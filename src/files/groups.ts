import type { Bin, DataFile, Group, Rules } from "./types";
import { TileCache } from "./tileCache";

export async function findGroup(file: DataFile, rules: Rules, cache: TileCache, r: number, c: number): Promise<Group> {
  const first = await cache.getCell(r, c);
  if (!first || first.tremor < rules.tremorThreshold || first.bin !== ".") {
    throw new Error("Selecciona una celda sin refinar que dé miedo.");
  }
  const directions = rules.connectivity === 8
    ? [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]
    : [[-1, 0], [0, -1], [0, 1], [1, 0]];
  const queue = [{ r, c }];
  const seen = new Set<string>([`${r}:${c}`]);
  const cells: { r: number; c: number }[] = [];
  let digitSum = 0;
  let maxDigit = 0;
  for (let index = 0; index < queue.length; index += 1) {
    const position = queue[index];
    const cell = await cache.getCell(position.r, position.c);
    if (!cell || cell.tremor < rules.tremorThreshold || cell.bin !== ".") continue;
    cells.push(position);
    digitSum += cell.digit;
    maxDigit = Math.max(maxDigit, cell.digit);
    for (const [dr, dc] of directions) {
      const nr = position.r + dr;
      const nc = position.c + dc;
      const key = `${nr}:${nc}`;
      if (nr < 0 || nc < 0 || nr >= file.rows || nc >= file.cols || seen.has(key)) continue;
      seen.add(key);
      queue.push({ r: nr, c: nc });
    }
  }
  const value = rules.binning.strategy === "DIGIT_SUM_MOD" ? digitSum : maxDigit;
  const bin = rules.binning.order[value % 4] as Bin;
  return { cells, bin, noise: cells.length < rules.minGroupSize || cells.length > rules.maxGroupSize };
}
