import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { findGroup } from "../files/groups";
import { TileCache } from "../files/tileCache";
import type { Bin, DataFile, Group, RefineResult, Rules } from "../files/types";
import { ApiError } from "../lib/api";

const CELL_SIZE = 42;
const BINS: Bin[] = ["WO", "FC", "DR", "MA"];
const DIRECTIONS: Record<string, [number, number]> = {
  ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
};

function wait(milliseconds: number) { return new Promise((resolve) => window.setTimeout(resolve, milliseconds)); }
function clamp(value: number, maximum: number) { return Math.max(0, Math.min(maximum, value)); }

export function GridPage() {
  const { id } = useParams();
  const fileId = Number(id);
  const { request, session } = useAuth();
  const requestRef = useRef(request);
  requestRef.current = request;
  const [searchParams, setSearchParams] = useSearchParams();
  const [file, setFile] = useState<DataFile | null>(null);
  const [rules, setRules] = useState<Rules | null>(null);
  const [cache, setCache] = useState<TileCache | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tileError, setTileError] = useState("");
  const [selectionError, setSelectionError] = useState("");
  const [group, setGroup] = useState<Group | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [revision, setRevision] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 800, height: 520, top: 0, left: 0 });
  const [focus, setFocus] = useState({ r: 0, c: 0 });

  useEffect(() => {
    if (!Number.isInteger(fileId) || fileId < 1) { setError("Archivo inválido."); setLoading(false); return; }
    let active = true;
    setLoading(true); setError(""); setFile(null); setRules(null); setCache(null);
    Promise.all([
      requestRef.current<DataFile>(`/files/${fileId}`),
      requestRef.current<Rules>(`/files/${fileId}/rules`),
    ]).then(([nextFile, nextRules]) => {
      if (!active) return;
      setFile(nextFile); setRules(nextRules);
      setCache(new TileCache(nextFile, (path, options) => requestRef.current(path, options)));
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof ApiError ? cause.message : "No se pudo abrir el archivo.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fileId]);

  useEffect(() => {
    if (!cache) return;
    return cache.subscribe(() => setRevision((value) => value + 1));
  }, [cache]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element || !file) return;
    const observer = new ResizeObserver(() => setViewport((current) => ({ ...current, width: element.clientWidth, height: element.clientHeight })));
    observer.observe(element);
    const r = clamp(Number.parseInt(searchParams.get("r") ?? "0", 10) || 0, file.rows - 1);
    const c = clamp(Number.parseInt(searchParams.get("c") ?? "0", 10) || 0, file.cols - 1);
    element.scrollTop = r * CELL_SIZE;
    element.scrollLeft = c * CELL_SIZE;
    setViewport({ width: element.clientWidth, height: element.clientHeight, top: element.scrollTop, left: element.scrollLeft });
    setFocus({ r, c });
    return () => observer.disconnect();
  }, [fileId, file?.rows, file?.cols]);

  const rowStart = file ? clamp(Math.floor(viewport.top / CELL_SIZE) - 2, file.rows - 1) : 0;
  const colStart = file ? clamp(Math.floor(viewport.left / CELL_SIZE) - 2, file.cols - 1) : 0;
  const rowEnd = file ? Math.min(file.rows, rowStart + Math.min(45, Math.ceil(viewport.height / CELL_SIZE) + 5)) : 0;
  const colEnd = file ? Math.min(file.cols, colStart + Math.min(45, Math.ceil(viewport.width / CELL_SIZE) + 5)) : 0;

  useEffect(() => {
    if (!file || !cache) return;
    const needed = new Set<string>();
    for (let tr = Math.floor(rowStart / file.tileSize); tr <= Math.floor((rowEnd - 1) / file.tileSize); tr += 1) {
      for (let tc = Math.floor(colStart / file.tileSize); tc <= Math.floor((colEnd - 1) / file.tileSize); tc += 1) {
        needed.add(cache.key(tr, tc));
        void cache.get(tr, tc).catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === "AbortError") return;
          setTileError(cause instanceof ApiError ? cause.message : "No se pudo cargar un bloque. Desplázate para reintentar.");
        });
      }
    }
    cache.abortOutside(needed);
  }, [file?.id, cache, rowStart, rowEnd, colStart, colEnd]);

  useEffect(() => {
    if (!file) return;
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      const r = Math.floor(viewport.top / CELL_SIZE);
      const c = Math.floor(viewport.left / CELL_SIZE);
      if (next.get("r") === String(r) && next.get("c") === String(c)) return;
      next.set("r", String(r)); next.set("c", String(c));
      setSearchParams(next, { replace: true });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [viewport.top, viewport.left, file?.id]);

  const selected = useMemo(() => new Set(group?.cells.map(({ r, c }) => `${r}:${c}`) ?? []), [group]);

  async function selectCell(r: number, c: number) {
    if (!cache || !file || !rules || selecting || submitting) return;
    setSelecting(true); setSelectionError(""); setGroup(null);
    try { setGroup(await findGroup(file, rules, cache, r, c)); }
    catch (cause) { setSelectionError(cause instanceof Error ? cause.message : "No se pudo seleccionar el grupo."); }
    finally { setSelecting(false); }
  }

  async function refine(bin: Bin) {
    if (!group || !cache || !file || group.noise || submittingRef.current) return;
    submittingRef.current = true; setSubmitting(true); setSelectionError("");
    const key = crypto.randomUUID();
    try {
      let result: RefineResult | null = null;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          result = await requestRef.current<RefineResult>(`/files/${file.id}/refinements`, {
            method: "POST", headers: { "Idempotency-Key": key }, body: { bin, cells: group.cells },
          });
          break;
        } catch (cause) {
          const retryable = cause instanceof ApiError ? cause.status === 503 : cause instanceof TypeError;
          if (!retryable || attempt === 4) throw cause;
          await wait(Math.max((cause instanceof ApiError ? cause.retryAfter ?? 0 : 0) * 1000, 500 * 2 ** attempt));
        }
      }
      if (!result) throw new Error("No llegó la confirmación del refinamiento.");
      cache.markRefined(group.cells, bin);
      setFile((current) => current ? { ...current, ...result.file } : current);
      setGroup(null);
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "ALREADY_REFINED") {
        const details = cause.details as { tiles?: [number, number][] } | null;
        for (const [r, c] of details?.tiles ?? []) void cache.invalidate(r, c).catch(() => undefined);
        setGroup(null);
      }
      setSelectionError(cause instanceof ApiError ? cause.message : "No se pudo refinar. Puedes reintentar.");
    } finally { submittingRef.current = false; setSubmitting(false); }
  }

  function moveFocus(r: number, c: number) {
    if (!file) return;
    const next = { r: clamp(r, file.rows - 1), c: clamp(c, file.cols - 1) };
    setFocus(next);
    const element = viewportRef.current;
    if (element) {
      if (next.r * CELL_SIZE < element.scrollTop) element.scrollTop = next.r * CELL_SIZE;
      if ((next.r + 1) * CELL_SIZE > element.scrollTop + element.clientHeight) element.scrollTop = (next.r + 1) * CELL_SIZE - element.clientHeight;
      if (next.c * CELL_SIZE < element.scrollLeft) element.scrollLeft = next.c * CELL_SIZE;
      if ((next.c + 1) * CELL_SIZE > element.scrollLeft + element.clientWidth) element.scrollLeft = (next.c + 1) * CELL_SIZE - element.clientWidth;
    }
    requestAnimationFrame(() => viewportRef.current?.querySelector<HTMLElement>(`[data-cell="${next.r}:${next.c}"]`)?.focus());
  }

  function onGridKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); void selectCell(focus.r, focus.c); return; }
    const direction = DIRECTIONS[event.key];
    if (direction) { event.preventDefault(); moveFocus(focus.r + direction[0], focus.c + direction[1]); }
    else if (event.key === "PageDown") { event.preventDefault(); moveFocus(focus.r + Math.floor(viewport.height / CELL_SIZE), focus.c); }
    else if (event.key === "PageUp") { event.preventDefault(); moveFocus(focus.r - Math.floor(viewport.height / CELL_SIZE), focus.c); }
    else if (event.key === "Home") { event.preventDefault(); moveFocus(event.ctrlKey ? 0 : focus.r, 0); }
    else if (event.key === "End" && file) { event.preventDefault(); moveFocus(event.ctrlKey ? file.rows - 1 : focus.r, file.cols - 1); }
  }

  if (!session?.user.permissions.includes("files:read")) return <main className="p-8">No tienes permiso para abrir archivos.</main>;
  if (loading) return <main className="grid min-h-screen place-items-center bg-[#081b19] text-emerald-100">Abriendo archivo…</main>;
  if (error || !file || !rules || !cache) return <main className="p-8"><p role="alert">{error || "No se pudo abrir el archivo."}</p><Link to="/files">Volver</Link></main>;

  return (
    <main className="min-h-screen bg-[#081b19] px-4 py-5 text-[#e7f4e9]">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-4"><div><Link className="text-sm text-emerald-300 underline" to="/files">← Archivos</Link><h1 className="mt-2 text-2xl font-semibold">{file.name}</h1><p className="text-sm text-[#a9c2b5]">{file.refinedGroups}/{file.totalGroups} grupos · {Math.round(file.progress.overall * 100)} % completo · {file.mistakes} errores</p></div><Link className="text-sm text-emerald-300 underline" to="/estado">Estado del piso</Link></header>
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
          <section aria-label="Grilla de números" className="min-w-0">
            <div ref={viewportRef} role="grid" aria-label={`Datos de ${file.name}`} aria-rowcount={file.rows} aria-colcount={file.cols} onKeyDown={onGridKeyDown} onScroll={(event) => { const element = event.currentTarget; setViewport((current) => ({ ...current, top: element.scrollTop, left: element.scrollLeft })); }} className="relative h-[min(70vh,680px)] overflow-auto rounded-xl border border-emerald-800 bg-[#0d2520] outline-none focus-within:ring-2 focus-within:ring-emerald-300">
              <div className="relative" style={{ width: file.cols * CELL_SIZE, height: file.rows * CELL_SIZE }}>
                {Array.from({ length: rowEnd - rowStart }, (_, index) => {
                  const r = rowStart + index;
                  return <div key={r} role="row" aria-rowindex={r + 1} className="absolute" style={{ top: r * CELL_SIZE, left: 0, height: CELL_SIZE, width: file.cols * CELL_SIZE }}>
                    {Array.from({ length: colEnd - colStart }, (_, offset) => {
                      const c = colStart + offset;
                      const cell = cache.peekCell(r, c);
                      const scary = cell && cell.tremor >= rules.tremorThreshold && cell.bin === ".";
                      const isSelected = selected.has(`${r}:${c}`);
                      return <button key={c} type="button" role="gridcell" aria-rowindex={r + 1} aria-colindex={c + 1} aria-selected={isSelected} aria-label={cell ? `Fila ${r + 1}, columna ${c + 1}, número ${cell.digit}${scary ? ", da miedo" : ""}${cell.bin !== "." ? ", refinado" : ""}` : `Fila ${r + 1}, columna ${c + 1}, cargando`} data-cell={`${r}:${c}`} tabIndex={focus.r === r && focus.c === c ? 0 : -1} onFocus={() => setFocus({ r, c })} onClick={() => { setFocus({ r, c }); void selectCell(r, c); }} className={`absolute grid place-items-center border border-[#33584a] font-mono text-sm focus:z-10 focus:outline-2 focus:outline-emerald-300 ${isSelected ? "bg-emerald-300 text-[#08231c]" : cell?.bin !== "." ? "bg-[#375a50] text-emerald-100" : scary ? "scary-cell bg-[#204437] text-emerald-200" : "bg-[#102823] text-[#aac3b6]"}`} style={{ left: c * CELL_SIZE, width: CELL_SIZE, height: CELL_SIZE, animationDuration: scary ? `${Math.max(0.12, 0.55 - cell.tremor / 300)}s` : undefined }}>{cell ? cell.digit : "·"}</button>;
                    })}
                  </div>;
                })}
              </div>
            </div>
            {tileError && <p role="alert" className="mt-2 text-sm text-rose-200">{tileError}</p>}
            <p className="mt-2 text-xs text-[#a9c2b5]">Usa flechas, Page Up/Down, Inicio y Fin para moverte; Enter selecciona un grupo.</p>
          </section>
          <aside className="rounded-xl border border-emerald-900 bg-[#102823] p-5">
            <h2 className="text-lg font-semibold">Cajas de refinamiento</h2>
            <p className="mt-2 text-sm text-[#a9c2b5]">{selecting ? "Buscando el grupo completo…" : group ? `${group.cells.length} celdas · ${group.noise ? "Ruido: no se puede refinar" : `Caja correcta: ${group.bin}`}` : "Selecciona un número que dé miedo."}</p>
            {selectionError && <p role="alert" className="mt-3 text-sm text-rose-200">{selectionError}</p>}
            <div className="mt-5 grid gap-3">{BINS.map((bin) => <button key={bin} type="button" disabled={!group || group.noise || submitting || !session.user.permissions.includes("files:refine")} onClick={() => void refine(bin)} className={`rounded-lg border px-4 py-3 text-left disabled:opacity-50 ${group?.bin === bin ? "border-emerald-300 bg-emerald-900" : "border-emerald-700"}`}><span className="font-semibold">{bin}</span><span className="ml-2 text-xs">{Math.round(file.progress[bin] * 100)} %</span></button>)}</div>
            {submitting && <p role="status" className="mt-4 text-sm">Refinando…</p>}
          </aside>
        </div>
        <span className="sr-only">Bloques cargados: {cache.tiles.size}; actualización {revision}</span>
      </div>
    </main>
  );
}
