import { BALANCE } from '../data/balance';
import { TOWER_IDS, type TowerId } from '../data/dungeons';
import { STARTER_ARMOR_NAME, STARTER_WEAPON_NAME } from '../data/names';
import { makeItem } from './itemGen';
import type { Rng } from './rng';
import type { Item, Loadout } from './types';

export interface TowerProgress {
  /** 挑戦開始できる最も高い階（1, 21, 41, ...） */
  checkpoint: number;
  /** この塔での最高到達階 */
  maxFloor: number;
  cleared: boolean;
}

export interface Profile {
  version: 1;
  loadout: Loadout;
  storage: Item[];
  towers: Record<TowerId, TowerProgress>;
  bestFloor: number;
  /** ランごとのシード生成用カウンタ */
  runCounter: number;
}

export const SAVE_KEY = 'synergy-tower-save-v2';

export function newProfile(rng: Rng): Profile {
  const towers = {} as Record<TowerId, TowerProgress>;
  for (const id of TOWER_IDS) towers[id] = { checkpoint: 1, maxFloor: 0, cleared: false };
  return {
    version: 1,
    loadout: [
      makeItem(rng, { kind: 'weapon', floor: 1, quality: 1, type: '短剣', name: STARTER_WEAPON_NAME, skills: [...BALANCE.starter.weaponSkills] }),
      null,
      makeItem(rng, { kind: 'armor', floor: 1, quality: 1, type: '外套', name: STARTER_ARMOR_NAME, skills: [...BALANCE.starter.armorSkills] }),
      null,
    ],
    storage: [],
    towers,
    bestFloor: 0,
    runCounter: 0,
  };
}

/** 開始可能な階の一覧（1 と、撃破済みボスの次の階） */
export function startFloors(p: TowerProgress): number[] {
  const out: number[] = [];
  for (let f = 1; f <= p.checkpoint; f += BALANCE.explore.bossInterval) out.push(f);
  return out;
}

export function storageFull(p: Profile): boolean {
  return p.storage.length >= BALANCE.storage.capacity;
}

export interface KVStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export function saveProfile(store: KVStore, p: Profile): void {
  store.setItem(SAVE_KEY, JSON.stringify(p));
}

export function loadProfile(store: KVStore, rng: Rng): Profile {
  const raw = store.getItem(SAVE_KEY);
  if (!raw) return newProfile(rng);
  try {
    const p = JSON.parse(raw) as Profile;
    if (p.version !== 1 || !Array.isArray(p.loadout) || p.loadout.length !== 4) return newProfile(rng);
    const fresh = newProfile(rng);
    for (const id of TOWER_IDS) if (!p.towers[id]) p.towers[id] = fresh.towers[id];
    return p;
  } catch {
    return newProfile(rng);
  }
}

export function clearSave(store: KVStore): void {
  store.removeItem(SAVE_KEY);
}
