import { turtle } from '../src/track/builders/layout.js';
export const closeRadius = 90; export const closeProps = { y: 1, w: 22 };
// NOTE: arc(R, +deg) turns RIGHT, arc(R, -deg) turns LEFT
export default function () {
  const t = turtle({ x: 0, z: 0, heading: 90, y: 1.0, w: 22 });
  t.straight(220, {}, 55).mark('a1');
  t.arc(160, 14, { w: 22 });
  t.straight(110);
  t.arc(160, -14);
  t.straight(150).mark('a2');
  t.arc(34, -180, { w: 18, y: 1.6 }).mark('hair');
  t.straight(50, { w: 20 });
  t.arc(70, 55, { y: 3.5 }).mark('ess1');
  t.arc(70, -40, { y: 6.5 });
  t.straight(120, { y: 8 });
  t.arc(70, -25, { y: 9 });
  t.arc(70, 50, { y: 9 });
  t.straight(120, { y: 9 });
  return t;
}
