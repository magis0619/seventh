import { qualityPercent, rarityOf, RARITY_LABEL } from '../core/itemGen';
import type { Item } from '../core/types';
import { SKILLS } from '../data/skills';
import { esc, flowClass, SLOT_LABEL, skillFlow } from './components';
import { formatNum } from './format';

const KIND_HELP: Record<string, string> = {
  成長: '決まった量だけ伸ばす',
  タグ: '同じタグのスキルが多いほど伸びる',
  トリガー: '他のスキルを再発動・回数を増やす・被弾時に反応',
  変換: 'あるステータスの値を別のステータスに足す（連鎖の橋渡し）',
  自己参照: '自分の値の割合で自分を伸ばす（戦うほど加速）',
};

/** 装備の詳細シート（カードをタップすると開く） */
export function openItemDetail(item: Item) {
  close();
  const r = rarityOf(item);
  const base =
    item.kind === 'weapon'
      ? `攻撃 <b>${formatNum(item.atk)}</b>`
      : `防御 <b>${formatNum(item.def)}</b>　HP <b>${formatNum(item.hp)}</b>`;
  const skills = item.skills.length
    ? item.skills
        .map((id, i) => {
          const d = SKILLS[id];
          return `<div class="dskill">
            <div class="row"><span class="order">${i + 1}</span><span class="tag tag-${d.tag}">${d.tag}</span><b>${d.name}</b>
              <span class="flow ${flowClass(id)}">${esc(skillFlow(id))}</span></div>
            <div class="ddesc">${esc(d.desc)}</div>
            <div class="dmeta">${d.kind}：${KIND_HELP[d.kind]}　／　${d.timing}</div>
          </div>`;
        })
        .join('')
    : '<div class="dim">スキルなし。基本性能だけの装備です。</div>';

  const el = document.createElement('div');
  el.id = 'sheet';
  el.innerHTML = `<div class="sheet-backdrop"></div>
    <div class="sheet card ${r}" role="dialog" aria-label="${esc(item.name)}">
      <div class="row"><span class="name">${esc(item.name)}</span><span class="rarity">${RARITY_LABEL[r]}</span><span class="spacer"></span>
        <button class="sheet-close" aria-label="閉じる">✕</button></div>
      <div class="base">${base}${item.luck ? `　運 <b>+${item.luck}</b>` : ''}　<span class="q">性能 ${qualityPercent(item.quality)}%・${item.floor}F</span></div>
      <h3>スキル（上から順に発動）</h3>
      ${skills}
      <div class="sheet-help">
        ・戦闘開始時、${SLOT_LABEL.join(' → ')} の順に、各装備の上から発動。伸びた値はラン中ずっと残る<br>
        ・<b>⛓ 連鎖</b>：前のスキルが伸ばした値を、次のスキルが使って伸びること。並び順が大事<br>
        ・同じタグが3つで伸びる量×2、5つで×3
      </div>
    </div>`;
  document.body.appendChild(el);
  el.querySelector('.sheet-backdrop')!.addEventListener('click', close);
  el.querySelector('.sheet-close')!.addEventListener('click', close);
}

export function close() {
  document.getElementById('sheet')?.remove();
}
