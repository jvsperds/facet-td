import type { GameData } from '../data';

// Board geometry of the original map, read from the VPK conversion (addon_game_mode.lua):
// cells are 1-based [x, y], x east, y north; cell centre in world units = ((x-19)*128, (y-19)*128).
export const BOARD_SIZE = 37;
export const CELL_UNITS = 128;
const CENTRE = 19;

export interface Cell {
  x: number;
  y: number;
}
export interface Waypoint {
  /** `path1` is the spawn, `path2`..`path6` the checkpoints, `path7` the castle. */
  name: string;
  cell: Cell;
}
export type CellKind = 'stone' | 'waypoint' | 'no-build' | 'outside' | 'open';

/** Lua `math.floor((p+64)/128)+19`, the original world-to-grid snap. */
export const worldToCell = (wx: number, wy: number): Cell => ({
  x: Math.floor((wx + 64) / CELL_UNITS) + CENTRE,
  y: Math.floor((wy + 64) / CELL_UNITS) + CENTRE,
});
export const cellToWorld = (c: Cell) => ({
  x: (c.x - CENTRE) * CELL_UNITS,
  y: (c.y - CENTRE) * CELL_UNITS,
});

/**
 * Layouts ported from GemTD (data/map.json and MAPS in src/sim/setup.ts): the same grid and arm
 * walls with a different checkpoint order or extra terrain. GemTD's [col, row] (0-based, top-left)
 * becomes cell (col + 1, 37 - row) here.
 */
export const MAPS = {
  classic: { name: 'Classic' },
  // Top, left, bottom, right, then the centre: every leg crosses the middle.
  cross: { name: 'Crossroads' },
  // Two walled gardens, each a ring of stone round ground nobody can build on.
  rift: { name: 'Rift Garden' },
} as const;
export type MapId = keyof typeof MAPS;
const CROSS_CHECKPOINTS: Cell[] = [
  { x: 19, y: 33 },
  { x: 5, y: 19 },
  { x: 19, y: 5 },
  { x: 33, y: 19 },
  { x: 19, y: 19 },
];
/** [x0, x1, y0, y1] boxes, inclusive. */
const RIFT_NO_BUILD = [
  [12, 15, 24, 26],
  [23, 26, 12, 14],
];
const RIFT_RINGS = [
  [11, 15, 24, 26],
  [23, 27, 12, 14],
];
const ring = ([x0, x1, y0, y1]: number[]) => {
  const out: Cell[] = [];
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++)
      if (x === x0 || x === x1 || y === y0 || y === y1) out.push({ x, y });
  return out;
};

type Entity = { classname?: string; targetname?: string; origin?: string };
type LuaStones = Record<string, Record<string, Cell>>;

export class Board {
  readonly size = BOARD_SIZE;
  readonly waypoints: Waypoint[];
  readonly stones: Cell[];
  private readonly stoneSet: Set<number>;
  private readonly noBuild: number[][];

  /** Only the 1-player map for now; co-op and race layouts come with phase 6. */
  constructor(data: GameData, players = 1, map: MapId = 'classic') {
    const entities = data.files['maps/gemtd_1p.entities.json'] as Entity[];
    this.waypoints = Array.from({ length: 7 }, (_, i) => {
      const name = `path${i + 1}`;
      const e = entities.find(
        (e) => e.classname === 'path_corner' && e.targetname?.replace('[PR#]', '') === name,
      );
      if (!e?.origin) throw new Error(`gemtd_1p is missing ${name}`);
      const [wx, wy] = e.origin.split(' ').map(Number);
      return { name, cell: worldToCell(wx, wy) };
    });
    const lua = data.files['lua/addon_game_mode.json'] as { default_stone: { value: LuaStones } };
    this.stones = Object.values(lua.default_stone.value[players] ?? {});
    if (map === 'cross')
      CROSS_CHECKPOINTS.forEach(
        (cell, i) => (this.waypoints[i + 1] = { name: `path${i + 2}`, cell }),
      );
    if (map === 'rift') this.stones = [...this.stones, ...RIFT_RINGS.flatMap(ring)];
    this.noBuild = map === 'rift' ? RIFT_NO_BUILD : [];
    this.stoneSet = new Set(this.stones.map(key));
  }

  inside = (c: Cell) => c.x >= 1 && c.x <= this.size && c.y >= 1 && c.y <= this.size;

  /** What occupies a cell before any player builds; mirrors the Lua build checks. */
  kind(c: Cell): CellKind {
    if (!this.inside(c)) return 'outside';
    if (this.stoneSet.has(key(c))) return 'stone';
    if (this.waypoints.some((w) => w.cell.x === c.x && w.cell.y === c.y)) return 'waypoint';
    // gemtd_1p / gemtd_coop: "text_mima_cannot_build_here" around the castle (SE) and spawn (NW).
    if ((c.x >= 29 && c.y <= 9) || (c.x <= 9 && c.y >= 29)) return 'no-build';
    if (this.noBuild.some(([x0, x1, y0, y1]) => c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1))
      return 'no-build';
    return 'open';
  }
}

const key = (c: Cell) => c.y * 64 + c.x;
