import { qualityPercent, rarityOf, RARITY_LABEL } from '../core/itemGen';
import { countTags, SKILL_SOURCE, tagMultiplier, type SkillEvent } from '../core/skillEngine';
import { STAT_LABEL } from '../core/stats';
import type { EffectiveStats, Item, Loadout, SlotIndex } from '../core/types';
import { BALANCE } from '../data/balance';
import { SKILLS, TAGS, type SkillId } from '../data/skills';
import { formatNum } from './format';

export const SLOT_LABEL = ['武器1', '武器2', '防具1', '防具2'] as const;

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export interface CardOptions {
  slot?: SlotIndex;
  slotLabel?: string;
  compact?: boolean;
  /** 比較対象（差分表示） */
  compare?: Item | null;
  actions?: string;
  extraClass?: string;
}

function diff(a: number, b: number | undefined): string {
  if (b === undefined) return '';
  const d = a - b;
  if (d === 0) return '';
  return d > 0 ? `<span class="diff-up">▲${formatNum(d)}</span>` : `<span class="diff-down">▼${formatNum(-d)}</span>`;
}

/** スキルが伸ばすもの（流れチップの右側） */
const SKILL_TARGET: Record<SkillId, string> = {
  S01: '力', S02: '力', S03: '直前を2回', S04: '力', S05: '力', S06: '力×2',
  S07: '魔力', S08: '魔力', S09: '直後をもう1回', S10: '力', S11: '魔力', S12: '魔力',
  S13: '速さ', S14: '速さ', S15: '攻撃回数×2', S16: '力', S17: '追加攻撃', S18: '速さ',
  S19: '防御', S20: '防御', S21: '反撃', S22: '力', S23: '防御', S24: 'HP1で耐える',
};
const SOURCE_LABEL: Record<string, string> = {
  str: '力', spd: '速さ', mag: '魔力', def: '防御', luck: '運', maxHp: '最大HP', tag: '同タグ数',
};

/**
 * スキルの「何から何を伸ばすか」を一目で分かる短い表記にする。
 * 例: 魔力転換 → 「魔力 → 力」、筋トレ → 「＋力」、深淵 → 「魔力 ↺ 増殖」
 */
export function skillFlow(id: SkillId): string {
  const src = SKILL_SOURCE[id];
  const to = SKILL_TARGET[id];
  const kind = SKILLS[id].kind;
  if (kind === 'トリガー') {
    if (id === 'S17') return '会心 → 追加攻撃';
    if (id === 'S21') return '被弾 → 反撃';
    if (id === 'S24') return '致命傷 → HP1';
    return `↻ ${to}`;
  }
  if (id === 'S06') return '運% で 力×2';
  if (src === 'none') return `＋${to}`;
  if (SOURCE_LABEL[src] === to) return `${to} ↺ 増殖`;
  return `${SOURCE_LABEL[src]} → ${to}`;
}

/** 流れチップの見た目の種類（色と記号の両方で区別する） */
export function flowClass(id: SkillId): string {
  const kind = SKILLS[id].kind;
  if (kind === 'トリガー') return 'flow-trigger';
  if (kind === '変換') return 'flow-convert';
  if (kind === '自己参照') return 'flow-self';
  return 'flow-add';
}

export function skillRow(id: SkillId, slot: SlotIndex | undefined, idx: number, withDesc: boolean): string {
  const d = SKILLS[id];
  return `<div class="skill" data-slot="${slot ?? ''}" data-idx="${idx}">
    <span class="tag tag-${d.tag}">${d.tag}</span>
    <b class="sname">${d.name}</b>
    <span class="flow ${flowClass(id)}">${esc(skillFlow(id))}</span>
    ${withDesc ? `<span class="desc">${esc(d.desc)}</span>` : ''}
  </div>`;
}

