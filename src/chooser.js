import { ROSTER } from './riders/roster.js';

// The rider picker: a card per rider and 確認 at the bottom. It opens on a fresh tab
// and from the × next to the headline. Level changes reload the page, so the tab
// remembers it already picked and the choice itself is kept across visits.
const CHOICE_KEY = 'desert-racing-rider';
const PICKED_KEY = 'desert-racing-rider-picked';

function read(store, key) {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function write(store, key, value) {
  try {
    store.setItem(key, value);
  } catch {
    // Without storage the picker just asks again next time.
  }
}

export class Chooser {
  constructor() {
    this.root = document.getElementById('chooser');
    this.cards = [];
    this.index = Math.max(ROSTER.findIndex((r) => r.id === read(localStorage, CHOICE_KEY)), 0);
    this.onPreview = null;
    const grid = document.getElementById('chooser-grid');
    ROSTER.forEach((r, i) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'chooser-card';
      card.innerHTML = `<span class="chooser-icon">${r.icon}</span><span>${r.name}</span>`;
      card.addEventListener('click', () => this.select(i));
      grid.appendChild(card);
      this.cards.push(card);
    });
    document.getElementById('chooser-ok').addEventListener('click', () => this.confirm());
    document.getElementById('rechoose').addEventListener('click', () => this.show());
    this.mark();
    this.setOpen(read(sessionStorage, PICKED_KEY) !== '1');
  }

  get current() {
    return ROSTER[this.index];
  }

  mark() {
    this.cards.forEach((c, i) => c.classList.toggle('active', i === this.index));
  }

  select(i) {
    this.index = (i + ROSTER.length) % ROSTER.length;
    this.mark();
    this.onPreview?.(this.current);
  }

  setOpen(open) {
    this.open = open;
    this.root.hidden = !open;
    document.body.classList.toggle('choosing', open);
  }

  show() {
    this.setOpen(true);
  }

  confirm() {
    write(localStorage, CHOICE_KEY, this.current.id);
    write(sessionStorage, PICKED_KEY, '1');
    this.setOpen(false);
    document.activeElement?.blur?.();
  }
}
