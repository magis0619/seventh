import { BALANCE } from '../../data/balance';
import { attack, combatant, escape } from '../../core/run';
import { currentEscapeChance, predictEnemyDamage, predictPlayerDamage, type BattleState, type TurnLog } from '../../core/battle';
import { computeEffective, STAT_LABEL } from '../../core/stats';
import { summarizePhase } from '../../core/skillEngine';
import type { BaseStats, StatKey } from '../../core/types';
import { SKILLS } from '../../data/skills';
import { esc, hpBar, skillEventText, statsPanel } from '../components';
import { formatNum, formatPercent, magnitude } from '../format';
import { wait, type Game } from '../game';
import { mountCorridor, playLayout, viewHtml } from './play';

interface Fx {
  damage?: number;
  crit?: boolean;
  levelUp?: boolean;
  taken?: number;
  counter?: number;
}
let pendingFx: Fx | null = null;

function enemyPanel(b: BattleState): string {
  const e = b.enemy;
  return `<div class="enemy-box">
    <div><b class="ename">${e.isBoss ? '<span class="bad">BOSS</span> ' : ''}${esc(e.name)}</b>
    <span class="dim estat">攻撃 ${formatNum(e.atk)} ／ 速さ ${e.spd}</span></div>
    ${hpBar(e.hp, e.maxHp, 'enemy')}
  </div>`;
}

function predictHtml(g: Game, b: BattleState): string {
  const c = combatant(g.profile, g.run!);
  const dmg = predictPlayerDamage(b, c);
  const taken = predictEnemyDamage(b, c);
  const turns = b.enemy.hp > 0 ? formatNum(Math.ceil(b.enemy.hp / Math.max(1, dmg))) : '—';
  const survive = Math.ceil(g.run!.hp / taken);
  const hpPerTurn = taken;
  const toDie = Math.ceil(g.run!.hp / Math.max(1, hpPerTurn));
  const toKill = b.enemy.hp > 0 ? Math.ceil(b.enemy.hp / Math.max(1, dmg)) : 0;
  // 勝てるか一目で分かる判定（記号＋文言。色だけに頼らない）
  const verdict =
    b.enemy.hp <= 0
      ? ''
      : toKill <= toDie - 1
        ? `<div class="verdict ok">◎ 勝てる見込み（${formatNum(toKill)}ターンで撃破）</div>`
        : toKill <= toDie
          ? `<div class="verdict warn">△ ギリギリ（撃破${formatNum(toKill)}ターン／倒れるまで${formatNum(toDie)}発）</div>`
          : `<div class="verdict bad">✕ 勝てない見込み — 逃げるのも手（倒れるまで${formatNum(toDie)}発）</div>`;
  return `${verdict}<div class="predict">
    <div><div class="label">与ダメ / ターン</div><div class="val">${formatNum(dmg)}</div><div class="label">撃破まで ${turns} ターン</div></div>
    <div><div class="label">被ダメ / 回</div><div class="val ${survive <= 2 ? 'bad' : ''}">${survive <= 2 ? '⚠ ' : ''}${formatNum(taken)}</div><div class="label">あと ${formatNum(survive)} 発で倒れる</div></div>
    <div><div class="label">逃走成功率</div><div class="val">${formatPercent(currentEscapeChance(b, c))}</div><div class="label">${b.enemy.isBoss ? 'ボス戦は固定' : '逃げると今回の成長は失う'}</div></div>
  </div>`;
}

function turnLines(log: TurnLog): string[] {
  const out: string[] = [];
  if (log.type === 'attack') {
    const a = log.attack;
    const parts = [`${a.hits}回攻撃`];
    if (a.crits) parts.push(`会心${a.crits}（×${a.critMul.toFixed(1)}）`);
    if (a.extraHits) parts.push(`連撃+${a.extraHits}`);
    out.push(`<span class="hl">T${log.turn} ${parts.join('、')} → ${formatNum(a.damage)} ダメージ</span>`);
  } else if (log.type === 'escape_ok') {
    out.push(`T${log.turn} 逃走成功！（${formatPercent(log.chance)}）`);
  } else {
    out.push(`T${log.turn} 逃走失敗…（${formatPercent(log.chance)}）`);
  }
  const hit = log.type === 'escape_ok' ? null : log.enemyHit;
  if (hit) {
    out.push(`<span class="bad">　敵の攻撃 → ${formatNum(hit.damage)} ダメージ</span>`);
    if (hit.gutsTriggered) out.push('<span class="accent">　根性！ HP1で踏みとどまった</span>');
    if (hit.counterDamage) out.push(`<span class="hl">　反撃 → ${formatNum(hit.counterDamage)} ダメージ</span>`);
  }
  return out;
}