export function itemCard(item: Item | null, o: CardOptions = {}): string {
  const label = o.slotLabel ?? (o.slot !== undefined ? SLOT_LABEL[o.slot] : '');
  if (!item) {
    return `<div class="card empty ${o.extraClass ?? ''}"><div class="slot">${label}</div><div>（空き）</div>${
      o.actions ? `<div class="actions">${o.actions}</div>` : ''
    }</div>`;
  }
  const r = rarityOf(item);
  const c = o.compare ?? undefined;
  const base =
    item.kind === 'weapon'
      ? `<span>攻撃 <b>${formatNum(item.atk)}</b>${diff(item.atk, c?.atk ?? (o.compare === null ? 0 : undefined))}</span>`
      : `<span>防御 <b>${formatNum(item.def)}</b>${diff(item.def, c?.def ?? (o.compare === null ? 0 : undefined))}</span><span>HP <b>${formatNum(item.hp)}</b>${diff(item.hp, c?.hp ?? (o.compare === null ? 0 : undefined))}</span>`;
  const luck = item.luck ? `<span>運 <b>+${item.luck}</b></span>` : '';
  const skills = item.skills.length
    ? item.skills.map((id, idx) => skillRow(id, o.slot, idx, !o.compact)).join('')
    : '<div class="noskill">スキルなし</div>';
  return `<div class="card ${r} ${o.compact ? 'compact' : ''} ${o.extraClass ?? ''}" data-item="${item.id}" ${o.slot !== undefined ? `data-card-slot="${o.slot}"` : ''}>
    <div class="slot">${label}</div>
    <div class="card-head"><span class="name">${esc(item.name)}</span><span class="rarity">${RARITY_LABEL[r]}</span><span class="info" aria-hidden="true">ⓘ</span></div>
    <div class="base">${base}${luck}<span class="q">性能 ${qualityPercent(item.quality)}%</span><span class="q">${item.floor}F</span></div>
    ${skills}
    ${o.actions ? `<div class="actions">${o.actions}</div>` : ''}
  </div>`;
}

export function loadoutCards(loadout: Loadout, compact = false, actions?: (slot: SlotIndex) => string): string {
  return ([0, 1, 2, 3] as SlotIndex[])
    .map((s) => itemCard(loadout[s], { slot: s, compact, actions: actions?.(s) }))
    .join('');
}

export function statsPanel(e: EffectiveStats, battleMul?: number): string {
  const rows: Array<[string, string, string]> = [
    ['attack', '攻撃', formatNum(e.attack)],
    ['str', '└ 力', formatNum(e.str)],
    ['spd', '速さ', formatNum(e.spd) + (battleMul && battleMul > 1 ? ` <span class="accent">×${formatNum(battleMul)}</span>` : '')],
    ['mag', '魔力', formatNum(e.mag)],
    ['defense', '防御', formatNum(e.defense)],
    ['luck', '運', formatNum(e.luck)],
    ['maxHp', '最大HP', formatNum(e.maxHp)],
  ];
  return `<div class="stats">${rows.map(([k, l, v]) => `<div class="k">${l}</div><div class="v" data-stat="${k}">${v}</div>`).join('')}</div>`;
}

export function tagSummary(loadout: Loadout): string {
  const c = countTags(loadout);
  return `<div class="tags">${TAGS.map((t) => {
    const m = tagMultiplier(c[t]);
    // 次のボーナスまでの残りを見せる（例: 2/3）
    const next = [...BALANCE.tagBonus.tiers].reverse().find(([need]) => c[t] < need);
    const progress = next ? `${c[t]}/${next[0]}` : `${c[t]}`;
    return `<span class="${m > 1 ? 'on' : ''}" title="同じタグが3つで×2、5つで×3"><span class="tag tag-${t}">${t}</span> ${progress}${m > 1 ? ` <b class="accent">×${m}</b>` : ''}</span>`;
  }).join('')}</div>`;
}

export function hpBar(hp: number, max: number, cls = ''): string {
  const pct = max > 0 ? Math.max(0, Math.min(100, (hp / max) * 100)) : 0;
  return `<div class="hpbar ${cls}"><div style="width:${pct}%"></div></div><div class="hptext">${formatNum(hp)} / ${formatNum(max)}</div>`;
}

/** スキル発動イベントをログ1行に */
export function skillEventText(ev: SkillEvent): string {
  const name = ev.ref ? SKILLS[ev.ref.skillId].name : '';
  const prefix = (ev.depth > 0 ? '↻ ' : '') + (ev.chain ? '⛓ ' : '');
  switch (ev.type) {
    case 'effect':
    case 'nochange': {
      const c = ev.changes[0];
      if (!c) return `${prefix}${name}`;
      if (c.key === 'battleMul') return `${prefix}${name}：攻撃回数 ×${formatNum(c.after)}`;
      const d = c.after - c.before;
      const bonus = c.tagMul > 1 ? `（タグ×${c.tagMul}）` : '';
      return `${prefix}${name}：${STAT_LABEL[c.key]} +${formatNum(d)}${bonus} → ${formatNum(c.after)}`;
    }
    case 'gamble_fail':
      return `${prefix}${name}：失敗…`;
    case 'fizzle':
      return `${prefix}${name}：不発`;
    case 'trigger':
      return `${prefix}${name}：発動！`;
    case 'passive':
      return `${prefix}${name}：待機（${ev.ref ? SKILLS[ev.ref.skillId].timing : ''}に発動）`;
    case 'depth_limit':
      return `${prefix}${name}：連鎖上限（深さ4）`;
    case 'cap':
      return '発動回数上限（200回）に達した';
  }
}
