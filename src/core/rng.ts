/**
 * シード付き乱数（mulberry32）。状態は 32bit 整数1つなので保存・再現が容易。
 */
export interface Rng {
  /** [0, 1) の一様乱数 */
  next(): number;
  /** 内部状態（再現用） */
  getState(): number;
  setState(s: number): void;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    getState: () => a,
    setState: (s: number) => {
      a = s >>> 0;
    },
  };
}

/** 文字列や任意の数値から 32bit シードを作る */
export function hashSeed(input: string | number): number {
  const s = String(input);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function randRange(rng: Rng, min: number, max: number): number {
  return min + (max - min) * rng.next();
}

/** min 以上 max 以下の整数 */
export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng.next() * (max - min + 1));
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng.next() * arr.length)];
}

export function weightedPick<T>(rng: Rng, items: readonly T[], weights: readonly number[]): T {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng.next() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}
