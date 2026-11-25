import type { Tag } from './skills';

export type TowerId = 'grass' | 'volcano' | 'abyss';

export interface TowerDef {
  id: TowerId;
  name: string;
  /** 難度倍率（敵HP・攻撃に掛かる） */
  difficulty: number;
  /** スキル抽選時のタグの重み */
  tagWeights: Record<Tag, number>;
  /** スキル数抽選の p に加算 */
  skillPBonus: number;
  /** 通路の色味 */
  palette: { wall: string; floor: string; ceil: string; line: string; fog: string };
}

export const TOWERS: Record<TowerId, TowerDef> = {
  grass: {
    id: 'grass',
    name: '草原の塔',
    difficulty: 1.0,
    tagWeights: { 鍛: 2, 魔: 1, 風: 1, 守: 2 },
    skillPBonus: 0,
    palette: { wall: '#2f5a32', floor: '#1d3a1f', ceil: '#14261a', line: '#7fc77f', fog: '#0a140b' },
  },
  volcano: {
    id: 'volcano',
    name: '火山の塔',
    difficulty: 1.5,
    tagWeights: { 鍛: 2, 魔: 2, 風: 1, 守: 1 },
    skillPBonus: 0,
    palette: { wall: '#6a2a1c', floor: '#3a160e', ceil: '#24100a', line: '#ff9a5c', fog: '#140605' },
  },
  abyss: {
    id: 'abyss',
    name: '深淵の塔',
    difficulty: 2.2,
    tagWeights: { 鍛: 1, 魔: 1, 風: 1, 守: 1 },
    skillPBonus: 0.1,
    palette: { wall: '#3d2560', floor: '#22143a', ceil: '#160c26', line: '#c79bff', fog: '#08040f' },
  },
};

export const TOWER_IDS = Object.keys(TOWERS) as TowerId[];
