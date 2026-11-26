import { BALANCE } from '../data/balance';
import { TOWERS, type TowerId } from '../data/dungeons';
import { RESCUE_WEAPON_NAME } from '../data/names';
import {
  createEnemy,
  isBossFloor,
  playerAttack,
  startBattle,
  tryEscape,
  type BattleState,
  type Combatant,
  type TurnLog,
} from './battle';
import { generateItem, makeItem } from './itemGen';
import { createRng, type Rng } from './rng';
import { storageFull, type Profile } from './save';
import { computeEffective, initialStats } from './stats';
import { slotKind, type BaseStats, type Item, type SlotIndex } from './types';

export type RunStatus = 'explore' | 'battle' | 'loot' | 'ended';
export type RunResult = 'retreat' | 'defeat' | 'clear';

export type ExploreEvent =
  | { type: 'start' }
  | { type: 'nothing'; floor: number }
  | { type: 'fountain'; floor: number; heal: number }
  | { type: 'battle'; floor: number; isBoss: boolean }
  | { type: 'escaped'; floor: number }
  | { type: 'win'; floor: number; drop: boolean };

export interface RunState {
  towerId: TowerId;
  seed: number;
  rng: Rng;
  startFloor: number;
  /** 現在いる階（開始時は startFloor - 1） */
  floor: number;
  /** 現在の階を突破済みか（ボスから逃げたら false のまま） */
  floorCleared: boolean;
  hp: number;
  stats: BaseStats;
  status: RunStatus;
  battle: BattleState | null;
  /** 直近に完了した戦闘（デバッグ表示用） */
  lastBattle: BattleState | null;
  pendingLoot: Item | null;
  lastEvent: ExploreEvent;
  towerCleared: boolean;
  result: RunResult | null;
  /** 集計 */
  kills: number;
  maxDamage: number;
  sentToStorage: Item[];
  lost: Item[];
  discarded: number;
  /** 町を出た時点のステータス（結果画面で比較） */
  startStats: BaseStats;
}

export function maxHpOf(profile: Profile, run: RunState): number {
  return computeEffective(run.stats, profile.loadout).maxHp;
}

export function combatant(profile: Profile, run: RunState): Combatant {
  // loadout は profile と共有。stats / hp は戦闘後に書き戻す
  return { hp: run.hp, stats: run.stats, loadout: profile.loadout };
}

function syncBack(run: RunState, c: Combatant) {
  run.hp = c.hp;
  run.stats = c.stats;
}

/** 武器が1本も無い場合の救済（倉庫にも武器が無ければ木の棒を渡す） */
export function ensureWeapon(profile: Profile, rng: Rng): Item | null {
  const hasWeapon = profile.loadout[0] || profile.loadout[1];
  if (hasWeapon) return null;
  if (profile.storage.some((i) => i.kind === 'weapon')) return null;
  const stick = makeItem(rng, {
    kind: 'weapon',
    floor: 1,
    quality: BALANCE.item.qualityMin,
    type: '杖',
    name: RESCUE_WEAPON_NAME,
    skills: [...BALANCE.starter.rescueSkills],
  });
  profile.loadout[0] = stick;
  return stick;
}

export function startRun(profile: Profile, towerId: TowerId, startFloor: number, seed: number): RunState {
  const rng = createRng(seed);
  const stats = initialStats();
  profile.runCounter++;
  const run: RunState = {
    towerId,
    seed,
    rng,
    startFloor,
    floor: startFloor - 1,
    floorCleared: true,
    hp: 0,
    stats,
    status: 'explore',
    battle: null,
    lastBattle: null,
    pendingLoot: null,
    lastEvent: { type: 'start' },
    towerCleared: false,
    result: null,
    kills: 0,
    maxDamage: 0,
    sentToStorage: [],
    lost: [],
    discarded: 0,
    startStats: { ...stats },
  };
  run.hp = maxHpOf(profile, run);
  return run;
}

