// Item styles: the two-slot HUD item box (slot 1 large, slot 2 smaller and tucked behind it), the roulette, the name + sentence pop-up,
// the category palette, and the Item Guide screen. Design units as everywhere (`12u` = 12 px on the 960x540 stage).
import { ring } from './util.js';

export const itemsCss = () => `
/* ---------- category palette (HUD pop-up chips and the Item Guide) ---------- */
.cat-attack{--cc:#FF5B6B}.cat-defence{--cc:#22D3EE}.cat-boost{--cc:#3DDC84}.cat-hazard{--cc:#FFB020}.cat-chaos{--cc:#FF3DCB}.cat-skill{--cc:#B48CFF}
.cat-dot{display:inline-block;width:9u;height:9u;border-radius:50%;background:var(--cc,#fff);border:2u solid var(--ink)}

/* ---------- HUD item box ---------- */
.item-slot{position:relative;width:118u;height:76u;flex:none}
.item-stack{position:absolute;left:0;top:0;width:100%;height:100%}
.item-frame{position:absolute;isolation:isolate;display:grid;place-items:center}
.item-frame.s1{left:0;top:0;width:76u;height:76u;z-index:2}
.item-frame.s2{left:68u;top:27u;width:50u;height:50u;z-index:1;pointer-events:auto;cursor:pointer;touch-action:manipulation;opacity:.62;transition:opacity .25s,transform .25s var(--spring)}
.item-frame.s2.has{opacity:1}
.item-frame::before{content:"";position:absolute;inset:0;z-index:-2;border-radius:16u;transform:skewX(-7deg);border:4u solid var(--paper);
  background:radial-gradient(90% 90% at 50% 25%,#2C5BB0 0%,var(--navy-3) 45%,var(--navy) 100%);box-shadow:0 6u 0 var(--ink),0 10u 22u rgba(0,0,0,.45)}
.item-frame::after{content:"";position:absolute;inset:5u;z-index:-1;border-radius:11u;transform:skewX(-7deg);border:2u dashed rgba(255,248,236,.22)}
.item-frame.s2::before{border-radius:12u;border-width:3u;box-shadow:0 4u 0 var(--ink),0 8u 16u rgba(0,0,0,.4)}
.item-frame.s2::after{inset:4u;border-radius:8u}
.item-frame.s2:not(.has):not(.rolling){opacity:0;pointer-events:none}
.item-frame.s2:not(.has):not(.rolling)::before{border-style:dashed;border-color:rgba(255,248,236,.55);background:rgba(6,18,42,.55);box-shadow:none}
.item-ico{width:58u;height:58u;filter:drop-shadow(0 3u 0 rgba(0,0,0,.4));opacity:0;transform:scale(.4)}
.item-ico svg{width:100%;height:100%}
.s2 .item-ico{width:38u;height:38u}
.item-frame.has .item-ico{opacity:1;transform:none}
.item-frame.has::after{border-color:rgba(255,209,102,.7)}
.item-frame.s1.has{animation:glowPulse 1.6s ease-in-out infinite}
.item-frame.rolling::before{background:conic-gradient(from 0deg,#FF3DCB,#FFD166,#3DDC84,#22D3EE,#8B5CFF,#FF3DCB);animation:itemHue .5s linear infinite}
.item-frame.rolling .item-ico{opacity:1;transform:none;filter:drop-shadow(0 3u 0 rgba(0,0,0,.4)) blur(.6px)}
@keyframes itemHue{to{filter:hue-rotate(360deg)}}
.item-frame .item-q{position:absolute;font-family:var(--font-display);font-style:italic;font-weight:900;font-size:34f;color:rgba(255,248,236,.16)}
.item-frame.has .item-q,.item-frame.rolling .item-q,.item-frame.s2 .item-q{display:none}
.item-count{position:absolute;right:-8u;bottom:-8u;min-width:26u;height:26u;padding:0 6u;display:none;place-items:center;border-radius:99u;background:var(--yellow);color:var(--ink);
  border:3u solid var(--ink);font-family:var(--font-display);font-style:italic;font-weight:900;font-size:14f;box-shadow:0 3u 0 var(--ink)}
.s2 .item-count{min-width:20u;height:20u;font-size:11f;right:-6u;bottom:-6u;border-width:2.5u}
.item-count.on{display:grid}
.item-key{position:absolute;left:-6u;top:-8u;z-index:3}
.s2 .item-key{left:auto;right:-5u;top:-9u}
.item-key .key{transform:rotate(-8deg)}
.item-key.off{display:none}
.item-lock{position:absolute;left:-5u;bottom:-5u;width:18u;height:18u;display:none;place-items:center;border-radius:50%;background:var(--red);color:var(--paper);border:2.5u solid var(--ink);z-index:3}
.item-lock .glyph{width:10u;height:10u}
.item-frame.s2.locked .item-lock{display:grid}
.item-frame.s2.locked .item-ico{opacity:.55}
.item-frame.full::before{border-color:var(--red);animation:itemShake .4s ease-in-out}
@keyframes itemShake{0%,100%{transform:skewX(-7deg) translateX(0)}20%{transform:skewX(-7deg) translateX(-5u)}40%{transform:skewX(-7deg) translateX(5u)}60%{transform:skewX(-7deg) translateX(-3u)}80%{transform:skewX(-7deg) translateX(3u)}}
.tap .item-frame.s2{left:58u;top:16u;width:64u;height:64u}
.tap .s2 .item-ico{width:44u;height:44u}
.tap .item-slot{width:122u}
.item-hit{display:none}
.tap .item-hit{display:block;position:absolute;inset:-10u 0 -12u -8u;z-index:2}

/* capacitor charge meter (sweet spot in green), fuse / tow ribbon */
.item-meter{position:absolute;left:8u;right:8u;bottom:7u;height:9u;border-radius:99u;background:rgba(6,18,42,.9);border:2u solid var(--paper);overflow:hidden;display:none}
.item-frame.charging .item-meter{display:block}
.item-meter .sweet{position:absolute;top:0;bottom:0;background:rgba(61,220,132,.55);border-left:2u solid var(--green);border-right:2u solid var(--green)}
.item-meter .fill{position:absolute;left:0;top:0;bottom:0;width:0;background:var(--amber)}
.item-frame[data-zone="sweet"] .item-meter .fill{background:var(--green)}
.item-frame[data-zone="over"] .item-meter .fill{background:var(--red)}
.item-ribbon{position:absolute;left:50%;bottom:-12u;transform:translateX(-50%);z-index:4;display:none;padding:2u 8u;border-radius:99u;border:2.5u solid var(--ink);background:var(--yellow);color:var(--ink);
  font-family:var(--font-display);font-style:italic;font-weight:900;font-size:10f;letter-spacing:.04em;white-space:nowrap;box-shadow:0 2u 0 var(--ink)}
.item-ribbon.on{display:block}
.item-ribbon[data-kind="fuse"]{background:var(--red);color:var(--paper);animation:pulse .5s ease-in-out infinite}
.item-ribbon[data-kind="charge-sweet"]{background:var(--green)}
.item-ribbon[data-kind="charge-over"]{background:var(--red);color:var(--paper);animation:pulse .3s ease-in-out infinite}
.item-ribbon[data-kind="tow"]{background:var(--cyan)}

/* pop-up: name (bold) and one sentence, about 3 s on pickup, then it fades to a one-line label */
.hud-tl{z-index:4}
.hud.on .standings{transform:translateY(var(--pop-shift,0px))}
.item-pop{position:absolute;left:0;top:calc(100% + 3u);width:max(86u,104px);z-index:6;pointer-events:none}
.ip-list{position:absolute;left:0;top:0;width:100%;opacity:0;transform:translateY(-6u);transition:opacity .6s ease-in,transform .6s}
.item-pop.on .ip-list{opacity:1;transform:none;transition:opacity .12s,transform .25s var(--spring)}
.ip-entry{position:relative;isolation:isolate;padding:1u 4u 2u 7u;margin-bottom:2u;color:var(--paper)}
.ip-entry::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:6u;background:rgba(8,14,34,.42)}
.ip-entry::after{content:"";position:absolute;left:2u;top:4u;bottom:4u;width:3u;border-radius:2u;background:var(--cc,var(--yellow))}
.ip-tag{font-size:6.5f;font-weight:900;letter-spacing:.06em;opacity:.75;margin-bottom:1u;line-height:1.1}
.ip-head{display:flex;align-items:center;gap:6u;flex-wrap:wrap}
.ip-name{font-family:var(--font-display);font-style:italic;font-weight:900;font-size:8f;line-height:1.05;letter-spacing:.02em;text-transform:uppercase;color:var(--yellow)}
.ip-cat{padding:1u 6u;border-radius:99u;background:var(--ink);color:var(--cc,var(--paper));border:2u solid var(--cc,var(--paper));font-size:10f;font-weight:900;letter-spacing:.1em;text-transform:uppercase}
.ip-entry.sub{padding:1u 4u 2u 7u}
.ip-entry.sub .ip-name{font-size:7f}
.ip-entry.sub .ip-blurb{font-size:6.5f;line-height:1.15}
.ip-blurb{margin-top:0;font-size:6.8f;font-weight:700;line-height:1.15;opacity:.82}
.ip-rest{position:absolute;left:0;top:0;width:100%;display:flex;flex-direction:column;gap:1u;opacity:0;transition:opacity .5s .4s;text-shadow:${ring(1.4, 'var(--ink)', 1.5)}}
.item-pop.has .ip-rest{opacity:1}
.item-pop.on .ip-rest{opacity:0;transition:opacity .1s}
.ip-rname{font-family:var(--font-display);font-style:italic;font-weight:900;font-size:7.5f;letter-spacing:.03em;text-transform:uppercase;color:var(--yellow)}
.ip-rnext{font-size:6.5f;font-weight:800;letter-spacing:.04em;color:var(--paper);opacity:.9}
.ip-rnext.locked{opacity:.6}

/* ---------- Item Guide ---------- */
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
