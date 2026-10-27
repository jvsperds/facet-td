// Roles verified against baseline English help, assigned abilities and ability definitions.
export const COMBINED_EFFECTS = {
  gemtd_xingcaihongbaoshi: {
    effect: "Burn aura",
    design: "Open ember brazier, flame crown and heat vents.",
    sourceDescription: "burns nearby enemies.",
    abilities: ["tower_huiyao"],
  },
  gemtd_xuehonghuoshan: {
    effect: "Stronger burn aura",
    design: "Lava crater, erupting flame spires and bright molten core.",
    sourceDescription: "burns enemies in range.",
    abilities: ["tower_huiyao2"],
  },
  gemtd_yu: {
    effect: "Poison and rapid attacks",
    design: "Venom reservoir, dripping fang nozzles and green reagent pipes.",
    sourceDescription: "poisons enemies, fast attack speed.",
    abilities: ["tower_du4"],
  },
  gemtd_haiyangqingyu: {
    effect: "Range aura and poison",
    design: "Forward sighting lens and range reticle above a venom reservoir.",
    sourceDescription: "increase attack range of allies around.",
    abilities: ["tower_shechengguanghuan", "tower_du5"],
  },
  gemtd_jixiangdezhongguoyu: {
    effect: "Poison, anti-air and healing",
    design: "Venom fangs, upward wing hooks and a healing cross.",
    sourceDescription:
      "impairs flying enemies, poisons enemies, and has a chance to heal the gem tower on hit.",
    abilities: [
      "tower_du5",
      "tower_huichun_aura",
      "tower_zheyi",
      "tower_attack4",
    ],
  },
  gemtd_huaguoshanxiandan: {
    effect: "Range and accuracy auras",
    design: "Twin targeting sights, crosshair and a golden Monkey King staff.",
    sourceDescription:
      "increase attack range and grant attacks regardless of evasion for allies around.",
    abilities: [
      "tower_du5",
      "tower_shechengguanghuan",
      "tower_jingzhun",
      "tower_attack4",
    ],
  },
  gemtd_jingangshikulinan: {
    effect: "High damage, range and accuracy",
    design:
      "Large diamond targeting optic with precise crosshair and sighting rails.",
    sourceDescription:
      "have amazing attack damage, increase attack range and grant attacks regardless of evasion for allies around.",
    abilities: [
      "tower_jingzhun",
      "tower_shechengguanghuan",
      "tower_attack6",
      "tower_baoji1",
      "e10005",
    ],
  },
  gemtd_furongshi: {
    effect: "Anti-air debuff",
    design: "Upward harpoon-like crystal forks and swept interceptor wings.",
    sourceDescription: "impairs flying enemies.",
    abilities: ["tower_zheyi"],
  },
  gemtd_mirendeqingjinshi: {
    effect: "Stronger anti-air debuff",
    design: "Twin hooked blue interception forks and tall aiming vanes.",
    sourceDescription: "impairs flying enemies.",
    abilities: ["tower_zheyi2"],
  },
  gemtd_huguoshenyishi: {
    effect: "Anti-air and ember blasts",
    design: "Golden flak crown, orange blast core and interceptor wings.",
    sourceDescription:
      "have random magical attack damage, impairs flying enemies.",
    abilities: ["tower_zheyi3", "tower_ranjin", "e10006"],
  },
  gemtd_heianfeicui: {
    effect: "Chance to stun",
    design: "Heavy impact jewel over an anvil, held by striking hammer jaws.",
    sourceDescription: "has a chance to stun enemies.",
    abilities: ["tower_10jiyun"],
  },
  gemtd_feicuimoxiang: {
    effect: "Petrification and armour reduction",
    design:
      "Large stone-gaze eye, grasping guardian shoulders and cracked plates.",
    sourceDescription: "has a chance to stone-gaze enemies.",
    abilities: [
      "tower_10jiyun",
      "tower_jin",
      "tower_shihua_new",
      "tower_attack4",
    ],
  },
  gemtd_huangcailanbaoshi: {
    effect: "Freezing slow aura",
    design:
      "Yellow core surrounded by icy spines, a sixfold frost crown and cold aura ring.",
    sourceDescription: "greatly slows nearby enemies.",
    abilities: ["tower_lanbaoshi"],
  },
  gemtd_haibao: {
    effect: "Ice aura and bouncing chain frost",
    design:
      "Frozen orb cradle and linked frost nodes suggest bouncing cold projectiles.",
    sourceDescription:
      "decreases movement speed of enemies around, can cast chain frost when pedals nearby triggered to deal magical damage and speed decrement.",
    abilities: ["tower_lanbaoshi", "tower_chain_frost"],
  },
  gemtd_xingguanglanbaoshi: {
    effect: "Strong ice and attack-speed auras",
    design:
      "Blue snowflake antenna with a wider frost halo and radiating star points.",
    sourceDescription:
      "reduce move speed of enemies in a middle range, and attack speed aura and slow enemy aura.",
    abilities: [
      "tower_true_sight",
      "tower_speed_aura6",
      "tower_slow6",
      "tower_lanbaoshi2",
      "e10001",
    ],
  },
  gemtd_palayibabixi: {
    effect: "Armour and magic-resistance reduction aura",
    design: "Turquoise core surrounded by split, peeled-back armour plates.",
    sourceDescription: "decreases nearby enemies' armor.",
    abilities: ["tower_bixi"],
  },
  gemtd_jingxindiaozhuodepalayibabixi: {
    effect: "Stronger resistance-shredding aura",
    design: "Multi-plate shredder cage and a fractured protective shell.",
    sourceDescription:
      "greatly reduces enemies' armor in range. This effect ignores magic immunity.",
    abilities: ["tower_10jiyun", "tower_bixi2"],
  },
  gemtd_sililankazhixing: {
    effect: "Poison, armour shred and freezing debuffs",
    design:
      "Icy corrosive core, broken armour and cold-green secondary crystals.",
    sourceDescription: "grant enemies several weird debuffs.",
    abilities: [
      "tower_du6",
      "tower_jianjia6",
      "tower_bixi2",
      "tower_jihan",
      "e10004",
    ],
  },
  gemtd_heisemaoyanshi: {
    effect: "Damage and speed auras; true sight",
    design: "Eye beacon and broadcast amplifier dish with radial signal vanes.",
    sourceDescription: "boosts attack damage of nearby gem towers.",
    abilities: ["tower_speed_aura5", "tower_true_sight", "tower_maoyan"],
  },
  gemtd_hongshanhu: {
    effect: "Multiple buffs and magic protection",
    design: "Branching coral antennae and layered broadcast/ward rings.",
    sourceDescription: "have several auras.",
    abilities: [
      "tower_speed_aura5",
      "tower_speed_aura4",
      "tower_true_sight",
      "tower_maoyan",
      "tower_chenmoguanghuan",
    ],
  },
  gemtd_yijiazhishi: {
    effect: "Extreme attack-speed aura and true sight",
    design:
      "Spoked conductor rotor, multiple signal horns and a central ruby eye.",
    sourceDescription: "have several auras, and drive towers around crazy!",
    abilities: [
      "tower_chenmoguanghuan",
      "tower_maoyan",
      "tower_speed_aura_guichu",
      "tower_true_sight",
      "e10009",
    ],
  },
  gemtd_jin: {
    effect: "Single-target armour reduction",
    design: "Gold chisel and crushing jaws visibly split a grey armour plate.",
    sourceDescription: "greatly reduces armor of a single enemy.",
    abilities: ["tower_jin"],
  },
  gemtd_aijijin: {
    effect: "Armour reduction and greed",
    design: "Stronger armour crusher with minted coin and weighing motifs.",
    sourceDescription:
      "greatly reduces armor of a single enemy, and has a chance to get gold on hit.",
    abilities: ["tower_jin2", "tower_tanlan", "tower_attack4"],
  },
  gemtd_fenhongzuanshi: {
    effect: "Critical hits and damage",
    design: "Pink diamond cleaver and heavy striking head.",
    sourceDescription: "attacks have a chance to crit.",
    abilities: ["tower_baoji1", "tower_attack3"],
  },
  gemtd_juxingfenhongzuanshi: {
    effect: "Critical cleave and slowing hits",
    design: "Wide twin-edged crystal cleaver with a few cold chips.",
    sourceDescription: "cleaves enemies on hit, attacks have a chance to crit.",
    abilities: [
      "tower_jianshe3",
      "tower_baoji1",
      "tower_attack4",
      "tower_slow3",
    ],
  },
  gemtd_keyinuoerguangmingzhishan: {
    effect: "Extreme damage, armour reduction, cleave and crits",
    design: "Diamond executioner wedge and visibly broken armour beneath it.",
    sourceDescription:
      "with extreme high attack damage and armor reduction, cleave, chances of crit.",
    abilities: [
      "tower_slow3",
      "tower_jianshe4",
      "tower_baoji1",
      "tower_attack6",
      "tower_jianjia6",
      "e301",
    ],
  },
  gemtd_jixueshi: {
    effect: "Chain lightning",
    design:
      "Forked electrodes and a bright zigzag chain between bloodstone nodes.",
    sourceDescription: "attacks have a chance to spark lightning chain.",
    abilities: ["tower_shandianlian"],
  },
  gemtd_gudaidejixueshi: {
    effect: "Forked lightning and burn aura",
    design:
      "Three-way conductor, branching lightning and ember-tipped terminals.",
    sourceDescription:
      "burns enemies in range, attacks have a chance to spark forked lightning.",
    abilities: ["tower_chazhuangshandian", "tower_huiyao2"],
  },
  gemtd_heiwangzihuangguanhongbaoshi: {
    effect: "Extreme burn, lightning and poison",
    design:
      "Crown-shaped lightning conductor with flame tips and venom accents.",
    sourceDescription:
      "with extreme high burn damage to enemies, chances of lightning and poison.",
    abilities: [
      "tower_chazhuangshandian",
      "tower_huiyao3",
      "tower_du6",
      "e10002",
    ],
  },
  gemtd_you238: {
    effect: "Rapid multi-target radiation attacks",
    design: "Radial volley nozzles surrounding a green reactor core.",
    sourceDescription: "attacks multiple enemies, fast attack speed.",
    abilities: ["tower_fenliejian_you"],
  },
  gemtd_you235: {
    effect: "Stronger rapid multi-target attacks",
    design: "Expanded crystal firing array and reinforced reactor stator.",
    sourceDescription: "attacks multiple enemies, fast attack speed.",
    abilities: ["tower_fenliejian_you", "tower_attack4"],
  },
  gemtd_shuaibiankaipayou: {
    effect: "Extreme-speed multi-target attacks",
    design: "Dense cyan-green volley array and a segmented acceleration ring.",
    sourceDescription:
      "with extreme high attack speed on multi enemies simultaneously.",
    abilities: ["tower_attack5", "tower_fenliejian_you", "e10003"],
  },
  gemtd_shenhaizhenzhu: {
    effect: "Magic-immunity support aura",
    design: "Pearl ward under a protective faceted canopy and shield petals.",
    sourceDescription: "help towers nearby resist magic influence.",
    abilities: ["tower_chenmoguanghuan"],
  },
  gemtd_tianranzumulv: {
    effect: "Steals three nearby tower abilities",
    design:
      "Emerald collector with three intake prongs and three captured ability jewels.",
    sourceDescription: "steal 3 abilities from towers around.",
    abilities: [],
  },
};