function updateReach(profile: Profile, run: RunState) {
  const t = profile.towers[run.towerId];
  t.maxFloor = Math.max(t.maxFloor, run.floor);
  profile.bestFloor = Math.max(profile.bestFloor, run.floor);
}

/** 「進む」 */
export function advance(profile: Profile, run: RunState): ExploreEvent {
  if (run.status !== 'explore') throw new Error(`cannot advance in status ${run.status}`);
  const X = BALANCE.explore;
  const rng = run.rng;
  if (run.floorCleared) {
    if (run.floor >= X.maxFloor) throw new Error('tower already at top');
    run.floor++;
    run.floorCleared = false;
    updateReach(profile, run);
  }
  const F = run.floor;
  const boss = isBossFloor(F);
  if (boss || rng.next() < X.encounterRate) {
    const enemy = createEnemy(rng, F, run.towerId, boss);
    const c = combatant(profile, run);
    run.battle = startBattle(c, enemy, rng);
    syncBack(run, c);
    run.status = 'battle';
    run.lastEvent = { type: 'battle', floor: F, isBoss: boss };
    return run.lastEvent;
  }
  run.floorCleared = true;
  if (rng.next() < X.fountainRate) {
    const max = maxHpOf(profile, run);
    const before = run.hp;
    run.hp = Math.min(max, run.hp + Math.ceil(max * X.fountainHealRatio));
    run.lastEvent = { type: 'fountain', floor: F, heal: run.hp - before };
  } else {
    run.lastEvent = { type: 'nothing', floor: F };
  }
  return run.lastEvent;
}

export function dropChance(luck: number, isBoss: boolean): number {
  const D = BALANCE.drop;
  if (isBoss) return D.boss;
  return Math.min(D.normalMax, D.normalBase + luck / D.luckPerPercent / 100);
}

function onBattleEnd(profile: Profile, run: RunState) {
  const b = run.battle!;
  run.maxDamage = Math.max(run.maxDamage, b.maxDamage);
  run.lastBattle = b;
  run.battle = null;
  if (b.outcome === 'win') {
    run.kills++;
    run.floorCleared = true;
    const F = run.floor;
    if (b.enemy.isBoss) {
      const X = BALANCE.explore;
      const t = profile.towers[run.towerId];
      const next = Math.min(F + 1, X.maxFloor - X.bossInterval + 1);
      t.checkpoint = Math.max(t.checkpoint, next);
      if (F >= X.maxFloor) {
        t.cleared = true;
        run.towerCleared = true;
      }
    }
    const luck = computeEffective(run.stats, profile.loadout).luck;
    const drop = run.rng.next() < dropChance(luck, b.enemy.isBoss);
    run.lastEvent = { type: 'win', floor: F, drop };
    if (drop) {
      run.pendingLoot = generateItem(run.rng, { floor: F, towerId: run.towerId, luck, isBoss: b.enemy.isBoss });
      run.status = 'loot';
    } else if (run.towerCleared) {
      endRun(profile, run, 'clear');
    } else {
      run.status = 'explore';
    }
  } else if (b.outcome === 'lose') {
    endRun(profile, run, 'defeat');
  } else if (b.outcome === 'escaped') {
    // 逃げたらこの戦闘のスキルで伸びた分は失う（逃走→再戦で成長だけ稼ぐのを防ぐ）
    run.stats = { ...b.phase.before };
    // 雑魚から逃げたら階は突破扱い。ボスから逃げたら次の「進む」で再戦
    if (!b.enemy.isBoss) run.floorCleared = true;
    run.status = 'explore';
    run.lastEvent = { type: 'escaped', floor: run.floor };
  }
}

/** 「攻撃」 */
export function attack(profile: Profile, run: RunState): TurnLog {
  if (run.status !== 'battle' || !run.battle) throw new Error('not in battle');
  const c = combatant(profile, run);
  const log = playerAttack(run.battle, c);
  syncBack(run, c);
  if (run.battle.outcome !== 'ongoing') onBattleEnd(profile, run);
  return log;
}

