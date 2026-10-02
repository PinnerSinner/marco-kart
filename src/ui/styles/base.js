// Design system: tokens, type, panels, buttons, controls, backgrounds, transitions. Screens and HUD build on these.
import { ring } from './util.js';

export const baseCss = () => `
.mk,.mk *,.mk *::before,.mk *::after{box-sizing:border-box}
.mk{
  --u:min(.104167vw,.185185vh);
  --red:#E63946;--red-d:#B3202D;--navy:#0B1D3A;--navy-2:#132C55;--navy-3:#1D4079;--navy-4:#2C5BB0;--ink:#06122A;
  --cyan:#22D3EE;--cyan-d:#0E9CB8;--yellow:#FFD166;--yellow-d:#E9A92A;--paper:#FFF8EC;--paper-d:#E4D6BB;
  --magenta:#FF3DCB;--amber:#FFB020;--green:#3DDC84;--silver:#DDE6F2;--bronze:#F0A35E;
  --font-display:"Arial Black","Segoe UI Black","Avenir Next Condensed","Helvetica Neue",Arial,"Liberation Sans",system-ui,sans-serif;
  --font-body:"Trebuchet MS","Segoe UI","Helvetica Neue",Arial,"Liberation Sans",system-ui,sans-serif;
  --spring:cubic-bezier(.2,1.5,.4,1);
  position:absolute;inset:0;overflow:hidden;pointer-events:none;
  font-family:var(--font-body);font-weight:700;color:var(--paper);line-height:1.15;
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
  -webkit-user-select:none;user-select:none;-webkit-touch-callout:none;touch-action:manipulation;
}
#ui-root>.mk{pointer-events:none}
:where(.mk button){font:inherit;color:inherit;background:none;border:0;padding:0;margin:0;cursor:pointer;text-align:inherit;-webkit-tap-highlight-color:transparent;outline:0}
:where(.mk svg){display:block;overflow:visible}
:where(.mk img){-webkit-user-drag:none}
.mk [hidden]{display:none!important}
.mk :focus-visible{outline:3u solid var(--cyan);outline-offset:2u}
.mk [data-nav]{outline:0;-webkit-tap-highlight-color:transparent}

.disp{font-family:var(--font-display);font-style:italic;font-weight:900;text-transform:uppercase;letter-spacing:.02em}
.ol{text-shadow:${ring(2.4, 'var(--ink)', 4)}}
.ol-s{text-shadow:${ring(1.6, 'var(--ink)', 2)}}
.muted{opacity:.72}
.glyph,.ico{width:1em;height:1em;flex:none}

/* ---------- entrance animations (restart whenever a screen becomes active) ---------- */
@keyframes rise{from{opacity:0;transform:translateY(22u) scale(.96)}to{opacity:1;transform:none}}
@keyframes slideL{from{opacity:0;transform:translateX(-60u)}to{opacity:1;transform:none}}
@keyframes slideR{from{opacity:0;transform:translateX(60u)}to{opacity:1;transform:none}}
@keyframes dropIn{from{opacity:0;transform:translateY(-40u)}to{opacity:1;transform:none}}
@keyframes zoomIn{0%{opacity:0;transform:scale(.5)}60%{opacity:1;transform:scale(1.06)}100%{transform:scale(1)}}
@keyframes floaty{0%,100%{transform:translateY(0)}50%{transform:translateY(-6u)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes glowPulse{0%,100%{filter:drop-shadow(0 0 4u rgba(255,209,102,.5))}50%{filter:drop-shadow(0 0 14u rgba(255,209,102,.95))}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes shine{from{transform:translateX(-140%) skewX(-20deg)}to{transform:translateX(340%) skewX(-20deg)}}
@keyframes blink{0%,49%{opacity:1}50%,100%{opacity:0}}
.rise{animation:rise .55s var(--spring) both;animation-delay:calc(var(--i,0)*55ms + 80ms)}
.slide-l{animation:slideL .5s var(--spring) both;animation-delay:calc(var(--i,0)*55ms + 60ms)}
.slide-r{animation:slideR .5s var(--spring) both;animation-delay:calc(var(--i,0)*55ms + 60ms)}
.drop-in{animation:dropIn .5s var(--spring) both;animation-delay:calc(var(--i,0)*55ms)}
.zoom-in{animation:zoomIn .55s var(--spring) both;animation-delay:calc(var(--i,0)*55ms + 60ms)}
.float{animation:floaty 3.4s ease-in-out infinite}

/* ---------- screen scaffolding ---------- */
.screens{position:absolute;inset:0;pointer-events:none}
.screen{position:absolute;inset:0;display:none;flex-direction:column;pointer-events:auto;
  padding:max(env(safe-area-inset-top),18u) max(env(safe-area-inset-right),34u) max(env(safe-area-inset-bottom),34u) max(env(safe-area-inset-left),34u)}
.screen.is-active{display:flex}
.screen-body{flex:1 1 auto;min-height:0;display:flex;position:relative}
.grow{flex:1 1 auto;min-width:0;min-height:0}

/* ---------- animated backgrounds ---------- */
.bg{position:absolute;inset:0;overflow:hidden;pointer-events:none;opacity:0;transition:opacity .35s}
.mk[data-bg="solid"] .bg{opacity:1}
.bg-base{position:absolute;inset:0;background:
  radial-gradient(120% 90% at 50% -10%,#2A63C4 0%,rgba(42,99,196,0) 60%),
  radial-gradient(90% 70% at 100% 100%,rgba(230,57,70,.5) 0%,rgba(230,57,70,0) 60%),
  linear-gradient(180deg,#123068 0%,#0B1D3A 55%,#06122A 100%)}
.bg-rays{position:absolute;left:50%;top:44%;width:260vmax;height:260vmax;margin:-130vmax 0 0 -130vmax;
  background:repeating-conic-gradient(from 0deg,rgba(255,255,255,.075) 0deg 7deg,rgba(255,255,255,0) 7deg 20deg);
  -webkit-mask-image:radial-gradient(closest-side,#000 8%,rgba(0,0,0,.0) 62%);mask-image:radial-gradient(closest-side,#000 8%,rgba(0,0,0,0) 62%);
  animation:spin 90s linear infinite}
.bg-slab{position:absolute;left:-10%;width:130%;transform:skewY(-9deg);transform-origin:0 100%}
.bg-slab.a{bottom:14%;height:15%;background:linear-gradient(180deg,rgba(230,57,70,.85),rgba(179,32,45,.85));box-shadow:0 0 0 2u rgba(255,255,255,.25)}
.bg-slab.b{bottom:10.5%;height:2.6%;background:var(--cyan);opacity:.85}
.bg-slab.c{bottom:29.4%;height:1.2%;background:var(--yellow);opacity:.9}
.bg-streaks{position:absolute;inset:0}
.bg-streaks i{position:absolute;left:100%;top:var(--y);width:var(--l);height:var(--h);border-radius:99px;
  background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.75));opacity:var(--o,.6);animation:streak var(--d) linear infinite;animation-delay:var(--dl)}
.bg-streaks i:nth-child(3n){background:linear-gradient(90deg,rgba(34,211,238,0),rgba(34,211,238,.9))}
.bg-streaks i:nth-child(5n){background:linear-gradient(90deg,rgba(255,209,102,0),rgba(255,209,102,.9))}
@keyframes streak{from{transform:translateX(0)}to{transform:translateX(-170vw)}}
.bg-wave{position:absolute;left:0;right:0;bottom:0;height:22u;overflow:hidden;box-shadow:0 -4u 0 var(--ink),0 -7u 0 var(--paper)}
.bg-wave::before{content:"";position:absolute;inset:0 -200u;background-image:var(--wave);background-size:auto 100%;background-repeat:repeat-x;animation:waveDrift 14s linear infinite}
@keyframes waveDrift{to{transform:translateX(-96u)}}
.bg-vignette{position:absolute;inset:0;background:radial-gradient(120% 100% at 50% 40%,rgba(0,0,0,0) 45%,rgba(0,0,0,.55) 100%)}
.bg-dim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(6,18,42,.62),rgba(6,18,42,.86));backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);opacity:0;transition:opacity .3s}
.mk[data-bg="dim"] .bg-dim{opacity:1}
.mk[data-bg="dim"] .bg{opacity:1}
.mk[data-bg="dim"] .bg-base,.mk[data-bg="dim"] .bg-rays,.mk[data-bg="dim"] .bg-slab,.mk[data-bg="dim"] .bg-wave,.mk[data-bg="dim"] .bg-vignette{opacity:0}

/* ---------- panels ---------- */
.panel{position:relative;isolation:isolate;padding:12u 16u}
.panel::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:10u;transform:skewX(-6deg);
  background:linear-gradient(180deg,rgba(29,64,121,.97),rgba(11,29,58,.97));border:3u solid var(--paper);box-shadow:0 6u 0 var(--ink),0 12u 26u rgba(0,0,0,.4)}
.panel.flat::before{transform:none}
.panel.red::before{background:linear-gradient(180deg,#F25A66,var(--red) 55%,var(--red-d))}
.panel.yellow{color:var(--ink)}
.panel.yellow::before{background:linear-gradient(180deg,#FFF3C0,var(--yellow) 55%,var(--yellow-d));border-color:var(--ink)}
.panel.paper{color:var(--ink)}
.panel.paper::before{background:linear-gradient(180deg,#fff,var(--paper) 60%,var(--paper-d));border-color:var(--ink)}
.panel.dark::before{background:rgba(6,18,42,.86);border-color:rgba(255,248,236,.55)}

/* ---------- buttons ---------- */
.btn{position:relative;isolation:isolate;display:flex;align-items:center;gap:12u;min-height:44u;padding:6u 26u 6u 22u;
  font-family:var(--font-display);font-style:italic;font-weight:900;font-size:18f;letter-spacing:.03em;text-transform:uppercase;text-align:left;
  color:var(--paper);text-shadow:0 2u 0 rgba(0,0,0,.4);transition:transform .16s var(--spring),color .1s}
.btn::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:9u;transform:skewX(-11deg);
  background:linear-gradient(180deg,var(--navy-4) 0%,var(--navy-3) 45%,var(--navy-2) 100%);border:3u solid var(--paper);
  box-shadow:0 5u 0 var(--ink),0 9u 16u rgba(0,0,0,.35);transition:background .12s,border-color .12s,box-shadow .12s}
.btn::after{content:"";position:absolute;left:10u;right:14u;top:5u;height:34%;z-index:-1;border-radius:99u;transform:skewX(-11deg);
  background:linear-gradient(180deg,rgba(255,255,255,.32),rgba(255,255,255,0));pointer-events:none}
.btn .glyph{width:22u;height:22u;flex:none}
.btn .chev{margin-left:auto;width:18u;height:18u;opacity:0;transform:translateX(-10u);transition:opacity .15s,transform .2s var(--spring)}
.btn.is-focus{color:var(--ink);text-shadow:none;transform:translateX(10u)}
.btn.is-focus::before{background:linear-gradient(180deg,#FFF3C0 0%,var(--yellow) 50%,var(--yellow-d) 100%);border-color:var(--ink);
  box-shadow:0 5u 0 var(--ink),0 0 0 3u var(--paper),0 0 24u rgba(255,209,102,.7)}
.btn.is-focus .chev{opacity:1;transform:none}
.btn:active{transform:translateX(10u) translateY(3u) scale(.985)}
.btn.red::before{background:linear-gradient(180deg,#F25A66 0%,var(--red) 50%,var(--red-d) 100%)}
.btn.red.is-focus::before{background:linear-gradient(180deg,#FFF3C0 0%,var(--yellow) 50%,var(--yellow-d) 100%)}
.btn.small{min-height:34u;padding:4u 18u;font-size:14f;gap:8u}
.btn.small .glyph{width:16u;height:16u}
.btn.center{justify-content:center;text-align:center}
.btn[disabled],.btn.is-disabled{filter:grayscale(.8) brightness(.7);pointer-events:none}
.btn.is-focus::after{overflow:hidden}

/* ---------- headings, steps, hints ---------- */
.hdr{display:flex;align-items:center;justify-content:space-between;gap:16u;flex:none;margin-bottom:12u}
.hdr-l{display:flex;align-items:center;gap:14u;min-width:0}
.hdr-title{position:relative;isolation:isolate;padding:6u 34u 6u 20u;font-family:var(--font-display);font-style:italic;font-weight:900;font-size:27f;line-height:1;
  text-transform:uppercase;letter-spacing:.02em;text-shadow:${ring(1.6, 'var(--ink)', 2)};white-space:nowrap}
.hdr-title::before{content:"";position:absolute;inset:0;z-index:-1;transform:skewX(-14deg);border-radius:8u;border:3u solid var(--paper);
  background:linear-gradient(180deg,#F25A66,var(--red) 55%,var(--red-d));box-shadow:0 5u 0 var(--ink)}
.hdr-sub{font-size:12f;font-weight:800;letter-spacing:.16em;text-transform:uppercase;opacity:.85}
.steps{display:flex;gap:6u;align-items:center}
.step{position:relative;isolation:isolate;display:flex;align-items:center;gap:6u;padding:4u 14u 4u 10u;font-family:var(--font-display);font-style:italic;font-weight:900;font-size:11f;
  letter-spacing:.08em;text-transform:uppercase;color:rgba(255,248,236,.75)}
.step::before{content:"";position:absolute;inset:0;z-index:-1;transform:skewX(-14deg);border-radius:6u;background:rgba(6,18,42,.6);border:2u solid rgba(255,248,236,.35)}
.step b{display:grid;place-items:center;width:16u;height:16u;border-radius:50%;background:rgba(255,248,236,.2);font-size:10f}
.step.on{color:var(--ink)}
.step.on::before{background:var(--yellow);border-color:var(--ink);box-shadow:0 3u 0 var(--ink)}
.step.on b{background:var(--ink);color:var(--yellow)}
.step.done{color:var(--ink)}
.step.done::before{background:var(--cyan);border-color:var(--ink)}
.step.done b{background:var(--ink);color:var(--cyan)}
.ftr{display:flex;align-items:center;justify-content:space-between;gap:14u;flex:none;margin-top:10u}
.hints{display:flex;gap:16u;align-items:center;flex-wrap:wrap;font-size:11f;font-weight:800;letter-spacing:.1em;text-transform:uppercase;opacity:.92}
.hint{display:flex;gap:6u;align-items:center}
.key{display:inline-grid;place-items:center;min-width:20u;height:20u;padding:0 6u;border-radius:5u;background:var(--paper);color:var(--ink);
  font-family:var(--font-display);font-style:normal;font-size:10f;font-weight:900;border:2u solid var(--ink);box-shadow:0 3u 0 var(--ink);letter-spacing:0;text-transform:none}
.key.pad{border-radius:50%;min-width:20u;padding:0;background:var(--cyan)}
.key.pad.a{background:#3DDC84}.key.pad.b{background:#FF5B6B}.key.pad.x{background:#5BA0FF}.key.pad.y{background:#FFD166}
.key.wide{padding:0 9u}
.tag{display:inline-flex;align-items:center;gap:5u;padding:2u 9u;border-radius:99u;background:var(--ink);color:var(--paper);border:2u solid rgba(255,248,236,.5);font-size:10f;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
.tag.yellow{background:var(--yellow);color:var(--ink);border-color:var(--ink)}
.tag.red{background:var(--red);border-color:var(--ink)}
.tag.cyan{background:var(--cyan);color:var(--ink);border-color:var(--ink)}
.tag.green{background:var(--green);color:var(--ink);border-color:var(--ink)}

/* ---------- portraits ---------- */
.pt{display:block;position:relative;width:100%;aspect-ratio:1;border-radius:22%;overflow:hidden;border:2u solid var(--ink);background:var(--pc,var(--navy-3));box-shadow:0 2u 0 rgba(0,0,0,.4)}
.pt svg,.pt img{display:block;width:100%;height:100%;object-fit:cover}
.pt.round{border-radius:50%}
.pt .pt-sad{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2}
.pt.sad-fb .pt-img{filter:saturate(.5) brightness(.84) contrast(1.06);transform:translateY(6%) scale(1.1) rotate(-5deg);transform-origin:50% 100%}
.pt.sad-fb::before{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;background:linear-gradient(180deg,rgba(34,64,140,.5),rgba(34,64,140,0) 62%)}
.pt-sad .tear{animation:tearDrop 2.2s ease-in infinite}
.pt-sad .rain{animation:rainFall .9s linear infinite}
@keyframes tearDrop{0%,12%{transform:translateY(-2px);opacity:0}30%{opacity:1}100%{transform:translateY(16px);opacity:0}}
@keyframes rainFall{from{transform:translateY(-3px);opacity:.3}50%{opacity:1}to{transform:translateY(4px);opacity:.3}}

/* ---------- stat bars ---------- */
.stats{display:flex;flex-direction:column;gap:7u}
.stat{display:grid;grid-template-columns:78u 1fr 22u;align-items:center;gap:8u}
.stat-l{font-family:var(--font-display);font-style:italic;font-weight:900;font-size:11f;letter-spacing:.08em;text-transform:uppercase;text-shadow:0 2u 0 rgba(0,0,0,.4)}
.stat-bar{display:flex;gap:3u}
.stat-bar i{position:relative;flex:1;height:12u;border-radius:3u;transform:skewX(-16deg);background:rgba(6,18,42,.7);border:2u solid rgba(255,248,236,.3);overflow:hidden}
.stat-bar i::after{content:"";position:absolute;inset:0;transform:scaleX(0);transform-origin:0 50%;background:linear-gradient(180deg,#8BEAFB,var(--cyan) 55%,var(--cyan-d));transition:transform .35s var(--spring);transition-delay:calc(var(--k,0)*45ms)}
.stat-bar i.on{border-color:var(--ink)}
.stat-bar i.on::after{transform:scaleX(1)}
.stat-bar i.up::after{background:linear-gradient(180deg,#B8FFD0,var(--green) 55%,#1FA35B)}
.stat-bar i.down{border-color:var(--red)}
.stat-bar i.down::after{background:linear-gradient(180deg,#FF9AA3,var(--red) 55%,var(--red-d));transform:scaleX(1);opacity:.55}
.stat-d{font-family:var(--font-display);font-style:italic;font-weight:900;font-size:11f;text-align:right}
.stat-d.up{color:var(--green)}.stat-d.down{color:#FF7C88}

/* ---------- controls: slider, segmented, toggle ---------- */
.row{position:relative;isolation:isolate;display:flex;align-items:center;gap:14u;min-height:50u;padding:6u 18u}
.row::before{content:"";position:absolute;inset:0;z-index:-1;transform:skewX(-8deg);border-radius:8u;background:rgba(6,18,42,.72);border:3u solid rgba(255,248,236,.28);transition:background .12s,border-color .12s,box-shadow .12s}
.row.is-focus::before{background:linear-gradient(180deg,rgba(29,64,121,.98),rgba(19,44,85,.98));border-color:var(--yellow);box-shadow:0 0 0 3u var(--ink),0 0 22u rgba(255,209,102,.55)}
.row-l{flex:0 0 38%;white-space:nowrap;font-family:var(--font-display);font-style:italic;font-weight:900;font-size:14f;letter-spacing:.05em;text-transform:uppercase;display:flex;gap:8u;align-items:center}
.row-l .glyph{width:18u;height:18u;color:var(--yellow)}
.row.is-focus .row-l{color:var(--yellow)}
.slider-track{position:relative;flex:1;height:18u;border-radius:99u;background:rgba(6,18,42,.9);border:3u solid var(--paper);transform:skewX(-14deg);cursor:pointer;touch-action:none}
.slider-fill{position:absolute;inset:0;border-radius:99u;transform-origin:0 50%;background:linear-gradient(180deg,#8BEAFB,var(--cyan) 55%,var(--cyan-d));width:100%;transform:scaleX(var(--v,.5))}
.slider-knob{position:absolute;top:50%;left:calc(var(--v,.5)*100%);width:26u;height:26u;margin:-13u 0 0 -13u;border-radius:50%;background:var(--yellow);border:3u solid var(--ink);box-shadow:0 3u 0 var(--ink);transform:skewX(14deg);transition:transform .15s var(--spring)}
.row.is-focus .slider-knob,.slider-track.drag .slider-knob{transform:skewX(14deg) scale(1.25)}
.row-v{flex:0 0 40u;text-align:right;font-family:var(--font-display);font-style:italic;font-weight:900;font-size:15f}
.seg{display:flex;gap:6u;flex:1;justify-content:flex-end}
.seg button{position:relative;isolation:isolate;flex:1;min-height:30u;padding:4u 12u;text-align:center;font-family:var(--font-display);font-style:italic;font-weight:900;font-size:13f;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,248,236,.85)}
.seg button::before{content:"";position:absolute;inset:0;z-index:-1;transform:skewX(-14deg);border-radius:6u;background:rgba(6,18,42,.85);border:3u solid rgba(255,248,236,.4);transition:background .12s,transform .16s var(--spring)}
.seg button.on{color:var(--ink)}
.seg button.on::before{background:linear-gradient(180deg,#FFF3C0,var(--yellow) 60%,var(--yellow-d));border-color:var(--ink);box-shadow:0 3u 0 var(--ink);transform:skewX(-14deg) translateY(-1u)}
.toggle{position:relative;width:58u;height:28u;flex:none;margin-left:auto}
.toggle::before{content:"";position:absolute;inset:0;transform:skewX(-14deg);border-radius:99u;background:rgba(6,18,42,.9);border:3u solid var(--paper);transition:background .15s}
.toggle::after{content:"";position:absolute;left:5u;top:4u;width:20u;height:20u;border-radius:50%;background:var(--paper);border:3u solid var(--ink);transition:transform .2s var(--spring),background .15s}
.toggle.on::before{background:var(--green)}
.toggle.on::after{transform:translateX(30u);background:var(--yellow)}

/* ---------- transition wipe, rotate hint ---------- */
.wipe{position:absolute;inset:0;pointer-events:none;overflow:hidden;visibility:hidden;z-index:60}
.wipe i{position:absolute;top:-10%;bottom:-10%;left:-40%;width:180%;transform:translateX(-120%) skewX(-18deg);background:var(--ink)}
.wipe i:nth-child(1){background:var(--yellow)}
.wipe i:nth-child(2){background:var(--cyan)}
.wipe i:nth-child(3){background:var(--red)}
.wipe i:nth-child(4){background:var(--navy)}
.rotate-hint{position:absolute;inset:0;z-index:90;display:none;flex-direction:column;align-items:center;justify-content:center;gap:16u;background:var(--navy);text-align:center;padding:30u;pointer-events:auto}
.rotate-hint .phone{width:64u;height:104u;border-radius:14u;border:5u solid var(--paper);animation:rot 2.2s ease-in-out infinite}
@keyframes rot{0%,20%{transform:rotate(0)}60%,100%{transform:rotate(-90deg)}}
@media (orientation:portrait) and (max-width:700px){.rotate-hint{display:flex}}
@media (prefers-reduced-motion:reduce){.bg-rays,.bg-streaks i,.bg-wave::before,.float{animation:none}}
`;
