import { mulberry32 } from './noise.js';
import { FRIEND, FOE } from './teams.js';
import { JAIL, PENALTY } from './war.js';

const PREFIXES = [
  '閃電', '疾風', '赤焰', '極光', '暴走', '無敵', '黃金', '酷炫', '旋風', '星辰',
  '飛天', '狂飆', '幸運', '神秘', '霹靂', '超能', '霸氣', '呆萌', '元氣', '機智',
  '冰霜', '烈日', '彩虹', '巨無霸', '神速', '小小', '鐵甲', '影子', '銀河', '快樂',
];

const NOUNS = [
  '阿貓', '小狗', '胖熊', '熊貓', '駿馬', '斑馬', '羚羊', '青蛙', '飛鷹', '小豹',
  '虎鯨', '海豚', '狐狸', '企鵝', '松鼠', '獅子', '兔子', '柴犬', '刺蝟', '水獺',
  '騎士', '車手', '飛俠', '達人', '大王', '高手', '先鋒', '隊長', '探險家', '好手',
];

// Deterministic Traditional Chinese name for every rider; rider 0 is always 拿錢博士.
export function riderNames(n) {
  const names = new Array(n);
  names[0] = '拿錢博士';
  const pool = [];
  for (const p of PREFIXES) {
    for (const noun of NOUNS) pool.push(`${p}${noun}`);
  }
  const rng = mulberry32(20261118);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  for (let i = 1; i < n; i++) {
    const base = pool[(i - 1) % pool.length];
    const round = Math.floor((i - 1) / pool.length);
    names[i] = round === 0 ? base : `${base}${round + 1}`;
  }
  return names;
}

export function computeStandings(war, names) {
  const red = [];
  const blue = [];
  for (let i = 0; i < war.n; i++) {
    const st = war.stage[i];
    const isPlayer = i === 0;
    const bonus = isPlayer ? Math.floor(war.coins / 10000) * 10 : 0;
    const statusBonus = st < JAIL ? (6 - st) * 20 : st === JAIL ? -40 : -80;
    const score = war.points[i] + bonus + statusBonus - war.pricks[i] * 10;
    const status = st === PENALTY ? '超大監牢' : st === JAIL ? '監牢' : `第 ${st + 1} 關`;
    const entry = {
      id: i,
      name: names[i] ?? `騎士 ${i}`,
      team: war.team[i],
      score,
      status,
      isPlayer,
    };
    if (war.team[i] === FRIEND) red.push(entry);
    else blue.push(entry);
  }
  const byScore = (a, b) => b.score - a.score || a.id - b.id;
  red.sort(byScore);
  blue.sort(byScore);
  const all = [...red, ...blue].sort(byScore);
  const overallFirst = all[0] ?? null;
  return { red, blue, overallFirst };
}

export function renderLeaderboard(el, war, names, onRestart) {
  const { red, blue, overallFirst } = computeStandings(war, names);
  const winLabel =
    war.winner === FRIEND ? '紅隊獲勝！' : war.winner === FOE ? '藍隊獲勝！' : '雙方平手！';
  const champText = overallFirst
    ? `🏆 全場第一名：${overallFirst.name}（${overallFirst.team === FRIEND ? '紅隊' : '藍隊'} · ${overallFirst.score} 分）`
    : '';

  const rowsHtml = (list) =>
    list
      .map((r, idx) => {
        const rank = idx + 1;
        const medal = rank === 1 ? '🥇 ' : rank === 2 ? '🥈 ' : rank === 3 ? '🥉 ' : `${rank}. `;
        return `<div class="lb-row${r.isPlayer ? ' me' : ''}">
          <span class="lb-rank">${medal}</span>
          <span class="lb-name">${r.name}</span>
          <span class="lb-status">${r.status}</span>
          <span class="lb-score">${r.score} 分</span>
        </div>`;
      })
      .join('');

  el.innerHTML = `
    <div class="lb-panel">
      <div class="lb-head">
        <div class="lb-title">${winLabel}兩隊名次榜</div>
        <div class="lb-champ">${champText}</div>
      </div>
      <div class="lb-cols">
        <div class="lb-col red">
          <div class="lb-col-title">🔴 紅隊名次（共 ${red.length} 人）</div>
          <div class="lb-list">${rowsHtml(red)}</div>
        </div>
        <div class="lb-col blue">
          <div class="lb-col-title">🔵 藍隊名次（共 ${blue.length} 人）</div>
          <div class="lb-list">${rowsHtml(blue)}</div>
        </div>
      </div>
      <div class="lb-foot">
        <button type="button" class="lb-restart" id="lb-restart">再玩一場（Enter）</button>
      </div>
    </div>
  `;
  el.hidden = false;
  el.querySelector('#lb-restart')?.addEventListener('click', onRestart);
}
