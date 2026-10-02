// Character factory: eight stylised drivers built from the shared rig.
import { getCharacter } from '../core/roster.js';
import { Rig } from './rig.js';
import * as marco from './chars/marco.js';
import * as subnet from './chars/subnet.js';
import * as lambda from './chars/lambda.js';
import * as packet from './chars/packet.js';
import * as carlos from './chars/carlos.js';
import * as tilly from './chars/tilly.js';
import * as rex from './chars/rex.js';
import * as biscuit from './chars/biscuit.js';

const REGISTRY = { marco, subnet, lambda, packet, carlos, tilly, rex, biscuit };

/**
 * Create a driver model. Origin = seat/hips, faces +Z, ~1.5 tall.
 * `group.userData = { head, body, setExpression(name), lookSteer(steer, dt), setPose(name), setMotion(speed01, boost01), dispose(), charId }`
 * Expressions: neutral | happy | sad | hit | boost. Poses: drive | celebrate | defeat | spin.
 * @param {string} charId roster id (unknown ids fall back to the first roster entry)
 * @param {{expression?: string, pose?: string}} [opts]
 * @returns {import('three').Group}
 */
export function createCharacterMesh(charId, opts = {}) {
  const c = getCharacter(charId);
  const def = REGISTRY[c.id] ?? REGISTRY.marco;
  const rig = new Rig(c.id, def.cfg);
  def.build(rig, opts);
  const g = rig.root;
  g.userData = rig.api();
  rig.setExpression(opts.expression ?? 'neutral');
  rig.setPose(opts.pose ?? 'drive');
  rig.snap();
  return g;
}
