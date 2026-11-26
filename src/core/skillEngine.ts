import { BALANCE } from '../data/balance';
import { SKILLS, SKILL_PARAMS, TAGS, type SkillId, type Tag } from '../data/skills';
import type { Rng } from './rng';
import { capNumber, computeEffective } from './stats';
import type { BaseStats, Loadout, SlotIndex, StatKey } from './types';

/** タグと、そのタグが伸ばすステータス（§5.4） */
export const TAG_STAT: Record<Tag, StatKey> = { 鍛: 'str', 魔: 'mag', 風: 'spd', 守: 'def' };

export interface SkillRef {
  slot: SlotIndex;
  /** 装備内でのスキルの順番 */
  index: number;
  skillId: SkillId;
}

export type ChangeKey = StatKey | 'battleMul';

export interface StatChange {
  key: ChangeKey;
  before: number;
  after: number;
  /** タグボーナス倍率（1なら無し） */
  tagMul: number;
}

export type SkillEventType =
  | 'effect' // ステータスが変化した
  | 'nochange' // 発動したが増加 0（例: 魔力0で深淵）
  | 'gamble_fail' // 博打失敗
  | 'fizzle' // 反復が先頭 / 共鳴が末尾
  | 'trigger' // 反復・共鳴が発動（このあと再発動が続く）
  | 'passive' // 攻撃時・被弾時スキルの待機
  | 'depth_limit' // 連鎖の深さ上限
  | 'cap'; // 発動回数上限

/** スキルが計算に使った値 */
export type SourceKey = StatKey | 'maxHp' | 'tag' | 'none';

export interface SkillEvent {
  seq: number;
  type: SkillEventType;
  /** 上限ログなど、スキルに紐付かないイベントは null */
  ref: SkillRef | null;
  depth: number;
  changes: StatChange[];
  /** 計算に使った値 */
  source: SourceKey;
  /**
   * 連鎖: このフェーズ中に「別のスキル」が伸ばした値を使って伸びた。
   * 例: 瞑想で増えた魔力を、魔力転換が力に流した
   */
  chain: boolean;
  /** 連鎖元のスキル（chain のとき） */
  chainFrom: SkillRef | null;
}

/** スキルが計算に使う値（UI の「魔力 → 力」表示にも使う） */
export const SKILL_SOURCE: Record<SkillId, SourceKey> = {
  S01: 'none', S02: 'tag', S03: 'none', S04: 'maxHp', S05: 'str', S06: 'str',
  S07: 'none', S08: 'tag', S09: 'none', S10: 'mag', S11: 'str', S12: 'mag',
  S13: 'none', S14: 'tag', S15: 'none', S16: 'spd', S17: 'none', S18: 'spd',
  S19: 'none', S20: 'tag', S21: 'none', S22: 'def', S23: 'def', S24: 'none',
};

export interface Passives {
  /** 連撃を持っているか */
  chain: boolean;
  /** 反撃の個数（1つにつき攻撃×100%） */
  counter: number;
  /** 根性を持っているか */
  guts: boolean;
}

export interface SkillPhaseResult {
  before: BaseStats;
  stats: BaseStats;
  battleMul: number;
  events: SkillEvent[];
  activations: number;
  truncated: boolean;
  passives: Passives;
}

/** 装備のスキルを発動順（武器1→武器2→防具1→防具2、各装備は上から）に並べる */
export function flattenSkills(loadout: Loadout): SkillRef[] {
  const out: SkillRef[] = [];
  loadout.forEach((it, slot) => {
    if (!it) return;
    it.skills.forEach((skillId, index) => out.push({ slot: slot as SlotIndex, index, skillId }));
  });
  return out;
}

export function countTags(loadout: Loadout): Record<Tag, number> {
  const c: Record<Tag, number> = { 鍛: 0, 魔: 0, 風: 0, 守: 0 };
  for (const r of flattenSkills(loadout)) c[SKILLS[r.skillId].tag]++;
  return c;
}

