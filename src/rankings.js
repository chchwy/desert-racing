import { mulberry32 } from './noise.js';
import { FRIEND, FOE } from './teams.js';
import { JAIL, PENALTY } from './war.js';
import { t, getLang } from './i18n.js';

const NAME_SETS = {
  'zh-Hant': {
    prefixes: ['閃電', '疾風', '赤焰', '極光', '暴走', '無敵', '黃金', '酷炫', '旋風', '星辰', '飛天', '狂飆', '幸運', '神秘', '霹靂', '超能', '霸氣', '呆萌', '元氣', '機智', '冰霜', '烈日', '彩虹', '巨無霸', '神速', '小小', '鐵甲', '影子', '銀河', '快樂'],
    nouns: ['阿貓', '小狗', '胖熊', '熊貓', '駿馬', '斑馬', '羚羊', '青蛙', '飛鷹', '小豹', '虎鯨', '海豚', '狐狸', '企鵝', '松鼠', '獅子', '兔子', '柴犬', '刺蝟', '水獺', '騎士', '車手', '飛俠', '達人', '大王', '高手', '先鋒', '隊長', '探險家', '好手'],
  },
  ko: {
    prefixes: ['번개', '질풍', '불꽃', '오로라', '폭주', '무적', '황금', '멋진', '회오리', '별빛', '하늘', '광속', '행운', '신비', '천둥', '초능력', '패기', '귀여운', '활기찬', '영리한', '얼음', '태양', '무지개', '자이언트', '신속', '꼬마', '강철', '그림자', '은하', '행복한'],
    nouns: ['고양이', '강아지', '곰돌이', '판다', '야생마', '얼룩말', '영양', '개구리', '독수리', '표범', '범고래', '돌고래', '여우', '펭귄', '다람쥐', '사자', '토끼', '시바견', '고슴도치', '수달', '기사', '레이서', '히어로', '달인', '대왕', '고수', '선봉', '대장', '탐험가', '에이스'],
  },
  ja: {
    prefixes: ['稲妻', '疾風', '紅蓮', 'オーロラ', '爆走', '無敵', '黄金', 'クール', '旋風', '星屑', '飛天', '激走', '幸運', '神秘', '雷鳴', '超能', '覇気', 'キュート', '元気', '知略', '氷霜', '烈日', '虹色', 'ビッグ', '神速', 'ちび', '鉄甲', 'シャドウ', '銀河', 'ハッピー'],
    nouns: ['ネコ', 'イヌ', 'クマ', 'パンダ', 'ウマ', 'シマウマ', 'カモシカ', 'カエル', 'ワシ', 'ヒョウ', 'シャチ', 'イルカ', 'キツネ', 'ペンギン', 'リス', 'ライオン', 'ウサギ', 'シバ', 'ハリネズミ', 'カワウソ', '騎士', 'レーサー', 'ヒーロー', '達人', '大王', '名人', '先鋒', '隊長', '冒険家', 'エース'],
  },
  en: {
    prefixes: ['Lightning', 'Gale', 'Blaze', 'Aurora', 'Turbo', 'Invincible', 'Golden', 'Cool', 'Cyclone', 'Star', 'Sky', 'Hyper', 'Lucky', 'Mystic', 'Thunder', 'Super', 'Fierce', 'Cute', 'Peppy', 'Clever', 'Frost', 'Solar', 'Rainbow', 'Giant', 'Swift', 'Tiny', 'Iron', 'Shadow', 'Galaxy', 'Happy'],
    nouns: ['Cat', 'Dog', 'Bear', 'Panda', 'Horse', 'Zebra', 'Antelope', 'Frog', 'Eagle', 'Leopard', 'Orca', 'Dolphin', 'Fox', 'Penguin', 'Squirrel', 'Lion', 'Rabbit', 'Shiba', 'Hedgehog', 'Otter', 'Knight', 'Racer', 'Hero', 'Master', 'King', 'Pro', 'Vanguard', 'Captain', 'Explorer', 'Ace'],
  },
  es: {
    prefixes: ['Rayo', 'Vendaval', 'Llama', 'Aurora', 'Turbo', 'Invencible', 'Dorado', 'Genial', 'Ciclón', 'Estrella', 'Aéreo', 'Veloz', 'Afortunado', 'Místico', 'Trueno', 'Súper', 'Feroz', 'Tierno', 'Activo', 'Astuto', 'Escarcha', 'Solar', 'Arcoíris', 'Gigante', 'Rápido', 'Pequeño', 'Hierro', 'Sombra', 'Galaxia', 'Feliz'],
    nouns: ['Gato', 'Perro', 'Oso', 'Panda', 'Caballo', 'Cebra', 'Antílope', 'Rana', 'Águila', 'Leopardo', 'Orca', 'Delfín', 'Zorro', 'Pingüino', 'Ardilla', 'León', 'Conejo', 'Shiba', 'Erizo', 'Nutria', 'Jinete', 'Piloto', 'Héroe', 'Maestro', 'Rey', 'Experto', 'Pionero', 'Capitán', 'Explorador', 'As'],
  },
  fr: {
    prefixes: ['Éclair', 'Rafale', 'Flamme', 'Aurore', 'Turbo', 'Invincible', 'Doré', 'Cool', 'Cyclone', 'Étoile', 'Céleste', 'Hyper', 'Chanceux', 'Mystique', 'Tonnerre', 'Super', 'Féroce', 'Mignon', 'Vif', 'Malin', 'Givre', 'Solaire', 'Arc-en-ciel', 'Géant', 'Rapide', 'Petit', 'Acier', 'Ombre', 'Galaxie', 'Joyeux'],
    nouns: ['Chat', 'Chien', 'Ours', 'Panda', 'Cheval', 'Zèbre', 'Antilope', 'Grenouille', 'Aigle', 'Léopard', 'Orque', 'Dauphin', 'Renard', 'Pingouin', 'Écureuil', 'Lion', 'Lapin', 'Shiba', 'Hérisson', 'Loutre', 'Chevalier', 'Pilote', 'Héros', 'Maître', 'Roi', 'Pro', 'Avant-garde', 'Capitaine', 'Explorateur', 'As'],
  },
};

