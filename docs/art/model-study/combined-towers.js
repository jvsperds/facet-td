import { combinedBuildersA } from "./combined-heads-a.js";
import { combinedBuildersB } from "./combined-heads-b.js";
import { COMBINED_EFFECTS } from "./combined-effect-notes.js";

// Canonical remaining combined towers; display variants do not change gameplay data.
const families = [
  {
    family: "Asteriated Ruby",
    shape: "ruby",
    color: "#c84259",
    sides: 6,
    variants: [
      ["gemtd_xingcaihongbaoshi", "Asteriated Ruby"],
      ["gemtd_xuehonghuoshan", "Volcano", "volcano"],
    ],
  },
  {
    family: "Jade",
    shape: "jade",
    color: "#53ad89",
    sides: 8,
    variants: [
      ["gemtd_yu", "Jade"],
      ["gemtd_haiyangqingyu", "Gray Jade", "gray", "#829b99"],
      ["gemtd_jixiangdezhongguoyu", "Lucky Chinese Jade", "lucky"],
      ["gemtd_huaguoshanxiandan", "Monkey King Jade", "monkey"],
      ["gemtd_jingangshikulinan", "Diamond Cullinan", "cullinan", "#dceef2"],
    ],
  },
  {
    family: "Quartz",
    shape: "quartz",
    color: "#e0b5d5",
    sides: 6,
    variants: [
      ["gemtd_furongshi", "Quartz"],
      ["gemtd_mirendeqingjinshi", "Charming Lazurite", "lapis", "#4676c0"],
      ["gemtd_huguoshenyishi", "Golden Jubilee", "jubilee", "#edbe54"],
    ],
  },
  {
    family: "Dark Emerald",
    shape: "dark-emerald",
    color: "#21624f",
    sides: 8,
    variants: [
      ["gemtd_heianfeicui", "Dark Emerald"],
      ["gemtd_feicuimoxiang", "Emerald Golem", "golem"],
    ],
  },
  {
    family: "Yellow Sapphire",
    shape: "yellow-sapphire",
    color: "#e3b84d",
    sides: 6,
    variants: [
      ["gemtd_huangcailanbaoshi", "Yellow Sapphire"],
      ["gemtd_haibao", "Northern Saber's Eye", "saber", "#607b9b"],
      ["gemtd_xingguanglanbaoshi", "Star Sapphire", "star", "#4c7bcf"],
    ],
  },
  {
    family: "Paraiba Tourmaline",
    shape: "paraiba",
    color: "#43c2bd",
    sides: 6,
    variants: [
      ["gemtd_palayibabixi", "Paraiba Tourmaline"],
      [
        "gemtd_jingxindiaozhuodepalayibabixi",
        "Elaborately Carved Tourmaline",
        "carved",
      ],
      ["gemtd_sililankazhixing", "Sapphire Star of Adam", "adam", "#4f87d6"],
    ],
  },
  {
    family: "Cat's Eye",
    shape: "cat-eye",
    color: "#b3b864",
    sides: 8,
    variants: [
      ["gemtd_heisemaoyanshi", "Chrysoberyl Cat's Eye"],
      ["gemtd_hongshanhu", "Red Coral", "coral", "#d15c59"],
      ["gemtd_yijiazhishi", "Carmen-Lucia", "carmen", "#bb3556"],
    ],
  },
  {
    family: "Gold",
    shape: "gold",
    color: "#dfb04e",
    sides: 8,
    variants: [
      ["gemtd_jin", "Gold"],
      ["gemtd_aijijin", "Egypt Gold", "egypt"],
    ],
  },
  {
    family: "Pink Diamond",
    shape: "pink-diamond",
    color: "#e68fb9",
    sides: 8,
    variants: [
      ["gemtd_fenhongzuanshi", "Pink Diamond"],
      ["gemtd_juxingfenhongzuanshi", "Huge Pink Diamond", "huge"],
      [
        "gemtd_keyinuoerguangmingzhishan",
        "Koh-i-noor Diamond",
        "kohinoor",
        "#e5edf4",
      ],
    ],
  },
  {
    family: "Bloodstone",
    shape: "bloodstone",
    color: "#497769",
    sides: 6,
    variants: [
      ["gemtd_jixueshi", "Bloodstone"],
      ["gemtd_gudaidejixueshi", "Antique Bloodstone", "antique"],
      [
        "gemtd_heiwangzihuangguanhongbaoshi",
        "The Crown Prince",
        "prince",
        "#982f49",
      ],
    ],
  },
  {
    family: "Uranium",
    shape: "uranium",
    color: "#93bc50",
    sides: 6,
    variants: [
      ["gemtd_you238", "Uranium-238"],
      ["gemtd_you235", "Uranium-235", "235"],
      ["gemtd_shuaibiankaipayou", "Depleted-Kyparium", "depleted", "#53a6a0"],
    ],
  },
  {
    family: "DeepSea Pearl",
    shape: "pearl",
    color: "#e6e5d8",
    sides: 8,
    variants: [
      ["gemtd_shenhaizhenzhu", "DeepSea Pearl"],
      ["gemtd_tianranzumulv", "Natural Zumurud", "zumurud", "#3daf84"],
    ],
  },
];

export const COMBINED_FAMILIES = families.map((group) => group.family);
export const COMBINED_TOWERS = families.flatMap((group) =>
  group.variants.map(
    ([id, name, variant = "", color = group.color], stage) => ({
      id,
      name,
      family: group.family,
      shape: group.shape,
      sides: group.sides,
      color,
      stage,
      variant,
      quality: Math.min(6, 4 + stage),
      extended: true,
      headDrop:
        group.shape === "quartz" ||
        group.shape === "gold" ||
        group.shape === "bloodstone"
          ? 0.04
          : group.shape === "pink-diamond" && stage > 0
            ? 0.03
            : group.shape === "yellow-sapphire" && variant === "star"
              ? 0.025
              : 0,
      headWidthScale:
        group.shape === "paraiba" && variant === "carved" ? 0.98 : 1,
      ...COMBINED_EFFECTS[id],
    }),
  ),
);

export function buildCombinedTower(tools, spec) {
  const build = combinedBuildersA[spec.shape] ?? combinedBuildersB[spec.shape];
  if (!build) throw new RangeError(`No combined silhouette for ${spec.shape}`);
  return build(tools, spec);
}
