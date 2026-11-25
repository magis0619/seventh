/** 探索・戦闘シーン共通のレイアウト部品（スマホは縦1カラム、PCは2カラム） */
import { TOWERS } from '../../data/dungeons';
import { BALANCE } from '../../data/balance';
import { floorsToBoss, maxHpOf } from '../../core/run';
import { computeEffective } from '../../core/stats';
import { Corridor } from '../corridor';
import { hpBar, loadoutCards, statsPanel, tagSummary } from '../components';
import type { Game } from '../game';

export function statusPanel(g: Game, battleMul?: number): string {
  const run = g.run!;
  const p = g.profile;
  const eff = computeEffective(run.stats, p.loadout);
  const toBoss = floorsToBoss(run);
  return `<div class="panel status">
    <div class="row"><b>HP</b><span class="spacer"></span>
      <span class="dim" style="font-size:12px">${toBoss === 0 ? '<b class="bad">ボス階</b>' : `次のボスまで ${toBoss}F`}</span></div>
    <div id="player-hp">${hpBar(run.hp, maxHpOf(p, run))}</div>
    <div id="stats" style="margin-top:6px">${statsPanel(eff, battleMul)}</div>
    ${tagSummary(p.loadout)}
  </div>`;
}

export function cardsPanel(g: Game): string {
  return `<div class="panel cards-panel"><h2>装備</h2><div id="cards" class="cards-grid">${loadoutCards(g.profile.loadout, true)}</div></div>`;
}

export interface PlayParts {
  view: string;
  controls: string;
  battleMul?: number;
  predict?: string;
  log?: string;
  note?: string;
}

/**
 * PC: 左（通路・予測・ボタン・ログ）／右（ステータス・装備）
 * スマホ: 通路 → ステータス → 予測 → 装備 → ログ、ボタンは画面下に固定
 */
export function playLayout(g: Game, parts: PlayParts): string {
  return `<div class="cols play">
    <div class="col-main">
      <div class="area-view">${parts.view}</div>
      ${parts.predict ? `<div class="area-predict">${parts.predict}</div>` : ''}
      <div class="area-controls"><div class="controls">${parts.controls}</div>${parts.note ? `<div class="note">${parts.note}</div>` : ''}</div>
      ${parts.log !== undefined ? `<div class="area-log">${parts.log}</div>` : ''}
    </div>
    <div class="col-side">
      <div class="area-status">${statusPanel(g, parts.battleMul)}</div>
      <div class="area-cards">${cardsPanel(g)}</div>
    </div>
  </div>`;
}

export function viewHtml(g: Game, extra = ''): string {
  const run = g.run!;
  const t = TOWERS[run.towerId];
  return `<div class="view" id="view">
    <canvas id="corridor" width="800" height="450"></canvas>
    <div class="overlay" id="overlay">
      <div class="hud"><div class="floor">${run.floor}F <span class="dim max">/ ${BALANCE.explore.maxFloor}F</span></div><div class="tname">${t.name}</div></div>
      ${extra}
      <div class="msg" id="msg"></div>
    </div>
  </div>`;
}

export function mountCorridor(g: Game): Corridor {
  const canvas = g.root.querySelector<HTMLCanvasElement>('#corridor')!;
  const c = new Corridor(canvas, TOWERS[g.run!.towerId]);
  g.corridor = c;
  c.draw();
  return c;
}
