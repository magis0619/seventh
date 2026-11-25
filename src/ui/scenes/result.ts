import { TOWERS } from '../../data/dungeons';
import { STAT_LABEL } from '../../core/stats';
import type { StatKey } from '../../core/types';
import { esc, itemCard } from '../components';
import { formatNum } from '../format';
import type { Game } from '../game';

const TITLE = {
  retreat: ['帰還', 'good', '無事に町へ戻った。装備は持ち帰った。'],
  defeat: ['敗北', 'bad', '力尽きた…。装備中の武器を失った。'],
  clear: ['踏破！', 'accent', '塔の頂上に辿り着いた！'],
} as const;

export function renderResult(g: Game) {
  const run = g.run!;
  const res = run.result ?? 'retreat';
  const [title, cls, sub] = TITLE[res];
  const keys: StatKey[] = ['str', 'spd', 'mag', 'def', 'luck'];
  const growth = keys
    .map((k) => `<tr><td>${STAT_LABEL[k]}</td><td>${formatNum(run.startStats[k])} → <b>${formatNum(run.stats[k])}</b></td></tr>`)
    .join('');
  const tp = g.profile.towers[run.towerId];

  g.root.innerHTML = `
    <div class="result panel">
      <div class="banner ${cls}">${title}</div>
      <div style="text-align:center" class="dim">${sub}</div>
      <h2 style="margin-top:16px">${TOWERS[run.towerId].name}</h2>
      <table>
        <tr><td>到達階</td><td>${run.startFloor}F → <b>${run.floor}F</b></td></tr>
        <tr><td>撃破数</td><td>${run.kills}</td></tr>
        <tr><td>最大ダメージ</td><td><b class="accent" style="font-size:18px">${formatNum(run.maxDamage)}</b></td></tr>
        <tr><td>次回の開始可能階</td><td>${tp.checkpoint}F まで</td></tr>
        <tr><td>倉庫へ送った装備</td><td>${run.sentToStorage.length}個</td></tr>
        <tr><td>捨てた装備</td><td>${run.discarded}個</td></tr>
      </table>
      <h2 style="margin-top:16px">ラン中の成長（町に戻るとリセット）</h2>
      <table>${growth}</table>
      ${
        run.lost.length
          ? `<h2 style="margin-top:16px" class="bad">失った装備</h2><div class="two-col">${run.lost
              .map((it) => itemCard(it, { compact: true }))
              .join('')}</div>`
          : ''
      }
      <div class="controls"><button class="big primary" id="town">町へ<span class="kbd">[Space]</span></button></div>
    </div>`;
  const back = () => {
    g.run = null;
    g.townMessage = res === 'defeat' ? `前回: ${esc(TOWERS[run.towerId].name)} ${run.floor}Fで敗北` : '';
    g.go('town');
  };
  g.root.querySelector('#town')!.addEventListener('click', back);
  g.hotkeys = { ' ': back, Enter: back };
}