function buildNames(n, lang) {
  const set = NAME_SETS[lang] ?? NAME_SETS['zh-Hant'];
  const names = new Array(n);
  names[0] = t('drMoney');
  const pool = [];
  const sep = lang === 'en' || lang === 'es' || lang === 'fr' || lang === 'ko' ? ' ' : '';
  for (const p of set.prefixes) {
    for (const noun of set.nouns) pool.push(`${p}${sep}${noun}`);
  }
  const rng = mulberry32(20261118);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  for (let i = 1; i < n; i++) {
    const base = pool[(i - 1) % pool.length];
    const round = Math.floor((i - 1) / pool.length);
    names[i] = round === 0 ? base : `${base} ${round + 1}`;
  }
  return names;
}

// Deterministic Traditional Chinese name for every rider; rider 0 is always 拿錢博士.
export function riderNames(n) {
  return buildNames(n, getLang());
}

export function computeStandings(war, names) {
  const langNames = buildNames(war.n, getLang());
  const red = [];
  const blue = [];
  for (let i = 0; i < war.n; i++) {
    const st = war.stage[i];
    const isPlayer = i === 0;
    const bonus = isPlayer ? Math.floor(war.coins / 10000) * 10 : 0;
    const statusBonus = st < JAIL ? (6 - st) * 20 : st === JAIL ? -40 : -80;
    const score = war.points[i] + bonus + statusBonus - war.pricks[i] * 10;
    const status = st === PENALTY ? t('penaltyStatus') : st === JAIL ? t('jailStatus') : `${t('stagePrefix')}${st + 1}${t('stageSuffix')}`;
    const entry = {
      id: i,
      name: isPlayer ? t('drMoney') : (langNames[i] ?? names[i] ?? `#${i}`),
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
    war.winner === FRIEND ? t('redWin') : war.winner === FOE ? t('blueWin') : t('drawWin');
  const champText = overallFirst
    ? `${t('lbChamp')}：${overallFirst.name}（${overallFirst.team === FRIEND ? t('redTeam') : t('blueTeam')} · ${overallFirst.score} ${t('lbPts')}）`
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
          <span class="lb-score">${r.score} ${t('lbPts')}</span>
        </div>`;
      })
      .join('');

  el.innerHTML = `
    <div class="lb-panel">
      <div class="lb-head">
        <div class="lb-title">${winLabel} ${t('lbTitle')}</div>
        <div class="lb-champ">${champText}</div>
      </div>
      <div class="lb-cols">
        <div class="lb-col red">
          <div class="lb-col-title">${t('lbRedCol')}（${red.length} ${t('lbPeople')}）</div>
          <div class="lb-list">${rowsHtml(red)}</div>
        </div>
        <div class="lb-col blue">
          <div class="lb-col-title">${t('lbBlueCol')}（${blue.length} ${t('lbPeople')}）</div>
          <div class="lb-list">${rowsHtml(blue)}</div>
        </div>
      </div>
      <div class="lb-foot">
        <button type="button" class="lb-restart" id="lb-restart">${t('lbRestart')}</button>
      </div>
    </div>
  `;
  el.hidden = false;
  el.querySelector('#lb-restart')?.addEventListener('click', onRestart);
}
