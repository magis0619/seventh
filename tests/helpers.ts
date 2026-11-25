import type { SkillId } from '../src/data/skills';
import type { Rng } from '../src/core/rng';
import type { BaseStats, Item, Loadout } from '../src/core/types';
import { initialStats } from '../src/core/stats';

let n = 0;
/** 性能0のテスト用装備 */
export function item(skills: SkillId[], over: Partial<Item> = {}): Item {
  return {
    id: `t${n++}`,
    kind: 'weapon',
    type: '短剣',
    name: 'テスト',
    quality: 1,
    atk: 0,
    def: 0,
    hp: 0,
    luck: 0,
    skills,
    floor: 1,
    ...over,
  };
}

/** スキル配列の配列から装備4枠を作る（足りない枠は空） */
export function loadout(...slots: Array<SkillId[] | Item | null>): Loadout {
  const out: Loadout = [null, null, null, null];
  slots.forEach((s, i) => {
    if (s === null) return;
    if (Array.isArray(s)) {
      out[i] = item(s, { kind: i < 2 ? 'weapon' : 'armor' });
    } else out[i] = s;
  });
  return out;
}

export function stats(over: Partial<BaseStats> = {}): BaseStats {
  return { ...initialStats(), ...over };
}

/** 常に同じ値を返す乱数スタブ */
export function fixedRng(v: number): Rng {
  return { next: () => v, getState: () => 0, setState: () => {} };
}
