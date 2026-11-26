import { describe, expect, it } from 'vitest';
import { runSkillPhase, countTags, tagMultiplier, flattenSkills, summarizePhase } from '../src/core/skillEngine';
import { createRng } from '../src/core/rng';
import { computeAttack, createEnemy, playerAttack, startBattle } from '../src/core/battle';
import { computeEffective } from '../src/core/stats';
import { BALANCE } from '../src/data/balance';
import { fixedRng, item, loadout, stats } from './helpers';

const rng0 = () => fixedRng(0);

describe('スキル24種の効果（初期値: 力2 速さ1 魔力0 防御0 運5）', () => {
  it('S01 筋トレ: 力 +3', () => {
    expect(runSkillPhase(stats(), loadout(['S01']), rng0()).stats.str).toBe(5);
  });
  it('S02 鍛錬の型: 力 + 鍛タグ数 × 4', () => {
    expect(runSkillPhase(stats(), loadout(['S02']), rng0()).stats.str).toBe(2 + 4);
    // 鍛タグ2つ（S01, S02）→ S01: +3, S02: +8
    expect(runSkillPhase(stats(), loadout(['S01', 'S02']), rng0()).stats.str).toBe(2 + 3 + 8);
  });
  it('S03 反復: 直前のスキルを2回発動', () => {
    // S01 → 反復(S01 ×2) = +9
    expect(runSkillPhase(stats(), loadout(['S01', 'S03']), rng0()).stats.str).toBe(2 + 9);
  });
  it('S03 反復: 装備をまたいでも直前のスキルを参照する', () => {
    const r = runSkillPhase(stats(), loadout(['S07'], ['S03']), rng0());
    expect(r.stats.mag).toBe(12);
  });
  it('S04 重撃: 力 + 最大HP × 10%', () => {
    expect(runSkillPhase(stats(), loadout(['S04']), rng0()).stats.str).toBe(2 + Math.floor(BALANCE.player.baseMaxHp * 0.1));
    const armor = item([], { kind: 'armor', hp: 60 });
    expect(runSkillPhase(stats(), loadout(['S04'], null, armor), rng0()).stats.str).toBe(2 + Math.floor((BALANCE.player.baseMaxHp + 60) * 0.1));
  });
  it('S05 鍛え直し: 力 + 力 × 8%（切り上げ）', () => {
    expect(runSkillPhase(stats(), loadout(['S05']), rng0()).stats.str).toBe(3);
    expect(runSkillPhase(stats({ str: 100 }), loadout(['S05']), rng0()).stats.str).toBe(108);
    expect(runSkillPhase(stats({ str: 101 }), loadout(['S05']), rng0()).stats.str).toBe(101 + 9);
  });
  it('S06 博打: 運%で力 ×2、失敗なら変化なし', () => {
    expect(runSkillPhase(stats({ str: 50 }), loadout(['S06']), fixedRng(0)).stats.str).toBe(100);
    const fail = runSkillPhase(stats({ str: 50 }), loadout(['S06']), fixedRng(0.06));
    expect(fail.stats.str).toBe(50);
    expect(fail.events[0].type).toBe('gamble_fail');
    // 運は90%が上限
    expect(runSkillPhase(stats({ str: 50, luck: 500 }), loadout(['S06']), fixedRng(0.91)).stats.str).toBe(50);
    expect(runSkillPhase(stats({ str: 50, luck: 500 }), loadout(['S06']), fixedRng(0.89)).stats.str).toBe(100);
  });
  it('S06 博打: 装備の運も確率に含まれる', () => {
    const lucky = item(['S06'], { luck: 45 }); // 運 5 + 45 = 50%
    expect(runSkillPhase(stats({ str: 10 }), loadout(lucky), fixedRng(0.49)).stats.str).toBe(20);
    expect(runSkillPhase(stats({ str: 10 }), loadout(lucky), fixedRng(0.51)).stats.str).toBe(10);
  });
  it('S07 瞑想: 魔力 +4', () => {
    expect(runSkillPhase(stats(), loadout(['S07']), rng0()).stats.mag).toBe(4);
  });
  it('S08 魔導書: 魔力 + 魔タグ数 × 4', () => {
    expect(runSkillPhase(stats(), loadout(['S08']), rng0()).stats.mag).toBe(4);
    expect(runSkillPhase(stats(), loadout(['S07', 'S08']), rng0()).stats.mag).toBe(4 + 8);
  });
  it('S09 共鳴: 直後のスキルをもう1回発動', () => {
    expect(runSkillPhase(stats(), loadout(['S09', 'S07']), rng0()).stats.mag).toBe(8);
  });
  it('S10 魔力転換: 力 + 魔力', () => {
    expect(runSkillPhase(stats({ mag: 10 }), loadout(['S10']), rng0()).stats.str).toBe(12);
  });
  it('S11 学者: 魔力 + 力 × 10%', () => {
    expect(runSkillPhase(stats({ str: 50 }), loadout(['S11']), rng0()).stats.mag).toBe(5);
  });
  it('S12 深淵: 魔力 + 魔力 × 10%（切り上げ）', () => {
    expect(runSkillPhase(stats({ mag: 10 }), loadout(['S12']), rng0()).stats.mag).toBe(11);
    expect(runSkillPhase(stats({ mag: 11 }), loadout(['S12']), rng0()).stats.mag).toBe(13);
    const zero = runSkillPhase(stats({ mag: 0 }), loadout(['S12']), rng0());
    expect(zero.stats.mag).toBe(0);
    expect(zero.events[0].type).toBe('nochange');
  });
  it('S13 加速: 速さ +1', () => {
    expect(runSkillPhase(stats(), loadout(['S13']), rng0()).stats.spd).toBe(2);
  });
  it('S14 風の加護: 速さ + 風タグ数', () => {
    expect(runSkillPhase(stats(), loadout(['S14']), rng0()).stats.spd).toBe(2);
    expect(runSkillPhase(stats(), loadout(['S13', 'S14']), rng0()).stats.spd).toBe(1 + 1 + 2);
  });
  it('S15 追い風: この戦闘中の攻撃回数 ×2（ステータスには残らない）', () => {
    const r = runSkillPhase(stats(), loadout(['S15']), rng0());
    expect(r.battleMul).toBe(2);
    expect(r.stats.spd).toBe(1);
  });
  it('S16 疾風剣: 力 + 速さ × 2', () => {
    expect(runSkillPhase(stats({ spd: 5 }), loadout(['S16']), rng0()).stats.str).toBe(12);
  });
  it('S17 連撃: 会心1回ごとに追加攻撃1回（上限10回）', () => {
    const r = runSkillPhase(stats(), loadout(['S17']), rng0());
    expect(r.passives.chain).toBe(true);
    expect(r.events[0].type).toBe('passive');
    // 速さ20, 運100 → 20回攻撃すべて会心 → 追加攻撃は10回まで
    const a = computeAttack(stats({ spd: 20, luck: 100, str: 1 }), loadout(['S17']), 1, r.passives);
    expect(a.hits).toBe(20);
    expect(a.crits).toBe(20);
    expect(a.extraHits).toBe(10);
    expect(a.damage).toBe(20 * 3 + 10);
    const none = computeAttack(stats({ spd: 20, luck: 100, str: 1 }), loadout([]), 1, { chain: false, counter: 0, guts: false });
    expect(none.extraHits).toBe(0);
  });
  it('S18 加速度: 速さ + 速さ × 10%（切り上げ）', () => {
    expect(runSkillPhase(stats(), loadout(['S18']), rng0()).stats.spd).toBe(2);
    expect(runSkillPhase(stats({ spd: 30 }), loadout(['S18']), rng0()).stats.spd).toBe(33);
  });
  it('S19 鉄壁: 防御 +3', () => {
    expect(runSkillPhase(stats(), loadout(['S19']), rng0()).stats.def).toBe(3);
  });
  it('S20 守りの陣: 防御 + 守タグ数 × 3', () => {
    expect(runSkillPhase(stats(), loadout(['S20']), rng0()).stats.def).toBe(3);
    expect(runSkillPhase(stats(), loadout(['S19', 'S20']), rng0()).stats.def).toBe(3 + 6);
  });
  it('S21 反撃: 被弾するたび攻撃×100%を返す', () => {
    const p = { hp: 100, stats: stats({ str: 7 }), loadout: loadout(['S21']) };
    const enemy = createEnemy(createRng(1), 1, 'grass', false);
    enemy.hp = enemy.maxHp = 1000;
    const b = startBattle(p, enemy, createRng(1));
    expect(b.passives.counter).toBe(1);
    const log = playerAttack(b, p);
    expect(log.type).toBe('attack');
    if (log.type !== 'attack') return;
    expect(log.enemyHit!.counterDamage).toBe(7);
    expect(enemy.hp).toBe(1000 - 7 - 7);
  });
  it('S22 重装: 力 + 防御（防具込み）', () => {
    const armor = item([], { kind: 'armor', def: 6 });
    expect(runSkillPhase(stats({ def: 4 }), loadout(['S22'], null, armor), rng0()).stats.str).toBe(2 + 10);
  });
  it('S23 金剛: 防御 + 防御 × 10%（切り上げ・防具込み）', () => {
    expect(runSkillPhase(stats({ def: 10 }), loadout(['S23']), rng0()).stats.def).toBe(11);
    const armor = item([], { kind: 'armor', def: 20 });
    expect(runSkillPhase(stats({ def: 10 }), loadout(['S23'], null, armor), rng0()).stats.def).toBe(13);
  });
  it('S24 根性: HP0になる攻撃を1戦闘1回だけHP1で耐える', () => {
    const p = { hp: 5, stats: stats({ str: 1 }), loadout: loadout(['S24']) };
    const enemy = createEnemy(createRng(1), 1, 'grass', false);
    enemy.hp = enemy.maxHp = 1000;
    enemy.atk = 100;
    const b = startBattle(p, enemy, createRng(1));
    const l1 = playerAttack(b, p);
    expect(l1.type === 'attack' && l1.enemyHit!.gutsTriggered).toBe(true);
    expect(p.hp).toBe(1);
    expect(b.outcome).toBe('ongoing');
    playerAttack(b, p);
    expect(p.hp).toBe(0);
    expect(b.outcome).toBe('lose');
  });
});

