// Synthetic track defs used by the tracks_* tests (no scenery, headless friendly).
import { turtle } from '../src/track/builders/layout.js';

/** Fixture: start straight, hairpin, hill, esses, banked sweeper, oil patch, boost pad and a jump ramp. */
export function fixtureDef() {
  const t = turtle({ x: 0, z: 0, heading: 0, y: 0, w: 18 });
  t.straight(240);                                    // start straight (walls)
  t.arc(22, 180).mark('hair');                        // hairpin
  t.straight(120, { y: 5 });                          // climb
  t.arc(50, -40, { y: 6 });                           // esses
  t.arc(50, 40, { y: 6 });
  t.straight(50, { y: 3 });
  t.arc(45, 30, { bank: 16, y: 1 }).mark('sweep');    // banked sweeper
  const points = t.closeLoop(30, { bank: 0, y: 0 }); // final corner + straights back onto the start line
  return {
    id: 'fixture', name: 'Fixture GP', lapCount: 3, seed: 7, killY: -30,
    road: { width: 18 },
    points,
    walls: { barrier: { height: 1.1 } },
    defaults: { both: { edge: 'grass', skirt: 8 } },
    zones: [
      { from: 0, to: 200, wall: 'barrier' },
      { from: '@hair-30', to: '@hair+30', side: 'right', kerb: true, edge: 'sand' },
    ],
    boostPads: [{ s: 100, lateral: 0, length: 10, width: 6 }],
    patches: [{ kind: 'oil', s: 400, lateral: 3, rs: 3, rl: 2.5 }],
    ramps: [{ s: 60, length: 10, width: 8, rise: 2.4, id: 'jump' }],
    itemRows: [{ s: 120 }, { s: 500 }],
  };
}
