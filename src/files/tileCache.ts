import { ApiError, type RequestOptions } from "../lib/api";
import type { Cell, DataFile, DecodedTile, Tile } from "./types";

type Request = <T>(path: string, options?: RequestOptions) => Promise<T>;
type InFlight = { promise: Promise<DecodedTile>; controller: AbortController; pinned: boolean };

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = window.setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, milliseconds);
    function onAbort() { window.clearTimeout(timer); reject(signal.reason); }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export class TileCache {
  readonly tiles = new Map<string, DecodedTile>();
  private readonly inFlight = new Map<string, InFlight>();
  private readonly listeners = new Set<() => void>();
  private requestTimes: number[] = [];
  private blockedUntil = 0;
  private active = 0;

  constructor(private readonly file: DataFile, private readonly request: Request) {}

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notify() { for (const listener of this.listeners) listener(); }

  key(row: number, col: number) { return `${row}:${col}`; }

  peek(row: number, col: number) { return this.tiles.get(this.key(row, col)); }

  async get(row: number, col: number, pinned = false): Promise<DecodedTile> {
    const key = this.key(row, col);
    const cached = this.tiles.get(key);
    if (cached) return cached;
    const running = this.inFlight.get(key);
    if (running) {
      if (pinned) running.pinned = true;
      return running.promise;
    }
    const controller = new AbortController();
    const task: InFlight = {
      controller,
      pinned,
      promise: this.fetchTile(row, col, controller.signal).then((tile) => {
        this.tiles.set(key, tile);
        if (this.tiles.size > 120) this.tiles.delete(this.tiles.keys().next().value!);
        this.notify();
        return tile;
      }).finally(() => this.inFlight.delete(key)),
    };
    this.inFlight.set(key, task);
    return task.promise;
  }

  abortOutside(needed: Set<string>) {
    for (const [key, task] of this.inFlight) {
      if (!needed.has(key) && !task.pinned) task.controller.abort();
    }
  }

  private async waitForSlot(signal: AbortSignal) {
    while (true) {
      if (signal.aborted) throw signal.reason;
      const now = Date.now();
      this.requestTimes = this.requestTimes.filter((time) => now - time < 10_000);
      if (now >= this.blockedUntil && this.active < 4 && this.requestTimes.length < 35) {
        this.requestTimes.push(now);
        this.active += 1;
        return;
      }
      const rateWait = this.requestTimes.length >= 35 ? 10_000 - (now - this.requestTimes[0]) : 0;
      await delay(Math.max(50, Math.min(1000, this.blockedUntil - now || rateWait || 50)), signal);
    }
  }

  private async fetchTile(row: number, col: number, signal: AbortSignal): Promise<DecodedTile> {
    for (let attempt = 0; ; attempt += 1) {
      await this.waitForSlot(signal);
      try {
        const tile = await this.request<Tile>(`/files/${this.file.id}/tiles/${row}/${col}`, { signal });
        const bytes = atob(tile.tremor);
        const tremorValues = Uint8Array.from(bytes, (character) => character.charCodeAt(0));
        if (tile.values.length !== tile.rows * tile.cols || tremorValues.length !== tile.values.length) {
          throw new Error("El bloque recibido no tiene el tamaño esperado.");
        }
        return { ...tile, tremorValues };
      } catch (error) {
        if (signal.aborted) throw error;
        if (!(error instanceof ApiError) || ![429, 503].includes(error.status) || attempt >= 5) throw error;
        const wait = Math.max((error.retryAfter ?? 0) * 1000, Math.min(8000, 500 * 2 ** attempt));
        if (error.status === 429) this.blockedUntil = Math.max(this.blockedUntil, Date.now() + wait);
        await delay(wait, signal);
      } finally {
        this.active -= 1;
      }
    }
  }

  async getCell(r: number, c: number): Promise<Cell | null> {
    if (r < 0 || c < 0 || r >= this.file.rows || c >= this.file.cols) return null;
    const tile = await this.get(Math.floor(r / this.file.tileSize), Math.floor(c / this.file.tileSize), true);
    return this.cellFromTile(tile, r, c);
  }

  peekCell(r: number, c: number): Cell | null {
    const tile = this.peek(Math.floor(r / this.file.tileSize), Math.floor(c / this.file.tileSize));
    return tile ? this.cellFromTile(tile, r, c) : null;
  }

  private cellFromTile(tile: DecodedTile, r: number, c: number): Cell {
    const index = (r - tile.originRow) * tile.cols + c - tile.originCol;
    return { r, c, digit: Number(tile.values[index]), tremor: tile.tremorValues[index], bin: tile.bins[index] };
  }

  markRefined(cells: { r: number; c: number }[], bin: string) {
    const mark = ({ WO: "W", FC: "F", DR: "D", MA: "M" } as Record<string, string>)[bin];
    for (const { r, c } of cells) {
      const tile = this.peek(Math.floor(r / this.file.tileSize), Math.floor(c / this.file.tileSize));
      if (!tile) continue;
      const index = (r - tile.originRow) * tile.cols + c - tile.originCol;
      tile.bins = `${tile.bins.slice(0, index)}${mark}${tile.bins.slice(index + 1)}`;
    }
    this.notify();
  }

  invalidate(row: number, col: number) {
    this.tiles.delete(this.key(row, col));
    this.notify();
    return this.get(row, col, true);
  }
}