function appendLog(g: Game, html: string, cls = '') {
  const line = `<div class="${cls}">${html}</div>`;
  g.battleLines.push(line);
  const el = g.root.querySelector('#log');
  if (el) {
    el.insertAdjacentHTML('beforeend', line);
    el.scrollTop = el.scrollHeight;
  }
}

function showFx(g: Game, fx: Fx) {
  const ov = g.root.querySelector('#overlay');
  if (!ov) return;
  const pop = (text: string, cls: string, size: number) => {
    const d = document.createElement('div');
    d.className = `dmgpop ${cls}`;
    d.style.fontSize = `${size}px`;
    d.textContent = text;
    ov.appendChild(d);
    setTimeout(() => d.remove(), 1000);
  };
  if (fx.damage !== undefined) {
    // 桁が増えるほど文字を大きく
    const w = (ov as HTMLElement).clientWidth || 800;
    const size = Math.min(110, w * 0.15, 22 + magnitude(fx.damage) * 6);
    pop(formatNum(fx.damage), `${fx.crit ? 'crit' : ''} ${fx.levelUp ? 'levelup' : ''}`, size);
    g.corridor?.hurtEnemy();
  }
  if (fx.taken !== undefined) {
    pop(`-${formatNum(fx.taken)}`, 'taken', 26);
    const v = g.root.querySelector('#view');
    v?.classList.remove('shake');
    void (v as HTMLElement | null)?.offsetWidth;
    v?.classList.add('shake');
  }
}

const FLASH_KEYS: Record<string, string[]> = {
  str: ['str', 'attack'],
  spd: ['spd'],
  mag: ['mag'],
  def: ['defense'],
  luck: ['luck'],
  battleMul: ['spd'],
};

/** スキル名（カード上の位置つき） */
function skillName(ref: { skillId: keyof typeof SKILLS }): string {
  return SKILLS[ref.skillId].name;
}

function ratioText(a: number, b: number): string {
  if (a <= 0) return '';
  const r = b / a;
  return r >= 1.05 ? `×${r >= 100 ? formatNum(r) : r.toFixed(1)}` : '';
}

/** 戦闘開始時のまとめ（演出後も通路の上に小さく残す） */
export function phaseBadge(g: Game, b: BattleState): string {
  const lo = g.profile.loadout;
  const a0 = computeEffective(b.phase.before, lo).attack;
  const a1 = computeEffective(b.phase.stats, lo).attack;
  const sum = summarizePhase(b.phase);
  const parts: string[] = [];
  if (a1 > a0) parts.push(`攻撃 ${formatNum(a0)}→<b>${formatNum(a1)}</b> ${ratioText(a0, a1)}`);
  if (sum.chains) parts.push(`⛓連鎖${sum.chains}`);
  if (sum.refires) parts.push(`↻再発動${sum.refires}`);
  if (b.battleMul > 1) parts.push(`回数×${formatNum(b.battleMul)}`);
  return parts.length ? `<div class="phase-badge">${parts.join('　')}</div>` : '';
}

