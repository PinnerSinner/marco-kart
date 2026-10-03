// Item styles: the two-slot HUD item box (slot 1 large, slot 2 smaller and tucked behind it), the roulette, the name + sentence caption,
// the category palette, and the Item Guide screen. The Guide uses design units as everywhere (`12u` = 12 px on the 960x540 stage); the HUD box
// uses `Ni` / `Nt` (one unit of a 76-unit slot, scaled by `--iu` from styles/hud.js; `t` is text, never under 11px), see hudUnits in util.js.
import { ring, hudUnits } from './util.js';

/** Outline for HUD caption text in item units (see ring in util.js, which draws in design units). */
const iring = (w) => ring(w, 'var(--ink)', 1.5).replace(/(\d)u /g, '$1i ');

const hudBox = () => hudUnits(`
/* ---------- HUD item box (large: about a fifth of the screen height) ---------- */
.item-slot{position:relative;flex:none}
.item-stack{position:relative;width:122i;height:76i}
.item-frame{position:absolute;isolation:isolate;display:grid;place-items:center}
.item-frame.s1{left:0;top:0;width:76i;height:76i;z-index:2}
.item-frame.s2{left:74i;top:30i;width:48i;height:48i;z-index:1;pointer-events:auto;cursor:pointer;touch-action:manipulation;opacity:.7;transition:opacity .25s,transform .25s var(--spring)}
.item-frame.s2.has{opacity:1}
.item-frame::before{content:"";position:absolute;inset:0;z-index:-2;border-radius:16i;transform:skewX(-7deg);border:4i solid var(--paper);
  background:radial-gradient(90% 90% at 50% 25%,#2C5BB0 0%,var(--navy-3) 45%,var(--navy) 100%);box-shadow:0 6i 0 var(--ink),0 10i 22i rgba(0,0,0,.45)}
.item-frame::after{content:"";position:absolute;inset:5i;z-index:-1;border-radius:11i;transform:skewX(-7deg);border:2i dashed rgba(255,248,236,.22)}
.item-frame.s2::before{border-radius:12i;border-width:3i;box-shadow:0 4i 0 var(--ink),0 8i 16i rgba(0,0,0,.4)}
.item-frame.s2::after{inset:4i;border-radius:8i}
.item-frame.s2:not(.has):not(.rolling){opacity:0;pointer-events:none}
.item-frame.s2:not(.has):not(.rolling)::before{border-style:dashed;border-color:rgba(255,248,236,.55);background:rgba(6,18,42,.55);box-shadow:none}
.item-ico{width:62i;height:62i;filter:drop-shadow(0 3i 0 rgba(0,0,0,.4));opacity:0;transform:scale(.4)}
.item-ico svg{width:100%;height:100%}
.s2 .item-ico{width:38i;height:38i}
.item-frame.has .item-ico{opacity:1;transform:none}
.item-frame.has::after{border-color:rgba(255,209,102,.7)}
.item-frame.s1.has{animation:glowPulse 1.6s ease-in-out infinite}
.item-frame.rolling::before{background:conic-gradient(from 0deg,#FF3DCB,#FFD166,#3DDC84,#22D3EE,#8B5CFF,#FF3DCB);animation:itemHue .5s linear infinite}
.item-frame.rolling .item-ico{opacity:1;transform:none;filter:drop-shadow(0 3i 0 rgba(0,0,0,.4)) blur(.6px)}
@keyframes itemHue{to{filter:hue-rotate(360deg)}}
.item-frame .item-q{position:absolute;font-family:var(--font-display);font-style:italic;font-weight:900;font-size:40i;color:rgba(255,248,236,.2)}
.item-frame.has .item-q,.item-frame.rolling .item-q,.item-frame.s2 .item-q{display:none}
.item-count{position:absolute;right:-8i;bottom:-8i;min-width:28i;height:28i;padding:0 7i;display:none;place-items:center;border-radius:99i;background:var(--yellow);color:var(--ink);
  border:3i solid var(--ink);font-family:var(--font-display);font-style:italic;font-weight:900;font-size:15i;box-shadow:0 3i 0 var(--ink)}
.s2 .item-count{min-width:22i;height:22i;font-size:12i;right:-6i;bottom:-6i;border-width:2.5i}
.item-count.on{display:grid}
.item-key{position:absolute;left:-7i;top:-9i;z-index:3}
.s2 .item-key{left:auto;right:-5i;top:-10i}
.item-key .key{transform:rotate(-8deg);min-width:23i;height:23i;padding:0 6i;border-radius:6i;font-size:12i;border-width:2.5i;box-shadow:0 3i 0 var(--ink)}
.item-key.off{display:none}
.item-lock{position:absolute;left:-5i;bottom:-5i;width:20i;height:20i;display:none;place-items:center;border-radius:50%;background:var(--red);color:var(--paper);border:2.5i solid var(--ink);z-index:3}
.item-lock .glyph{width:11i;height:11i}
.item-frame.s2.locked .item-lock{display:grid}
.item-frame.s2.locked .item-ico{opacity:.55}
.item-frame.full::before{border-color:var(--red);animation:itemShake .4s ease-in-out}
@keyframes itemShake{0%,100%{transform:skewX(-7deg) translateX(0)}20%{transform:skewX(-7deg) translateX(-5i)}40%{transform:skewX(-7deg) translateX(5i)}60%{transform:skewX(-7deg) translateX(-3i)}80%{transform:skewX(-7deg) translateX(3i)}}
.tap .item-frame.s2{left:66i;top:20i;width:56i;height:56i}
.tap .s2 .item-ico{width:42i;height:42i}
.item-hit{display:none}
.tap .item-hit{display:block;position:absolute;inset:-10i 0 -12i -8i;z-index:2}

/* capacitor charge meter (sweet spot in green), fuse / tow ribbon */
.item-meter{position:absolute;left:8i;right:8i;bottom:7i;height:10i;border-radius:99i;background:rgba(6,18,42,.9);border:2i solid var(--paper);overflow:hidden;display:none}
.item-frame.charging .item-meter{display:block}
.item-meter .sweet{position:absolute;top:0;bottom:0;background:rgba(61,220,132,.55);border-left:2i solid var(--green);border-right:2i solid var(--green)}
.item-meter .fill{position:absolute;left:0;top:0;bottom:0;width:0;background:var(--amber)}
.item-frame[data-zone="sweet"] .item-meter .fill{background:var(--green)}
.item-frame[data-zone="over"] .item-meter .fill{background:var(--red)}
.item-ribbon{position:absolute;left:50%;bottom:-13i;transform:translateX(-50%);z-index:4;display:none;padding:2i 9i;border-radius:99i;border:2.5i solid var(--ink);background:var(--yellow);color:var(--ink);
  font-family:var(--font-display);font-style:italic;font-weight:900;font-size:10t;letter-spacing:.04em;white-space:nowrap;box-shadow:0 2i 0 var(--ink)}
.item-ribbon.on{display:block}
.item-ribbon[data-kind="fuse"]{background:var(--red);color:var(--paper);animation:pulse .5s ease-in-out infinite}
.item-ribbon[data-kind="charge-sweet"]{background:var(--green)}
.item-ribbon[data-kind="charge-over"]{background:var(--red);color:var(--paper);animation:pulse .3s ease-in-out infinite}
.item-ribbon[data-kind="tow"]{background:var(--cyan)}

/* caption under the box, only while something is held (no space is reserved when empty): the front item's name and one sentence, and "next: ..." for the queued one.
   A short-lived extra line under it says when the slots are full. */
.hud-tl{z-index:4}
.item-pop{position:relative;display:none;width:178i;max-width:min(178i,46vw);margin-top:12i;pointer-events:none}
.item-pop.has,.item-pop.on{display:block}
.ip-rest{position:relative;isolation:isolate;padding:4i 8i 5i 12i;color:var(--paper);transform-origin:0 0}
.ip-rest::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:9i;background:rgba(8,14,34,.62);border:2i solid rgba(255,248,236,.22)}
.ip-rest::after{content:"";position:absolute;left:4i;top:6i;bottom:6i;width:4i;border-radius:3i;background:var(--cc,var(--yellow))}
.ip-rname{display:block;font-family:var(--font-display);font-style:italic;font-weight:900;font-size:13t;line-height:1.05;letter-spacing:.02em;text-transform:uppercase;color:var(--yellow);text-shadow:${iring(1.8)}}
.ip-rblurb{display:block;margin-top:2i;font-size:7.8t;font-weight:800;line-height:1.2;text-shadow:${iring(1.3)}}
.ip-rnext{display:block;margin-top:3i;font-size:6.8t;font-weight:900;letter-spacing:.04em;text-transform:uppercase;color:var(--cyan);text-shadow:${iring(1.3)}}
.ip-rname:empty,.ip-rblurb:empty,.ip-rnext:empty{display:none}
.ip-rnext.locked{opacity:.6}
.ip-list{position:relative;margin-top:5i;opacity:0;transform:translateY(-6i);transition:opacity .6s ease-in,transform .6s}
.item-pop.on .ip-list{opacity:1;transform:none;transition:opacity .12s,transform .25s var(--spring)}
.ip-entry{position:relative;isolation:isolate;padding:3i 8i 4i 12i;margin-bottom:3i;color:var(--paper)}
.ip-entry::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:8i;background:rgba(8,14,34,.62);border:2i solid rgba(255,248,236,.22)}
.ip-entry::after{content:"";position:absolute;left:4i;top:5i;bottom:5i;width:4i;border-radius:3i;background:var(--cc,var(--yellow))}
.ip-name{font-family:var(--font-display);font-style:italic;font-weight:900;font-size:10t;color:#FF8A94;line-height:1.05;letter-spacing:.02em;text-transform:uppercase;text-shadow:${iring(1.3)}}
.ip-blurb{margin-top:1i;font-size:6.8t;font-weight:800;line-height:1.2;opacity:.92}

`);

