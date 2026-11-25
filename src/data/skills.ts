/**
 * スキル定義（設計表 §5.5 をデータ化）。
 * 効果の実装は core/skillEngine.ts の EFFECTS にある。ここは表示と抽選用のメタデータ。
 */
export type Tag = '鍛' | '魔' | '風' | '守';
export const TAGS: readonly Tag[] = ['鍛', '魔', '風', '守'];

export type SkillKind = '成長' | 'タグ' | 'トリガー' | '変換' | '自己参照';
export type SkillTiming = '戦闘開始' | '攻撃時' | '被弾時';

export type SkillId =
  | 'S01' | 'S02' | 'S03' | 'S04' | 'S05' | 'S06'
  | 'S07' | 'S08' | 'S09' | 'S10' | 'S11' | 'S12'
  | 'S13' | 'S14' | 'S15' | 'S16' | 'S17' | 'S18'
  | 'S19' | 'S20' | 'S21' | 'S22' | 'S23' | 'S24';

export interface SkillDef {
  id: SkillId;
  name: string;
  kind: SkillKind;
  tag: Tag;
  desc: string;
  timing: SkillTiming;
}

/** スキル効果で使う係数（balance と同様に一箇所にまとめる） */
export const SKILL_PARAMS = {
  S01: { add: 3 },
  S02: { perTag: 4 },
  S03: { repeats: 2 },
  S04: { ratio: 0.1 },
  S05: { ratio: 0.08 },
  S06: { luckCap: 90, mul: 2 },
  S07: { add: 4 },
  S08: { perTag: 4 },
  S09: { repeats: 1 },
  S10: { ratio: 1 },
  S11: { ratio: 0.1 },
  S12: { ratio: 0.1 },
  S13: { add: 1 },
  S14: { perTag: 1 },
  S15: { mul: 2 },
  S16: { ratio: 2 },
  S17: { perTurnCap: 10 },
  S18: { ratio: 0.1 },
  S19: { add: 3 },
  S20: { perTag: 3 },
  S21: { ratio: 1 },
  S22: { ratio: 1 },
  S23: { ratio: 0.1 },
  S24: { perBattle: 1 },
} as const;

export const SKILLS: Record<SkillId, SkillDef> = {
  S01: { id: 'S01', name: '筋トレ', kind: '成長', tag: '鍛', desc: '力 +3', timing: '戦闘開始' },
  S02: { id: 'S02', name: '鍛錬の型', kind: 'タグ', tag: '鍛', desc: '力 + 鍛タグの数 × 4', timing: '戦闘開始' },
  S03: { id: 'S03', name: '反復', kind: 'トリガー', tag: '鍛', desc: '直前のスキルを2回発動', timing: '戦闘開始' },
  S04: { id: 'S04', name: '重撃', kind: '変換', tag: '鍛', desc: '力 + 最大HP × 10%', timing: '戦闘開始' },
  S05: { id: 'S05', name: '鍛え直し', kind: '自己参照', tag: '鍛', desc: '力 + 力 × 8%（切り上げ）', timing: '戦闘開始' },
  S06: { id: 'S06', name: '博打', kind: '自己参照', tag: '鍛', desc: '運%（上限90%）で力 ×2', timing: '戦闘開始' },
  S07: { id: 'S07', name: '瞑想', kind: '成長', tag: '魔', desc: '魔力 +4', timing: '戦闘開始' },
  S08: { id: 'S08', name: '魔導書', kind: 'タグ', tag: '魔', desc: '魔力 + 魔タグの数 × 4', timing: '戦闘開始' },
  S09: { id: 'S09', name: '共鳴', kind: 'トリガー', tag: '魔', desc: '直後のスキルをもう1回発動', timing: '戦闘開始' },
  S10: { id: 'S10', name: '魔力転換', kind: '変換', tag: '魔', desc: '力 + 魔力', timing: '戦闘開始' },
  S11: { id: 'S11', name: '学者', kind: '変換', tag: '魔', desc: '魔力 + 力 × 10%', timing: '戦闘開始' },
  S12: { id: 'S12', name: '深淵', kind: '自己参照', tag: '魔', desc: '魔力 + 魔力 × 10%（切り上げ）', timing: '戦闘開始' },
  S13: { id: 'S13', name: '加速', kind: '成長', tag: '風', desc: '速さ +1', timing: '戦闘開始' },
  S14: { id: 'S14', name: '風の加護', kind: 'タグ', tag: '風', desc: '速さ + 風タグの数', timing: '戦闘開始' },
  S15: { id: 'S15', name: '追い風', kind: 'トリガー', tag: '風', desc: 'この戦闘中の攻撃回数 ×2', timing: '戦闘開始' },
  S16: { id: 'S16', name: '疾風剣', kind: '変換', tag: '風', desc: '力 + 速さ × 2', timing: '戦闘開始' },
  S17: { id: 'S17', name: '連撃', kind: 'トリガー', tag: '風', desc: '会心1回ごとに追加攻撃1回（1ターン上限10回）', timing: '攻撃時' },
  S18: { id: 'S18', name: '加速度', kind: '自己参照', tag: '風', desc: '速さ + 速さ × 10%（切り上げ）', timing: '戦闘開始' },
  S19: { id: 'S19', name: '鉄壁', kind: '成長', tag: '守', desc: '防御 +3', timing: '戦闘開始' },
  S20: { id: 'S20', name: '守りの陣', kind: 'タグ', tag: '守', desc: '防御 + 守タグの数 × 3', timing: '戦闘開始' },
  S21: { id: 'S21', name: '反撃', kind: 'トリガー', tag: '守', desc: '被弾するたび、攻撃 × 100% のダメージを返す', timing: '被弾時' },
  S22: { id: 'S22', name: '重装', kind: '変換', tag: '守', desc: '力 + 防御', timing: '戦闘開始' },
  S23: { id: 'S23', name: '金剛', kind: '自己参照', tag: '守', desc: '防御 + 防御 × 10%（切り上げ）', timing: '戦闘開始' },
  S24: { id: 'S24', name: '根性', kind: 'トリガー', tag: '守', desc: 'HPが0になる攻撃を、1戦闘に1回だけHP1で耐える', timing: '被弾時' },
};

export const ALL_SKILL_IDS = Object.keys(SKILLS) as SkillId[];
