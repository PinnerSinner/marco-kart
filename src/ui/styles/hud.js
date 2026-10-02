// HUD styles: everything visible while racing. Positions are in design units on the 960x540 stage.
import { ring } from './util.js';

export const hudCss = () => `
.hud{position:absolute;inset:0;pointer-events:none;visibility:hidden;opacity:0;transition:opacity .3s,visibility 0s .3s;
  padding:max(env(safe-area-inset-top),16u) max(env(safe-area-inset-right),24u) max(env(safe-area-inset-bottom),14u) max(env(safe-area-inset-left),24u)}
.hud.on{visibility:visible;opacity:1;transition:opacity .3s}
.hud>*{position:absolute;transition:transform .55s var(--spring),opacity .4s}
.hud:not(.on) .hud-tl{transform:translateX(-90u)}
.hud:not(.on) .standings{transform:translateX(-90u)}
.hud:not(.on) .hud-tr{transform:translateX(90u)}
.hud:not(.on) .hud-bl{transform:translateY(90u)}
.hud:not(.on) .hud-br{transform:translateY(90u)}
.hud:not(.on) .hud-bc{transform:translateY(90u)}

/* top-left: item slot and race clock */
.hud-tl{left:max(env(safe-area-inset-left),24u);top:max(env(safe-area-inset-top),16u);display:flex;align-items:flex-start;gap:12u}
/* item slots, roulette and pop-up: see items.js */
.timer{min-width:158u;padding:8u 16u 8u 18u}
.timer .lbl{font-size:10f;font-weight:900;letter-spacing:.2em;color:var(--cyan)}
.timer .tv{font-family:var(--font-display);font-style:italic;font-weight:900;font-size:24f;letter-spacing:.01em;font-variant-numeric:tabular-nums;text-shadow:0 3u 0 rgba(0,0,0,.4);white-space:nowrap}
.laps{margin-top:4u;display:flex;flex-direction:column;gap:1u;font-variant-numeric:tabular-nums}
.lrow{display:flex;justify-content:space-between;gap:12u;font-size:11f;font-weight:800;letter-spacing:.04em;opacity:.95}
.lrow span:first-child{opacity:.7}
.lrow.live{color:var(--yellow)}
.lrow.best span:last-child{color:var(--cyan)}
.lrow.best span:first-child{color:var(--cyan);opacity:1}
.lrow.empty{opacity:.28}

/* standings */
.standings{left:max(env(safe-area-inset-left),24u);top:calc(max(env(safe-area-inset-top),16u) + 132u);width:140u;height:calc(var(--n,8)*17u)}
.srow{position:absolute;left:0;right:0;top:0;height:15u;display:flex;align-items:center;gap:5u;padding-left:2u;transform:translateY(calc(var(--r,0)*17u));transition:transform .4s var(--spring)}
.srow::before{content:"";position:absolute;inset:0;z-index:-1;transform:skewX(-12deg);border-radius:4u;background:rgba(6,18,42,.72);border:1.5u solid rgba(255,248,236,.28)}
.srow.me::before{background:linear-gradient(180deg,#FFF3C0,var(--yellow));border-color:var(--ink);box-shadow:0 2u 0 var(--ink)}
.srow.me{color:var(--ink)}
.srow{isolation:isolate}
.sp{width:14u;text-align:center;font-family:var(--font-display);font-style:italic;font-weight:900;font-size:10f}
.srow .spt{width:12u;flex:none}
.sn{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10f;font-weight:800;letter-spacing:.02em}
.sl{width:17u;text-align:center;font-size:9f;font-weight:900;opacity:.75}
.srow.done .sl{color:var(--green);opacity:1}
.srow.me.done .sl{color:#0B7A3E}

/* top-right: pause + minimap */
.hud-tr{right:max(env(safe-area-inset-right),24u);top:max(env(safe-area-inset-top),16u);display:flex;align-items:flex-start;gap:10u}
.pause-btn{pointer-events:auto;position:relative;isolation:isolate;width:30u;height:30u;display:grid;place-items:center;color:var(--paper)}
.pause-btn::before{content:"";position:absolute;inset:0;z-index:-1;transform:skewX(-8deg);border-radius:8u;background:rgba(6,18,42,.8);border:3u solid var(--paper);box-shadow:0 3u 0 var(--ink)}
.pause-btn i{display:flex;gap:4u}
.pause-btn i b{display:block;width:5u;height:14u;border-radius:2u;background:currentColor}
.pause-btn:active{transform:translateY(2u)}
.minimap{position:relative;isolation:isolate;width:118u;height:118u}
.minimap::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:16u;transform:skewX(-5deg);background:radial-gradient(100% 100% at 30% 20%,rgba(29,64,121,.92),rgba(6,18,42,.92));border:4u solid var(--paper);box-shadow:0 6u 0 var(--ink),0 10u 22u rgba(0,0,0,.45)}
.minimap svg{position:absolute;inset:6u;width:calc(100% - 12u);height:calc(100% - 12u)}
.mm-dot{stroke:var(--ink);stroke-width:1.4}
.mm-me{stroke:#fff;stroke-width:2}
.mm-ring{fill:none;stroke:var(--yellow);stroke-width:1.6;transform-box:fill-box;transform-origin:center;animation:mmPing 1.3s ease-out infinite}
@keyframes mmPing{from{transform:scale(.7);opacity:1}to{transform:scale(2.3);opacity:0}}

/* bottom-left: lap + speedometer */
.hud-bl{left:max(env(safe-area-inset-left),24u);bottom:max(env(safe-area-inset-bottom),14u);display:flex;flex-direction:column;align-items:flex-start;gap:8u}
.lapchip{display:flex;align-items:baseline;gap:8u;padding:5u 18u 5u 16u}
.lapchip small{font-size:10f;letter-spacing:.2em;font-weight:900;color:var(--cyan)}
.lapchip b{font-family:var(--font-display);font-style:italic;font-weight:900;font-size:26f;line-height:1;text-shadow:0 3u 0 rgba(0,0,0,.4)}
.lapchip em{font-family:var(--font-display);font-style:italic;font-weight:900;font-size:15f;opacity:.8}
.lapchip.final b{color:var(--yellow)}
.speedo{position:relative;width:146u;height:96u}
.speedo svg{position:absolute;left:0;top:0;width:146u;height:96u}
.sp-track{fill:none;stroke:var(--ink);stroke-width:15;stroke-linecap:round}
.sp-back{fill:none;stroke:rgba(255,248,236,.22);stroke-width:9;stroke-linecap:round}
.sp-fill{fill:none;stroke:var(--cyan);stroke-width:9;stroke-linecap:round;transition:stroke .2s}
.sp-tick{stroke:rgba(255,248,236,.5);stroke-width:1.6;stroke-linecap:round}
.speedo[data-hot="1"] .sp-fill{stroke:var(--yellow)}
.speedo[data-hot="2"] .sp-fill{stroke:#FF8A3D}
.speedo[data-hot="3"] .sp-fill{stroke:var(--red)}
.speedo.boosting .sp-fill{stroke:var(--magenta);filter:drop-shadow(0 0 5px var(--magenta))}
.sp-num{position:absolute;left:0;right:0;top:34u;text-align:center;font-family:var(--font-display);font-style:italic;font-weight:900;font-size:40f;line-height:1;font-variant-numeric:tabular-nums;text-shadow:${ring(2, 'var(--ink)', 3)}}
.sp-unit{position:absolute;left:0;right:0;top:74u;text-align:center;font-size:10f;font-weight:900;letter-spacing:.22em;color:var(--cyan);text-shadow:0 2u 0 rgba(0,0,0,.5)}
.sp-class{position:absolute;left:0;right:0;top:85u;text-align:center;font-family:var(--font-display);font-style:italic;font-size:10f;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:var(--yellow);text-shadow:0 2u 0 rgba(0,0,0,.55);white-space:nowrap}
.sp-class:empty{display:none}
.speedo[data-cls="50"] .sp-class{color:#9FD8FF}
.speedo[data-cls="150"] .sp-class{color:#FFB020}
.speedo[data-cls="200"] .sp-class{color:#FF5C6A}

/* bottom-right: position */
.hud-br{right:max(env(safe-area-inset-right),24u);bottom:max(env(safe-area-inset-bottom),10u)}
.place{position:relative;display:flex;align-items:flex-start;line-height:.82;transform-origin:100% 100%;color:var(--paper)}
.place .pn{font-family:var(--font-display);font-style:italic;font-weight:900;font-size:124f;letter-spacing:-.03em;text-shadow:${ring(4, 'var(--ink)', 8)}}
.place .pcol{display:flex;flex-direction:column;align-items:flex-start;margin:12u 0 0 3u;line-height:1}
.place .ps{font-family:var(--font-display);font-style:italic;font-weight:900;font-size:38f;text-shadow:${ring(2.6, 'var(--ink)', 4)}}
.place .po{margin:6u 0 0 2u;font-family:var(--font-display);font-style:italic;font-weight:900;font-size:16f;letter-spacing:.06em;color:var(--paper);opacity:.9;text-shadow:${ring(1.6, 'var(--ink)', 2)}}
.place[data-p="1"]{color:var(--yellow);filter:drop-shadow(0 0 10u rgba(255,209,102,.55))}
.place[data-p="2"]{color:var(--silver)}
.place[data-p="3"]{color:var(--bronze)}
.place-delta{position:absolute;left:-30u;top:14u;width:26u;height:26u;opacity:0}
.place-delta.up{color:var(--green)}.place-delta.down{color:#FF6B78}

/* bottom-centre: drift meter, boost */
.hud-bc{left:50%;bottom:max(env(safe-area-inset-bottom),14u);margin-left:-105u;width:210u;display:flex;flex-direction:column;align-items:center;gap:6u}
.drift{position:relative;width:100%;opacity:.0;transform:translateY(8u) scale(.92);transition:opacity .2s,transform .25s var(--spring)}
.drift.on{opacity:1;transform:none}
.drift-bar{display:flex;gap:6u}
.drift-bar i{position:relative;flex:1;height:15u;border-radius:5u;transform:skewX(-20deg);background:rgba(6,18,42,.85);border:3u solid var(--paper);overflow:hidden}
.drift-bar i::after{content:"";position:absolute;inset:0;transform:scaleX(var(--f,0));transform-origin:0 50%;background:var(--c)}
.drift-bar i:nth-child(1){--c:linear-gradient(180deg,#9CF0FF,#22D3EE 60%,#0E9CB8)}
.drift-bar i:nth-child(2){--c:linear-gradient(180deg,#FFE08A,#FFB020 60%,#D98700)}
.drift-bar i:nth-child(3){--c:linear-gradient(180deg,#FF9AEA,#FF3DCB 60%,#C4149A)}
.drift-bar i.lit{border-color:#fff;box-shadow:0 0 14u var(--gc,#22D3EE)}
.drift-bar i:nth-child(1){--gc:#22D3EE}.drift-bar i:nth-child(2){--gc:#FFB020}.drift-bar i:nth-child(3){--gc:#FF3DCB}
.drift-lbl{margin-top:5u;text-align:center;font-family:var(--font-display);font-style:italic;font-weight:900;font-size:13f;letter-spacing:.2em;text-transform:uppercase;text-shadow:${ring(1.4, 'var(--ink)', 0)}}
.drift[data-level="1"] .drift-lbl{color:#22D3EE}.drift[data-level="2"] .drift-lbl{color:#FFB020}
.drift[data-level="3"] .drift-lbl{color:#FF3DCB;animation:pulse .35s linear infinite}
.boost{position:relative;display:flex;align-items:center;gap:8u;opacity:0;transform:scale(.8);transition:opacity .15s,transform .25s var(--spring)}
.boost.on{opacity:1;transform:none}
.boost .glyph{width:24u;height:24u;color:#FF8A1F;filter:drop-shadow(0 0 8u rgba(255,138,31,.9));animation:flick .18s linear infinite alternate}
.boost.fibre .glyph{color:var(--magenta);filter:drop-shadow(0 0 8u rgba(255,61,203,.9))}
.boost-bar{width:120u;height:9u;border-radius:99u;transform:skewX(-20deg);background:rgba(6,18,42,.85);border:2u solid var(--paper);overflow:hidden}
.boost-bar i{display:block;height:100%;width:100%;transform-origin:0 50%;transform:scaleX(var(--f,1));background:linear-gradient(180deg,#FFE08A,#FF8A1F)}
.boost.fibre .boost-bar i{background:linear-gradient(180deg,#FF9AEA,var(--magenta))}
@keyframes flick{from{transform:scale(1) rotate(-3deg)}to{transform:scale(1.18) rotate(3deg)}}

/* effects layer: countdown, banners, wrong way, finish */
.fx{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.smear{position:absolute;inset:0;opacity:0;transition:opacity .12s linear;background:radial-gradient(ellipse 34% 26% at 24% 30%,rgba(110,170,20,.92),rgba(80,140,16,.7) 55%,transparent 72%),radial-gradient(ellipse 30% 30% at 74% 38%,rgba(120,180,24,.9),rgba(84,140,18,.68) 55%,transparent 72%),radial-gradient(ellipse 40% 22% at 50% 72%,rgba(98,160,18,.88),rgba(72,124,14,.6) 58%,transparent 75%),linear-gradient(180deg,rgba(100,160,20,.5),rgba(100,160,20,.12) 45%,transparent 70%)}
.count{position:absolute;left:0;right:0;top:20%;display:flex;flex-direction:column;align-items:center;gap:14u}
.count-num{font-family:var(--font-display);font-style:italic;font-weight:900;font-size:190f;line-height:.9;color:var(--c,#fff);text-shadow:${ring(6, 'var(--ink)', 12)};animation:cnt 1s cubic-bezier(.2,.9,.2,1) both}
.count-num.go{font-size:150f;letter-spacing:.02em}
@keyframes cnt{0%{opacity:0;transform:scale(2.6) rotate(-10deg)}18%{opacity:1;transform:scale(.94) rotate(2deg)}30%{transform:scale(1.04) rotate(0)}70%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(.7) translateY(-16u)}}
.count-burst{position:absolute;left:50%;top:44%;width:460u;height:460u;margin:-230u 0 0 -230u;border-radius:50%;opacity:0;
  background:repeating-conic-gradient(from 0deg,var(--c,#fff) 0 6deg,transparent 6deg 18deg);-webkit-mask-image:radial-gradient(closest-side,transparent 30%,#000 32%,transparent 100%);mask-image:radial-gradient(closest-side,transparent 30%,#000 32%,transparent 100%);animation:burst .9s ease-out both}
@keyframes burst{0%{opacity:.9;transform:scale(.3) rotate(0)}100%{opacity:0;transform:scale(1.5) rotate(40deg)}}
.lights{display:flex;gap:14u;padding:8u 18u;border-radius:99u;background:var(--ink);border:3u solid var(--paper);box-shadow:0 5u 0 rgba(0,0,0,.4)}
.lights i{width:24u;height:24u;border-radius:50%;background:#2A3350;border:3u solid #0B1226;transition:background .1s,box-shadow .1s}
.lights i.red{background:var(--red);box-shadow:0 0 16u var(--red)}
.lights i.green{background:#3DFF7B;box-shadow:0 0 18u #3DFF7B}
.banners{position:absolute;left:0;right:0;top:18%;display:flex;flex-direction:column;align-items:center;gap:10u}
.banner{position:relative;isolation:isolate;padding:8u 46u 10u 40u;text-align:center;animation:banner var(--ms,1900ms) both}
.banner::before{content:"";position:absolute;inset:0;z-index:-1;transform:skewX(-14deg);border-radius:8u;border:4u solid var(--paper);box-shadow:0 7u 0 var(--ink),0 14u 30u rgba(0,0,0,.4);background:linear-gradient(180deg,var(--navy-3),var(--navy))}
.banner-t{display:flex;align-items:center;justify-content:center;gap:12u;font-family:var(--font-display);font-style:italic;font-weight:900;font-size:40f;line-height:1;letter-spacing:.03em;text-transform:uppercase;text-shadow:${ring(2, 'var(--ink)', 3)}}
.banner-t .glyph{width:36u;height:36u}
.banner-s{margin-top:3u;font-family:var(--font-display);font-style:italic;font-weight:900;font-size:14f;letter-spacing:.14em;opacity:.95}
.banner.k-final::before{background:linear-gradient(180deg,#FFF3C0,var(--yellow) 55%,var(--yellow-d));border-color:var(--ink)}
.banner.k-final .banner-t{color:var(--red);text-shadow:${ring(2, 'var(--ink)', 3)}}
.banner.k-final .banner-s{color:var(--ink)}
.banner.k-wrong::before,.banner.k-bad::before{background:linear-gradient(180deg,#F25A66,var(--red) 55%,var(--red-d))}
.banner.k-best::before{background:linear-gradient(180deg,#8BEAFB,var(--cyan) 55%,var(--cyan-d));border-color:var(--ink)}
.banner.k-best .banner-t{color:#fff}
.banner.k-best .banner-s{color:var(--ink)}
.banner.k-good::before{background:linear-gradient(180deg,#8CF0B6,var(--green) 55%,#1FA35B);border-color:var(--ink)}
.banner.k-lap .banner-t{font-size:30f}
.pops{position:absolute;left:0;right:0;top:56%;display:flex;flex-direction:column;align-items:center;gap:4u}
.pop{text-align:center;animation:popUp var(--ms,1100ms) both;will-change:transform,opacity}
.pop-t{font-family:var(--font-display);font-style:italic;font-weight:900;font-size:34f;line-height:1;letter-spacing:.04em;text-transform:uppercase;color:var(--yellow);text-shadow:${ring(2, 'var(--ink)', 3)},0 0 18u rgba(255,209,102,.75)}
.pop-s{margin-top:2u;font-family:var(--font-display);font-style:italic;font-weight:900;font-size:13f;letter-spacing:.16em;color:#fff;text-shadow:0 2u 0 var(--ink)}
.pop.k-jump .pop-t{font-size:38f;color:#FFE066;text-shadow:${ring(2.4, 'var(--ink)', 3)},0 0 22u rgba(255,170,40,.85),0 6u 0 var(--ink)}
.pop.k-good .pop-t{color:#8CF0B6}
@keyframes popUp{0%{opacity:0;transform:translateY(18u) scale(.4) rotate(-6deg)}14%{opacity:1;transform:translateY(0) scale(1.22) rotate(2deg)}26%{transform:scale(.97) rotate(0)}38%{transform:scale(1)}78%{opacity:1;transform:translateY(-8u) scale(1)}100%{opacity:0;transform:translateY(-34u) scale(.92)}}
@keyframes banner{0%{opacity:0;transform:translateX(-120vw) skewX(20deg)}10%{opacity:1;transform:translateX(16u) skewX(-4deg)}16%{transform:translateX(-6u)}21%{transform:none}84%{opacity:1;transform:none}100%{opacity:0;transform:translateX(120vw) skewX(-20deg)}}
.wrong{position:absolute;left:0;right:0;top:32%;display:none;justify-content:center}
.wrong.on{display:flex}
.wrong::before{content:"";position:fixed;inset:0;background:radial-gradient(90% 90% at 50% 50%,rgba(230,57,70,0) 55%,rgba(230,57,70,.5) 100%);animation:pulse .7s ease-in-out infinite}
.wrong-in{position:relative;isolation:isolate;display:flex;align-items:center;gap:14u;padding:10u 34u;font-family:var(--font-display);font-style:italic;font-weight:900;font-size:36f;letter-spacing:.04em;text-transform:uppercase;text-shadow:${ring(2, 'var(--ink)', 3)};animation:wrongShake .5s ease-in-out infinite}
.wrong-in::before{content:"";position:absolute;inset:0;z-index:-1;transform:skewX(-14deg);border-radius:8u;border:4u solid var(--paper);background:repeating-linear-gradient(-45deg,var(--red) 0 14u,var(--red-d) 14u 28u);box-shadow:0 7u 0 var(--ink)}
.wrong-in .glyph{width:34u;height:34u;color:var(--yellow);animation:pulse .5s linear infinite}
@keyframes wrongShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-4u)}75%{transform:translateX(4u)}}
.finish{position:absolute;left:0;right:0;top:12%;display:none;flex-direction:column;align-items:center;animation:none}
.finish.on{display:flex;animation:finishIn .7s var(--spring) both}
.finish-band{position:relative;width:100%;padding:10u 0 12u;text-align:center;background:linear-gradient(180deg,rgba(230,57,70,.96),rgba(179,32,45,.96));border-top:4u solid var(--paper);border-bottom:4u solid var(--paper);box-shadow:0 8u 0 rgba(0,0,0,.35)}
.finish-band::before,.finish-band::after{content:"";position:absolute;left:0;right:0;height:12u;background:repeating-conic-gradient(#0B1D3A 0 25%,#FFF8EC 0 50%) 0 0/24u 24u}
.finish-band::before{top:-16u}.finish-band::after{bottom:-16u}
.finish-t{font-family:var(--font-display);font-style:italic;font-weight:900;font-size:60f;line-height:1;letter-spacing:.03em;text-shadow:${ring(3.4, 'var(--ink)', 5)}}
.finish-s{margin-top:4u;font-family:var(--font-display);font-style:italic;font-weight:900;font-size:18f;letter-spacing:.12em;color:var(--yellow);text-shadow:${ring(2, 'var(--ink)', 2)}}
@keyframes finishIn{from{opacity:0;transform:scaleY(.1) scaleX(1.3)}to{opacity:1;transform:none}}

/* phone layout: the touch pad, brake, item and drift buttons own the bottom corners, so lap and speed move up and the place moves under the minimap */
.touch .pause-btn{width:max(40px,44u);height:max(40px,44u)}
.touch .hud-bl{left:50%;margin-left:-70u;bottom:auto;top:max(env(safe-area-inset-top),12u);flex-direction:row;align-items:center;gap:8u}
.touch .speedo{width:70u;height:40u}
.touch .speedo svg{display:none}
.touch .sp-num{top:0;font-size:32f}
.touch .sp-unit{top:33u;font-size:9f}
.touch .hud-br{bottom:auto;top:calc(max(env(safe-area-inset-top),16u) + 128u)}
.touch .place .pn{font-size:76f}
.touch .place .ps{font-size:24f}
.touch .place .po{font-size:11f}
.touch .hud-bc{bottom:max(env(safe-area-inset-bottom),8u)}
@media (max-height:460px){
  .sn{display:none}.standings{width:66u}.srow .spt{width:13u}
  .timer{min-width:130u}.laps{display:none}
  .hud-bc{bottom:max(env(safe-area-inset-bottom),8u)}
}
`;