/** 「逃げる」 */
export function escape(profile: Profile, run: RunState): TurnLog {
  if (run.status !== 'battle' || !run.battle) throw new Error('not in battle');
  const c = combatant(profile, run);
  const log = tryEscape(run.battle, c, run.rng);
  syncBack(run, c);
  if (run.battle.outcome !== 'ongoing') onBattleEnd(profile, run);
  return log;
}

function afterLoot(profile: Profile, run: RunState) {
  if (run.pendingLoot) return;
  if (run.towerCleared) endRun(profile, run, 'clear');
  else run.status = 'explore';
}

/**
 * 拾った装備を装備する。外した装備は次の「拾った装備」になり、倉庫へ送るか捨てるかを選ぶ。
 */
export function lootEquip(profile: Profile, run: RunState, slot: SlotIndex): Item | null {
  const item = run.pendingLoot;
  if (run.status !== 'loot' || !item) throw new Error('no loot');
  if (slotKind(slot) !== item.kind) throw new Error('wrong slot kind');
  const prevMax = maxHpOf(profile, run);
  const old = profile.loadout[slot];
  profile.loadout[slot] = item;
  run.pendingLoot = old;
  // 最大HPの増減に合わせて現在HPを調整（増えた分だけ回復、超過分はカット）
  const newMax = maxHpOf(profile, run);
  run.hp = Math.max(1, Math.min(newMax, run.hp + Math.max(0, newMax - prevMax)));
  afterLoot(profile, run);
  return old;
}

export function lootStore(profile: Profile, run: RunState): boolean {
  const item = run.pendingLoot;
  if (run.status !== 'loot' || !item) throw new Error('no loot');
  if (storageFull(profile)) return false;
  profile.storage.push(item);
  run.sentToStorage.push(item);
  run.pendingLoot = null;
  afterLoot(profile, run);
  return true;
}

export function lootDiscard(profile: Profile, run: RunState): void {
  if (run.status !== 'loot' || !run.pendingLoot) throw new Error('no loot');
  run.pendingLoot = null;
  run.discarded++;
  afterLoot(profile, run);
}

/** 「戻る」 */
export function retreat(profile: Profile, run: RunState): void {
  if (run.status !== 'explore') throw new Error('can only retreat while exploring');
  endRun(profile, run, 'retreat');
}

export function endRun(profile: Profile, run: RunState, result: RunResult): void {
  run.result = result;
  run.status = 'ended';
  run.battle = null;
  run.pendingLoot = null;
  if (result === 'defeat') {
    // 負けたら武器2枠を失う（防具と倉庫は残る）
    for (const s of [0, 1] as const) {
      const it = profile.loadout[s];
      if (it) run.lost.push(it);
      profile.loadout[s] = null;
    }
  }
}

/** デバッグ: 任意の階へワープ（次の「進む」でその階に入る） */
export function debugWarp(profile: Profile, run: RunState, floor: number): void {
  const target = Math.max(1, Math.min(BALANCE.explore.maxFloor, Math.floor(floor)));
  run.floor = target - 1;
  run.floorCleared = true;
  run.status = 'explore';
  run.battle = null;
  void profile;
}

export function debugHeal(profile: Profile, run: RunState): void {
  run.hp = maxHpOf(profile, run);
}

export function towerName(id: TowerId): string {
  return TOWERS[id].name;
}

/** 次のボスまでの階数（現在の階がボス階で未突破なら 0） */
export function floorsToBoss(run: RunState): number {
  const I = BALANCE.explore.bossInterval;
  const nextFloor = run.floorCleared ? run.floor + 1 : run.floor;
  const nextBoss = Math.ceil(nextFloor / I) * I;
  return nextBoss - nextFloor;
}
