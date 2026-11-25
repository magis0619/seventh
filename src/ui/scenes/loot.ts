import { BALANCE } from '../../data/balance';
import { lootDiscard, lootEquip, lootStore } from '../../core/run';
import { storageFull } from '../../core/save';
import { computeEffective } from '../../core/stats';
import type { Item, Loadout, SlotIndex } from '../../core/types';
import { itemCard, SLOT_LABEL } from '../components';
import { formatNum } from '../format';
import type { Game } from '../game';

/** その枠に装備したときの実効ステータスの差分 */
function equipDelta(g: Game, slot: SlotIndex, item: Item): string {
  const run = g.run!;
  const before = computeEffective(run.stats, g.profile.loadout);
  const lo = [...g.profile.loadout] as Loadout;
  lo[slot] = item;
  const after = computeEffective(run.stats, lo);
  const parts: string[] = [];
  const add = (label: string, a: number, b: number) => {
    const d = b - a;
    if (d !== 0) parts.push(`<span class="${d > 0 ? 'diff-up' : 'diff-down'}">${label}${d > 0 ? '+' : '−'}${formatNum(Math.abs(d))}</span>`);
  };
  add('攻撃', before.attack, after.attack);
  add('防御', before.defense, after.defense);
  add('HP', before.maxHp, after.maxHp);
  add('運', before.luck, after.luck);
  return parts.join(' ') || '<span class="dim">基本性能の差なし</span>';
}

export function renderLoot(g: Game) {
  const run = g.run!;
  const item = run.pendingLoot;
  if (!item) return g.syncScene();
  const slots = (item.kind === 'weapon' ? [0, 1] : [2, 3]) as SlotIndex[];
  const full = storageFull(g.profile);
  const isSwap = g.lootSwapped;

  const slotCards = slots
    .map((s) =>
      itemCard(g.profile.loadout[s], {
        slot: s,
        actions: `<button class="primary" data-equip="${s}">ここに装備</button><div style="width:100%;font-size:12px">${equipDelta(g, s, item)}</div>`,
      }),
    )
    .join('');

  g.root.innerHTML = `
    <div class="topbar"><h1>${isSwap ? '外した装備' : 'ドロップ！'}</h1><span class="sub">${run.floor}F</span></div>
    <div class="panel">
      <div class="loot">
        <div>
          <h2>${isSwap ? '外した装備（どうする？）' : '拾った装備'}</h2>
          <div class="new">${itemCard(item, { slotLabel: item.kind === 'weapon' ? '武器' : '防具' })}</div>
          <div class="row" style="margin-top:12px">
            <button id="store" ${full ? 'disabled' : ''}>倉庫へ送る（${g.profile.storage.length}/${BALANCE.storage.capacity}）</button>
            <button class="danger" id="discard">捨てる</button>
          </div>
          <div class="dim" style="font-size:12px;margin-top:6px">倉庫へ送った装備は、負けても失いません。${full ? '<br><b class="bad">倉庫がいっぱいです。</b>' : ''}</div>
        </div>
        <div style="grid-column: span 2">
          <h2>装備中の${item.kind === 'weapon' ? '武器' : '防具'}と比較</h2>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">${slotCards}</div>
          <div class="dim" style="font-size:12px">装備すると、外した装備をどうするか（倉庫へ／捨てる）を続けて選びます。スキルの発動順は ${SLOT_LABEL.join(' → ')}、各装備の中は上から。</div>
        </div>
      </div>
    </div>`;

  const done = () => {
    g.lootSwapped = run.status === 'loot';
    g.syncScene();
  };
  g.root.querySelectorAll<HTMLButtonElement>('[data-equip]').forEach((b) =>
    b.addEventListener('click', () => {
      lootEquip(g.profile, run, Number(b.dataset.equip) as SlotIndex);
      done();
    }),
  );
  g.root.querySelector('#store')!.addEventListener('click', () => {
    if (lootStore(g.profile, run)) done();
  });
  g.root.querySelector('#discard')!.addEventListener('click', () => {
    lootDiscard(g.profile, run);
    done();
  });
  g.hotkeys = {
    '1': () => g.root.querySelector<HTMLButtonElement>(`[data-equip="${slots[0]}"]`)?.click(),
    '2': () => g.root.querySelector<HTMLButtonElement>(`[data-equip="${slots[1]}"]`)?.click(),
    s: () => g.root.querySelector<HTMLButtonElement>('#store')?.click(),
    d: () => g.root.querySelector<HTMLButtonElement>('#discard')?.click(),
  };
}
