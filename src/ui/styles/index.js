// Assembles the single stylesheet injected by UI.mount().
import { units } from './util.js';
import { baseCss } from './base.js';
import { hudCss } from './hud.js';
import { screensCss } from './screens.js';
import { photosCss } from './photos.js';
import { itemsCss } from './items.js';
import { bubblesCss } from './bubbles.js';
import { caricatureCss } from '../caricatureUi.js';

/** @returns {string} the complete UI stylesheet with design units expanded */
export function buildCss() {
  return units(baseCss() + hudCss() + screensCss() + photosCss() + itemsCss() + bubblesCss() + caricatureCss());
}
