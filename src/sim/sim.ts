import type { GameData } from '../data';
import { hash } from '../data';
import { Board, type Cell } from './board';
import { Game, TICK_HZ as GAME_TICK_HZ } from './game';
import { Rng } from './rng';

/** Fixed sim rate; the view interpolates between ticks. */
export const TICK_HZ = GAME_TICK_HZ;

/** Player action. Every state change goes through one of these. */
export type Cmd =
  | { type: 'noop' }
  | { type: 'build'; cell: Cell }
  | { type: 'remove'; cell: Cell }
  | { type: 'keep'; id: number; upgrade: 0 | 1 | 2 };
export type LogEntry = { tick: number; player: number; cmd: Cmd };

export interface Player {
  id: number;
}

/**
 * Pure game state. No DOM, no three.js, no wall clock, no Math.random (lint-enforced):
 * same data + seed + command log = same game, which gives replays, saves, and lockstep co-op.
 */
export class Sim {
  tick = 0;
  readonly rng: Rng;
  readonly players: Player[];
  readonly board: Board;
  readonly game: Game;
  readonly log: LogEntry[] = [];
  private queue: LogEntry[] = [];

  constructor(
    readonly data: GameData,
    readonly seed: number,
    playerCount = 1,
  ) {
    this.rng = new Rng(seed);
    this.players = Array.from({ length: playerCount }, (_, id) => ({ id }));
    // shortcut: one shared single-player board; co-op and race boards per player come with phase 6.
    this.board = new Board(data);
    this.game = new Game(data, this.board, this.rng);
  }

  /** Queue a command for the next tick. */
  send(player: number, cmd: Cmd) {
    this.queue.push({ tick: this.tick, player, cmd });
  }

  step() {
    for (const e of this.queue) this.apply(e);
    this.log.push(...this.queue);
    this.queue = [];
    this.game.step(this.tick);
    this.tick++;
  }

  private apply(e: LogEntry) {
    const c = e.cmd;
    switch (c.type) {
      case 'noop':
        return;
      case 'build':
        return void this.game.build(c.cell);
      case 'remove':
        return void this.game.remove(c.cell);
      case 'keep':
        return void this.game.keep(c.id, c.upgrade);
    }
  }

  /** Hash of everything that defines the game state; equal hashes = identical games. */
  stateHash() {
    return hash(
      JSON.stringify([
        this.data.version,
        this.tick,
        this.rng.state,
        this.players,
        this.game.snapshot(),
      ]),
    );
  }
}
