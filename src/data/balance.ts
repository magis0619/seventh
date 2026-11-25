/**
 * 全バランス数値をここに集約する。コード中に数値を直書きしないこと。
 * 参照: MVP実装指示書 §2.2 / §4 / §5
 */
export const BALANCE = {
  player: {
    /** 初期ステータス（§4.1） */
    initial: { str: 2, spd: 1, mag: 0, def: 0, luck: 5 },
    baseMaxHp: 40,
    /** 会心率計算で使う運の上限（%） */
    critLuckCap: 100,
    /** 会心ダメージ倍率 = critBase + max(0, 運 - critLuckCap) / critOverDivisor */
    critBase: 3,
    critOverDivisor: 50,
    minHits: 1,
  },

  escape: {
    base: 0.5,
    perSpeedDiff: 0.05,
    max: 0.95,
    min: 0.05,
    boss: 0.2,
  },

  enemy: {
    hpBase: 20,
    hpGrowth: 1.22,
    atkBase: 5,
    atkGrowth: 1.12,
    spdBase: 1,
    spdFloorDivisor: 15,
    bossHpMul: 4,
    bossAtkMul: 1.5,
    minDamage: 1,
  },

  explore: {
    maxFloor: 100,
    bossInterval: 20,
    encounterRate: 0.4,
    /** 非遭遇時に泉が出る確率 */
    fountainRate: 0.08,
    fountainHealRatio: 0.4,
  },

  drop: {
    normalBase: 0.35,
    /** 運 1 につき +1/4 % */
    luckPerPercent: 4,
    normalMax: 0.7,
    boss: 1.0,
  },

  item: {
    qualityMin: 0.6,
    qualityMax: 1.4,
    weaponAtkBase: 4,
    weaponAtkPerFloor: 1.2,
    armorDefBase: 2,
    armorDefPerFloor: 0.6,
    armorHpBase: 10,
    armorHpPerFloor: 4,
    luckChance: 0.25,
    luckMin: 1,
    luckMax: 8,
  },

  skillRoll: {
    pBase: 0.4,
    luckDivisor: 250,
    bossBonus: 0.2,
    pMax: 0.85,
    decay: 0.65,
    maxSkills: 3,
    bossMinSkills: 1,
  },

  skillPhase: {
    /** 再発動の連鎖の深さ上限（§5.6） */
    maxDepth: 4,
    /** 1回のスキルフェーズの発動回数上限 */
    maxActivations: 200,
  },

  tagBonus: {
    /** [必要数, 倍率]。上から順に判定 */
    tiers: [
      [5, 3],
      [3, 2],
    ] as ReadonlyArray<readonly [number, number]>,
  },

  storage: {
    capacity: 20,
  },

  /** 数値が double の上限を超えないようにする安全弁 */
  numberCap: 1e300,

  /** 演出 */
  fx: {
    skillStepMs: 280,
    skillStepFastMs: 40,
    fastForwardAfter: 20,
    corridorMoveMs: 300,
  },
} as const;
