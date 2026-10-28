import { describe, expect, it } from 'vitest';
import { loadData } from '../src/data';
import {
  combineOptions,
  planCombine,
  planDowngrade,
  readRecipes,
  resolveKeepUpgrade,
  type ProgressionState,
} from '../src/sim/progression';

const data = loadData('classic');
const state = (
  names: string[],
  phase: ProgressionState['phase'] = 'build',
  draft = names.map((_, i) => i + 1),
): ProgressionState => ({
  phase,
  gold: 0,
  draft,
  gems: names.map((name, i) => ({
    id: i + 1,
    name,
    cell: { x: i, y: 0 },
    cooldown: 0,
    target: null,
  })),
});

describe('progression plans', () => {
  it('reads real recipes whose outputs exist', () => {
    const recipes = readRecipes(data);
    const units = (data.files['npc/units.json'] as { DOTAUnits: Record<string, unknown> })
      .DOTAUnits;
    expect(new Set(recipes.map((r) => r.kind)).size).toBe(5);
    for (const r of recipes) expect(units[r.result], r.result).toBeDefined();
  });
  it('plans kept and draft combinations with correct scopes and without mutation', () => {
    const s = state(['gemtd_b1', 'gemtd_y1', 'gemtd_d1', 'gemtd_p1', 'gemtd_g1']);
    const before = JSON.stringify(s);
    expect(planCombine(data, s, 1, 'draft', 'gemtd_baiyin')).toMatchObject({
      ok: true,
      consume: [1, 2, 3, 4, 5],
      endDraft: true,
    });
    expect(planCombine(data, s, 4, 'draft', 'gemtd_baiyin').ok).toBe(false);
    expect(planCombine(data, s, 1, 'normal', 'gemtd_baiyin').ok).toBe(false);
    expect(
      planCombine(data, { ...s, phase: 'wave', draft: [] }, 2, 'normal', 'gemtd_baiyin'),
    ).toMatchObject({ ok: true, consume: [2, 1, 3], endDraft: false });
    expect(planCombine(data, { ...s, draft: [1, 2, 3] }, 1, 'draft', 'gemtd_baiyin').ok).toBe(
      false,
    );
    expect(JSON.stringify(s)).toBe(before);
  });
  it('handles secret and tablet draft recipes and aligned tablet upgrades', () => {
    const secret = state(['gemtd_p1', 'gemtd_p11', 'gemtd_p111', 'gemtd_p1111', 'gemtd_p11111']);
    expect(planCombine(data, secret, 3, 'secret', 'gemtd_keyinuoerguangmingzhishan')).toMatchObject(
      { ok: true, consume: [1, 2, 3, 4, 5], endDraft: true },
    );
    const tablet = state(['gemtd_y111', 'gemtd_d11', 'gemtd_p1', 'gemtd_g1', 'gemtd_b1']);
    expect(combineOptions(data, tablet, 1)).toContainEqual(
      expect.objectContaining({
        kind: 'tablet',
        result: 'gemtd_youbushiban',
        placement: 'separate',
      }),
    );
    const three = state(Array(3).fill('gemtd_youbushiban'), 'wave', []);
    expect(planCombine(data, three, 2, 'tablet-upgrade', 'gemtd_youbushiban_yin')).toMatchObject({
      ok: true,
      consume: [2, 1, 3],
    });
    three.gems[2].cell.y = 1;
    expect(planCombine(data, three, 2, 'tablet-upgrade', 'gemtd_youbushiban_yin').ok).toBe(false);
  });
  it('resolves duplicate keeps, huge upgrade, and downgrade boundaries', () => {
    const s = state(['gemtd_b11111', 'gemtd_b11111', 'gemtd_b11111', 'gemtd_b11111', 'gemtd_p1']);
    expect(resolveKeepUpgrade(data, s, 2, 2)).toMatchObject({
      ok: true,
      result: 'gemtd_zhenjiazhishi',
    });
    expect(planDowngrade(data, s, 2, 90)).toMatchObject({ ok: true, result: 'gemtd_b11' });
    expect(planDowngrade(data, s, 2, 91)).toMatchObject({ ok: true, result: 'gemtd_b1' });
    expect(resolveKeepUpgrade(data, { ...s, phase: 'wave' }, 2, 1).ok).toBe(false);
    expect(planDowngrade(data, s, 2, 0).ok).toBe(false);
  });
});