describe('タグボーナス', () => {
  it('倍率: 2つ→×1, 3つ→×2, 5つ→×3', () => {
    expect(tagMultiplier(2)).toBe(1);
    expect(tagMultiplier(3)).toBe(2);
    expect(tagMultiplier(4)).toBe(2);
    expect(tagMultiplier(5)).toBe(3);
  });
  it('鍛タグ2つ: 筋トレは +3 のまま', () => {
    const r = runSkillPhase(stats(), loadout(['S01'], ['S01']), rng0());
    expect(r.stats.str).toBe(2 + 3 + 3);
    expect(r.events[0].changes[0].tagMul).toBe(1);
  });
  it('鍛タグ3つ: 筋トレは +6', () => {
    const r = runSkillPhase(stats(), loadout(['S01'], ['S01'], ['S01']), rng0());
    expect(r.stats.str).toBe(2 + 18);
    expect(r.events[0].changes[0].tagMul).toBe(2);
  });
  it('鍛タグ5つ: 筋トレは +9', () => {
    const l = loadout(['S01', 'S05'], ['S01'], ['S01'], ['S01']);
    expect(countTags(l)['鍛']).toBe(5);
    const r = runSkillPhase(stats(), l, rng0());
    expect(r.events[0].changes[0].after - r.events[0].changes[0].before).toBe(9);
  });
  it('他系統のステータスを伸ばす変換スキルにはボーナスが乗らない', () => {
    // 魔タグ3つ。魔力転換は「力」を伸ばすので ×1
    const r = runSkillPhase(stats({ mag: 10 }), loadout(['S10'], ['S07'], ['S08']), rng0());
    const conv = r.events.find((e) => e.ref?.skillId === 'S10')!;
    expect(conv.changes[0].tagMul).toBe(1);
    expect(conv.changes[0].after).toBe(12);
    const med = r.events.find((e) => e.ref?.skillId === 'S07')!;
    expect(med.changes[0].after - med.changes[0].before).toBe(8);
  });
  it('博打（倍化）にはタグボーナスが乗らない', () => {
    const r = runSkillPhase(stats({ str: 10 }), loadout(['S06'], ['S03'], ['S01']), fixedRng(0));
    const g = r.events.find((e) => e.ref?.skillId === 'S06')!;
    expect(g.changes[0].after).toBe(20);
  });
});

