import { createRng, hashSeed } from '../core/rng';
import { loadProfile, saveProfile, type KVStore, type Profile } from '../core/save';
import type { RunState } from '../core/run';
import type { BattleState } from '../core/battle';
import type { Corridor } from './corridor';
import { renderTown } from './scenes/town';
import { renderExplore } from './scenes/explore';
import { renderBattle } from './scenes/battle';
import { renderLoot } from './scenes/loot';
import { renderResult } from './scenes/result';
import { renderDebug } from './debug';

export type SceneId = 'town' | 'explore' | 'battle' | 'loot' | 'result';

/** localStorage が使えない環境でも動くようにする */
function safeStore(): KVStore {
  try {
    const k = '__test__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    const m = new Map<string, string>();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
  }
}

export class Game {
  readonly store = safeStore();
  profile: Profile;
  run: RunState | null = null;
  scene: SceneId = 'town';
  corridor: Corridor | null = null;
  /** 入力ロック（アニメ中など） */
  busy = false;
  /** シーン固有のキーボード操作 */
  hotkeys: Record<string, () => void> = {};
  /** busy 中でも hotkeys を受け付けるか（スキル演出のスキップ用） */
  busyHotkeys = false;
  /** 戦闘ログ（HTML行） */
  battleLines: string[] = [];
  /** スキル演出済みの戦闘 */
  animatedBattle: BattleState | null = null;
  /** 決着後、遷移前に表示しておく戦闘 */
  finishedBattle: BattleState | null = null;
  /** デバッグ表示用: 最後に見た戦闘 */
  lastBattleCache: BattleState | null = null;
  /** ドロップ画面で「外した装備」を扱っているか */
  lootSwapped = false;
  /** 町に表示する一言 */
  townMessage = '';
  /** デバッグ: 次のランのシード（null ならランダム） */
  fixedSeed: number | null = null;
  readonly debug: boolean;

  constructor(readonly root: HTMLElement, readonly debugRoot: HTMLElement) {
    const params = new URLSearchParams(location.search);
    this.debug = params.get('debug') === '1';
    const seedParam = params.get('seed');
    if (seedParam) this.fixedSeed = /^\d+$/.test(seedParam) ? Number(seedParam) : hashSeed(seedParam);
    this.profile = loadProfile(this.store, createRng(Date.now() >>> 0));
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;
      const fn = this.hotkeys[e.key];
      if (fn && (!this.busy || this.busyHotkeys)) {
        e.preventDefault();
        fn();
      }
    });
  }

  save() {
    saveProfile(this.store, this.profile);
  }

  nextRunSeed(): number {
    if (this.fixedSeed !== null) return this.fixedSeed;
    return hashSeed(`${Date.now()}-${this.profile.runCounter}-${Math.random()}`);
  }

  go(scene: SceneId) {
    this.scene = scene;
    this.render();
  }

  /** ランの状態から適切なシーンへ */
  syncScene() {
    const r = this.run;
    if (!r) return this.go('town');
    this.save();
    switch (r.status) {
      case 'explore':
        return this.go('explore');
      case 'battle':
        return this.go('battle');
      case 'loot':
        return this.go('loot');
      case 'ended':
        return this.go('result');
    }
  }

  render() {
    this.corridor?.destroy();
    this.corridor = null;
    this.hotkeys = {};
    this.busyHotkeys = false;
    switch (this.scene) {
      case 'town':
        renderTown(this);
        break;
      case 'explore':
        renderExplore(this);
        break;
      case 'battle':
        renderBattle(this);
        break;
      case 'loot':
        renderLoot(this);
        break;
      case 'result':
        renderResult(this);
        break;
    }
    this.renderDebug();
  }

  renderDebug() {
    if (this.debug) renderDebug(this);
  }
}

export function wait(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