async function animateSkillPhase(g: Game, b: BattleState) {
  g.busy = true;
  const loadout = g.profile.loadout;
  const display: BaseStats = { ...b.phase.before };
  let mul = 1;
  let skip = false;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const skipBtn = g.root.querySelector<HTMLButtonElement>('#skip');
  skipBtn?.addEventListener('click', () => (skip = true));
  g.hotkeys = { ' ': () => (skip = true), Enter: () => (skip = true) };
  g.busyHotkeys = true;
  const statsEl = g.root.querySelector('#stats');
  const msgEl = g.root.querySelector('#msg');
  const overlay = g.root.querySelector('#overlay');
  // 連鎖カウンターと、値の流れを見せる帯
  overlay?.insertAdjacentHTML(
    'beforeend',
    `<div class="chain-hud" hidden><span class="chain-label">⛓ CHAIN</span><span class="chain-n">0</span></div><div class="flow-pop" hidden></div>`,
  );
  const hud = overlay?.querySelector<HTMLElement>('.chain-hud');
  const hudN = overlay?.querySelector<HTMLElement>('.chain-n');
  const flowPop = overlay?.querySelector<HTMLElement>('.flow-pop');
  const drawStats = (flash: string[]) => {
    if (!statsEl) return;
    statsEl.innerHTML = statsPanel(computeEffective(display, loadout), mul);
    for (const k of flash) statsEl.querySelector(`[data-stat="${k}"]`)?.classList.add('flash');
  };
  const skillEl = (ref: { slot: number; index: number }) =>
    g.root.querySelector(`[data-card-slot="${ref.slot}"] .skill[data-idx="${ref.index}"]`);
  drawStats([]);
  appendLog(g, b.phase.events.length ? '— スキル発動 —' : '— スキルなし —', 'sys');
  const F = BALANCE.fx;
  let chains = 0;
  for (let i = 0; i < b.phase.events.length; i++) {
    const ev = b.phase.events[i];
    for (const c of ev.changes) {
      if (c.key === 'battleMul') mul = c.after;
      else display[c.key] = c.after;
    }
    if (ev.chain) chains++;
    // 連鎖上限は行数が膨らむので本ログでは省略（デバッグの全文ログには残る）
    if (ev.type === 'depth_limit') continue;
    if (skip) {
      appendLogSilently(g, skillEventText(ev), ev.depth, ev.chain);
      continue;
    }
    const fast = i >= F.fastForwardAfter;
    const lit = ev.ref ? skillEl(ev.ref) : null;
    lit?.classList.add('lit');
    // 連鎖: 供給元のスキルも同時に光らせ、「A → B / 魔力 → 力」を通路の上に出す
    const src = ev.chain && ev.chainFrom ? skillEl(ev.chainFrom) : null;
    src?.classList.add('src');
    const c = ev.changes[0];
    if (ev.chain && ev.chainFrom && ev.ref && c && c.key !== 'battleMul' && flowPop && hud && hudN) {
      hud.hidden = false;
      hudN.textContent = String(chains);
      hud.classList.remove('bump');
      void hud.offsetWidth;
      hud.classList.add('bump');
      flowPop.hidden = false;
      flowPop.className = 'flow-pop chain';
      flowPop.innerHTML = `<div class="fp-skills">${esc(skillName(ev.chainFrom))} <span class="arrow">⟶</span> ${esc(skillName(ev.ref))}</div>
        <div class="fp-stat">${STAT_LABEL[ev.source as StatKey] ?? ''} <span class="arrow">⟶</span> ${STAT_LABEL[c.key]} <b>+${formatNum(c.after - c.before)}</b></div>`;
    } else if (ev.depth > 0 && ev.type === 'effect' && ev.ref && flowPop) {
      flowPop.hidden = false;
      flowPop.className = 'flow-pop refire';
      flowPop.innerHTML = `<div class="fp-skills">↻ 再発動：${esc(skillName(ev.ref))}</div>`;
    } else if (flowPop) {
      flowPop.hidden = true;
    }
    appendLog(g, esc(skillEventText(ev)), `depth${Math.min(4, ev.depth)}${ev.chain ? ' chainline' : ''}`);
    if (msgEl) msgEl.textContent = skillEventText(ev);
    drawStats(ev.changes.flatMap((c) => FLASH_KEYS[c.key] ?? []));
    const base = fast ? F.skillStepFastMs : F.skillStepMs;
    // 連鎖は読めるよう少し長めに見せる
    await wait(reduced ? base : ev.chain && !fast ? base * 1.8 : base);
    lit?.classList.remove('lit');
    src?.classList.remove('src');
  }
  if (skip) {
    const el = g.root.querySelector('#log');
    if (el) {
      el.innerHTML = g.battleLines.join('');
      el.scrollTop = el.scrollHeight;
    }
  }
  flowPop && (flowPop.hidden = true);
  const limits = b.phase.events.filter((e) => e.type === 'depth_limit').length;
  if (limits) appendLog(g, `（連鎖上限で止まった再発動 ${limits}回）`, 'sys');
  if (b.phase.truncated) appendLog(g, '（発動回数の上限で打ち切り）', 'sys');

  // まとめ: この戦闘でどれだけ伸びたか / ラン開始からどれだけ伸びたか
  const lo = loadout;
  const a0 = computeEffective(b.phase.before, lo).attack;
  const a1 = computeEffective(b.phase.stats, lo).attack;
  const aStart = computeEffective(g.run!.startStats, lo).attack;
  const sum = summarizePhase(b.phase);
  if (a1 > a0 || sum.chains || sum.refires) {
    appendLog(
      g,
      `<b>攻撃 ${formatNum(a0)} → ${formatNum(a1)}</b> ${ratioText(a0, a1)}${sum.chains ? `　⛓連鎖 ${sum.chains}` : ''}${sum.refires ? `　↻再発動 ${sum.refires}` : ''}`,
      'summary',
    );
    if (overlay && b.phase.events.length) {
      overlay.insertAdjacentHTML(
        'beforeend',
        `<div class="phase-summary ${sum.chains >= 3 ? 'big' : ''}">
          <div class="ps-title">${sum.chains >= 3 ? 'シナジー発生！' : sum.chains ? 'シナジー' : '成長'}</div>
          <div class="ps-main">攻撃 ${formatNum(a0)} → <b>${formatNum(a1)}</b> <span class="ps-ratio">${ratioText(a0, a1)}</span></div>
          <div class="ps-sub">${sum.chains ? `⛓ 連鎖 ${sum.chains}　` : ''}${sum.refires ? `↻ 再発動 ${sum.refires}　` : ''}${
            aStart > 0 && a1 / aStart >= 1.5 ? `ラン開始から ${ratioText(aStart, a1)}` : ''
          }</div>
        </div>`,
      );
      await wait(reduced ? 600 : skip ? 900 : 1500);
    }
  }
  appendLog(g, `— 戦闘開始 — ${b.phase.activations}回発動`, 'sys');
  g.animatedBattle = b;
  g.busy = false;
  g.busyHotkeys = false;
  g.render();
}

