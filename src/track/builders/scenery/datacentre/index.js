// Dressing for Cloud Nine Data Centre: the hall shell, rack canyons, fans, glass atrium, Core tower, trench and signage.
import { hallShell } from './hall.js';
import { hallFill } from './hallfill.js';
import { atrium } from './atrium.js';
import { core } from './core.js';
import { trenchDress } from './trenchdress.js';
import { signage } from './signs.js';
import { fanWalls } from './fans.js';
import { installDatacentreHazards } from './hazards.js';
import { wallTrim, cableTrays } from './canyon.js';
import { installForks, dressForks } from './forks.js';
import { aisleEdges } from './aisleglow.js';
import { installDcTraffic } from './traffic.js';

export function dressDatacentre(kit, ctx) {
  const { M } = ctx, CUTS = ctx.CUTS ?? [ctx.T];
  const m = kit.track.model;
  for (const T of CUTS) for (const c of T.capsules) m.addCapsule(c[0], c[1], c[2], c[3], c[4], -1e9, 1e9);     // rack rows confining the trench (physics, headless-safe)
  if (ctx.FK) installForks(kit, ctx);                                                                                       // second roads of the forks + their rack rows (before any scenery is placed)
  installDatacentreHazards(kit, ctx);
  installDcTraffic(kit, ctx);                                                                                               // rampable AGV / forklift / tape-robot traffic
  if (kit.headless) return;
  kit.statics.castShadow = false;
  kit.animate((dt, t) => M.tick(dt, t));
  const B = hallShell(kit, ctx);
  hallFill(kit, ctx, B);
  fanWalls(kit, ctx, B);
  atrium(kit, ctx, B);
  core(kit, ctx, B);
  for (const T of CUTS) trenchDress(kit, { ...ctx, T });
  if (ctx.FK) dressForks(kit, ctx);
  aisleEdges(kit, ctx);
  signage(kit, ctx, B);
  wallTrim(kit, ctx);
  cableTrays(kit, ctx);
}
