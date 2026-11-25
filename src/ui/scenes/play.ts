/** 探索・戦闘シーン共通のレイアウト部品 */
import { TOWERS } from '../../data/dungeons';
import { BALANCE } from '../../data/balance';
import { floorsToBoss, maxHpOf } from '../../core/run';
import { computeEffective } from '../../core/stats';
import { Corridor } from '../corridor';
import { hpBar, loadoutCards, statsPanel, tagSummary } from '../components';
import type { Game } from '../game';

export function sidePanel(g: Game, battleMul?: number): string {
  const run = g.run!;
  const p = g.profile;
  const eff = computeEffective(run.stats, p.loadout);
  const toBoss = floorsToBoss(run);
  return `<div class="panel">
    <div class="row"><b>HP</b><span class="spacer"></span></div>
    <div id="player-hp">${hpBar(run.hp, maxHpOf(p, run))}</div>
    <div class="row" style="margin-top:8px"><h2 style="margin:0">ステータス</h2><span class="spacer"></span>
      <span class="dim" style="font-size:12px">${toBoss === 0 ? '<b class="bad">ボス階</b>' : `次のボスまで ${toBoss}F`}</span></div>
    <div id="stats">${statsPanel(eff, battleMul)}</div>
    ${tagSummary(p.loadout)}
    <h2 style="margin-top:10px">装備</h2>
    <div id="cards">${loadoutCards(p.loadout, true)}</div>
  </div>`;
}

export function viewHtml(g: Game): string {
  const run = g.run!;
  const t = TOWERS[run.towerId];
  return `<div class="view" id="view">
    <canvas id="corridor" width="800" height="450"></canvas>
    <div class="overlay" id="overlay">
      <div class="hud"><div class="floor">${run.floor}F <span style="font-size:13px" class="dim">/ ${BALANCE.explore.maxFloor}F</span></div><div>${t.name}</div></div>
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
