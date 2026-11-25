import type { TowerId } from './dungeons';

export const WEAPON_TYPES = ['短剣', '長剣', '斧', '槍', '杖'] as const;
export const ARMOR_TYPES = ['兜', '鎧', '盾', '外套', '篭手'] as const;

/** 品質に応じた接頭辞（低 → 高） */
export const QUALITY_PREFIX = ['錆びた', '古びた', '', '良質な', '業物の'] as const;

export const ENEMY_NAMES: Record<TowerId, string[]> = {
  grass: ['スライム', '草むらの影', 'ツノウサギ', '野犬', 'マッドプラント', 'ゴブリン'],
  volcano: ['火トカゲ', '溶岩スライム', '煤の亡霊', 'ボムロック', '炎の小鬼', 'マグマ蛇'],
  abyss: ['虚ろな目', '影の手', '深き者', '囁く泥', '星喰い', '無貌の騎士'],
};

export const BOSS_NAMES: Record<TowerId, string[]> = {
  grass: ['森の番人', '大樹の王', '嵐の牡鹿', '翠玉竜', '草原の覇者'],
  volcano: ['炎獄の門番', '溶岩巨人', '灼熱の魔女', '紅蓮竜', '火山の主'],
  abyss: ['深淵の口', '万眼の王', '虚無の司祭', '冥竜', '終わりの塔主'],
};

export const STARTER_WEAPON_NAME = '旅立ちの短剣';
export const STARTER_ARMOR_NAME = '旅人の外套';
export const RESCUE_WEAPON_NAME = '拾った木の棒';
