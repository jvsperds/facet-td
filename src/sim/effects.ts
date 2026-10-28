import { CELL_UNITS } from './board';

export type EffectBody = {
  modifier: string;
  properties: Record<string, number>;
  states: string[];
  duration: number;
  interval: number;
  damage: number;
  multiple: boolean;
  pierces: boolean;
  self?: boolean;
};
export type SpecialEffect =
  | ({
      kind: 'field';
      name: string;
      radius: number;
      ally: boolean;
      excludeAncients: boolean;
    } & EffectBody)
  | ({
      kind: 'hit-effect';
      name: string;
      radius: number;
      chance: number;
      pseudo?: boolean;
      trigger?: 'start' | 'landed';
    } & EffectBody)
  | { kind: 'critical'; name: string; chance: number; multiplier: number; pseudo: boolean }
  | {
      kind: 'script';
      name: string;
      fn: string;
      chance: number;
      args: Record<string, string>;
      pseudo?: boolean;
      trigger?: 'start' | 'landed';
    }
  | { kind: 'trait'; name: string };

type Apply = {
  ModifierName: string;
  Duration?: string;
  Target?: string | { Radius?: string; Flags?: string };
};
type Action = {
  ApplyModifier?: Apply;
  Stun?: { Duration: string };
  RunScript?: Record<string, string>;
  Random?: { Chance: string; PseudoRandom?: string; OnSuccess: Action };
};
type Mod = {
  Passive?: string;
  Aura?: string;
  Aura_Radius?: string;
  Aura_Teams?: string;
  Aura_Flags?: string;
  Duration?: string;
  ThinkInterval?: string;
  Attributes?: string;
  Properties?: Record<string, string>;
  States?: Record<string, string>;
  OnIntervalThink?: { Damage?: { Damage: string } };
  OnAttackLanded?: Action;
  OnAttackStart?: Action;
};
export type AbilityDefinition = {
  Modifiers?: Record<string, Mod>;
  SpellImmunityType?: string;
  AbilityValues?: Record<string, string | { value: string }>;
};

/** Compile the VPK's declarative special-tower effects without copying balance tables. */
export function readSpecialEffects(name: string, definition: AbilityDefinition): SpecialEffect[] {
  const out: SpecialEffect[] = [];
  const mods = definition.Modifiers ?? {};
  const body = (modifier: string, duration?: string): EffectBody => {
    const m = mods[modifier];
    return {
      modifier,
      properties: Object.fromEntries(
        Object.entries(m.Properties ?? {}).map(([k, v]) => [k, Number(v)]),
      ),
      states: Object.entries(m.States ?? {})
        .filter(([, v]) => v === 'MODIFIER_STATE_VALUE_ENABLED')
        .map(([k]) => k),
      duration: Number(duration ?? m.Duration ?? 1),
      interval: Number(m.ThinkInterval ?? 0),
      damage: Number(m.OnIntervalThink?.Damage?.Damage ?? 0),
      multiple: (m.Attributes ?? '').includes('MODIFIER_ATTRIBUTE_MULTIPLE'),
      pierces: definition.SpellImmunityType === 'SPELL_IMMUNITY_ENEMIES_YES',
    };
  };
  for (const m of Object.values(mods)) {
    if (m.Aura) {
      const field = body(m.Aura);
      field.pierces ||= (m.Aura_Flags ?? '').includes('MAGIC_IMMUNE_ENEMIES');
      out.push({
        kind: 'field',
        name,
        radius: Number(m.Aura_Radius) / CELL_UNITS,
        ally:
          (m.Aura_Teams ?? '').includes('FRIENDLY') || (m.Aura_Teams ?? '').includes('GOODGUYS'),
        excludeAncients: (m.Aura_Flags ?? '').includes('NOT_ANCIENTS'),
        ...field,
      });
    }
    const action = m.OnAttackLanded ?? m.OnAttackStart;
    if (!action) continue;
    const chance = Number(action.Random?.Chance ?? 100);
    const timing = {
      pseudo: !!action.Random?.PseudoRandom,
      trigger: m.OnAttackLanded ? ('landed' as const) : ('start' as const),
    };
    const a = action.Random?.OnSuccess ?? action;
    if (a.RunScript)
      out.push({
        kind: 'script',
        name,
        fn: a.RunScript.Function,
        chance,
        args: a.RunScript,
        ...timing,
      });
    if (a.Stun)
      out.push({
        kind: 'hit-effect',
        name,
        radius: 0,
        chance,
        ...timing,
        modifier: `${name}:stun`,
        duration: Number(a.Stun.Duration),
        properties: {},
        states: ['MODIFIER_STATE_STUNNED'],
        interval: 0,
        damage: 0,
        multiple: false,
        pierces: definition.SpellImmunityType === 'SPELL_IMMUNITY_ENEMIES_YES',
      });
    if (a.ApplyModifier && mods[a.ApplyModifier.ModifierName]) {
      const effect = body(a.ApplyModifier.ModifierName, a.ApplyModifier.Duration);
      const critical = effect.properties.MODIFIER_PROPERTY_PREATTACK_CRITICALSTRIKE;
      if (critical)
        out.push({
          kind: 'critical',
          name,
          chance,
          multiplier: critical / 100,
          pseudo: !!action.Random?.PseudoRandom,
        });
      else {
        const target = a.ApplyModifier.Target;
        effect.self = target === 'CASTER' || target === 'ATTACKER';
        if (typeof target === 'object')
          effect.pierces ||= (target.Flags ?? '').includes('MAGIC_IMMUNE_ENEMIES');
        out.push({
          kind: 'hit-effect',
          name,
          chance,
          radius: typeof target === 'object' ? Number(target.Radius ?? 0) / CELL_UNITS : 0,
          ...timing,
          ...effect,
        });
      }
    }
  }
  if (name === 'tower_true_sight' || name === 'tower_chain_frost')
    out.push({ kind: 'trait', name });
  return out;
}
