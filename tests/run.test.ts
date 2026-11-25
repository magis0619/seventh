import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';
import { loadProfile, newProfile, saveProfile, startFloors, type KVStore } from '../src/core/save';
import {
  advance,
  attack,
  debugWarp,
  ensureWeapon,
  escape,
  floorsToBoss,
  lootDiscard,
  lootEquip,
  lootStore,
  retreat,
  startRun,
} from '../src/core/run';
import { item } from './helpers';
import { formatNum } from '../src/ui/format';

function memStore(): KVStore {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

/** 強い装備で固めたプロフィール */
function strongProfile() {
  const p = newProfile(createRng(1));
  p.loadout[0] = item([], { atk: 1e12 });
  p.loadout[1] = item([], { atk: 1e12 });
  p.loadout[2] = item([], { kind: 'armor', def: 1e9, hp: 1000 });
  return p;
}

describe('ラン', () => {
  it('開始時は全快、進むと階が増える', () => {
    const p = newProfile(createRng(1));
    const run = startRun(p, 'grass', 1, 10);
    expect(run.hp).toBe(40 + p.loadout[2]!.hp);
    expect(run.floor).toBe(0);
    advance(p, run);
    expect(run.floor).toBe(1);
    expect(p.towers.grass.maxFloor).toBe(1);
  });

  it('20Fボスを倒すとチェックポイントが21Fになる', () => {
    const p = strongProfile();
    const run = startRun(p, 'grass', 1, 10);
    debugWarp(p, run, 20);
    const ev = advance(p, run);
    expect(ev).toEqual({ type: 'battle', floor: 20, isBoss: true });
    attack(p, run);
    expect(run.status).toBe('loot'); // ボスは確定ドロップ
    expect(run.pendingLoot!.skills.length).toBeGreaterThanOrEqual(1);
    expect(p.towers.grass.checkpoint).toBe(21);
    expect(startFloors(p.towers.grass)).toEqual([1, 21]);
    lootDiscard(p, run);
    expect(run.status).toBe('explore');
    // 次回は21Fから
    const run2 = startRun(p, 'grass', 21, 11);
    advance(p, run2);
    expect(run2.floor).toBe(21);
  });

  it('負けると武器2枠を失い、防具と倉庫は残る', () => {
    const p = newProfile(createRng(1));
    p.loadout[1] = item([], { atk: 1 });
    const stored = item([], { atk: 3 });
    p.storage.push(stored);
    const armor = p.loadout[2];
    const run = startRun(p, 'abyss', 1, 5);
    debugWarp(p, run, 60);
    advance(p, run);
    while (run.status === 'battle') attack(p, run);
    expect(run.result).toBe('defeat');
    expect(p.loadout[0]).toBeNull();
    expect(p.loadout[1]).toBeNull();
    expect(p.loadout[2]).toBe(armor);
    expect(p.storage).toContain(stored);
    expect(run.lost).toHaveLength(2);
    // 武器が無ければ救済の武器
    p.storage = [];
    expect(ensureWeapon(p, createRng(1))).not.toBeNull();
    expect(p.loadout[0]).not.toBeNull();
  });

  it('ラン中に倉庫へ送った装備は負けても残る', () => {
    const p = strongProfile();
    const run = startRun(p, 'grass', 1, 10);
    debugWarp(p, run, 20);
    advance(p, run);
    attack(p, run);
    const loot = run.pendingLoot!;
    expect(lootStore(p, run)).toBe(true);
    expect(p.storage).toContain(loot);
    // 弱体化して負ける
    p.loadout[0] = item([], { atk: 0 });
    p.loadout[1] = null;
    p.loadout[2] = null;
    run.hp = 1;
    debugWarp(p, run, 99);
    advance(p, run);
    while (run.status === 'battle') attack(p, run);
    expect(run.result).toBe('defeat');
    expect(p.storage).toContain(loot);
  });

  it('装備すると外した装備が次の拾い物になる', () => {
    const p = strongProfile();
    const run = startRun(p, 'grass', 1, 10);
    debugWarp(p, run, 20);
    advance(p, run);
    attack(p, run);
    const loot = run.pendingLoot!;
    const slot = loot.kind === 'weapon' ? 0 : 2;
    const old = p.loadout[slot];
    lootEquip(p, run, slot);
    expect(p.loadout[slot]).toBe(loot);
    expect(run.pendingLoot).toBe(old);
    expect(run.status).toBe('loot');
    lootDiscard(p, run);
    expect(run.status).toBe('explore');
  });

  it('ボスから逃げたら、次の「進む」で同じボスと再戦', () => {
    const p = newProfile(createRng(1));
    const run = startRun(p, 'grass', 1, 10);
    debugWarp(p, run, 20);
    advance(p, run);
    run.hp = 1e9;
    // 逃げられるまで試す
    let guard = 0;
    while (run.status === 'battle' && guard++ < 200) escape(p, run);
    expect(run.status).toBe('explore');
    expect(run.floorCleared).toBe(false);
    expect(floorsToBoss(run)).toBe(0);
    const ev = advance(p, run);
    expect(ev).toEqual({ type: 'battle', floor: 20, isBoss: true });
  });

  it('戻ると帰還。スキルで伸びたステータスはランごとにリセット', () => {
    const p = newProfile(createRng(1));
    p.loadout[0]!.skills = ['S01'];
    const run = startRun(p, 'grass', 1, 10);
    let guard = 0;
    while (run.stats.str === 2 && guard++ < 100) {
      advance(p, run);
      while (run.status === 'battle') attack(p, run);
      if (run.status === 'loot') lootDiscard(p, run);
    }
    expect(run.stats.str).toBeGreaterThan(2);
    retreat(p, run);
    expect(run.result).toBe('retreat');
    const run2 = startRun(p, 'grass', 1, 11);
    expect(run2.stats.str).toBe(2);
  });

  it('100Fボス撃破で踏破', () => {
    const p = strongProfile();
    const run = startRun(p, 'grass', 81, 10);
    debugWarp(p, run, 100);
    advance(p, run);
    attack(p, run);
    lootDiscard(p, run);
    expect(run.result).toBe('clear');
    expect(p.towers.grass.cleared).toBe(true);
    expect(p.towers.grass.checkpoint).toBe(81);
  });

  it('同じシードなら同じ展開になる', () => {
    const play = () => {
      const p = newProfile(createRng(1));
      const run = startRun(p, 'volcano', 1, 777);
      const evs: string[] = [];
      for (let i = 0; i < 30 && run.status !== 'ended'; i++) {
        if (run.status === 'explore') evs.push(advance(p, run).type);
        else if (run.status === 'battle') attack(p, run);
        else if (run.status === 'loot') lootDiscard(p, run);
      }
      return evs.join(',') + run.floor + ':' + run.hp;
    };
    expect(play()).toBe(play());
  });
});

describe('セーブ', () => {
  it('保存して読み込める', () => {
    const store = memStore();
    const p = newProfile(createRng(1));
    p.towers.volcano.checkpoint = 41;
    p.storage.push(item(['S01']));
    saveProfile(store, p);
    const q = loadProfile(store, createRng(2));
    expect(q.towers.volcano.checkpoint).toBe(41);
    expect(q.storage[0].skills).toEqual(['S01']);
  });
  it('壊れたデータなら新規', () => {
    const store = memStore();
    store.setItem('synergy-tower-save-v1', '{broken');
    expect(loadProfile(store, createRng(1)).bestFloor).toBe(0);
  });
});

describe('数字の日本語単位表示', () => {
  it.each([
    [0, '0'],
    [9999, '9999'],
    [12000, '1.2万'],
    [10000, '1万'],
    [123456, '12.3万'],
    [12345678, '1234万'],
    [3.4e8, '3.4億'],
    [5.6e12, '5.6兆'],
    [7.8e16, '7.8京'],
    [2e20, '2垓'],
    [1.5e75, '1.50e75'],
  ])('%d → %s', (v, s) => {
    expect(formatNum(v)).toBe(s);
  });
});
