import { BALANCE } from '../data/balance';
import type { BaseStats, EffectiveStats, Loadout, StatKey } from './types';

export const STAT_LABEL: Record<StatKey, string> = {
  str: '力',
  spd: '速さ',
  mag: '魔力',
  def: '防御',
  luck: '運',
};

export function initialStats(): BaseStats {
  return { ...BALANCE.player.initial };
}

/** 数値を有限かつ上限以内に収める（double のオーバーフロー対策） */
export function capNumber(v: number): number {
  if (Number.isNaN(v)) return 0;
  if (v > BALANCE.numberCap || v === Infinity) return BALANCE.numberCap;
  return v;
}

export function computeEffective(base: BaseStats, loadout: Loadout): EffectiveStats {
  let weaponAtk = 0;
  let armorDef = 0;
  let armorHp = 0;
  let equipLuck = 0;
  loadout.forEach((it, i) => {
    if (!it) return;
    if (i < 2) weaponAtk += it.atk;
    else {
      armorDef += it.def;
      armorHp += it.hp;
    }
    equipLuck += it.luck;
  });
  return {
    str: base.str,
    attack: capNumber(base.str + weaponAtk),
    spd: base.spd,
    mag: base.mag,
    defense: capNumber(base.def + armorDef),
    luck: base.luck + equipLuck,
    maxHp: BALANCE.player.baseMaxHp + armorHp,
  };
}

/** 1ターンの基本攻撃回数（小数切り捨て、最低1） */
export function hitsPerTurn(spd: number, battleMul: number): number {
  return Math.max(BALANCE.player.minHits, Math.floor(capNumber(spd * battleMul)));
}

/** 会心数 = round(攻撃回数 × min(運,100)/100) */
export function critCount(hits: number, luck: number): number {
  const rate = Math.min(Math.max(luck, 0), BALANCE.player.critLuckCap) / 100;
  return Math.round(hits * rate);
}

/** 会心ダメージ倍率 = 3 + max(0, 運-100)/50 */
export function critMultiplier(luck: number): number {
  const p = BALANCE.player;
  return p.critBase + Math.max(0, luck - p.critLuckCap) / p.critOverDivisor;
}

/** 逃走成功率 */
export function escapeChance(playerSpd: number, enemySpd: number, isBoss: boolean): number {
  const e = BALANCE.escape;
  if (isBoss) return e.boss;
  const p = e.base + (playerSpd - enemySpd) * e.perSpeedDiff;
  return Math.min(e.max, Math.max(e.min, p));
}

/** 被ダメージ = max(1, 敵攻撃 - 防御) */
export function damageTaken(enemyAtk: number, defense: number): number {
  return Math.max(BALANCE.enemy.minDamage, Math.ceil(enemyAtk - defense));
}
