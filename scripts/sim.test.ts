/**
 * バランス検証用の自動プレイ（npm run sim）。
 * 単純な方針のボットで何ランも遊び、到達階を集計する。テストではなくレポート用。
 */
import { it } from 'vitest';
import { createRng } from '../src/core/rng';
import { newProfile, startFloors, storageFull, type Profile } from '../src/core/save';
import { advance, attack, escape, ensureWeapon, lootDiscard, lootEquip, lootStore, maxHpOf, retreat, startRun, type RunState } from '../src/core/run';
import { predictEnemyDamage, predictPlayerDamage } from '../src/core/battle';
import { combatant } from '../src/core/run';
import type { Item, SlotIndex } from '../src/core/types';
import { TOWER_IDS, type TowerId } from '../src/data/dungeons';
import { formatNum } from '../src/ui/format';
import { makeItem } from '../src/core/itemGen';
import type { SkillId } from '../src/data/skills';

function score(it: Item | null): number {
  if (!it) return -1;
  const base = it.kind === 'weapon' ? it.atk : it.def * 2 + it.hp * 0.3;
  return base * (1 + it.skills.length * 0.8) + it.luck;
}

function bestSlot(p: Profile, it: Item): SlotIndex | null {
  const slots = (it.kind === 'weapon' ? [0, 1] : [2, 3]) as SlotIndex[];
  const worst = slots.reduce((a, b) => (score(p.loadout[a]) <= score(p.loadout[b]) ? a : b));
  return score(it) > score(p.loadout[worst]) ? worst : null;
}

function townEquip(p: Profile) {
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < p.storage.length; i++) {
      const it = p.storage[i];
      const s = bestSlot(p, it);
      if (s !== null) {
        const old = p.loadout[s];
        p.loadout[s] = it;
        p.storage.splice(i, 1);
        if (old) p.storage.push(old);
        changed = true;
        break;
      }
    }
  }
  // 倉庫は良いものだけ残す
  p.storage.sort((a, b) => score(b) - score(a));
  p.storage.length = Math.min(p.storage.length, 14);
}

function playRun(p: Profile, tower: TowerId, seed: number, from?: number): RunState & { maxTurns: number } {
  const floors = startFloors(p.towers[tower]);
  const run = Object.assign(startRun(p, tower, from ?? floors[floors.length - 1], seed), { maxTurns: 0 });
  for (let step = 0; step < 5000 && run.status !== 'ended'; step++) {
    if (run.status === 'explore') {
      const max = maxHpOf(p, run);
      if (run.hp < max * 0.3) retreat(p, run);
      else advance(p, run);
    } else if (run.status === 'battle') {
      const c = combatant(p, run);
      const b = run.battle!;
      const turnsToKill = Math.ceil(b.enemy.hp / Math.max(1, predictPlayerDamage(b, c)));
      const turnsToDie = Math.ceil(run.hp / predictEnemyDamage(b, c));
      if (!b.enemy.isBoss && turnsToKill > turnsToDie) escape(p, run);
      else if (b.enemy.isBoss && turnsToKill > turnsToDie && run.hp < maxHpOf(p, run)) escape(p, run);
      else attack(p, run);
      if (run.lastBattle) run.maxTurns = Math.max(run.maxTurns, run.lastBattle.turn);
    } else if (run.status === 'loot') {
      const it = run.pendingLoot!;
      const s = bestSlot(p, it);
      if (s !== null && run.pendingLoot === it) lootEquip(p, run, s);
      if (run.status === 'loot') {
        if (!storageFull(p) && score(run.pendingLoot) > 0) lootStore(p, run);
        else lootDiscard(p, run);
      }
    }
  }
  return run;
}

it('balance simulation', () => {
  for (const tower of TOWER_IDS) {
    const rows: string[] = [];
    for (const profileSeed of [1, 2, 3]) {
      const p = newProfile(createRng(profileSeed));
      const rng = createRng(profileSeed * 1000);
      const reach: number[] = [];
      let bestDmg = 0;
      let maxTurns = 0;
      let defeats = 0;
      for (let r = 0; r < 80; r++) {
        ensureWeapon(p, rng);
        townEquip(p);
        const run = playRun(p, tower, Math.floor(rng.next() * 2 ** 31));
        reach.push(run.floor);
        bestDmg = Math.max(bestDmg, run.maxDamage);
        maxTurns = Math.max(maxTurns, run.maxTurns);
        if (run.result === 'defeat') defeats++;
      }
      const milestones = [10, 20, 30, 40, 60, 80, 100].map((f) => {
        const i = reach.findIndex((x) => x >= f);
        return `${f}F:${i < 0 ? '-' : i + 1}`;
      });
      rows.push(
        `  profile${profileSeed}: best ${Math.max(...reach)}F, checkpoint ${p.towers[tower].checkpoint}F, defeats ${defeats}/80, maxDmg ${formatNum(bestDmg)}, 最長戦闘 ${maxTurns}T | 初到達ラン ${milestones.join(' ')}`,
      );
    }
    console.log(`[${tower}]\n${rows.join('\n')}`);
  }
});

it('combo scenarios (§5.7)', () => {
  const combos: Record<string, SkillId[][]> = {
    魔力ループ: [['S07', 'S12', 'S11'], ['S10'], [], []],
    鉄壁から攻撃へ: [['S22'], [], ['S19', 'S23', 'S20'], []],
    回数の掛け算: [['S13', 'S16', 'S03'], ['S15'], [], []],
    運の博打: [['S01', 'S06'], ['S17'], [], []],
    スキルなし: [[], [], [], []],
  };
  for (const [name, sk] of Object.entries(combos)) {
    const out: string[] = [];
    for (const tower of TOWER_IDS) {
      const results: string[] = [];
      for (const seed of [1, 2, 3, 4, 5]) {
        const rng = createRng(seed);
        const p = newProfile(rng);
        // 10F 相当・性能100%の装備に組み合わせを載せる（運の博打は全装備に運+8）
        p.loadout = sk.map((skills, i) =>
          makeItem(rng, { kind: i < 2 ? 'weapon' : 'armor', floor: 10, quality: 1.0, skills, luck: name === '運の博打' ? 8 : 0 }),
        ) as Profile['loadout'];
        // 装備は変えずに、HPが減ったら帰還せずに進み続ける（最大到達を見る）
        const run = playFixed(p, tower, seed * 77);
        results.push(`${run.floor}F${run.result === 'defeat' ? '✕' : ''}`);
      }
      out.push(`${tower}: ${results.join(' ')}`);
    }
    console.log(`[${name}] ${out.join(' | ')}`);
  }
});

/** 装備固定・逃走なし・帰還なしで、倒れるまで進む */
function playFixed(p: Profile, tower: TowerId, seed: number): RunState {
  const run = startRun(p, tower, 1, seed);
  for (let step = 0; step < 20000 && run.status !== 'ended'; step++) {
    if (run.status === 'explore') {
      if (run.floor >= 100 && run.floorCleared) break;
      advance(p, run);
    } else if (run.status === 'battle') {
      if (run.battle!.turn > 300) escape(p, run);
      else attack(p, run);
    } else if (run.status === 'loot') lootDiscard(p, run);
  }
  return run;
}
