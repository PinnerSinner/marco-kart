// Floor wash for the hot / cold aisle zones: a glowing strip along each road edge in the colour of the aisle (cyan or amber), lifted just above
// the painted edge line, so the colour change is visible from the cockpit at the boundary of each zone.
import * as THREE from 'three';
import { AISLE } from './aisles.js';

export function aisleEdges(kit, { AIS = [] }) {
  if (kit.headless || !AIS.length) return;
  const track = kit.track, p = kit.paint({ lift: 0.05, material: kit.mat.glowVertex() });
  for (const z of AIS) {
    const A = AISLE[z.kind], inset = 0.45, col = new THREE.Color(A.edge).multiplyScalar(1.6);
    const from = z.from + 0.01, to = Math.min(z.to, track.length - 0.01);
    for (const sg of [-1, 1]) p.strip(from, to, (s) => sg * (track.widthAt(s) / 2 - inset), 0.34, col, 3);
  }
}
