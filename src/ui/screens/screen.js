// Base class for full-screen menus. Subclasses build their DOM once, then refresh it on every enter().
import { h } from '../dom.js';

export class Screen {
  /**
   * @param {import('../UI.js').UI} ui owner
   * @param {string} name registry key
   * @param {{ bg?: 'solid'|'dim'|'none' }} [opts] background style behind the screen
   */
  constructor(ui, name, { bg = 'solid' } = {}) {
    this.ui = ui;
    this.name = name;
    this.bg = bg;
    this.el = h(`section.screen`, { data: { screen: name } });
    this.built = false;
  }

  /** Build static DOM (called once, lazily). */
  build() {}

  /**
   * Called each time the screen is shown.
   * @param {object} [params]
   */
  enter(params) {}

  /** Called when the screen is hidden. */
  leave() {}

  /** Escape / B pressed. */
  back() {}

  /** @returns {{ onBack?: Function, onStart?: Function, onAnyKey?: Function, initial?: any }} options for the nav scope */
  navOptions() { return { onBack: () => this.back() }; }
}
