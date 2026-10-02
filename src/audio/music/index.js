// Song registry: key -> song definition (see sequencer.js for the format).
import menu from './menu.js';
import copacabana from './copacabana.js';
import blighty from './blighty.js';
import datacentre from './datacentre.js';
import marcoverse from './marcoverse.js';
import results from './results.js';
import podium from './podium.js';

/** @type {Record<string, object>} */
export const SONGS = { menu, copacabana, blighty, datacentre, marcoverse, results, podium };
export const MUSIC_KEYS = Object.keys(SONGS);
