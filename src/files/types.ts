export type Bin = "WO" | "FC" | "DR" | "MA";
export type Progress = Record<Bin, number> & { overall: number };

export type DataFile = {
  id: number;
  name: string;
  rows: number;
  cols: number;
  tileSize: number;
  status: "ACTIVE" | "COMPLETE";
  progress: Progress;
  refinedGroups: number;
  totalGroups: number;
  mistakes: number;
  updatedAt: string;
};

export type FilePage = {
  content: DataFile[];
  totalElements: number;
  totalPages: number;
  page: number;
  size: number;
};

export type Rules = {
  tremorThreshold: number;
  connectivity: 4 | 8;
  minGroupSize: number;
  maxGroupSize: number;
  binning: { strategy: "DIGIT_SUM_MOD" | "MAX_DIGIT_MOD"; order: Bin[] };
};

export type Tile = {
  tileRow: number;
  tileCol: number;
  originRow: number;
  originCol: number;
  rows: number;
  cols: number;
  values: string;
  tremor: string;
  bins: string;
  version: number;
};

export type DecodedTile = Tile & { tremorValues: Uint8Array };

export type Cell = { r: number; c: number; digit: number; tremor: number; bin: string };
export type Group = { cells: { r: number; c: number }[]; bin: Bin; noise: boolean };

export type RefineResult = {
  refinementId: number;
  bin: Bin;
  size: number;
  file: Pick<DataFile, "progress" | "refinedGroups" | "totalGroups" | "mistakes" | "status">;
};
