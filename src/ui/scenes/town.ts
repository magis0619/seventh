import { BALANCE } from '../../data/balance';
import { TOWERS, TOWER_IDS, type TowerId } from '../../data/dungeons';
import { ensureWeapon, startRun } from '../../core/run';
import { startFloors, storageFull } from '../../core/save';
import { computeEffective, initialStats } from '../../core/stats';
import { slotKind, type SlotIndex } from '../../core/types';
import { createRng } from '../../core/rng';
import { esc, itemCard, loadoutCards, SLOT_LABEL, statsPanel, tagSummary } from '../components';
import type { Game } from '../game';

export function renderTown(g: Game) {
  const p = g.profile;
  const rescued = ensureWeapon(p, createRng(Date.now() >>> 0));
  if (rescued) {
    g.townMessage = `武器が無いので「${rescued.name}」を拾った。`;
    g.save();
  }
  const eff = computeEffective(initialStats(), p.loadout);
  const cap = BALANCE.storage.capacity;
  const full = storageFull(p);

  const loadoutHtml = loadoutCards(p.loadout, false, (s) =>
    p.loadout[s] ? `<button data-unequip="${s}" ${full ? 'disabled title="倉庫がいっぱい"' : ''}>倉庫へ外す</button>` : '',
  );

  const storageHtml = p.storage.length
    ? p.storage
        .map((it, i) => {
          const slots = (it.kind === 'weapon' ? [0, 1] : [2, 3]) as SlotIndex[];
          const buttons =
            slots.map((s) => `<button data-equip="${i}" data-slot="${s}">${SLOT_LABEL[s]}へ</button>`).join('') +
            `<button class="danger" data-discard="${i}">捨てる</button>`;
          return itemCard(it, { compact: false, actions: buttons, slotLabel: `倉庫 #${i + 1}` });
        })
        .join('')
    : '<div class="dim">倉庫は空です。探索中に拾った装備を「倉庫へ」送ると、負けても失いません。</div>';

  const towersHtml = TOWER_IDS.map((id) => {
    const t = TOWERS[id];
    const prog = p.towers[id];
    const floors = startFloors(prog);
    return `<div class="tower" style="border-left:4px solid ${t.palette.line}">
      <div class="row"><span class="tname">${t.name}</span><span class="dim">難度 ×${t.difficulty}</span><span class="spacer"></span>${
        prog.cleared ? '<span class="accent">踏破済</span>' : ''
      }</div>
      <div class="dim" style="font-size:12px;margin:4px 0">最高到達 ${prog.maxFloor}F ／ 出やすいタグ: ${Object.entries(t.tagWeights)
        .filter(([, w]) => w > 1)
        .map(([k]) => k)
        .join('・') || '均等'}${t.skillPBonus ? `／スキルが付きやすい` : ''}</div>
      <div class="row">開始階 <select data-start="${id}">${floors
        .map((f) => `<option value="${f}" ${f === floors[floors.length - 1] ? 'selected' : ''}>${f}F</option>`)
        .join('')}</select>
      <span class="spacer"></span><button class="primary" data-go="${id}">出発</button></div>
    </div>`;
  }).join('');

  g.root.innerHTML = `
    <div class="topbar"><h1>シナジーの塔</h1><span class="sub">最高到達 ${p.bestFloor}F</span><span class="spacer"></span>
      <span class="dim">${g.debug ? 'DEBUG' : ''}</span></div>
    ${g.townMessage ? `<div class="panel" style="margin-bottom:10px">${esc(g.townMessage)}</div>` : ''}
    <nav class="tabs-bar">${(
      [
        ['tower', '出発'],
        ['equip', '装備'],
        ['storage', `倉庫 ${p.storage.length}/${cap}`],
      ] as const
    )
      .map(([k, l]) => `<button data-tab="${k}" class="${g.townTab === k ? 'active' : ''}">${l}</button>`)
      .join('')}</nav>
    <div class="cols town tab-${g.townTab}">
      <div class="panel pane-equip">
        <h2>装備</h2>
        ${loadoutHtml}
        <h2 style="margin-top:10px">出発時のステータス</h2>
        ${statsPanel(eff)}
        ${tagSummary(p.loadout)}
        <div class="dim" style="font-size:12px;margin-top:8px">スキルで伸びた値はラン中のみ有効。町に戻るとリセットされます。</div>
      </div>
      <div class="panel pane-storage">
        <h2>倉庫 ${p.storage.length} / ${cap}</h2>
        <div class="storage-grid">${storageHtml}</div>
      </div>
      <div class="panel pane-tower">
        ${
          p.bestFloor < 20
            ? `<ol class="howto">
            <li>塔を選んで<b>出発</b>。「進む」で1階ずつ登る</li>
            <li>戦闘が始まると<b>装備のスキルが上から順に発動</b>し、ステータスが伸びる。伸びた値はランの間ずっと残るので、<b>戦うほど強くなる</b></li>
            <li>危なくなったら<b>戻る</b>。負けると装備中の武器を失う</li>
          </ol>`
            : ''
        }
        <h2>塔を選ぶ</h2>
        ${towersHtml}
        <div class="dim" style="font-size:12px">
          ・各塔は100Fまで。20Fごとにボス。ボスを倒すと次回その次の階から挑戦できる。<br>
          ・<b class="bad">負けると装備中の武器2つを失う</b>（防具と倉庫は残る）。<br>
          ・HPは自動回復しない。回復は泉と帰還のみ。
        </div>
      </div>
    </div>`;

  g.root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) =>
    b.addEventListener('click', () => {
      g.townTab = b.dataset.tab as Game['townTab'];
      g.render();
    }),
  );
  g.root.querySelectorAll<HTMLButtonElement>('[data-unequip]').forEach((b) =>
    b.addEventListener('click', () => {
      const s = Number(b.dataset.unequip) as SlotIndex;
      const it = p.loadout[s];
      if (!it || storageFull(p)) return;
      p.storage.push(it);
      p.loadout[s] = null;
      g.townMessage = '';
      g.save();
      g.render();
    }),
  );
  g.root.querySelectorAll<HTMLButtonElement>('[data-equip]').forEach((b) =>
    b.addEventListener('click', () => {
      const i = Number(b.dataset.equip);
      const s = Number(b.dataset.slot) as SlotIndex;
      const it = p.storage[i];
      if (!it || slotKind(s) !== it.kind) return;
      const old = p.loadout[s];
      p.loadout[s] = it;
      p.storage.splice(i, 1);
      if (old) p.storage.splice(i, 0, old);
      g.townMessage = '';
      g.save();
      g.render();
    }),
  );
  g.root.querySelectorAll<HTMLButtonElement>('[data-discard]').forEach((b) =>
    b.addEventListener('click', () => {
      const i = Number(b.dataset.discard);
      const it = p.storage[i];
      if (!it) return;
      if (it.skills.length >= 2 && !confirm(`「${it.name}」を捨てますか？`)) return;
      p.storage.splice(i, 1);
      g.save();
      g.render();
    }),
  );
  g.root.querySelectorAll<HTMLButtonElement>('[data-go]').forEach((b) =>
    b.addEventListener('click', () => {
      const id = b.dataset.go as TowerId;
      const sel = g.root.querySelector<HTMLSelectElement>(`[data-start="${id}"]`)!;
      g.run = startRun(p, id, Number(sel.value), g.nextRunSeed());
      g.townMessage = '';
      g.battleLines = [];
      g.syncScene();
    }),
  );
}
