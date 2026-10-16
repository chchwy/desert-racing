import { FRIEND, FOE } from './teams.js';

// The team war across the levels. Every rider (the player, the rivals, the swarm) has a
// stage: 0..5 is the level it rides in (LEVEL_ORDER), JAIL is the jail. A rider shot by
// the other team moves to the next stage; shot on the last level, it goes to jail. The
// team that has all its riders in jail first loses.
//
// Only the riders on the player's level are on screen. The rest fight it out here:
// each second, every off-screen rider may be shot by the other team on its level, at a
// rate that grows with how many foes share that level.
//
// The state lives in localStorage, so it survives the reload a level change needs.
// Rider ids: 0 = player, 1..RIVALS = rivals, then the swarm.

export const STAGES = 6;
export const JAIL = STAGES;
const KEY = 'desert-racing-war-1';
const OFFSCREEN_RATE = 0.012; // chance per second per rider, times the foe share on its level

export class War {
  constructor(rivalTeams, swarmCount, swarmFriends) {
    this.n = 1 + rivalTeams.length + swarmCount;
    this.rivalBase = 1;
    this.swarmBase = 1 + rivalTeams.length;
    this.team = new Uint8Array(this.n);
    this.team[0] = FRIEND;
    rivalTeams.forEach((t, i) => (this.team[1 + i] = t));
    for (let i = 0; i < swarmCount; i++) this.team[this.swarmBase + i] = i < swarmFriends ? FRIEND : FOE;
    this.stage = new Uint8Array(this.n);
    this.winner = null;
    this.coins = 0; // the player's coin count, carried across level reloads
    this.kills = 0; // foes the player has shot
    this.load();
    this.acc = 0;
    this.saveIn = 2;
    this.listeners = [];
  }

  load() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    } catch {
      saved = null;
    }
    if (saved && saved.n === this.n && typeof saved.stage === 'string' && saved.stage.length === this.n) {
      for (let i = 0; i < this.n; i++) this.stage[i] = saved.stage.charCodeAt(i) - 48;
      this.winner = saved.winner ?? null;
      this.coins = saved.coins ?? 0;
      this.kills = saved.kills ?? 0;
    } else {
      this.stage.fill(0);
      this.winner = null;
    }
  }

  save() {
    let s = '';
    for (let i = 0; i < this.n; i++) s += String.fromCharCode(48 + this.stage[i]);
    try {
      localStorage.setItem(KEY, JSON.stringify({ n: this.n, stage: s, winner: this.winner, coins: this.coins, kills: this.kills }));
    } catch {
      // private window or blocked storage: the war just does not carry over
    }
  }

  reset() {
    this.stage.fill(0);
    this.winner = null;
    this.coins = 0;
    this.kills = 0;
    this.save();
  }

  // Called when a rider moves stage: (id, from, to).
  onMove(fn) {
    this.listeners.push(fn);
  }

  // A rider was shot: next level, or jail from the last one. Returns the new stage.
  hit(id) {
    const from = this.stage[id];
    if (from >= JAIL) return from;
    const to = from + 1;
    this.stage[id] = to;
    for (const fn of this.listeners) fn(id, from, to);
    this.checkWinner();
    return to;
  }

  // Out of jail and back to the first level (the player buys its way out).
  release(id) {
    const from = this.stage[id];
    this.stage[id] = 0;
    for (const fn of this.listeners) fn(id, from, 0);
  }

  // Counts per team: { free, jailed } for FRIEND and FOE.
  counts() {
    const c = { [FRIEND]: { free: 0, jailed: 0 }, [FOE]: { free: 0, jailed: 0 } };
    for (let i = 0; i < this.n; i++) {
      if (this.stage[i] >= JAIL) c[this.team[i]].jailed++;
      else c[this.team[i]].free++;
    }
    return c;
  }

  checkWinner() {
    if (this.winner != null) return;
    const c = this.counts();
    if (c[FRIEND].free === 0) this.winner = FOE;
    else if (c[FOE].free === 0) this.winner = FRIEND;
    if (this.winner != null) this.save();
  }

  // Off-screen fighting on every level but the one on screen.
  update(dt, onScreen) {
    this.saveIn -= dt;
    if (this.saveIn <= 0) {
      this.save();
      this.saveIn = 2;
    }
    if (this.winner != null) return;
    this.acc += dt;
    if (this.acc < 1) return;
    this.acc -= 1;
    const per = Array.from({ length: STAGES }, () => [0, 0]);
    for (let i = 0; i < this.n; i++) if (this.stage[i] < STAGES) per[this.stage[i]][this.team[i]]++;
    const shot = [];
    for (let i = 1; i < this.n; i++) {
      const s = this.stage[i];
      if (s >= STAGES || s === onScreen) continue;
      const [foe, friend] = per[s];
      const total = foe + friend;
      const enemies = this.team[i] === FRIEND ? foe : friend;
      if (enemies && Math.random() < OFFSCREEN_RATE * (enemies / total) * 2) shot.push(i);
    }
    for (const i of shot) this.hit(i);
  }
}