describe('トリガーの連鎖と安全装置', () => {
  it('反復が先頭なら不発', () => {
    const r = runSkillPhase(stats(), loadout(['S03', 'S01']), rng0());
    expect(r.events[0].type).toBe('fizzle');
    expect(r.stats.str).toBe(5);
  });
  it('共鳴が末尾なら不発（装備をまたいだ全体の末尾）', () => {
    const r = runSkillPhase(stats(), loadout(['S07', 'S09']), rng0());
    expect(r.events[1].type).toBe('fizzle');
    expect(r.stats.mag).toBe(4);
    // 末尾でなければ次の装備のスキルを再発動
    const r2 = runSkillPhase(stats(), loadout(['S09'], ['S07']), rng0());
    expect(r2.stats.mag).toBe(8);
  });
  it('反復の連鎖: 反復→反復は掛け算になる', () => {
    // S07(+4) → S03(+4×2) → S03(S03×2 → S07×4) = 4 + 8 + 16
    const r = runSkillPhase(stats(), loadout(['S07', 'S03', 'S03']), rng0());
    expect(r.stats.mag).toBe(28);
  });
  it('連鎖は深さ4まで', () => {
    // 共鳴 ⇄ 反復 が互いを呼び合う無限ループ
    const r = runSkillPhase(stats(), loadout(['S09', 'S03']), rng0());
    const maxDepth = Math.max(...r.events.filter((e) => e.type !== 'depth_limit').map((e) => e.depth));
    expect(maxDepth).toBe(BALANCE.skillPhase.maxDepth);
    expect(r.events.some((e) => e.type === 'depth_limit')).toBe(true);
  });
  it('1回のスキルフェーズの発動回数は最大200回', () => {
    const l = loadout(['S07', 'S03', 'S03'], ['S03', 'S03', 'S03'], ['S03', 'S03', 'S03'], ['S03', 'S03', 'S03']);
    const r = runSkillPhase(stats(), l, rng0());
    expect(r.activations).toBe(BALANCE.skillPhase.maxActivations);
    expect(r.truncated).toBe(true);
    expect(r.events.filter((e) => e.type === 'cap')).toHaveLength(1);
  });
  it('追い風を反復すると倍率が重なる', () => {
    const r = runSkillPhase(stats(), loadout(['S15', 'S03']), rng0());
    expect(r.battleMul).toBe(8);
  });
  it('発動順は 武器1 → 武器2 → 防具1 → 防具2', () => {
    const l = loadout(['S01'], ['S07'], ['S13'], ['S19']);
    expect(flattenSkills(l).map((r) => r.slot)).toEqual([0, 1, 2, 3]);
    const r = runSkillPhase(stats(), l, rng0());
    expect(r.events.map((e) => e.ref!.skillId)).toEqual(['S01', 'S07', 'S13', 'S19']);
  });
  it('元のステータスは変更しない', () => {
    const base = stats();
    runSkillPhase(base, loadout(['S01']), rng0());
    expect(base.str).toBe(2);
  });
});

