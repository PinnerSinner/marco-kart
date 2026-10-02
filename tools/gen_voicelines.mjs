// Regenerates VOICELINES.md (Marco's recording sheet) from src/core/voicelines.js and what is actually in assets/user.
// The sheet lists ONLY the lines that have no recording yet. Run: node tools/gen_voicelines.mjs
import { writeFileSync, readdirSync, existsSync } from 'node:fs';
import { MARCO_VOICE, VOICE_TIERS } from '../src/core/voicelines.js';

const dir = new URL('../assets/user/', import.meta.url);
const files = existsSync(dir) ? readdirSync(dir) : [];
/** Keys that have at least one voice_<key>[_N].(mp3|m4a|wav|ogg) file. */
const recorded = new Set();
for (const f of files) {
  const m = /^voice_(.+?)(?:_[2-9])?\.(mp3|m4a|wav|ogg)$/i.exec(f);
  if (m) recorded.add(m[1]);
}

for (const v of MARCO_VOICE) {
  if (recorded.has(v.key) && v.tier !== 0) console.warn(`note: voice_${v.key} exists but the catalogue still says tier ${v.tier}: set it to 0`);
  if (!recorded.has(v.key) && v.tier === 0) console.warn(`note: ${v.key} is tier 0 but there is no voice_${v.key} file in assets/user`);
}

const todo = MARCO_VOICE.filter((v) => !recorded.has(v.key));
const normal = todo.filter((v) => !v.rude);
const edgy = todo.filter((v) => v.rude);
const done = MARCO_VOICE.filter((v) => recorded.has(v.key) && !v.rude).length;

const head = `# Marco Kart: voice lines still to record

Thank you for the ${done} you have already recorded: they are all in the game, wired to the right moments, and they play in full (nothing is cut off, and a speech bubble stays up for as long as the clip lasts). Everything below is **not recorded yet**.

Record on your phone, quiet room, MP3/M4A/WAV. **Name each file exactly as shown** (e.g. voice_bump.mp3) and drop it in \`assets/user/\`. You can record several takes of the same line for variety: add _2, _3 (voice_bump_2.mp3). The game picks one at random. The words are suggestions; say them your way, but keep the meaning so the on-screen speech bubble still fits (or tell me your wording and I will change the caption).

Any line you do not record still appears as a speech bubble over Marco's head and is read aloud in a funny voice by the browser's speech synthesis (Settings: "Read out Marco's missing lines", on by default). All the sweary banter is spoken by the browser too, and is never listed here, apart from the few optional ones at the end.
`;
const titles = { 1: 'Record these first', 2: 'Next', 3: 'Bonus flavour' };
let out = head;
for (const tier of [1, 2, 3]) {
  const rows = normal.filter((v) => v.tier === tier);
  if (!rows.length) continue;
  out += `\n## ${titles[tier] ?? VOICE_TIERS[tier]}\n\n| File | Say something like | When it plays |\n|---|---|---|\n`;
  for (const v of rows) out += `| voice_${v.key}.mp3 | ${v.text} | ${v.when} |\n`;
}
if (edgy.length) {
  out += `\n## Optional: a handful of sweary ones\n\nOnly heard with Settings "Rude banter" on. If you fancy it, these ${edgy.length} are the best to hear in your own voice; the rest of the rude lines stay with the browser's voices.\n\n| File | Say something like | When it plays |\n|---|---|---|\n`;
  for (const v of edgy) out += `| voice_${v.key}.mp3 | ${v.text} | ${v.when.replace(/^Rude banter only: /, '')} |\n`;
}
out += `\nTotal still to record: ${normal.length} lines${edgy.length ? ` (plus ${edgy.length} optional sweary ones)` : ''}. Extra takes with _2, _3 are welcome for the frequent ones.\n`;
writeFileSync(new URL('../VOICELINES.md', import.meta.url), out);
console.log(`VOICELINES.md written: ${normal.length} lines to record${edgy.length ? ` + ${edgy.length} optional` : ''}; ${done} already recorded`);
