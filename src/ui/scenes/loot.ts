import { BALANCE } from '../../data/balance';
import { lootDiscard, lootEquip, lootStore } from '../../core/run';
import { storageFull } from '../../core/save';
import { computeEffective, hitsPerTurn } from '../../core/stats';
import { createRng } from '../../core/rng';
import { runSkillPhase, summarizePhase } from '../../core/skillEngine';
import type { Item, Loadout, SlotIndex } from '../../core/types';
import { itemCard, SLOT_LABEL } from '../components';
import { formatNum } from '../format';
import type { Game } from '../game';

interface Preview {
  /** 次の戦闘開始時（スキル発動後）の攻撃 */
  attack: number;
  defense: number;
  chains: number;
  maxHp: number;
}

/**
 * 次の戦闘開始時にスキルが発動した後の強さを試算する。
 * 博打の当たり外れで比較がぶれないよう、乱数は毎回同じシードで回す。
 */
function previewNextBattle(g: Game, lo: Loadout): Preview {
  const r = runSkillPhase(g.run!.stats, lo, createRng(12345));
  const e = computeEffective(r.stats, lo);
  return {
    attack: hitsPerTurn(e.spd, r.battleMul) * e.attack,
    defense: e.defense,
    chains: summarizePhase(r).chains,
    maxHp: e.maxHp,
  };
}

function deltaText(label: string, a: number, b: number): string {
  if (a === b) return '';
  const up = b > a;
  return `<span class="${up ? 'diff-up' : 'diff-down'}">${up ? '▲' : '▼'}${label} ${formatNum(a)}→${formatNum(b)}</span>`;
}

/** その枠に装備したら、次の戦闘で何が変わるか */
function equipPreview(g: Game, slot: SlotIndex, item: Item): { html: string; score: number } {
  const now = previewNextBattle(g, g.profile.loadout);
  const lo = [...g.profile.loadout] as Loadout;
  lo[slot] = item;
  const next = previewNextBattle(g, lo);
  const parts = [
    deltaText('火力', now.attack, next.attack),
    deltaText('防御', now.defense, next.defense),
    deltaText('最大HP', now.maxHp, next.maxHp),
  ].filter(Boolean);
  if (next.chains > now.chains) parts.push(`<span class="diff-up">⛓連鎖 ${now.chains}→${next.chains}</span>`);
  if (next.chains < now.chains) parts.push(`<span class="diff-down">⛓連鎖 ${now.chains}→${next.chains}</span>`);
  const score = (next.attack - now.attack) / Math.max(1, now.attack) + (next.defense - now.defense) / Math.max(1, now.defense + 5);
  return {
    html: `<div class="preview"><div class="pv-title">装備すると次の戦闘で</div>${parts.join('') || '<span class="dim">ほぼ変わらない</span>'}</div>`,
    score,
  };
}

export function renderLoot(g: Game) {
  const run = g.run!;
  const item = run.pendingLoot;
  if (!item) return g.syncScene();
  const slots = (item.kind === 'weapon' ? [0, 1] : [2, 3]) as SlotIndex[];
  const full = storageFull(g.profile);
  const isSwap = g.lootSwapped;

  const previews = slots.map((s) => equipPreview(g, s, item));
  const best = previews[0].score >= previews[1].score ? 0 : 1;
  const slotCards = slots
    .map((s, i) =>
      itemCard(g.profile.loadout[s], {
        slot: s,
        slotLabel: `${SLOT_LABEL[s]}${g.profile.loadout[s] ? 'と入れ替え' : '（空き）'}${previews[i].score > 0.05 && i === best ? '　★おすすめ' : ''}`,
        actions: `${previews[i].html}<button class="primary wide" data-equip="${s}">${SLOT_LABEL[s]}に装備</button>`,
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
        <div class="loot-compare">
          <h2>装備中の${item.kind === 'weapon' ? '武器' : '防具'}と比較</h2>
          <div class="two-col">${slotCards}</div>
          <div class="dim small">「火力」はスキル発動後の1ターンの与ダメ。装備したら、外した装備を倉庫へ送るか捨てるかを続けて選びます。カードをタップで詳細。</div>
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
