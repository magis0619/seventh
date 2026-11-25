import { createRng, hashSeed } from '../core/rng';
import { makeItem } from '../core/itemGen';
import { debugHeal, debugWarp } from '../core/run';
import { clearSave, storageFull } from '../core/save';
import { STAT_LABEL } from '../core/stats';
import type { StatKey } from '../core/types';
import { BALANCE } from '../data/balance';
import { ARMOR_TYPES, WEAPON_TYPES } from '../data/names';
import { ALL_SKILL_IDS, SKILLS, type SkillId } from '../data/skills';
import { skillEventText } from './components';
import { formatNum } from './format';
import type { Game } from './game';

let collapsed = false;

function skillSelect(i: number): string {
  return `<select data-dbg-skill="${i}"><option value="">—</option>${ALL_SKILL_IDS.map(
    (id) => `<option value="${id}">${id} ${SKILLS[id].name}（${SKILLS[id].tag}）</option>`,
  ).join('')}</select>`;
}

function lastBattleText(g: Game): { log: string; table: string } {
  const b = g.run?.battle ?? g.run?.lastBattle ?? g.lastBattleCache;
  if (!b) return { log: '（まだ戦闘していません）', table: '' };
  g.lastBattleCache = b;
  const lines = [
    `敵: ${b.enemy.name} ${b.enemy.floor}F${b.enemy.isBoss ? ' BOSS' : ''} HP${formatNum(b.enemy.maxHp)} 攻撃${formatNum(b.enemy.atk)}`,
    `発動 ${b.phase.activations} 回 / 戦闘中倍率 ×${b.battleMul}${b.phase.truncated ? ' / 上限打ち切り' : ''}`,
    ...b.phase.events.map((e) => `${String(e.seq).padStart(3, ' ')} [d${e.depth}] ${e.ref ? `${e.ref.skillId}@slot${e.ref.slot}#${e.ref.index}` : '-'} ${skillEventText(e)}`),
    '--- ターン ---',
    ...b.log.map((l) => {
      if (l.type === 'attack')
        return `T${l.turn} hits=${l.attack.hits} crit=${l.attack.crits} extra=${l.attack.extraHits} dmg=${l.attack.damage}${l.enemyHit ? ` / taken=${l.enemyHit.damage}${l.enemyHit.counterDamage ? ` counter=${l.enemyHit.counterDamage}` : ''}${l.enemyHit.gutsTriggered ? ' GUTS' : ''}` : ''}`;
      if (l.type === 'escape_ok') return `T${l.turn} escape OK (${l.chance})`;
      return `T${l.turn} escape NG (${l.chance}) taken=${l.enemyHit.damage}`;
    }),
    `結果: ${b.outcome}`,
  ];
  const keys: StatKey[] = ['str', 'spd', 'mag', 'def', 'luck'];
  const table = `<table><tr><th style="text-align:left">ステ</th><th>前</th><th>後</th><th>増加</th></tr>${keys
    .map(
      (k) =>
        `<tr><td style="text-align:left">${STAT_LABEL[k]}</td><td>${formatNum(b.phase.before[k])}</td><td>${formatNum(
          b.phase.stats[k],
        )}</td><td>${formatNum(b.phase.stats[k] - b.phase.before[k])}</td></tr>`,
    )
    .join('')}</table>`;
  return { log: lines.join('\n'), table };
}

export function renderDebug(g: Game) {
  const el = g.debugRoot;
  const run = g.run;
  const { log, table } = lastBattleText(g);
  el.className = collapsed ? 'collapsed' : '';
  el.innerHTML = `
    <div class="row dbg-head"><b style="color:#ff0">DEBUG</b><span class="spacer"></span><button data-dbg="toggle">${collapsed ? '開く' : '閉じる'}</button></div>
    <h3>シード</h3>
    <div class="row">次のラン: <input data-dbg-seed size="12" value="${g.fixedSeed ?? ''}" placeholder="ランダム"><button data-dbg="seed">設定</button></div>
    <div class="dim">現在のラン: ${run ? run.seed : '—'}　（URL に &seed=123 でも指定可）</div>
    <h3>ラン操作</h3>
    <div class="row">ワープ <input data-dbg-floor type="number" min="1" max="100" value="${run ? Math.min(100, run.floor + 1) : 20}" style="width:60px">F
      <button data-dbg="warp" ${run?.status === 'explore' || run?.status === 'battle' ? '' : 'disabled'}>次の進むでこの階へ</button></div>
    <div class="row"><button data-dbg="heal" ${run && run.status !== 'ended' ? '' : 'disabled'}>HP全快</button>
      <button data-dbg="wipe" class="danger">セーブ消去</button></div>
    <h3>装備生成</h3>
    <div class="row"><select data-dbg-kind><option value="weapon">武器</option><option value="armor">防具</option></select>
      階 <input data-dbg-ifloor type="number" value="${run ? Math.max(1, run.floor) : 20}" style="width:50px">
      品質 <input data-dbg-q type="number" step="0.1" min="0.6" max="1.4" value="1.4" style="width:50px">
      運 <input data-dbg-luck type="number" value="0" style="width:44px"></div>
    <div class="row">${skillSelect(0)}${skillSelect(1)}${skillSelect(2)}</div>
    <div class="row"><button data-dbg="gen-storage">倉庫へ</button>
      <button data-dbg="gen-loot" ${run && (run.status === 'explore' || run.status === 'loot') ? '' : 'disabled'}>拾い物にする（ラン中）</button></div>
    <h3>最後の戦闘: ステータス前後</h3>
    ${table}
    <h3>最後の戦闘: スキル発動ログ全文</h3>
    <pre>${log.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!)}</pre>
  `;

  const q = <T extends Element>(s: string) => el.querySelector<T>(s)!;
  const val = (s: string) => q<HTMLInputElement>(s).value;
  el.querySelectorAll<HTMLButtonElement>('[data-dbg]').forEach((b) =>
    b.addEventListener('click', () => {
      const action = b.dataset.dbg;
      switch (action) {
        case 'toggle':
          collapsed = !collapsed;
          return renderDebug(g);
        case 'seed': {
          const v = val('[data-dbg-seed]').trim();
          g.fixedSeed = v === '' ? null : /^\d+$/.test(v) ? Number(v) : hashSeed(v);
          return renderDebug(g);
        }
        case 'warp':
          if (!run || g.busy) return;
          debugWarp(g.profile, run, Number(val('[data-dbg-floor]')));
          g.animatedBattle = null;
          g.finishedBattle = null;
          return g.syncScene();
        case 'heal':
          if (!run) return;
          debugHeal(g.profile, run);
          return g.render();
        case 'wipe':
          if (!confirm('セーブデータを消去しますか？')) return;
          clearSave(g.store);
          location.reload();
          return;
        case 'gen-storage':
        case 'gen-loot': {
          const kind = val('[data-dbg-kind]') as 'weapon' | 'armor';
          const skills = [0, 1, 2]
            .map((i) => val(`[data-dbg-skill="${i}"]`) as SkillId | '')
            .filter((s): s is SkillId => s !== '');
          const uniq = [...new Set(skills)];
          const types = kind === 'weapon' ? WEAPON_TYPES : ARMOR_TYPES;
          const quality = Math.min(BALANCE.item.qualityMax, Math.max(BALANCE.item.qualityMin, Number(val('[data-dbg-q]')) || 1));
          const item = makeItem(createRng(Date.now() >>> 0), {
            kind,
            floor: Math.max(1, Number(val('[data-dbg-ifloor]')) || 1),
            quality,
            type: types[Math.floor(Math.random() * types.length)],
            luck: Number(val('[data-dbg-luck]')) || 0,
            skills: uniq,
          });
          if (action === 'gen-storage') {
            if (storageFull(g.profile)) return alert('倉庫がいっぱいです');
            g.profile.storage.push(item);
            g.save();
            return g.render();
          }
          if (!run) return;
          if (run.status === 'explore' || run.status === 'loot') {
            // 既存の拾い物は捨てて差し替え
            run.pendingLoot = item;
            run.status = 'loot';
            g.lootSwapped = false;
            return g.syncScene();
          }
          return;
        }
      }
    }),
  );
}
