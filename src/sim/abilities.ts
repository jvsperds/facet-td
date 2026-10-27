import type { GameData } from '../data';
import { CELL_UNITS } from './board';

export type TowerAbility =
  | { kind: 'slow' | 'armor'; name: string; modifier: string; amount: number; duration: number }
  | { kind: 'speed'; name: string; amount: number }
  | { kind: 'aura'; name: string; modifier: string; amount: number; radius: number };

type Modifier = {
  Duration?: string;
  Properties?: Record<string, string>;
  OnAttackLanded?: { ApplyModifier: { ModifierName: string; Duration?: string } };
  Aura?: string;
  Aura_Radius?: string;
};

/** Only the four verified passive families in this P5 slice; values stay in the VPK baseline. */
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
      if (!/^tower_(slow[1-6]|jianjia[1-6]|speed[12]|speed_aura[1-6])$/.test(name)) continue;
      const modifiers = definitions[name].Modifiers!;
      for (const m of Object.values(modifiers)) {
        if (m.OnAttackLanded) {
          const apply = m.OnAttackLanded.ApplyModifier;
          const target = modifiers[apply.ModifierName];
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
