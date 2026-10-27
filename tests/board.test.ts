import { expect, test } from 'vitest';
import { loadData } from '../src/data';
import { Board, cellToWorld, worldToCell } from '../src/sim/board';

const board = new Board(loadData('classic'));

test('waypoints snap from the original path_corner origins', () => {
  // BOARD.md "Original VPK anchors", snapped with the Lua grid formula.
  expect(board.waypoints.map((w) => [w.cell.x, w.cell.y])).toEqual([
    [5, 35],
    [5, 19],
    [33, 19],
    [33, 33],
    [19, 33],
    [19, 5],
    [34, 5],
  ]);
});

test('default stones are the 32 wall-arm cells and leave checkpoint gaps', () => {
  expect(board.stones).toHaveLength(32);
  expect(board.kind({ x: 4, y: 19 })).toBe('stone');
  expect(board.kind({ x: 5, y: 19 })).toBe('waypoint');
  expect(board.kind({ x: 19, y: 34 })).toBe('stone');
});

test('cell kinds follow the Lua build checks', () => {
  expect(board.kind({ x: 0, y: 10 })).toBe('outside');
  expect(board.kind({ x: 38, y: 10 })).toBe('outside');
  expect(board.kind({ x: 29, y: 9 })).toBe('no-build');
  expect(board.kind({ x: 9, y: 29 })).toBe('no-build');
  expect(board.kind({ x: 28, y: 9 })).toBe('open');
  expect(board.kind({ x: 19, y: 19 })).toBe('open');
});

test('world and cell transforms round-trip', () => {
  for (const c of [
    { x: 1, y: 1 },
    { x: 19, y: 19 },
    { x: 37, y: 2 },
  ]) {
    const w = cellToWorld(c);
    expect(worldToCell(w.x, w.y)).toEqual(c);
    expect(worldToCell(w.x + 63, w.y - 64)).toEqual(c);
  }
});