function appendLogSilently(g: Game, text: string, depth: number, chain = false) {
  g.battleLines.push(`<div class="depth${Math.min(4, depth)}${chain ? ' chainline' : ''}">${esc(text)}</div>`);
}

export function renderBattle(g: Game) {
  const run = g.run!;
  const b = run.battle ?? g.finishedBattle;
  if (!b) return g.syncScene();
  const finished = b.outcome !== 'ongoing';
  const animating = !finished && g.animatedBattle !== b;
  const controls = finished
    ? `<div class="banner ${b.outcome === 'lose' ? 'bad' : 'good'}">${{ win: '勝利！', lose: '敗北…', escaped: '逃走成功', ongoing: '' }[b.outcome]}</div>`
    : animating
      ? `<button class="big" id="skip">スキップ<span class="kbd">[Space]</span></button>`
      : `<button class="big primary" id="atk">攻撃<span class="kbd">[Space]</span></button>
         <button class="big" id="run">逃げる<span class="kbd">[Esc]</span></button>`;
  g.root.innerHTML = playLayout(g, {
    view: viewHtml(g, enemyPanel(b) + (animating ? '' : phaseBadge(g, b))),
    predict: predictHtml(g, b),
    controls,
    log: `<div class="log" id="log">${g.battleLines.join('')}</div>`,
    battleMul: animating ? 1 : b.battleMul,
  });
  const corridor = mountCorridor(g);
  corridor.setEnemy(b.enemy);
  const logEl = g.root.querySelector('#log')!;
  logEl.scrollTop = logEl.scrollHeight;

  if (animating) {
    if (!g.busy) void animateSkillPhase(g, b);
    return;
  }
  if (pendingFx) {
    showFx(g, pendingFx);
    pendingFx = null;
  }

  const act = (kind: 'attack' | 'escape') => {
    if (g.busy || run.status !== 'battle' || finished) return;
    const prevBest = Math.max(run.maxDamage, b.maxDamage);
    const log = kind === 'attack' ? attack(g.profile, run) : escape(g.profile, run);
    turnLines(log).forEach((l) => g.battleLines.push(`<div>${l}</div>`));
    const fx: Fx = {};
    if (log.type === 'attack') {
      fx.damage = log.attack.damage;
      fx.crit = log.attack.crits > 0;
      fx.levelUp = log.attack.damage >= 1e4 && magnitude(log.attack.damage) > magnitude(prevBest);
    }
    const hit = log.type === 'escape_ok' ? null : log.enemyHit;
    if (hit) fx.taken = hit.damage;
    if (b.outcome === 'ongoing') {
      pendingFx = fx;
      g.render();
      return;
    }
    // 決着
    if (b.outcome === 'win') g.battleLines.push('<div class="good"><b>勝利！</b></div>');
    if (b.outcome === 'lose') g.battleLines.push('<div class="bad"><b>敗北…</b></div>');
    // 戦闘画面のまま決着を見せてから遷移
    g.finishedBattle = b;
    pendingFx = fx;
    g.render();
    g.busy = true;
    void wait(b.outcome === 'escaped' ? 400 : 900).then(() => {
      g.busy = false;
      g.finishedBattle = null;
      g.syncScene();
    });
  };
  g.root.querySelector('#atk')?.addEventListener('click', () => act('attack'));
  g.root.querySelector('#run')?.addEventListener('click', () => act('escape'));
  g.hotkeys = { ' ': () => act('attack'), Enter: () => act('attack'), Escape: () => act('escape') };
}
