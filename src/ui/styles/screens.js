// Styles for the boot / title / menu screens, plus the aggregate of every screen stylesheet.
import { ring } from './util.js';
import { selectCss } from './select.js';
import { panelsCss } from './panels.js';
import { resultsCss } from './results.js';

const introCss = () => `
/* ---------- logo ---------- */
.logo{position:relative;width:min(560u,66vw)}
.logo.small{width:min(300u,44vw)}
.logo-svg{display:block;width:100%;height:auto;overflow:visible;filter:drop-shadow(0 10u 0 rgba(0,0,0,.35)) drop-shadow(0 0 30u rgba(230,57,70,.35))}
.chq{position:relative;display:flex;align-items:center;width:min(470u,54vw);height:40u;transform:rotate(-2deg)}
.chq-side{flex:1;height:26u;border:3u solid var(--ink);box-shadow:0 5u 0 var(--ink);background:conic-gradient(#111 25%,#fff 0 50%,#111 0 75%,#fff 0) 0 0/13u 13u}
.chq-badge{position:relative;z-index:1;flex:none;width:58u;height:58u;margin:0 -6u;border-radius:50%;border:4u solid var(--paper);box-shadow:0 0 0 3u var(--ink),0 6u 0 3u var(--ink);overflow:hidden;background:#cfe6f0}
.chq-badge img,.chq-fallback{display:block;width:100%;height:100%;object-fit:cover}
.chq-fallback .pt{width:100%;height:100%}
.chq-plate{flex:none;display:flex;flex-direction:column;justify-content:center;padding:3u 14u 3u 14u;margin-left:-2u;background:var(--paper);color:var(--ink);border:3u solid var(--ink);box-shadow:0 5u 0 var(--ink);transform:skewX(-12deg);line-height:1}
.chq-plate small{font-size:8f;letter-spacing:.2em;color:var(--red)}.chq-plate b{font-size:17f;letter-spacing:.06em;font-style:italic}

/* ---------- loading ---------- */
.screen[data-screen="loading"]{align-items:center;justify-content:center}
.load-stack{display:flex;flex-direction:column;align-items:center;gap:16u;width:min(560u,84vw);margin-top:-10u}
.load-status{font-size:19f;letter-spacing:.06em;text-shadow:${ring(2, 'var(--ink)', 3)}}
.load-barwrap{display:flex;align-items:center;gap:14u;width:100%;margin-top:34u}
.load-bar{position:relative;flex:1;--p:0}
.load-track{height:24u;border-radius:99u;transform:skewX(-14deg);background:rgba(6,18,42,.9);border:4u solid var(--paper);overflow:hidden;box-shadow:0 5u 0 var(--ink)}
.load-fill{height:100%;width:100%;transform-origin:0 50%;transform:scaleX(var(--p));transition:transform .25s;
  background:repeating-linear-gradient(-45deg,#FFE9A0 0 10u,var(--yellow) 10u 20u);background-size:28.28u 28.28u;animation:stripes .5s linear infinite}
.load-bar.indeterminate .load-fill{transform:none;width:38%;animation:sweep 1.1s ease-in-out infinite alternate,stripes .5s linear infinite}
@keyframes stripes{to{background-position:28.28u 0}}
@keyframes sweep{from{margin-left:0}to{margin-left:62%}}
.load-kart{position:absolute;bottom:16u;left:calc(var(--p)*100%);width:66u;margin-left:-33u;transition:left .25s}
.load-bar.indeterminate .load-kart{left:0;animation:kartSweep 1.1s ease-in-out infinite alternate}
@keyframes kartSweep{from{transform:translateX(30u)}to{transform:translateX(calc(var(--u)*430))}}
.load-pct{min-width:44u;font-size:16f;text-align:right}
.tip{display:flex;align-items:center;gap:14u;width:100%;min-height:54u;padding:10u 20u}
.tip-text{flex:1;font-size:14f;line-height:1.3;font-weight:700}
.tip-text.swap{animation:tipIn .5s var(--spring)}
@keyframes tipIn{from{opacity:0;transform:translateY(10u)}to{opacity:1;transform:none}}

/* ---------- title ---------- */
.screen[data-screen="title"]{align-items:center;justify-content:center}
.title-center{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;gap:8u;margin-top:-14u}
.press{position:relative;isolation:isolate;margin-top:14u;padding:10u 40u;font-size:22f;letter-spacing:.14em;color:var(--ink);text-shadow:none;animation:pressPulse 1.1s ease-in-out infinite}
.press::before{content:"";position:absolute;inset:0;z-index:-1;transform:skewX(-14deg);border-radius:9u;border:4u solid var(--ink);background:linear-gradient(180deg,#FFF3C0,var(--yellow) 55%,var(--yellow-d));box-shadow:0 6u 0 var(--ink),0 0 0 4u var(--paper),0 0 30u rgba(255,209,102,.7)}
.press.is-focus{transform:scale(1.06)}
@keyframes pressPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
.press.is-focus{animation:pressPulse 1.1s ease-in-out infinite}
.flyby{position:absolute;left:0;right:0;bottom:22u;height:60u;pointer-events:none;overflow:hidden}
.fly{position:absolute;bottom:var(--y,0);left:0;width:92u;animation:fly var(--d) linear infinite;animation-delay:var(--dl)}
@keyframes fly{from{transform:translateX(-140u)}to{transform:translateX(calc(100vw + 60u))}}
.hero{position:absolute;right:max(38u,4vw);bottom:46u;width:170u;z-index:3}
.hero-burst{position:absolute;inset:-46u;border-radius:50%;background:repeating-conic-gradient(rgba(255,209,102,.55) 0 8deg,transparent 8deg 20deg);
  -webkit-mask-image:radial-gradient(closest-side,#000 40%,transparent 100%);mask-image:radial-gradient(closest-side,#000 40%,transparent 100%);animation:spin 26s linear infinite}
.hero-portrait{position:relative;animation:floaty 3.6s ease-in-out infinite}
.hero-portrait .pt{border-radius:50%;border:5u solid var(--paper);box-shadow:0 8u 0 var(--ink),0 0 0 3u var(--ink)}
.hero.photo{width:190u}
.hero-card{position:relative;width:100%;aspect-ratio:3/4;border-radius:14u;border:5u solid var(--paper);box-shadow:0 8u 0 var(--ink);transform:rotate(3deg);overflow:hidden;background:radial-gradient(circle at 50% 40%,#3a2f6b,#16143a)}
.hero-slide{position:absolute;inset:0;opacity:0;transition:opacity .6s}
.hero-slide.on{opacity:1}.hero-slide.missing{display:none}
.hero-slide img{display:block;width:100%;height:100%;object-fit:cover}
.hero-slide.contain img{object-fit:contain}
.hero-cap{position:absolute;left:0;right:0;bottom:0;padding:14u 8u 6u;font-size:10f;font-weight:800;text-align:center;color:#fff;background:linear-gradient(transparent,rgba(0,0,0,.72))}
.bubble{position:absolute;left:14u;top:-58u;z-index:3;width:150u;padding:8u 12u;background:var(--paper);color:var(--ink);border:3u solid var(--ink);border-radius:14u;
  font-size:11f;line-height:1.2;text-transform:none;letter-spacing:0;transform:rotate(-4deg);box-shadow:0 4u 0 var(--ink)}
.bubble::after{content:"";position:absolute;left:44u;bottom:-9u;width:14u;height:14u;background:var(--paper);border-right:3u solid var(--ink);border-bottom:3u solid var(--ink);transform:rotate(45deg) skew(10deg,10deg)}
.brand{position:absolute;left:max(38u,4vw);top:24u;display:flex;flex-direction:column;gap:2u;z-index:2}
.brand-mark{font-size:22f;color:var(--yellow);text-shadow:${ring(2, 'var(--ink)', 3)}}
.brand-logo{height:74u;width:auto;align-self:flex-start;object-fit:contain;filter:drop-shadow(0 3u 0 rgba(0,0,0,.4))}

/* ---------- main menu ---------- */
/* Three columns inside the shared content cap: logo + buttons | mode card + racer | photo. Everything is sized in design units, which follow the
   viewport height, so the buttons always fit; wide screens widen the centre column (up to the cap) and centre the whole block. */
.screen[data-screen="menu"]{padding-bottom:max(env(safe-area-inset-bottom),56u)}
.menu-body{display:grid;grid-template-columns:minmax(0,300u) minmax(0,1fr) minmax(0,220u);grid-template-rows:minmax(0,1fr);gap:26u;align-items:stretch}
.menu-body.no-photo{grid-template-columns:minmax(0,300u) minmax(0,1fr)}
.menu-left{display:flex;flex-direction:column;gap:12u;min-height:0;padding-left:8u}
.menu-logo{flex:none;width:min(210u,100%);align-self:center}
.menu-list{flex:1 1 0;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:11u}
.menu-list .btn{flex:0 1 50u;min-height:0;max-height:50u;padding-top:2u;padding-bottom:2u}
.menu-mid{min-width:0;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:22u;padding:6u 0 10u}
.menu-info{flex:0 1 auto;min-height:min(236u,100%);display:flex;flex-direction:column;padding:16u 22u 14u}
.info-t{flex:none;font-size:30f;line-height:1;text-shadow:${ring(1.6, 'var(--ink)', 2)}}
.info-p{flex:none;margin:9u 0 12u;font-size:14f;line-height:1.35;font-weight:700;opacity:.95}
.info-h{flex:none;margin:2u 0 5u;font-size:10.5f;letter-spacing:.2em;font-weight:900;color:var(--cyan)}
.info-rows{min-height:0;overflow-y:auto;scrollbar-width:thin}
.info-row{display:flex;justify-content:space-between;gap:14u;padding:5u 0;font-size:13f;border-top:2u solid rgba(255,248,236,.14)}
.info-row .tv{flex:none;font-variant-numeric:tabular-nums;color:var(--yellow)}
.menu-racer{flex:none;display:flex;align-items:center;gap:16u;padding:12u 20u}
.mr-pt{flex:none;width:76u}
.mr-pt .pt{border-radius:50%;border:4u solid var(--paper);box-shadow:0 5u 0 var(--ink)}
.mr-text{min-width:0}
.mr-n{font-size:25f;line-height:1;text-shadow:${ring(1.6, 'var(--ink)', 2)}}
.mr-t{margin:4u 0 7u;font-size:12.5f;opacity:.88}
.menu-photo{min-width:0;min-height:0;display:grid;place-items:center;padding:8u 6u 14u}
.mh-photo{position:relative;width:100%;max-height:100%;aspect-ratio:3/4;border-radius:14u;border:5u solid var(--paper);box-shadow:0 8u 0 var(--ink),0 14u 28u rgba(0,0,0,.4);transform:rotate(2.5deg);overflow:hidden;background:radial-gradient(circle at 50% 40%,#3a2f6b,#16143a)}
@media (min-aspect-ratio:2/1){
  .menu-body{grid-template-columns:minmax(0,340u) minmax(0,1fr) minmax(0,330u);gap:34u}
  .menu-body.no-photo{grid-template-columns:minmax(0,340u) minmax(0,1fr)}
  .menu-logo{width:min(250u,100%)}
  .menu-list .btn{flex-basis:54u;max-height:54u}
  .info-t{font-size:34f}.info-p{font-size:15f}.info-row{font-size:14f}
}
@media (max-aspect-ratio:1/1){
  .menu-body,.menu-body.no-photo{grid-template-columns:minmax(0,300u) minmax(0,1fr)}
  .menu-photo{display:none}
}
`;

/** @returns {string} the CSS of every screen */
export const screensCss = () => introCss() + selectCss() + panelsCss() + resultsCss();
