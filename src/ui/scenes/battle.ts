import { BALANCE } from '../../data/balance';
import { attack, combatant, escape } from '../../core/run';
import { currentEscapeChance, predictEnemyDamage, predictPlayerDamage, type BattleState, type TurnLog } from '../../core/battle';
import { computeEffective } from '../../core/stats';
import type { BaseStats } from '../../core/types';
import { esc, hpBar, skillEventText, statsPanel } from '../components';
import { formatNum, formatPercent, magnitude } from '../format';
import { wait, type Game } from '../game';
import { mountCorridor, sidePanel, viewHtml } from './play';

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
  return `<div style="position:absolute;left:50%;top:10px;transform:translateX(-50%);width:46%;text-align:center;text-shadow:0 1px 2px #000">
    <div><b style="font-size:16px">${e.isBoss ? '<span class="bad">BOSS</span> ' : ''}${esc(e.name)}</b>
    <span class="dim" style="font-size:12px">攻撃 ${formatNum(e.atk)} ／ 速さ ${e.spd}</span></div>
    ${hpBar(e.hp, e.maxHp, 'enemy')}
  </div>`;
}

function predictHtml(g: Game, b: BattleState): string {
  const c = combatant(g.profile, g.run!);
  const dmg = predictPlayerDamage(b, c);
  const taken = predictEnemyDamage(b, c);
  const turns = Math.ceil(b.enemy.hp / Math.max(1, dmg));
  const survive = Math.ceil(g.run!.hp / taken);
  return `<div class="predict">
    <div><div class="label">与ダメ予測 / ターン</div><div class="val">${formatNum(dmg)}</div><div class="label">撃破まで ${formatNum(turns)} ターン</div></div>
    <div><div class="label">被ダメ予測 / 回</div><div class="val ${survive <= 2 ? 'bad' : ''}">${formatNum(taken)}</div><div class="label">あと ${formatNum(survive)} 発で倒れる</div></div>
    <div><div class="label">逃走成功率</div><div class="val">${formatPercent(currentEscapeChance(b, c))}</div><div class="label">${b.enemy.isBoss ? 'ボス戦は固定' : '速さの差で変化'}</div></div>
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
    const size = Math.min(110, 22 + magnitude(fx.damage) * 6);
    pop(formatNum(fx.damage), `${fx.crit ? 'crit' : ''} ${fx.levelUp ? 'levelup' : ''}`, size);
    g.corridor?.hurtEnemy();
  }
  if (fx.taken !== undefined) {
    pop(`-${formatNum(fx.taken)}`, 'taken', 28);
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

async function animateSkillPhase(g: Game, b: BattleState) {
  g.busy = true;
  const loadout = g.profile.loadout;
  const display: BaseStats = { ...b.phase.before };
  let mul = 1;
  let skip = false;
  const skipBtn = g.root.querySelector<HTMLButtonElement>('#skip');
  skipBtn?.addEventListener('click', () => (skip = true));
  g.hotkeys = { ' ': () => (skip = true), Enter: () => (skip = true) };
  const statsEl = g.root.querySelector('#stats');
  const drawStats = (flash: string[]) => {
    if (!statsEl) return;
    statsEl.innerHTML = statsPanel(computeEffective(display, loadout), mul);
    for (const k of flash) statsEl.querySelector(`[data-stat="${k}"]`)?.classList.add('flash');
  };
  drawStats([]);
  appendLog(g, b.phase.events.length ? '— スキルフェーズ —' : '— スキルなし —', 'sys');
  const F = BALANCE.fx;
  for (let i = 0; i < b.phase.events.length; i++) {
    const ev = b.phase.events[i];
    for (const c of ev.changes) {
      if (c.key === 'battleMul') mul = c.after;
      else display[c.key] = c.after;
    }
    // 早送り中は DOM 更新を間引く
    const fast = skip || i >= F.fastForwardAfter;
    if (skip) {
      appendLogSilently(g, skillEventText(ev), ev.depth);
      continue;
    }
    let lit: Element | null = null;
    if (ev.ref) {
      lit = g.root.querySelector(`[data-card-slot="${ev.ref.slot}"] .skill[data-idx="${ev.ref.index}"]`);
      lit?.classList.add('lit');
    }
    appendLog(g, esc(skillEventText(ev)), `depth${Math.min(4, ev.depth)}`);
    drawStats(ev.changes.flatMap((c) => FLASH_KEYS[c.key] ?? []));
    await wait(fast ? F.skillStepFastMs : F.skillStepMs);
    lit?.classList.remove('lit');
  }
  if (skip) {
    const el = g.root.querySelector('#log');
    if (el) {
      el.innerHTML = g.battleLines.join('');
      el.scrollTop = el.scrollHeight;
    }
  }
  if (b.phase.truncated) appendLog(g, '（発動回数の上限で打ち切り）', 'sys');
  appendLog(g, `— 戦闘開始 — ${b.phase.activations}回発動`, 'sys');
  g.animatedBattle = b;
  g.busy = false;
  g.render();
}

function appendLogSilently(g: Game, text: string, depth: number) {
  g.battleLines.push(`<div class="depth${Math.min(4, depth)}">${esc(text)}</div>`);
}

export function renderBattle(g: Game) {
  const run = g.run!;
  const b = run.battle ?? g.finishedBattle;
  if (!b) return g.syncScene();
  const finished = b.outcome !== 'ongoing';
  const animating = !finished && g.animatedBattle !== b;
  g.root.innerHTML = `
    <div class="cols play">
      <div>
        ${viewHtml(g).replace('<div class="msg" id="msg"></div>', `${enemyPanel(b)}<div class="msg" id="msg"></div>`)}
        ${predictHtml(g, b)}
        <div class="controls">
          ${
            finished
              ? `<div class="banner ${b.outcome === 'lose' ? 'bad' : 'good'}">${{ win: '勝利！', lose: '敗北…', escaped: '逃走成功', ongoing: '' }[b.outcome]}</div>`
              : animating
              ? `<button class="big" id="skip">スキップ<span class="kbd">[Space]</span></button>`
              : `<button class="big primary" id="atk">攻撃<span class="kbd">[Space]</span></button>
                 <button class="big" id="run">逃げる<span class="kbd">[Esc]</span></button>`
          }
        </div>
        <div class="log" id="log">${g.battleLines.join('')}</div>
      </div>
      ${sidePanel(g, animating ? 1 : b.battleMul)}
    </div>`;
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
