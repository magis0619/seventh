import { BALANCE } from '../../data/balance';
import { advance, maxHpOf, retreat } from '../../core/run';
import { enemyStats, isBossFloor } from '../../core/battle';
import { computeEffective, damageTaken, hitsPerTurn } from '../../core/stats';
import { formatNum } from '../format';
import type { Game } from '../game';
import { mountCorridor, playLayout, viewHtml } from './play';

function eventMessage(g: Game): string {
  const ev = g.run!.lastEvent;
  switch (ev.type) {
    case 'start':
      return `${g.run!.startFloor}Fへ挑む。「進む」で次の階へ。`;
    case 'nothing':
      return '静かな通路だ。何もない。';
    case 'fountain':
      return `回復の泉だ！ HP +${formatNum(ev.heal)}`;
    case 'escaped':
      return g.run!.floorCleared ? 'うまく逃げ切った。' : 'ボスから逃げた…。進むと再び挑むことになる。';
    case 'win':
      return ev.drop ? '敵を倒した！' : '敵を倒した。何も落とさなかった。';
    case 'battle':
      return '';
  }
}

/** 次の階の敵の目安と、危険度（「進むか戻るか」の判断材料） */
function nextFloorInfo(g: Game): { html: string; danger: boolean } {
  const run = g.run!;
  const next = run.floorCleared ? run.floor + 1 : run.floor;
  if (next > BALANCE.explore.maxFloor) return { html: '', danger: false };
  const boss = isBossFloor(next);
  const es = enemyStats(next, run.towerId, boss);
  const eff = computeEffective(run.stats, g.profile.loadout);
  const taken = damageTaken(es.atk, eff.defense);
  const hits = Math.ceil(run.hp / taken);
  const dmg = hitsPerTurn(eff.spd, 1) * eff.attack;
  const turns = Math.ceil(es.hp / Math.max(1, dmg));
  const danger = hits <= 3 || (boss && turns > hits);
  const lowHp = run.hp < maxHpOf(g.profile, run) * 0.35;
  const head = boss ? `<b class="bad">次は ${next}F ボス</b>` : `次の ${next}F の敵（目安）`;
  const html = `<div class="next-info ${danger ? 'danger' : ''}">
    <div>${head}：HP ${formatNum(es.hp)}／攻撃 ${formatNum(es.atk)}</div>
    <div class="dim">今の強さで：被ダメ ${formatNum(taken)}/回（あと${formatNum(hits)}発）・撃破 約${formatNum(turns)}ターン（スキル発動前）</div>
    ${danger || lowHp ? `<div class="warn-line">⚠ ${boss && turns > hits ? 'このままだとボスに勝てない見込み' : 'HPが危ない'} — 戻れば装備は持ち帰れる</div>` : ''}
  </div>`;
  return { html, danger: danger || lowHp };
}

export function renderExplore(g: Game) {
  const run = g.run!;
  const atTop = run.floorCleared && run.floor >= BALANCE.explore.maxFloor;
  const info = nextFloorInfo(g);
  g.root.innerHTML = playLayout(g, {
    view: viewHtml(g),
    predict: info.html,
    controls: `<button class="big ${info.danger ? '' : 'primary'}" id="go" ${atTop ? 'disabled' : ''}>進む<span class="kbd">[Space]</span></button>
      <button class="big ${info.danger ? 'warn' : ''}" id="back">${info.danger ? '戻る（推奨）' : '戻る'}<span class="kbd">[Esc]</span></button>`,
    note: '「戻る」で帰還：装備を持ち帰る（HP全快・成長はリセット）',
  });
  const corridor = mountCorridor(g);
  corridor.setFountain(run.lastEvent.type === 'fountain');
  g.root.querySelector('#msg')!.textContent = eventMessage(g);

  const go = async () => {
    if (g.busy || atTop) return;
    g.busy = true;
    corridor.setFountain(false);
    g.root.querySelector('#msg')!.textContent = '';
    await corridor.playMove(BALANCE.fx.corridorMoveMs);
    g.busy = false;
    const ev = advance(g.profile, run);
    if (ev.type === 'battle') g.battleLines = [];
    g.syncScene();
  };
  const back = () => {
    if (g.busy) return;
    retreat(g.profile, run);
    g.syncScene();
  };
  g.root.querySelector('#go')!.addEventListener('click', go);
  g.root.querySelector('#back')!.addEventListener('click', back);
  g.hotkeys = { ' ': go, Enter: go, Escape: back };
}
