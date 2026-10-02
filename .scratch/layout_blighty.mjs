import { turtle } from '../src/track/builders/layout.js';
export const closeRadius = 60; export const closeProps = { y: 0.4, w: 16 };
// arc(R, +deg) = RIGHT turn, negative = left
export default function () {
  const t = turtle({ x: 0, z: 0, heading: 90, y: 0.4, w: 16 });
  t.straight(300, {}, 50).mark('hs');                  // High Street, east
  t.arc(70, 90, { w: 18 }).mark('clock');              // clock tower corner
  t.straight(120, { y: 1.5 });
  t.arc(36, 90, { w: 18 }).mark('rbt');                // roundabout quarter
  t.straight(60, { w: 15 });
  t.arc(60, -28); t.arc(60, 28);                       // canal side kink
  t.straight(120, { w: 14, y: 2.0 }).mark('bridge');
  t.arc(60, 25); t.arc(60, -25);
  t.straight(120, { w: 16, y: 0.5 });
  t.arc(28, 180, { w: 15 }).mark('mews');              // Mews hairpin
  t.straight(140, { y: 0.5, w: 16 });
  t.arc(70, -90, { y: 3, bank: -12 }).mark('park');    // banked park ring
  t.straight(80, { y: 3 });
  return t;
}
