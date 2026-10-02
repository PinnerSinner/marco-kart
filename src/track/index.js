// Track registry. createTrack(id) builds a track by id; registerTrack(id, def) adds or replaces one.
// A def is a plain object (or a function returning one); see src/track/TRACKDEF.md.
import { Track } from './Track.js';
import copacabana from './tracks/copacabana.js';
import blighty from './tracks/blighty.js';
import datacentre from './tracks/datacentre.js';
import marcoverse from './tracks/marcoverse.js';

const registry = new Map();

/**
 * Register a track definition under an id ('copacabana' | 'blighty' | 'datacentre' | 'marcoverse' | any custom id).
 * @param {string} id
 * @param {object|(()=>object)} def track def object, or a factory called on every createTrack()
 */
export function registerTrack(id, def) { registry.set(id, def); }

/** Ids that can currently be created. */
export function trackIds() { return [...registry.keys()]; }

/**
 * Build a track.
 * @param {string} id
 * @param {{ headless?: boolean }} [opts] headless: skip all meshes and textures (gameplay data + obstacles only) for fast simulations
 * @returns {Track}
 */
export function createTrack(id, opts = {}) {
  const def = registry.get(id);
  if (!def) throw new Error(`Track "${id}" is not built yet (registered: ${trackIds().join(', ') || 'none'})`);
  return new Track(typeof def === 'function' ? def() : def, opts);
}

registerTrack('copacabana', copacabana);
registerTrack('blighty', blighty);
registerTrack('datacentre', datacentre);
registerTrack('marcoverse', marcoverse);

export { Track };
