import type { GameData } from '../data';
import { hash } from '../data';
import { Board, type Cell } from './board';
import { Game, TICK_HZ as GAME_TICK_HZ } from './game';
import { Rng } from './rng';
import type { RecipeKind } from './progression';
import { resolveConfig, type RunConfig } from './config';

/**
 * Version of the rules. Bump it whenever a change can make the same seed and commands play out
 * differently: saves made under another version are refused instead of desyncing.
 */
export const SIM_VERSION = 2;
export const SAVE_FORMAT = 'facet-td-save';

/** A saved run: replaying `log` from `seed` under `config` rebuilds the game at `tick`. */
export interface SaveEnvelope {
  format: typeof SAVE_FORMAT;
  dataVersion: string;
  simVersion: number;
  seed: number;
  config: RunConfig;
  log: LogEntry[];
  /** Tick the save was made at, and the state hash there, to verify the replay. */
  tick: number;
  hash: string;
}

export type SaveErrorCode = 'format' | 'data-version' | 'sim-version' | 'config' | 'desync';
export class SaveError extends Error {
  constructor(
    readonly code: SaveErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SaveError';
  }
}

/** Fixed sim rate; the view interpolates between ticks. */
export const TICK_HZ = GAME_TICK_HZ;

/** Player action. Every state change goes through one of these. */
export type Cmd =
  | { type: 'noop' }
  | { type: 'hero-loadout'; hero: string; abilities: Record<string, number> }
  | { type: 'hero-move'; cell: Cell }
  | { type: 'hero-cast'; action: string; target?: number; point?: Cell }
  | { type: 'build'; cell: Cell }
  | { type: 'remove'; cell: Cell }
  | { type: 'keep'; id: number; upgrade: 0 | 1 | 2 }
  | { type: 'downgrade'; id: number; hammer?: boolean }
  | { type: 'combine'; id: number; kind: RecipeKind; result: string; cell?: Cell }
  | { type: 'aim'; id: number; mode: number }
  | { type: 'hold'; id: number; hold: boolean };
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

  readonly config: Readonly<RunConfig>;

  /** Throws RunConfigError for an invalid config. */
  constructor(
    readonly data: GameData,
    readonly seed: number,
    config: Partial<RunConfig> = {},
    playerCount = 1,
  ) {
    this.config = Object.freeze(resolveConfig(data, config));
    this.rng = new Rng(seed);
    this.players = Array.from({ length: playerCount }, (_, id) => ({ id }));
    // shortcut: one shared single-player board; co-op and race boards per player come with phase 6.
    this.board = new Board(data);
    this.game = new Game(data, this.board, this.rng, this.config);
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
      case 'hero-loadout':
        return void this.game.configureHero(c.hero, c.abilities);
      case 'hero-move':
        return void this.game.moveHero(c.cell);
      case 'hero-cast':
        return void this.game.castHero(c.action, c.target, this.tick, c.point);
      case 'build':
        return void this.game.build(c.cell);
      case 'remove':
        return void this.game.remove(c.cell);
      case 'keep':
        return void this.game.keep(c.id, c.upgrade);
      case 'downgrade':
        return void (c.hammer ? this.game.hammer(c.id) : this.game.downgrade(c.id));
      case 'combine':
        return void this.game.combine(c.id, c.kind, c.result, c.cell);
      case 'aim':
        return void this.game.setAim(c.id, c.mode);
      case 'hold':
        return void this.game.setHold(c.id, c.hold);
    }
  }

  /** The run as a save: seed, config and every command so far (queued ones included). */
  save(): SaveEnvelope {
    return structuredClone({
      format: SAVE_FORMAT,
      dataVersion: this.data.version,
      simVersion: SIM_VERSION,
      seed: this.seed,
      config: { ...this.config },
      log: [...this.log, ...this.queue],
      tick: this.tick,
      hash: this.stateHash(),
    });
  }

  /**
   * Rebuild a saved run by replaying its log, then check it reached the same state. Throws
   * SaveError when the save is malformed, from other data or rules, or does not replay exactly.
   */
  static restore(data: GameData, save: SaveEnvelope): Sim {
    if (!save || save.format !== SAVE_FORMAT || !Array.isArray(save.log))
      throw new SaveError('format', 'Not a Facet TD save.');
    if (save.dataVersion !== data.version)
      throw new SaveError(
        'data-version',
        `Save was made with game data ${save.dataVersion}; this build has ${data.version}.`,
      );
    if (save.simVersion !== SIM_VERSION)
      throw new SaveError(
        'sim-version',
        `Save was made with rules version ${save.simVersion}; this build has ${SIM_VERSION}.`,
      );
    let sim: Sim;
    try {
      sim = new Sim(data, save.seed, save.config);
    } catch (e) {
      throw new SaveError('config', `Save has an invalid run config: ${(e as Error).message}`);
    }
    for (const e of save.log) {
      if (e.tick < sim.tick || e.tick > save.tick)
        throw new SaveError('format', 'Save log is out of order.');
      while (sim.tick < e.tick) sim.step();
      sim.queue.push({ ...e, cmd: structuredClone(e.cmd) });
    }
    while (sim.tick < save.tick) sim.step();
    if (sim.stateHash() !== save.hash)
      throw new SaveError('desync', 'Save did not replay to the same state.');
    return sim;
  }

  /** Hash of everything that defines the game state; equal hashes = identical games. */
  stateHash() {
    return hash(
      JSON.stringify([
        this.data.version,
        SIM_VERSION,
        this.tick,
        this.rng.state,
        this.players,
        this.game.snapshot(),
      ]),
    );
  }
}
