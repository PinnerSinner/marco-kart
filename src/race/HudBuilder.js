// HudBuilder: fills the (reused) HudSnapshot object returned by Race.getHud(). No allocation after construction.
import { CFG } from '../core/config.js';

export class HudBuilder {
  /** @param {import('./Race.js').Race} race */
  constructor(race) {
    const n = race.racers.length;
    this.hud = {
      state: 'countdown', countdown: CFG.countdownSeconds, time: 0, place: 1, racers: n, lap: 1, laps: race.laps,
      lapTimes: [], bestLap: null, speedKmh: 0,
      // game speed class of this race (Mbps): the HUD shows its name briefly at the start and in the speed read-out
      speedClass: race.speedClass ?? 100, speedClassName: race.speedInfo?.name ?? '100 Mbps', speedClassTag: race.speedInfo?.tag ?? 'Standard', speedC: race.speedC ?? 1,
      boost: { time: 0, power: 0 },
      drift: { active: false, level: 0, charge: 0 },
      // two item slots: `item` is slot 1 (the front item, fired by the use button), `item2` is slot 2 (queued, swapped in with the swap button).
      // `roulette.slot` is the slot the spinning box will fill (1 or 2; 1 with `double: true` = both slots are rolling); `swapLocked`: slot 1 is
      // live (charging / towing / pods out) so swapping is refused; `boxRefused` counts boxes driven through with both slots full (flash "FULL").
      item: null, item2: null, roulette: null, swapLocked: false, boxRefused: 0, shield: false,
      // live state of skill items and timed item effects (for the HUD: charge meter, fuse, tow timer, pods)
      itemFx: { charging: false, charge: 0, zone: '', potato: 0, trailT: 0, pods: 0, giant: false, splat: false }, smear: 0, wrongWay: false, finished: false, finishTime: null, finalLap: false,
      standings: [],
      minimap: { outline: race.track.minimapOutline(128), karts: [] },
    };
    this._item = { id: '', count: 0 };
    this._item2 = { id: '', count: 0 };
    this._roulette = { active: false, shown: null, slot: 1, double: false };
    for (let i = 0; i < n; i++) {
      this.hud.standings.push({ id: '', name: '', charId: '', place: 0, lap: 1, finished: false, isPlayer: false });
      this.hud.minimap.karts.push({ id: '', x: 0, z: 0, isPlayer: false, place: 0, colour: 0 });
    }
  }

  /**
   * @param {import('./Race.js').Race} race
   * @returns {object} the shared HudSnapshot (mutated in place)
   */
  build(race) {
    const h = this.hud;
    const r = race.player ?? race.racers[0];
    const k = r.kart;
    h.state = race.state; h.countdown = race.countdown; h.time = race.time;
    h.place = r.place; h.lap = r.lap; h.laps = race.laps;
    const lt = h.lapTimes;
    if (lt.length !== r.lapTimes.length) { lt.length = r.lapTimes.length; for (let i = 0; i < lt.length; i++) lt[i] = r.lapTimes[i]; }
    h.bestLap = r.bestLap;
    h.speedKmh = Math.abs(k.speed) * CFG.speedDisplayMult;
    h.boost.time = k.boost.time; h.boost.power = k.boost.power;
    h.drift.active = k.drift.active; h.drift.level = k.drift.level; h.drift.charge = k.drift.charge;
    if (r.item) { this._item.id = r.item.id; this._item.count = r.item.count; h.item = this._item; } else h.item = null;
    if (r.item2) { this._item2.id = r.item2.id; this._item2.count = r.item2.count; h.item2 = this._item2; } else h.item2 = null;
    if (r.itemRoulette) {
      const ro = this._roulette;
      ro.active = true; ro.shown = r.itemRoulette.shown;
      ro.slot = r.item ? 2 : 1; ro.double = !r.item && (r.itemRoulette.count ?? 1) > 1;
      h.roulette = ro;
    } else h.roulette = null;
    h.swapLocked = !!(race.items && race.items.swapLocked(r));
    h.boxRefused = r.boxRefused ?? 0;
    h.shield = r.shield;
    const fx = h.itemFx;
    fx.charging = !!r.charging; fx.charge = r.chargeT ?? 0; fx.zone = r._chargeZone ?? ''; fx.potato = r.potato ?? 0; fx.trailT = r.trailT ?? 0; fx.pods = r.pods ?? 0;
    fx.giant = r.giant > 0; fx.splat = r.splat > 0;
    // green fart smear over the screen (a poo hit): 1 while fresh, fading out over its last 0.9 s (lives in `screenFx`, humans only)
    h.smear = r.screenFx && r.screenFx.kind === 'smear' ? Math.min(1, r.screenFx.t / 0.9) : 0;
    h.wrongWay = r === race.player ? race.wrongWay : false;
    h.finished = r.finished; h.finishTime = r.finishTime;
    h.finalLap = !r.finished && r.lap === race.laps && race.laps > 0;
    const order = race.order;
    for (let i = 0; i < order.length; i++) {
      const o = order[i], row = h.standings[i];
      row.id = o.id; row.name = o.name; row.charId = o.charId; row.place = o.place; row.lap = o.lap; row.finished = o.finished; row.isPlayer = o.isPlayer;
    }
    const mk = h.minimap.karts;
    for (let i = 0; i < race.racers.length; i++) {
      const o = race.racers[i], m = mk[i];
      m.id = o.id; m.x = o.kart.pos.x; m.z = o.kart.pos.z; m.isPlayer = o.isPlayer; m.place = o.place; m.colour = o.colour;
    }
    return h;
  }
}
