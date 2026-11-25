import type { SkillId } from '../data/skills';
import type { TowerId } from '../data/dungeons';

export type ItemKind = 'weapon' | 'armor';

export interface Item {
  id: string;
  kind: ItemKind;
  /** 種類名（短剣・兜など） */
  type: string;
  name: string;
  /** 0.6〜1.4 */
  quality: number;
  atk: number;
  def: number;
  hp: number;
  luck: number;
  skills: SkillId[];
  /** 生成された階 */
  floor: number;
}

/** 装備4枠: 0,1 = 武器 / 2,3 = 防具（スキルフェーズの発動順でもある） */
export type SlotIndex = 0 | 1 | 2 | 3;
export type Loadout = [Item | null, Item | null, Item | null, Item | null];
export const WEAPON_SLOTS: readonly SlotIndex[] = [0, 1];
export const ARMOR_SLOTS: readonly SlotIndex[] = [2, 3];
export const ALL_SLOTS: readonly SlotIndex[] = [0, 1, 2, 3];

export function slotKind(slot: SlotIndex): ItemKind {
  return slot < 2 ? 'weapon' : 'armor';
}

/** スキルで伸びる「素」のステータス（ラン中のみ有効） */
export interface BaseStats {
  str: number;
  spd: number;
  mag: number;
  def: number;
  luck: number;
}
export type StatKey = keyof BaseStats;

/** 装備込みの実効ステータス */
export interface EffectiveStats {
  /** 力（素） */
  str: number;
  /** 攻撃 = 力 + 武器攻撃 */
  attack: number;
  spd: number;
  mag: number;
  /** 防御 = 防御（素） + 防具防御 */
  defense: number;
  luck: number;
  maxHp: number;
}

export interface Enemy {
  name: string;
  floor: number;
  isBoss: boolean;
  maxHp: number;
  hp: number;
  atk: number;
  spd: number;
  towerId: TowerId;
}
