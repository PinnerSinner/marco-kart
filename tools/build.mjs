// Bundles + inlines the game into ONE self-contained HTML file.
//   node tools/build.mjs            -> dist/marco-kart.html
// Embeds every file in assets/user/ as a data URI into window.__MK_ASSETS__ (key = filename sans extension).
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const entry = path.join(root, 'src/main.js');
if (!fs.existsSync(entry)) { console.error('src/main.js does not exist yet'); process.exit(1); }

const result = await build({
  entryPoints: [entry], bundle: true, format: 'iife', target: 'es2020',
  minify: process.argv.includes('--no-minify') ? false : true,
  write: false, legalComments: 'none', logLevel: 'warning',
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', txt: 'text/plain' };
const assets = {};
const dir = path.join(root, 'assets/user');
if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) {
  const ext = path.extname(f).slice(1).toLowerCase();
  if (!mime[ext]) continue;
  assets[path.basename(f, path.extname(f))] = `data:${mime[ext]};base64,` + fs.readFileSync(path.join(dir, f)).toString('base64');
}

const template = fs.readFileSync(path.join(root, 'tools/index.template.html'), 'utf8');
const html = template
  .replace('/*__ASSETS__*/', `window.__MK_ASSETS__ = ${JSON.stringify(assets)};`)
  .replace('/*__GAME__*/', () => js);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist/marco-kart.html');
fs.writeFileSync(out, html);
console.log(`built ${path.relative(root, out)}  ${(html.length / 1024).toFixed(0)} KB  (${Object.keys(assets).length} user assets)`);