describe('§5.7 噛み合いの例: 戦闘5回でステータスが単調増加', () => {
  function repeat(l: ReturnType<typeof loadout>, times = 5, seed = 42) {
    const rng = createRng(seed);
    let s = stats();
    const history = [s];
    const muls: number[] = [];
    for (let i = 0; i < times; i++) {
      const r = runSkillPhase(s, l, rng);
      s = r.stats;
      history.push(s);
      muls.push(r.battleMul);
    }
    return { history, muls };
  }
  function expectNonDecreasing(history: ReturnType<typeof stats>[]) {
    for (let i = 1; i < history.length; i++) {
      for (const k of ['str', 'spd', 'mag', 'def', 'luck'] as const) {
        expect(history[i][k]).toBeGreaterThanOrEqual(history[i - 1][k]);
      }
    }
  }
  function expectStrict(history: ReturnType<typeof stats>[], key: 'str' | 'mag' | 'def' | 'spd') {
    for (let i = 1; i < history.length; i++) expect(history[i][key]).toBeGreaterThan(history[i - 1][key]);
  }

  it('魔力ループ: 瞑想 → 深淵 → 学者 → 魔力転換', () => {
    const { history } = repeat(loadout(['S07', 'S12', 'S11'], ['S10']));
    expectNonDecreasing(history);
    expectStrict(history, 'str');
    expectStrict(history, 'mag');
    // 加速している（増加量自体が増える）
    const d = history.slice(1).map((h, i) => h.str - history[i].str);
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeGreaterThan(d[i - 1]);
  });
  it('鉄壁から攻撃へ: 鉄壁 → 金剛 → 守りの陣 → 重装', () => {
    const { history } = repeat(loadout(['S19', 'S23', 'S20'], ['S22']));
    expectNonDecreasing(history);
    expectStrict(history, 'def');
    expectStrict(history, 'str');
  });
  it('回数の掛け算: 疾風剣 → 反復、追い風', () => {
    const l = loadout(['S13', 'S16', 'S03'], ['S15']);
    const { history, muls } = repeat(l);
    expectNonDecreasing(history);
    expectStrict(history, 'str');
    expect(muls.every((m) => m === 2)).toBe(true);
    const dmg = history.map((h) => computeAttack(h, l, 2, { chain: false, counter: 0, guts: false }).damage);
    for (let i = 1; i < dmg.length; i++) expect(dmg[i]).toBeGreaterThan(dmg[i - 1]);
  });
  it('運の博打: 運の付いた装備 + 博打（+ 連撃）', () => {
    const l = loadout(
      item(['S01', 'S06'], { luck: 8 }),
      item(['S17'], { luck: 8 }),
      item([], { kind: 'armor', luck: 8 }),
      item([], { kind: 'armor', luck: 8 }),
    );
    expect(computeEffective(stats(), l).luck).toBe(37);
    const { history } = repeat(l, 5, 7);
    expectNonDecreasing(history);
    expectStrict(history, 'str');
  });
});

