import { GEM_TYPES } from '../docs/art/model-study/models.js';

/** The six cave creatures every creep is drawn as (models in world/creep-model.ts). */
export type CreepKind = 'burrower' | 'crawler' | 'golem' | 'bat' | 'wisp' | 'wyrm';
const KIND_NAMES: Record<CreepKind, string> = {
  burrower: 'Burrower',
  crawler: 'Crawler',
  golem: 'Golem',
  bat: 'Cave Bat',
  wisp: 'Wisp',
  wyrm: 'Wyrm',
};
const GEM_NAMES: Record<string, string> = {
  d: 'Diamond',
  b: 'Sapphire',
  y: 'Topaz',
  r: 'Ruby',
  g: 'Emerald',
  e: 'Opal',
  q: 'Aquamarine',
  p: 'Amethyst',
};

/**
 * Facet's creeps, replacing the original's Dota courier names: a cave creature and the gem its
 * crystals take after, shown as "<Gem> <Creature>". Display only: unit ids, stats and rules stay
 * the original's. The creature follows the original model's shape; flyers are bats or wisps and
 * every boss is a wyrm.
 */
const THEME: Record<string, [kind: CreepKind, gem: string]> = {
  gemtd_kuangbaoyezhu: ['burrower', 'd'],
  gemtd_kuaidiqingwatiaotiao: ['crawler', 'q'],
  gemtd_zhongchenggaoshanmaoniu: ['burrower', 'b'],
  gemtd_moluokedejixiezhushou: ['golem', 'y'],
  gemtd_wuweizhihuan_fly: ['wisp', 'e'],
  gemtd_shudunziranzhizhu: ['golem', 'g'],
  gemtd_chaomengjuxi: ['crawler', 'r'],
  gemtd_mengzhu: ['crawler', 'p'],
  gemtd_dashiqi: ['burrower', 'p'],
  gemtd_buquzhanquan_boss: ['wyrm', 'r'],
  gemtd_maorongrongdefeiyangyang: ['burrower', 'd'],
  gemtd_caonimalama: ['burrower', 'y'],
  gemtd_fengtungongzhu: ['burrower', 'd'],
  gemtd_bugou: ['burrower', 'b'],
  gemtd_banzhuduizhang_fly: ['bat', 'g'],
  gemtd_xunjiemotong: ['golem', 'r'],
  gemtd_yonggandexiaoji: ['burrower', 'y'],
  gemtd_xiaobajie: ['burrower', 'y'],
  gemtd_shentu: ['burrower', 'e'],
  gemtd_huxiaotao_boss: ['wyrm', 'g'],
  gemtd_siwangsiliezhe: ['crawler', 'd'],
  gemtd_yaorenxiangluoke: ['crawler', 'b'],
  gemtd_tiezuiyaorenxiang: ['crawler', 'd'],
  gemtd_jixieyaorenxiang: ['crawler', 'y'],
  gemtd_fengbaozhizikesaier_fly: ['bat', 'b'],
  gemtd_niepanhuolieniao: ['burrower', 'r'],
  gemtd_lgddejinmengmeng_fly: ['wisp', 'y'],
  gemtd_youniekesizhinu_fly: ['bat', 'r'],
  gemtd_feihuxia_fly: ['bat', 'e'],
  gemtd_mofafeitanxiaoemo_boss_fly: ['wyrm', 'p'],
  gemtd_modianxiaolong: ['crawler', 'b'],
  gemtd_xiaoshayu: ['crawler', 'q'],
  gemtd_feijiangxiaobao: ['golem', 'd'],
  gemtd_shangjinbaobao_fly: ['bat', 'y'],
  gemtd_jinyinhuling_fly: ['bat', 'd'],
  gemtd_cuihua: ['golem', 'g'],
  gemtd_xiaobaihu: ['burrower', 'q'],
  gemtd_xiaoxingyue: ['golem', 'p'],
  gemtd_liangqiyuhai_fly: ['wisp', 'q'],
  gemtd_guixiaoxieling_boss_fly: ['wyrm', 'e'],
  gemtd_weilanlong: ['crawler', 'b'],
  gemtd_saodiekupu_fly: ['wisp', 'y'],
  gemtd_maomaoyu: ['crawler', 'q'],
  gemtd_xiaomogu: ['golem', 'g'],
  gemtd_jiujiu_fly: ['bat', 'e'],
  gemtd_siwangxintu: ['golem', 'p'],
  gemtd_jilamofashi: ['golem', 'p'],
  gemtd_xiaofeixia_fly: ['bat', 'd'],
  gemtd_juniaoduoduo: ['burrower', 'd'],
  gemtd_roushan_boss_fly: ['wyrm', 'r'],
  gemtd_xiaohongmao_fly: ['bat', 'r'],
  gemtd_tianmaodigou_fly: ['bat', 'y'],
  gemtd_yaobaidelvgemi: ['golem', 'y'],
  gemtd_xiexiaowo: ['crawler', 'p'],
  gemtd_dazuiyaorenxiang: ['crawler', 'g'],
  gemtd_jixiezhanlv: ['golem', 'd'],
  gemtd_huoxingche_fly: ['wisp', 'y'],
  gemtd_ruxingshuimu_fly: ['wisp', 'q'],
  gemtd_xiaofamuji_fly: ['wisp', 'd'],
  gemtd_yingwuchuanfu_fly: ['bat', 'b'],
  gemtd_talongaosiji: ['crawler', 'q'],
  gemtd_siwangxianzhi: ['golem', 'p'],
  gemtd_xuemobaobao_fly: ['bat', 'r'],
  gemtd_fennenrongyuan_fly: ['wisp', 'e'],
  gemtd_cuiyuxiaolong: ['crawler', 'g'],
  gemtd_xunjieyuanzumaolv: ['burrower', 'b'],
  gemtd_jiwanghaidao_fly: ['wisp', 'y'],
  gemtd_yuediyang_boss: ['wyrm', 'p'],
  gemtd_zard_boss_fly: ['wyrm', 'r'],
  gemtd_gugubiao_boss_fly: ['wyrm', 'e'],
  gemtd_roushan_boss_fly_jin: ['wyrm', 'y'],
  gemtd_roushan_boss_fly_bojin: ['wyrm', 'd'],
};

/** A creep's theme; the "…1" variants some waves spawn share their base creep's. */
export function creepTheme(unit: string) {
  const entry = THEME[unit] ?? THEME[unit.replace(/1$/, '')];
  if (!entry) return undefined;
  const [kind, gem] = entry;
  const type = GEM_TYPES.find((g: { id: string }) => g.id === gem.toUpperCase());
  return {
    kind,
    gem,
    name: `${GEM_NAMES[gem]} ${KIND_NAMES[kind]}`,
    color: (type?.color as string) ?? '#cf9ae9',
  };
}