export const itemsCss = () => `
/* ---------- category palette (HUD pop-up chips and the Item Guide) ---------- */
.cat-attack{--cc:#FF5B6B}.cat-defence{--cc:#22D3EE}.cat-boost{--cc:#3DDC84}.cat-hazard{--cc:#FFB020}.cat-chaos{--cc:#FF3DCB}.cat-skill{--cc:#B48CFF}
.cat-dot{display:inline-block;width:9u;height:9u;border-radius:50%;background:var(--cc,#fff);border:2u solid var(--ink)}

${hudBox()}/* ---------- Item Guide ---------- */
.ig{display:flex;flex-direction:column;gap:8u;min-height:0;flex:1 1 auto;width:100%}
.ig-intro{display:flex;align-items:center;gap:14u;padding:7u 16u;flex:none}
.ig-intro p{margin:0;font-size:12f;font-weight:800;line-height:1.3}
.ig-intro b{color:var(--yellow)}
.ig-filters{display:flex;gap:7u;flex-wrap:wrap;flex:none}
.ig-filter{position:relative;isolation:isolate;display:inline-flex;align-items:center;gap:6u;padding:4u 13u;font-family:var(--font-display);font-style:italic;font-weight:900;font-size:12f;letter-spacing:.06em;text-transform:uppercase;color:var(--paper)}
.ig-filter::before{content:"";position:absolute;inset:0;z-index:-1;transform:skewX(-12deg);border-radius:6u;background:rgba(6,18,42,.72);border:2.5u solid rgba(255,248,236,.5)}
.ig-filter.on{color:var(--ink)}
.ig-filter.on::before{background:var(--cc,var(--yellow));border-color:var(--ink);box-shadow:0 3u 0 var(--ink)}
.ig-filter.is-focus::before{border-color:var(--yellow);box-shadow:0 0 0 3u var(--paper),0 0 18u rgba(255,209,102,.7)}
.ig-filter small{font-size:10f;opacity:.75;font-style:normal}
.ig-scroll{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;padding:4u 8u 12u 4u;scrollbar-width:thin;scrollbar-color:var(--yellow) rgba(6,18,42,.6);overscroll-behavior:contain}
.ig-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12u 12u}
.ig-card{position:relative;isolation:isolate;display:flex;gap:10u;align-items:flex-start;padding:8u 12u 9u 12u;text-align:left;color:var(--paper);min-width:0}
.ig-card::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:9u;background:linear-gradient(180deg,rgba(29,64,121,.96),rgba(11,29,58,.96));border:2.5u solid rgba(255,248,236,.55);box-shadow:0 4u 0 var(--ink);transition:background .12s,border-color .12s}
.ig-card::after{content:"";position:absolute;left:0;top:9u;bottom:9u;width:5u;border-radius:0 3u 3u 0;background:var(--cc,var(--yellow))}
.ig-card.is-focus{color:var(--ink);transform:translateY(-2u)}
.ig-card.is-focus::before{background:linear-gradient(180deg,#FFF3C0,var(--yellow) 60%,var(--yellow-d));border-color:var(--ink);box-shadow:0 4u 0 var(--ink),0 0 0 3u var(--paper),0 0 20u rgba(255,209,102,.7)}
.ig-ico{flex:none;width:52u;height:52u;filter:drop-shadow(0 3u 0 rgba(0,0,0,.4))}
.ig-ico svg{width:100%;height:100%}
.ig-body{min-width:0;display:flex;flex-direction:column;gap:3u}
.ig-head{display:flex;align-items:center;gap:6u;flex-wrap:wrap}
.ig-name{font-family:var(--font-display);font-style:italic;font-weight:900;font-size:14f;line-height:1;letter-spacing:.02em;text-transform:uppercase}
.ig-chip{padding:1u 7u;border-radius:99u;background:var(--ink);color:var(--cc,var(--paper));border:2u solid var(--cc,var(--paper));font-size:10f;font-weight:900;letter-spacing:.1em;text-transform:uppercase}
.ig-chip.skill-tag{background:var(--cc);color:var(--ink)}
.ig-chip.excl-tag{background:#FFD166;color:var(--ink);border-color:var(--ink)}
.ig-blurb{font-size:12f;font-weight:900;line-height:1.2}
.ig-good{font-size:11f;font-weight:800;line-height:1.3}
.ig-good b{display:inline-block;margin-right:6u;padding:0 6u;border-radius:99u;background:var(--ink);color:var(--cc,var(--yellow));font-size:9f;letter-spacing:.12em;text-transform:uppercase;line-height:1.5}
.ig-card.is-focus .ig-good b{background:var(--ink);color:var(--yellow)}
.ig-how{font-size:11f;font-weight:700;line-height:1.25;opacity:.88}
.ig-skill-note{display:inline-block;padding:0 7u;border-radius:99u;background:#B48CFF;color:var(--ink);font-size:10f;font-weight:900;letter-spacing:.08em;line-height:1.5}
.ig-intro .key{vertical-align:baseline}
.ig-card.is-focus .ig-how{opacity:1}
.ig-empty{padding:20u;text-align:center;font-size:13f;opacity:.8}
.screen[data-screen="items"] .screen-body{flex-direction:column}
@media (max-height:440px){.ig-intro{display:none}}
@media (max-width:760px){.ig-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:520px){.ig-grid{grid-template-columns:1fr}}
.pause-items{width:min(880u,94vw);display:flex;flex-direction:column;gap:8u;max-height:min(372u,74vh)}
.pause-items .ig-scroll{max-height:none}
.pause.view-items .pause-snap{display:none}
`;
