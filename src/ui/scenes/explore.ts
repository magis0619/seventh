import { BALANCE } from '../../data/balance';
import { advance, retreat } from '../../core/run';
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

export function renderExplore(g: Game) {
  const run = g.run!;
  const atTop = run.floorCleared && run.floor >= BALANCE.explore.maxFloor;
  g.root.innerHTML = playLayout(g, {
    view: viewHtml(g),
    controls: `<button class="big primary" id="go" ${atTop ? 'disabled' : ''}>進む<span class="kbd">[Space]</span></button>
      <button class="big" id="back">戻る<span class="kbd">[Esc]</span></button>`,
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