describe('連鎖（シナジー）の判定', () => {
  it('前のスキルが伸ばした値を次のスキルが使うと連鎖', () => {
    // 瞑想(魔力+4) → 魔力転換(魔力を力へ) は連鎖
    const r = runSkillPhase(stats(), loadout(['S07', 'S10']), rng0());
    expect(r.events[0].chain).toBe(false);
    expect(r.events[1].chain).toBe(true);
    expect(r.events[1].chainFrom?.skillId).toBe('S07');
    expect(r.events[1].source).toBe('mag');
  });
  it('自分で伸ばした値を読むだけなら連鎖ではない', () => {
    const r = runSkillPhase(stats({ mag: 10 }), loadout(['S12', 'S03']), rng0());
    // 深淵 → 反復(深淵×2)。深淵が自分の伸ばした魔力を読むのは連鎖扱いしない
    expect(r.events.filter((e) => e.chain)).toHaveLength(0);
    expect(summarizePhase(r).refires).toBe(2);
  });
  it('魔力ループは連鎖が複数回起きる', () => {
    const r = runSkillPhase(stats({ str: 50 }), loadout(['S07', 'S12', 'S11'], ['S10']), rng0());
    // 深淵(瞑想の魔力) / 魔力転換(学者の魔力) が連鎖
    expect(summarizePhase(r).chains).toBeGreaterThanOrEqual(2);
  });
});
