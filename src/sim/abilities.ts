import type { GameData } from '../data';
import { CELL_UNITS } from './board';
import { readSpecialEffects, type SpecialEffect, type AbilityDefinition } from './effects';

export type TowerAbility =
  | { kind: 'slow' | 'armor'; name: string; modifier: string; amount: number; duration: number }
  | { kind: 'speed'; name: string; amount: number }
  | { kind: 'aura'; name: string; modifier: string; amount: number; radius: number }
  | { kind: 'damage'; name: string; amount: number }
  | { kind: 'splash'; name: string; amount: number; radius: number }
  | { kind: 'split'; name: string; count: number }
  | {
      kind: 'poison';
      name: string;
      modifier: string;
      amount: number;
      duration: number;
      interval: number;
    }
  | SpecialEffect;

type Modifier = {
  Duration?: string;
  Properties?: Record<string, string>;
  OnAttackLanded?: { ApplyModifier: { ModifierName: string; Duration?: string } };
  Aura?: string;
  Aura_Radius?: string;
  ThinkInterval?: string;
  OnIntervalThink?: { Damage?: { Damage: string } };
};

/** Values come from VPK modifiers; scripted Ruby constants cite the original Lua functions. */
export function readTowerAbilities(data: GameData): Record<string, TowerAbility[]> {
  const units = (
    data.files['npc/units.json'] as { DOTAUnits: Record<string, Record<string, string>> }
  ).DOTAUnits;
  const definitions = (
    data.files['npc/abilities.json'] as {
      DOTAAbilities: Record<string, { Modifiers?: Record<string, Modifier> }>;
    }
  ).DOTAAbilities;
  const out: Record<string, TowerAbility[]> = {};
  for (const [unit, fields] of Object.entries(units)) {
    const abilities: TowerAbility[] = [];
    for (const name of new Set(
      Object.entries(fields)
        .filter(([k]) => /^Ability\d+$/.test(k))
        .map(([, v]) => v),
    )) {
      if (/^tower_jianshe[1-6]$/.test(name)) {
        const tier = Number(name.at(-1));
        // addon_game_mode.lua jianshe1..6, lines 11054..11211: includes the primary target, pure damage.
        abilities.push({
          kind: 'splash',
          name,
          radius: [300, 350, 400, 450, 500, 700][tier - 1] / CELL_UNITS,
          amount: [0.3, 0.4, 0.5, 0.6, 0.7, 1][tier - 1],
        });
        continue;
      }
      if (
        name === 'tower_fenliejian' ||
        name === 'tower_fenliejian_xianyan' ||
        name === 'tower_fenliejian_you'
      ) {
        const ability = definitions[name] as {
          Modifiers: Record<string, { OnAttack?: { RunScript: { attack_count: string } } }>;
        };
        const script = Object.values(ability.Modifiers).find((m) => m.OnAttack)?.OnAttack!
          .RunScript;
        abilities.push({ kind: 'split', name, count: Number(script!.attack_count) });
        continue;
      }
      if (
        !/^tower_(slow[1-6]|jianjia[1-6]|speed[12]|speed_aura[1-6]|du[1-6]|attack[1-7])$/.test(name)
      ) {
        if (name.startsWith('tower_') && definitions[name])
          abilities.push(...readSpecialEffects(name, definitions[name] as AbilityDefinition));
        continue;
      }
      const modifiers = definitions[name].Modifiers!;
      for (const m of Object.values(modifiers)) {
        if (m.OnAttackLanded) {
          const apply = m.OnAttackLanded.ApplyModifier;
          const target = modifiers[apply.ModifierName];
          if (name.startsWith('tower_du')) {
            abilities.push({
              kind: 'poison',
              name,
              modifier: apply.ModifierName,
              amount: Number(target.OnIntervalThink!.Damage!.Damage),
              duration: Number(apply.Duration ?? target.Duration),
              interval: Number(target.ThinkInterval),
            });
            continue;
          }
          const kind = name.startsWith('tower_slow') ? 'slow' : 'armor';
          const property =
            kind === 'slow'
              ? 'MODIFIER_PROPERTY_MOVESPEED_BONUS_CONSTANT'
              : 'MODIFIER_PROPERTY_PHYSICAL_ARMOR_BONUS';
          abilities.push({
            kind,
            name,
            modifier: apply.ModifierName,
            amount: Number(target.Properties![property]),
            duration: Number(apply.Duration ?? target.Duration),
          });
        } else if (m.Aura) {
          abilities.push({
            kind: 'aura',
            name,
            modifier: m.Aura,
            radius: Number(m.Aura_Radius) / CELL_UNITS,
            amount: Number(
              modifiers[m.Aura].Properties!.MODIFIER_PROPERTY_ATTACKSPEED_BONUS_CONSTANT,
            ),
          });
        } else if (name.startsWith('tower_attack')) {
          abilities.push({
            kind: 'damage',
            name,
            amount: Number(m.Properties!.MODIFIER_PROPERTY_BASEATTACK_BONUSDAMAGE),
          });
        } else if (name.startsWith('tower_speed') && !name.startsWith('tower_speed_aura')) {
          abilities.push({
            kind: 'speed',
            name,
            amount: Number(m.Properties!.MODIFIER_PROPERTY_ATTACKSPEED_BONUS_CONSTANT),
          });
        }
      }
    }
    out[unit] = abilities;
  }
  return out;
}
