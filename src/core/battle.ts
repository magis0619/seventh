import { BALANCE } from '../data/balance';
import { TOWERS, type TowerId } from '../data/dungeons';
import { BOSS_NAMES, ENEMY_NAMES } from '../data/names';
import { SKILL_PARAMS } from '../data/skills';
import { pick, type Rng } from './rng';
import { runSkillPhase, type Passives, type SkillPhaseResult } from './skillEngine';
import {
  capNumber,
  computeEffective,
  critCount,
  critMultiplier,
  damageTaken,
  escapeChance,
  hitsPerTurn,
} from './stats';
import type { BaseStats, Enemy, Loadout } from './types';

export function isBossFloor(floor: number): boolean {
  return floor % BALANCE.explore.bossInterval === 0;
}

export function enemyStats(floor: number, towerId: TowerId, isBoss: boolean) {
  const E = BALANCE.enemy;
  const m = TOWERS[towerId].difficulty;
  const hp = E.hpBase * Math.pow(E.hpGrowth, floor - 1) * m * (isBoss ? E.bossHpMul : 1);
  const atk = E.atkBase * Math.pow(E.atkGrowth, floor - 1) * m * (isBoss ? E.bossAtkMul : 1);
  const spd = E.spdBase + Math.floor(floor / E.spdFloorDivisor);
  return { hp: Math.ceil(hp), atk: Math.ceil(atk), spd };
}

export function createEnemy(rng: Rng, floor: number, towerId: TowerId, isBoss: boolean): Enemy {
  const s = enemyStats(floor, towerId, isBoss);
  const name = isBoss
    ? BOSS_NAMES[towerId][Math.min(BOSS_NAMES[towerId].length - 1, floor / BALANCE.explore.bossInterval - 1)]
    : pick(rng, ENEMY_NAMES[towerId]);
  return { name, floor, isBoss, maxHp: s.hp, hp: s.hp, atk: s.atk, spd: s.spd, towerId };
}

/** 戦闘に参加するプレイヤー側の状態（ラン状態から渡される。HP とステータスは書き換わる） */
export interface Combatant {
  hp: number;
  stats: BaseStats;
  loadout: Loadout;
}

export interface AttackResult {
  hits: number;
  crits: number;
  extraHits: number;
  critMul: number;
  damage: number;
}

export interface EnemyHitResult {
  damage: number;
  gutsTriggered: boolean;
  counterDamage: number;
}

export type TurnLog =
  | { type: 'attack'; turn: number; attack: AttackResult; enemyHit: EnemyHitResult | null }
  | { type: 'escape_fail'; turn: number; chance: number; enemyHit: EnemyHitResult }
  | { type: 'escape_ok'; turn: number; chance: number };

export type BattleOutcome = 'ongoing' | 'win' | 'lose' | 'escaped';

export interface BattleState {
  enemy: Enemy;
  phase: SkillPhaseResult;
  battleMul: number;
  passives: Passives;
  gutsUsed: boolean;
  turn: number;
  log: TurnLog[];
  outcome: BattleOutcome;
  maxDamage: number;
}

/** 戦闘開始: スキルフェーズを実行し、プレイヤーのステータスを（ラン中永続で）伸ばす */
export function startBattle(player: Combatant, enemy: Enemy, rng: Rng): BattleState {
  const phase = runSkillPhase(player.stats, player.loadout, rng);
  player.stats = phase.stats;
  // 最大HPが減ることはない（防具は戦闘中に変わらない）ので HP の補正は不要
  return {
    enemy,
    phase,
    battleMul: phase.battleMul,
    passives: phase.passives,
    gutsUsed: false,
    turn: 0,
    log: [],
    outcome: 'ongoing',
    maxDamage: 0,
  };
}

/** 1ターンの攻撃の計算（乱数を使わない） */
export function computeAttack(stats: BaseStats, loadout: Loadout, battleMul: number, passives: Passives): AttackResult {
  const e = computeEffective(stats, loadout);
  const hits = hitsPerTurn(e.spd, battleMul);
  const crits = critCount(hits, e.luck);
  const extraHits = passives.chain ? Math.min(SKILL_PARAMS.S17.perTurnCap, crits) : 0;
  const critMul = critMultiplier(e.luck);
  const damage = capNumber((hits - crits + extraHits) * e.attack + crits * e.attack * critMul);
  return { hits, crits, extraHits, critMul, damage };
}

export function predictPlayerDamage(b: BattleState, p: Combatant): number {
  return computeAttack(p.stats, p.loadout, b.battleMul, b.passives).damage;
}

export function predictEnemyDamage(b: BattleState, p: Combatant): number {
  return damageTaken(b.enemy.atk, computeEffective(p.stats, p.loadout).defense);
}

export function currentEscapeChance(b: BattleState, p: Combatant): number {
  return escapeChance(p.stats.spd, b.enemy.spd, b.enemy.isBoss);
}

function enemyAttack(b: BattleState, p: Combatant): EnemyHitResult {
  const e = computeEffective(p.stats, p.loadout);
  const dmg = damageTaken(b.enemy.atk, e.defense);
  let gutsTriggered = false;
  if (p.hp - dmg <= 0 && b.passives.guts && !b.gutsUsed) {
    b.gutsUsed = true;
    gutsTriggered = true;
    p.hp = 1;
  } else {
    p.hp = Math.max(0, p.hp - dmg);
  }
  let counterDamage = 0;
  if (p.hp <= 0) {
    b.outcome = 'lose';
  } else if (b.passives.counter > 0) {
    counterDamage = capNumber(e.attack * SKILL_PARAMS.S21.ratio * b.passives.counter);
    b.enemy.hp = Math.max(0, b.enemy.hp - counterDamage);
    b.maxDamage = Math.max(b.maxDamage, counterDamage);
    if (b.enemy.hp <= 0) b.outcome = 'win';
  }
  return { damage: dmg, gutsTriggered, counterDamage };
}

export function playerAttack(b: BattleState, p: Combatant): TurnLog {
  if (b.outcome !== 'ongoing') throw new Error('battle already finished');
  b.turn++;
  const attack = computeAttack(p.stats, p.loadout, b.battleMul, b.passives);
  b.enemy.hp = Math.max(0, b.enemy.hp - attack.damage);
  b.maxDamage = Math.max(b.maxDamage, attack.damage);
  let enemyHit: EnemyHitResult | null = null;
  if (b.enemy.hp <= 0) b.outcome = 'win';
  else enemyHit = enemyAttack(b, p);
  const log: TurnLog = { type: 'attack', turn: b.turn, attack, enemyHit };
  b.log.push(log);
  return log;
}

export function tryEscape(b: BattleState, p: Combatant, rng: Rng): TurnLog {
  if (b.outcome !== 'ongoing') throw new Error('battle already finished');
  b.turn++;
  const chance = currentEscapeChance(b, p);
  let log: TurnLog;
  if (rng.next() < chance) {
    b.outcome = 'escaped';
    log = { type: 'escape_ok', turn: b.turn, chance };
  } else {
    log = { type: 'escape_fail', turn: b.turn, chance, enemyHit: enemyAttack(b, p) };
  }
  b.log.push(log);
  return log;
}

/** 攻撃し続けたときの決着（シミュレーション・テスト用） */
export function autoFight(b: BattleState, p: Combatant, maxTurns = 1000): BattleOutcome {
  while (b.outcome === 'ongoing' && b.turn < maxTurns) playerAttack(b, p);
  return b.outcome;
}
