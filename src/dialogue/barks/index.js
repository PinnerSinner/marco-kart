// All bark banks, keyed by character id (src/core/roster.js). Every bank is { category: [line, ...], vs: { rivalId: [line, ...] } }.
// A line is a string, or { t, key?, items?: [itemId...], rude?: true } (key = Marco voice key for recordings; items = only used for those item ids;
// rude = an edgy line, only heard with Settings 'Rude banter' on).
// {other} in a line becomes the name of the rival involved; {class} the speed class in Mbps. `on: [moment]` = only for that moment (throwaway.js).
//
// Three views of the same lines:
//   MILD_BANKS  the clean game (the hand-written banks plus ./extra.js),
//   RUDE_BANKS  the edgy lines alone (./rude/*.js), every line tagged `rude: true`,
//   BANKS       both merged (mild lines first, edgy after), which is what the director draws from; BarkBank.pick({ rude: false }) drops the edgy ones.
import { norm } from '../barkPicker.js';
import marco from './marco.js';
import lambda from './lambda.js';
import subnet from './subnet.js';
import packet from './packet.js';
import carlos from './carlos.js';
import tilly from './tilly.js';
import rex from './rex.js';
import biscuit from './biscuit.js';
import extra from './extra.js';
import { MILD as itemMild, RUDE as itemRude } from './items.js';
import { MILD as twMild, RUDE as twRude } from './throwaway.js';
import mania from './rude/mania.js';
import rudeMarco from './rude/marco.js';
import rudeLambda from './rude/lambda.js';
import rudeSubnet from './rude/subnet.js';
import rudePacket from './rude/packet.js';
import rudeCarlos from './rude/carlos.js';
import rudeTilly from './rude/tilly.js';
import rudeRex from './rude/rex.js';
import rudeBiscuit from './rude/biscuit.js';

const mild = { marco, lambda, subnet, packet, carlos, tilly, rex, biscuit };
const edgy = { marco: rudeMarco, lambda: rudeLambda, subnet: rudeSubnet, packet: rudePacket, carlos: rudeCarlos, tilly: rudeTilly, rex: rudeRex, biscuit: rudeBiscuit };

const tag = (arr) => arr.map((l) => ({ ...norm(l), rude: true }));

/** The hand-written mild bank with the extra-moment lines added (categories the main file does not have yet). */
function withExtra(id) {
  const bank = { ...mild[id] };
  for (const src of [extra[id], itemMild[id], twMild[id]]) for (const [cat, lines] of Object.entries(src ?? {})) bank[cat] = [...(bank[cat] ?? []), ...lines];
  return bank;
}

/** The edgy file of a character plus its extra edgy lines (./rude/mania.js) and its edgy item reactions (./items.js). */
function edgyBank(id) {
  const bank = { ...edgy[id] };
  for (const src of [mania[id], itemRude[id], twRude[id]]) for (const [cat, lines] of Object.entries(src ?? {})) bank[cat] = [...(bank[cat] ?? []), ...lines];
  return bank;
}

/** An edgy bank with every line tagged. */
function tagged(bank) {
  const out = {};
  for (const [cat, v] of Object.entries(bank)) {
    if (cat === 'vs') { out.vs = {}; for (const [rid, arr] of Object.entries(v)) out.vs[rid] = tag(arr); } else out[cat] = tag(v);
  }
  return out;
}

/** Mild lines first (so a catalogue line stays the canonical first entry), the tagged edgy lines after them. */
function merge(m, r) {
  const out = { ...m, vs: { ...(m.vs ?? {}) } };
  for (const [cat, v] of Object.entries(r)) {
    if (cat === 'vs') { for (const [rid, arr] of Object.entries(v)) out.vs[rid] = [...(out.vs[rid] ?? []), ...arr]; } else out[cat] = [...(out[cat] ?? []), ...v];
  }
  return out;
}

const ids = Object.keys(mild);
/** The clean banks. */
export const MILD_BANKS = Object.fromEntries(ids.map((id) => [id, withExtra(id)]));
/** The edgy lines only, every one tagged `rude: true`. */
export const RUDE_BANKS = Object.fromEntries(ids.map((id) => [id, tagged(edgyBank(id))]));
/** Everything: what the director draws from (and filters with `rude`). */
export const BANKS = Object.fromEntries(ids.map((id) => [id, merge(MILD_BANKS[id], RUDE_BANKS[id])]));

/** Total lines per character (categories plus rival-specific pools). @param {object} bank @param {{rude?: boolean}} [o] rude=false: count the mild lines only */
export function countLines(bank, { rude = true } = {}) {
  let n = 0;
  const count = (arr) => arr.reduce((a, l) => a + (rude || !norm(l).rude ? 1 : 0), 0);
  for (const [k, v] of Object.entries(bank)) {
    if (k === 'vs') { for (const arr of Object.values(v)) n += count(arr); } else n += count(v);
  }
  return n;
}