/** タグボーナス倍率: 3つ以上 ×2、5つ以上 ×3 */
export function tagMultiplier(count: number): number {
  for (const [need, mul] of BALANCE.tagBonus.tiers) if (count >= need) return mul;
  return 1;
}

export function tagMultipliers(loadout: Loadout): Record<Tag, number> {
  const c = countTags(loadout);
  const out = {} as Record<Tag, number>;
  for (const t of TAGS) out[t] = tagMultiplier(c[t]);
  return out;
}

export function computePassives(loadout: Loadout): Passives {
  const refs = flattenSkills(loadout);
  return {
    chain: refs.some((r) => r.skillId === 'S17'),
    counter: refs.filter((r) => r.skillId === 'S21').length,
    guts: refs.some((r) => r.skillId === 'S24'),
  };
}

/**
 * 戦闘開始時のスキルフェーズ。base は変更せず、新しいステータスを返す。
 */
export function runSkillPhase(base: BaseStats, loadout: Loadout, rng: Rng): SkillPhaseResult {
  const P = BALANCE.skillPhase;
  const seq = flattenSkills(loadout);
  const tagCount = countTags(loadout);
  const stats: BaseStats = { ...base };
  let battleMul = 1;
  const events: SkillEvent[] = [];
  let activations = 0;
  let truncated = false;

  const eff = () => computeEffective(stats, loadout);

  /** 各ステータスを最後に伸ばしたスキル（連鎖判定用） */
  const lastChangedBy: Partial<Record<StatKey, SkillRef>> = {};

  const push = (type: SkillEventType, ref: SkillRef | null, depth: number, changes: StatChange[] = []) => {
    const source: SourceKey = ref ? SKILL_SOURCE[ref.skillId] : 'none';
    let chainFrom: SkillRef | null = null;
    if (type === 'effect' && ref && source !== 'none' && source !== 'tag' && source !== 'maxHp') {
      const from = lastChangedBy[source];
      // 自分自身が伸ばした値を読むのは連鎖ではない（別スキルからの流れだけ）
      if (from && !(from.slot === ref.slot && from.index === ref.index)) chainFrom = from;
    }
    events.push({ seq: events.length, type, ref, depth, changes, source, chain: chainFrom !== null, chainFrom });
    if (type === 'effect' && ref) {
      for (const c of changes) if (c.key !== 'battleMul') lastChangedBy[c.key] = ref;
    }
  };

  /** ステータス加算。スキルのタグが伸ばすステータスと一致すればタグボーナスを掛ける */
  const add = (key: StatKey, amount: number, tag: Tag, allowTagBonus = true): StatChange => {
    const mul = allowTagBonus && TAG_STAT[tag] === key ? tagMultiplier(tagCount[tag]) : 1;
    const before = stats[key];
    const after = capNumber(before + amount * mul);
    stats[key] = after;
    return { key, before, after, tagMul: mul };
  };

  const activate = (i: number, depth: number): void => {
    if (activations >= P.maxActivations) {
      if (!truncated) {
        truncated = true;
        push('cap', null, depth);
      }
      return;
    }
    activations++;
    const ref = seq[i];
    const def = SKILLS[ref.skillId];
    const tag = def.tag;
    const e = eff();
    let change: StatChange | null = null;

    switch (ref.skillId) {
      case 'S01':
        change = add('str', SKILL_PARAMS.S01.add, tag);
        break;
      case 'S02':
        change = add('str', tagCount['鍛'] * SKILL_PARAMS.S02.perTag, tag);
        break;
      case 'S03': {
        if (i === 0) return push('fizzle', ref, depth);
        push('trigger', ref, depth);
        for (let r = 0; r < SKILL_PARAMS.S03.repeats; r++) reactivate(i - 1, depth + 1, ref);
        return;
      }
      case 'S04':
        change = add('str', Math.floor(e.maxHp * SKILL_PARAMS.S04.ratio), tag);
        break;
      case 'S05':
        change = add('str', Math.ceil(stats.str * SKILL_PARAMS.S05.ratio), tag);
        break;
      case 'S06': {
        const chance = Math.min(e.luck, SKILL_PARAMS.S06.luckCap) / 100;
        if (rng.next() < chance) {
          // 倍化は乗算なのでタグボーナスの対象外
          change = add('str', stats.str * (SKILL_PARAMS.S06.mul - 1), tag, false);
        } else {
          return push('gamble_fail', ref, depth);
        }
        break;
      }
      case 'S07':
        change = add('mag', SKILL_PARAMS.S07.add, tag);
        break;
      case 'S08':
        change = add('mag', tagCount['魔'] * SKILL_PARAMS.S08.perTag, tag);
        break;
      case 'S09': {
        if (i === seq.length - 1) return push('fizzle', ref, depth);
        push('trigger', ref, depth);
        for (let r = 0; r < SKILL_PARAMS.S09.repeats; r++) reactivate(i + 1, depth + 1, ref);
        return;
      }
      case 'S10':
        change = add('str', stats.mag * SKILL_PARAMS.S10.ratio, tag);
        break;
      case 'S11':
        change = add('mag', Math.floor(stats.str * SKILL_PARAMS.S11.ratio), tag);
        break;
      case 'S12':
        change = add('mag', Math.ceil(stats.mag * SKILL_PARAMS.S12.ratio), tag);
        break;
      case 'S13':
        change = add('spd', SKILL_PARAMS.S13.add, tag);
        break;
      case 'S14':
        change = add('spd', tagCount['風'] * SKILL_PARAMS.S14.perTag, tag);
        break;
      case 'S15': {
        const before = battleMul;
        battleMul = capNumber(battleMul * SKILL_PARAMS.S15.mul);
        change = { key: 'battleMul', before, after: battleMul, tagMul: 1 };
        break;
      }
      case 'S16':
        change = add('str', stats.spd * SKILL_PARAMS.S16.ratio, tag);
        break;
      case 'S18':
        change = add('spd', Math.ceil(stats.spd * SKILL_PARAMS.S18.ratio), tag);
        break;
      case 'S19':
        change = add('def', SKILL_PARAMS.S19.add, tag);
        break;
      case 'S20':
        change = add('def', tagCount['守'] * SKILL_PARAMS.S20.perTag, tag);
        break;
      case 'S22':
        change = add('str', e.defense * SKILL_PARAMS.S22.ratio, tag);
        break;
      case 'S23':
        change = add('def', Math.ceil(e.defense * SKILL_PARAMS.S23.ratio), tag);
        break;
      case 'S17':
      case 'S21':
      case 'S24':
        return push('passive', ref, depth);
    }
    if (change && change.after !== change.before) push('effect', ref, depth, [change]);
    else push('nochange', ref, depth, change ? [change] : []);
  };

  const reactivate = (i: number, depth: number, from: SkillRef) => {
    if (depth > P.maxDepth) {
      push('depth_limit', from, depth);
      return;
    }
    activate(i, depth);
  };

  for (let i = 0; i < seq.length; i++) activate(i, 0);

  return {
    before: { ...base },
    stats,
    battleMul,
    events,
    activations,
    truncated,
    passives: computePassives(loadout),
  };
}

export interface PhaseSummary {
  /** 別スキルが伸ばした値を使って伸びた回数 */
  chains: number;
  /** 反復・共鳴による再発動で効果が出た回数 */
  refires: number;
  /** タグボーナスが乗った回数 */
  tagBoosts: number;
}

export function summarizePhase(r: SkillPhaseResult): PhaseSummary {
  let chains = 0;
  let refires = 0;
  let tagBoosts = 0;
  for (const e of r.events) {
    if (e.type !== 'effect') continue;
    if (e.chain) chains++;
    if (e.depth > 0) refires++;
    if (e.changes.some((c) => c.tagMul > 1)) tagBoosts++;
  }
  return { chains, refires, tagBoosts };
}
