import { BALANCE } from '../data/balance';
import { TOWERS, type TowerId } from '../data/dungeons';
import { ARMOR_TYPES, QUALITY_PREFIX, WEAPON_TYPES } from '../data/names';
import { ALL_SKILL_IDS, SKILLS, type SkillId } from '../data/skills';
import { pick, randInt, randRange, weightedPick, type Rng } from './rng';
import type { Item, ItemKind } from './types';

export type Rarity = 'normal' | 'rare' | 'epic' | 'legend';
export const RARITY_BY_COUNT: Rarity[] = ['normal', 'rare', 'epic', 'legend'];
export const RARITY_LABEL: Record<Rarity, string> = {
  normal: 'ノーマル',
  rare: 'レア',
  epic: 'エピック',
  legend: 'レジェンド',
};

export function rarityOf(item: Item): Rarity {
  return RARITY_BY_COUNT[Math.min(item.skills.length, 3)];
}

/** 品質 0.6〜1.4 を UI 表示用の 43〜100% に変換 */
export function qualityPercent(q: number): number {
  return Math.round((q / BALANCE.item.qualityMax) * 100);
}

/** スキル数抽選の初期確率 p */
export function skillRollP(luck: number, isBoss: boolean, towerBonus: number): number {
  const s = BALANCE.skillRoll;
  return Math.min(s.pMax, s.pBase + luck / s.luckDivisor + (isBoss ? s.bossBonus : 0) + towerBonus);
}

/** スキル数の抽選（§5.2） */
export function rollSkillCount(rng: Rng, luck: number, isBoss: boolean, towerBonus = 0): number {
  const s = BALANCE.skillRoll;
  let p = skillRollP(luck, isBoss, towerBonus);
  let n = 0;
  while (n < s.maxSkills && rng.next() < p) {
    n++;
    p *= s.decay;
  }
  if (isBoss) n = Math.max(n, s.bossMinSkills);
  return n;
}

/** 塔のタグ重みに従って重複なしでスキルを選ぶ */
export function rollSkills(rng: Rng, count: number, towerId: TowerId): SkillId[] {
  const weights = TOWERS[towerId].tagWeights;
  const pool = [...ALL_SKILL_IDS];
  const out: SkillId[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const id = weightedPick(
      rng,
      pool,
      pool.map((s) => weights[SKILLS[s].tag]),
    );
    out.push(id);
    pool.splice(pool.indexOf(id), 1);
  }
  return out;
}

let idCounter = 0;
export function newItemId(rng: Rng): string {
  idCounter = (idCounter + 1) % 1e6;
  return `i${Date.now().toString(36)}${idCounter.toString(36)}${Math.floor(rng.next() * 1e6).toString(36)}`;
}

function qualityName(type: string, quality: number): string {
  const B = BALANCE.item;
  const t = (quality - B.qualityMin) / (B.qualityMax - B.qualityMin);
  const idx = Math.min(QUALITY_PREFIX.length - 1, Math.max(0, Math.floor(t * QUALITY_PREFIX.length)));
  return `${QUALITY_PREFIX[idx]}${type}`;
}

export interface ItemSpec {
  kind: ItemKind;
  floor: number;
  quality: number;
  type?: string;
  name?: string;
  luck?: number;
  skills?: SkillId[];
}

/** 決まった性能から装備を作る（スターター装備やデバッグ用） */
export function makeItem(rng: Rng, spec: ItemSpec): Item {
  const B = BALANCE.item;
  const type = spec.type ?? (spec.kind === 'weapon' ? WEAPON_TYPES[0] : ARMOR_TYPES[0]);
  const q = spec.quality;
  const F = spec.floor;
  const isW = spec.kind === 'weapon';
  return {
    id: newItemId(rng),
    kind: spec.kind,
    type,
    name: spec.name ?? qualityName(type, q),
    quality: q,
    atk: isW ? Math.max(1, Math.round((B.weaponAtkBase + F * B.weaponAtkPerFloor) * q)) : 0,
    def: isW ? 0 : Math.max(1, Math.round((B.armorDefBase + F * B.armorDefPerFloor) * q)),
    hp: isW ? 0 : Math.max(1, Math.round((B.armorHpBase + F * B.armorHpPerFloor) * q)),
    luck: spec.luck ?? 0,
    skills: spec.skills ? [...spec.skills] : [],
    floor: F,
  };
}

export interface GenOptions {
  floor: number;
  towerId: TowerId;
  /** 抽選に使う運（プレイヤーの実効運） */
  luck: number;
  isBoss: boolean;
  kind?: ItemKind;
}

/** ランダムな装備を生成する（§5.1, §5.2） */
export function generateItem(rng: Rng, o: GenOptions): Item {
  const B = BALANCE.item;
  const kind: ItemKind = o.kind ?? (rng.next() < 0.5 ? 'weapon' : 'armor');
  const type = pick(rng, kind === 'weapon' ? WEAPON_TYPES : ARMOR_TYPES);
  const quality = randRange(rng, B.qualityMin, B.qualityMax);
  const luck = rng.next() < B.luckChance ? randInt(rng, B.luckMin, B.luckMax) : 0;
  const n = rollSkillCount(rng, o.luck, o.isBoss, TOWERS[o.towerId].skillPBonus);
  const skills = rollSkills(rng, n, o.towerId);
  return makeItem(rng, { kind, floor: o.floor, quality, type, luck, skills });
}
