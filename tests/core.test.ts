import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';
import { generateItem, makeItem, qualityPercent, rarityOf, rollSkillCount, rollSkills, skillRollP } from '../src/core/itemGen';
import { critCount, critMultiplier, damageTaken, escapeChance, hitsPerTurn, computeEffective } from '../src/core/stats';
import { createEnemy, enemyStats, isBossFloor, startBattle, tryEscape } from '../src/core/battle';
import { SKILLS } from '../src/data/skills';
import { BALANCE } from '../src/data/balance';
import { item, loadout, stats } from './helpers';

describe('乱数', () => {
  it('同じシードなら同じ列', () => {
    const a = createRng(123);
    const b = createRng(123);
    for (let i = 0; i < 10; i++) expect(a.next()).toBe(b.next());
  });
  it('状態を保存・復元できる', () => {
    const a = createRng(5);
    a.next();
    const s = a.getState();
    const v = a.next();
    a.setState(s);
    expect(a.next()).toBe(v);
  });
});

describe('計算式', () => {
  it('攻撃 = 力 + 武器攻撃合計、防御・運・最大HP', () => {
    const l = loadout(
      item([], { atk: 10, luck: 2 }),
      item([], { atk: 5 }),
      item([], { kind: 'armor', def: 4, hp: 20, luck: 3 }),
      item([], { kind: 'armor', def: 1, hp: 5 }),
    );
    const e = computeEffective(stats({ def: 2 }), l);
    expect(e.attack).toBe(17);
    expect(e.defense).toBe(7);
    expect(e.luck).toBe(10);
    expect(e.maxHp).toBe(65);
  });
  it('攻撃回数 = floor(速さ × 倍率)、最低1', () => {
    expect(hitsPerTurn(1, 1)).toBe(1);
    expect(hitsPerTurn(0, 1)).toBe(1);
    expect(hitsPerTurn(3.9, 1)).toBe(3);
    expect(hitsPerTurn(3, 2)).toBe(6);
  });
  it('会心数と会心倍率', () => {
    expect(critCount(10, 5)).toBe(1); // round(0.5)
    expect(critCount(10, 100)).toBe(10);
    expect(critCount(10, 250)).toBe(10);
    expect(critMultiplier(50)).toBe(3);
    expect(critMultiplier(200)).toBe(5);
  });
  it('逃走成功率', () => {
    expect(escapeChance(1, 1, false)).toBe(0.5);
    expect(escapeChance(5, 1, false)).toBeCloseTo(0.7);
    expect(escapeChance(100, 1, false)).toBe(0.95);
    expect(escapeChance(100, 1, true)).toBe(0.2);
  });
  it('被ダメージ = max(1, 敵攻撃 - 防御)', () => {
    expect(damageTaken(10, 3)).toBe(7);
    expect(damageTaken(10, 30)).toBe(1);
  });
});

describe('敵', () => {
  it('ボス階は20Fごと', () => {
    expect([19, 20, 21, 40, 100].map(isBossFloor)).toEqual([false, true, false, true, true]);
  });
  it('敵の式（§4.3）', () => {
    expect(enemyStats(1, 'grass', false)).toEqual({ hp: 20, atk: 5, spd: 1 });
    const s = enemyStats(20, 'volcano', true);
    expect(s.hp).toBe(Math.ceil(20 * 1.22 ** 19 * 1.5 * 4));
    expect(s.atk).toBe(Math.ceil(5 * 1.12 ** 19 * 1.5 * 1.5));
    expect(s.spd).toBe(2);
  });
  it('逃走失敗時は敵の攻撃を受ける', () => {
    const p = { hp: 100, stats: stats(), loadout: loadout() };
    const enemy = createEnemy(createRng(1), 1, 'grass', true);
    const b = startBattle(p, enemy, createRng(1));
    const log = tryEscape(b, p, { next: () => 0.99, getState: () => 0, setState: () => {} });
    expect(log.type).toBe('escape_fail');
    expect(p.hp).toBeLessThan(100);
  });
});

describe('装備生成', () => {
  it('基本性能は品質に比例', () => {
    const rng = createRng(1);
    const w = makeItem(rng, { kind: 'weapon', floor: 10, quality: 1 });
    expect(w.atk).toBe(16);
    const a = makeItem(rng, { kind: 'armor', floor: 10, quality: 1.4 });
    expect(a.def).toBe(Math.round(8 * 1.4));
    expect(a.hp).toBe(Math.round(50 * 1.4));
    expect(qualityPercent(0.6)).toBe(43);
    expect(qualityPercent(1.4)).toBe(100);
  });
  it('ランダム生成は範囲内で、同じ装備にスキルが重複しない', () => {
    const rng = createRng(99);
    for (let i = 0; i < 2000; i++) {
      const it = generateItem(rng, { floor: 30, towerId: 'abyss', luck: 200, isBoss: false });
      expect(it.quality).toBeGreaterThanOrEqual(BALANCE.item.qualityMin);
      expect(it.quality).toBeLessThan(BALANCE.item.qualityMax);
      expect(new Set(it.skills).size).toBe(it.skills.length);
      expect(it.skills.length).toBeLessThanOrEqual(3);
      expect(it.luck === 0 || (it.luck >= 1 && it.luck <= 8)).toBe(true);
      expect(rarityOf(it)).toBe(['normal', 'rare', 'epic', 'legend'][it.skills.length]);
    }
  });
  it('ボスのドロップはスキル1つ以上を保証', () => {
    const rng = createRng(3);
    for (let i = 0; i < 1000; i++) expect(rollSkillCount(rng, 0, true)).toBeGreaterThanOrEqual(1);
  });
  it('塔ごとに出やすいタグが変わる', () => {
    const rng = createRng(4);
    const count = { 鍛: 0, 魔: 0, 風: 0, 守: 0 };
    for (let i = 0; i < 5000; i++) for (const s of rollSkills(rng, 1, 'grass')) count[SKILLS[s].tag]++;
    // 草原: 鍛・守 ×2
    expect(count['鍛']).toBeGreaterThan(count['風'] * 1.6);
    expect(count['守']).toBeGreaterThan(count['魔'] * 1.6);
  });
});

describe('スキル数の抽選確率', () => {
  function distribution(luck: number, isBoss = false, bonus = 0, n = 40000) {
    const rng = createRng(2024);
    const d = [0, 0, 0, 0];
    for (let i = 0; i < n; i++) d[rollSkillCount(rng, luck, isBoss, bonus)]++;
    return d.map((x) => x / n);
  }
  it('p の式', () => {
    expect(skillRollP(5, false, 0)).toBeCloseTo(0.42);
    expect(skillRollP(100, false, 0)).toBeCloseTo(0.8);
    expect(skillRollP(500, true, 0)).toBe(0.85);
  });
  it('運5: 理論値どおりの分布', () => {
    const d = distribution(5);
    const p = 0.42;
    expect(d[0]).toBeCloseTo(1 - p, 1);
    expect(d[1]).toBeCloseTo(p * (1 - p * 0.65), 1);
  });
  it('運5と運100で分布が変わる（運が高いほど多く付く）', () => {
    const lo = distribution(5);
    const hi = distribution(100);
    expect(hi[0]).toBeLessThan(lo[0] - 0.3);
    expect(hi[3]).toBeGreaterThan(lo[3] * 3);
    const mean = (d: number[]) => d.reduce((s, x, i) => s + x * i, 0);
    expect(mean(hi)).toBeGreaterThan(mean(lo) + 0.5);
  });
});
