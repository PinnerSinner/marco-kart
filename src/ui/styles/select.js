// Styles for the selection flow: character, kart, difficulty and track screens.
import { ring } from './util.js';

export const selectCss = () => `
.sel-body{gap:22u;min-height:0}
.sel-left{flex:0 0 auto;width:min(452u,50%);display:flex;flex-direction:column;gap:14u;min-height:0}
.sel-right{flex:1;min-width:0;display:flex;min-height:0}

/* character cards */
.char-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12u}
.card{position:relative;isolation:isolate;display:flex;flex-direction:column;align-items:stretch;gap:5u;padding:5u 5u 6u;text-align:center;transition:transform .18s var(--spring)}
.card::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:12u;background:linear-gradient(180deg,rgba(29,64,121,.96),rgba(11,29,58,.96));border:3u solid rgba(255,248,236,.55);box-shadow:0 5u 0 var(--ink);transition:background .12s,border-color .12s,box-shadow .12s}
.card .pt{border-radius:18%;border-width:3u}
.card-n{font-family:var(--font-display);font-style:italic;font-weight:900;font-size:10f;line-height:1.05;letter-spacing:.02em;text-transform:uppercase;min-height:2.1em;display:grid;place-items:center;text-shadow:0 2u 0 rgba(0,0,0,.4)}
.card.is-focus{transform:translateY(-6u) scale(1.05);z-index:3}
.card.is-focus::before{background:linear-gradient(180deg,#FFF3C0,var(--yellow) 60%,var(--yellow-d));border-color:var(--ink);box-shadow:0 5u 0 var(--ink),0 0 0 3u var(--paper),0 0 22u rgba(255,209,102,.75)}
.card.is-focus .card-n{color:var(--ink);text-shadow:none}
.card.picked::after{content:"";position:absolute;right:-5u;top:-5u;width:16u;height:16u;border-radius:50%;background:var(--green) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M5 12.8 9.6 17.5 19 6.5' fill='none' stroke='%230B1D3A' stroke-width='4.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/70% no-repeat;border:2.4u solid var(--ink)}
.blurb-panel{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:5u}
.bp-name{font-size:22f;line-height:1;text-shadow:${ring(1.4, 'var(--ink)', 2)}}
.bp-title{font-size:11f;font-weight:900;letter-spacing:.16em;text-transform:uppercase;color:var(--cyan)}
.bp-text{font-size:13f;line-height:1.3;font-weight:700;opacity:.95}
.custom-hint{font-size:10f;opacity:.75;font-weight:700}

/* preview panel with the live 3D turntable */
.pv{position:relative;isolation:isolate;flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;justify-content:space-between;padding:14u 18u;overflow:hidden;--pc:#E63946}
.pv::before{content:"";position:absolute;inset:0;z-index:-3;border-radius:14u;background:linear-gradient(180deg,rgba(29,64,121,.96),rgba(6,18,42,.98));border:4u solid var(--paper);box-shadow:0 7u 0 var(--ink),0 12u 30u rgba(0,0,0,.45)}
.pv-rays{position:absolute;inset:4u;z-index:-2;border-radius:10u;overflow:hidden;background:radial-gradient(70% 60% at 50% 55%,color-mix(in srgb,var(--pc) 55%,transparent),transparent 72%)}
.pv-rays::before{content:"";position:absolute;left:50%;top:56%;width:220%;aspect-ratio:1;margin:-110% 0 0 -110%;background:repeating-conic-gradient(color-mix(in srgb,var(--pc) 34%,transparent) 0 6deg,transparent 6deg 18deg);
  -webkit-mask-image:radial-gradient(closest-side,#000 0,transparent 70%);mask-image:radial-gradient(closest-side,#000 0,transparent 70%);animation:spin 40s linear infinite}
.tt{position:absolute;inset:4u 4u 78u 4u;z-index:-1;border-radius:10u;overflow:hidden;cursor:grab}
.tt-canvas{width:100%;height:100%;display:block;touch-action:pan-y}
.tt-fallback{position:absolute;inset:0;display:grid;place-items:center;padding:20u}
.tt-fallback .kart-art{width:78%;filter:drop-shadow(0 8u 0 rgba(0,0,0,.35))}
.tt-fallback .pt{position:absolute;width:26%;left:36%;top:16%;border-radius:50%}
.pv-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10u}
.pv-name{font-size:28f;line-height:.95;text-shadow:${ring(2, 'var(--ink)', 3)}}
.pv-sub{margin-top:5u;font-size:11f;font-weight:900;letter-spacing:.18em;text-transform:uppercase;color:var(--yellow);text-shadow:0 2u 0 rgba(0,0,0,.6)}
.pv-badge{display:flex;flex-direction:column;align-items:flex-end;gap:5u}
.pv-stats{width:100%;padding:9u 14u;border-radius:10u;background:rgba(6,18,42,.72);border:2u solid rgba(255,248,236,.25);backdrop-filter:blur(2px)}
.pv-stats .stats{display:grid;grid-template-columns:1fr 1fr;gap:7u 22u}
.pv-photo{position:absolute;right:18u;top:56u;width:70u;z-index:1}
.pv-photo .pt{border-radius:50%;border:3u solid var(--paper);box-shadow:0 4u 0 var(--ink)}
.pv-drag{position:absolute;right:20u;bottom:96u;font-size:10f;font-weight:800;letter-spacing:.14em;text-transform:uppercase;opacity:.55}
.pv-bottom{display:flex;justify-content:space-between;align-items:flex-end;gap:12u}

/* kart list cards */
.kart-list{display:flex;flex-direction:column;gap:9u;min-height:0}
.kcard{position:relative;isolation:isolate;display:flex;align-items:center;gap:12u;padding:7u 14u 7u 10u;min-height:76u;text-align:left;transition:transform .18s var(--spring)}
.kcard::before{content:"";position:absolute;inset:0;z-index:-1;transform:skewX(-6deg);border-radius:12u;background:linear-gradient(180deg,rgba(29,64,121,.96),rgba(11,29,58,.96));border:3u solid rgba(255,248,236,.55);box-shadow:0 5u 0 var(--ink);transition:background .12s,border-color .12s,box-shadow .12s}
.kcard .kart-art{width:104u;flex:none;filter:drop-shadow(0 3u 0 rgba(0,0,0,.35))}
.kc-body{flex:1;min-width:0}
.kc-n{font-family:var(--font-display);font-style:italic;font-weight:900;font-size:15f;text-transform:uppercase;line-height:1.05}
.kc-b{margin-top:2u;font-size:11f;line-height:1.2;font-weight:700;opacity:.88}
.pv-feel{margin-top:5u;max-width:330u;font-size:12.5f;line-height:1.25;font-weight:800;text-shadow:0 2u 0 rgba(0,0,0,.45)}
.pv-feel:empty{display:none}
.pv-feel small{display:block;margin-top:4u;font-size:10.5f;line-height:1.25;font-weight:700;opacity:.9}
.pv-feel small b{color:var(--yellow);font-family:var(--font-display);font-style:italic;letter-spacing:.05em;text-transform:uppercase}
.kc-mods{display:flex;gap:5u;margin-top:5u;flex-wrap:wrap}
.chip{display:inline-flex;gap:4u;align-items:center;padding:1u 7u;border-radius:99u;font-family:var(--font-display);font-style:italic;font-weight:900;font-size:9f;letter-spacing:.06em;text-transform:uppercase;background:rgba(6,18,42,.8);border:2u solid rgba(255,248,236,.35)}
.chip.up{background:var(--green);color:var(--ink);border-color:var(--ink)}
.chip.down{background:var(--red);border-color:var(--ink)}
.kcard.is-focus{transform:translateX(10u)}
.kcard.is-focus::before{background:linear-gradient(180deg,#FFF3C0,var(--yellow) 60%,var(--yellow-d));border-color:var(--ink);box-shadow:0 5u 0 var(--ink),0 0 0 3u var(--paper),0 0 22u rgba(255,209,102,.7)}
.kcard.is-focus{color:var(--ink)}
.kcard.is-focus .chip{color:var(--paper)}
.kcard.is-focus .chip.up{color:var(--ink)}

/* difficulty */
.diff-body{align-items:center;justify-content:center;gap:22u}
.diff-card{position:relative;isolation:isolate;flex:1;max-width:280u;display:flex;flex-direction:column;align-items:center;gap:8u;padding:20u 16u 16u;text-align:center;transition:transform .22s var(--spring)}
.diff-card::before{content:"";position:absolute;inset:0;z-index:-1;transform:skewX(-5deg);border-radius:16u;background:linear-gradient(180deg,rgba(29,64,121,.97),rgba(11,29,58,.97));border:4u solid rgba(255,248,236,.55);box-shadow:0 8u 0 var(--ink),0 14u 28u rgba(0,0,0,.4);transition:background .14s,border-color .14s,box-shadow .14s}
.diff-badge{width:92u;height:92u}
.diff-badge svg{width:100%;height:100%}
.diff-n{font-size:24f;line-height:1;text-shadow:${ring(1.6, 'var(--ink)', 2)}}
.diff-t{font-size:11f;font-weight:900;letter-spacing:.16em;text-transform:uppercase;color:var(--cyan)}
.diff-p{font-size:12.5f;line-height:1.32;font-weight:700;opacity:.95;min-height:5.3em}
.diff-pips{display:flex;gap:6u;align-items:center;font-size:10f;font-weight:900;letter-spacing:.14em}
.diff-pips i{width:20u;height:12u;border-radius:3u;transform:skewX(-16deg);background:rgba(6,18,42,.8);border:2u solid rgba(255,248,236,.4)}
.diff-pips i.on{background:var(--tier);border-color:var(--ink)}
.diff-card{--tier:var(--cyan)}
.diff-card[data-id="professional"]{--tier:var(--yellow)}
.diff-card[data-id="specialty"]{--tier:var(--red)}
.diff-card .tag{position:absolute;top:-10u;left:50%;transform:translateX(-50%) skewX(0);white-space:nowrap}
.diff-card.is-focus{transform:translateY(-14u) scale(1.05)}
.diff-card.is-focus::before{border-color:var(--tier);box-shadow:0 8u 0 var(--ink),0 0 0 3u var(--paper),0 0 34u color-mix(in srgb,var(--tier) 75%,transparent);background:linear-gradient(180deg,#2C5BB0,var(--navy-3) 55%,var(--navy-2))}
.diff-card.picked::after{content:"LAST PICK";position:absolute;bottom:-11u;left:50%;transform:translateX(-50%);padding:2u 10u;border-radius:99u;background:var(--ink);border:2u solid rgba(255,248,236,.5);font-size:9f;font-weight:900;letter-spacing:.14em}

/* track */
.trk-body{flex-direction:column;justify-content:center;gap:18u;min-height:0}
.trk-row{display:grid;grid-template-columns:repeat(4,1fr);gap:14u;flex:none}
.tcard{position:relative;isolation:isolate;display:flex;flex-direction:column;text-align:left;padding:5u 5u 7u;transition:transform .2s var(--spring)}
.tcard::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:13u;background:linear-gradient(180deg,rgba(29,64,121,.97),rgba(11,29,58,.97));border:3u solid rgba(255,248,236,.55);box-shadow:0 6u 0 var(--ink);transition:background .12s,border-color .12s,box-shadow .12s}
.tcard-art{position:relative;aspect-ratio:240/150;border-radius:9u;overflow:hidden;border:3u solid var(--ink)}
.tcard-art svg{width:100%;height:100%;display:block}
.tcard-n{margin:6u 4u 0;font-family:var(--font-display);font-style:italic;font-weight:900;font-size:12.5f;line-height:1.05;text-transform:uppercase}
.tcard-b{margin:3u 4u 0;display:flex;justify-content:space-between;align-items:center;gap:6u;font-size:10.5f;font-weight:800}
.tcard-b .tv{font-variant-numeric:tabular-nums;color:var(--yellow)}
.tcard-tags{display:flex;gap:4u;margin:5u 4u 0;flex-wrap:wrap}
.tcard.is-focus{transform:translateY(-8u) scale(1.04);z-index:2}
.tcard.is-focus::before{background:linear-gradient(180deg,#2C5BB0,var(--navy-3) 55%,var(--navy-2));border-color:var(--yellow);box-shadow:0 6u 0 var(--ink),0 0 0 3u var(--ink),0 0 26u rgba(255,209,102,.7)}
.tcard.locked{filter:grayscale(.85) brightness(.75)}
.tcard.locked .tcard-art::after{content:"COMING SOON";position:absolute;inset:0;display:grid;place-items:center;background:rgba(6,18,42,.6);font-family:var(--font-display);font-style:italic;font-weight:900;font-size:14f;letter-spacing:.1em}
.tcard.picked::after{content:"";position:absolute;right:-5u;top:-5u;width:16u;height:16u;border-radius:50%;background:var(--green);border:2.4u solid var(--ink)}
.trk-detail{display:grid;grid-template-columns:1fr auto;gap:20u;align-items:center;flex:none;min-height:0;padding:14u 24u}
.td-l{min-width:0}
.td-n{font-size:22f;line-height:1;text-shadow:${ring(1.4, 'var(--ink)', 2)}}
.td-b{margin-top:6u;font-size:12.5f;line-height:1.3;font-weight:700;opacity:.95}
.td-times{display:flex;gap:18u;margin-top:8u}
.td-times div{display:flex;flex-direction:column;font-size:9.5f;font-weight:900;letter-spacing:.16em;text-transform:uppercase;color:var(--cyan)}
.td-times b{font-family:var(--font-display);font-style:italic;font-size:16f;letter-spacing:.02em;color:var(--paper);font-variant-numeric:tabular-nums}
.laps-pick{display:flex;flex-direction:column;align-items:flex-end;gap:6u}
.laps-pick .lbl{font-size:10f;font-weight:900;letter-spacing:.18em;text-transform:uppercase;color:var(--cyan)}
.laps-pick .seg{flex:none;min-width:200u}
.laps-pick .seg button{min-width:42u;min-height:32u}
.laps-pick .seg button.is-focus{outline:0;box-shadow:0 0 0 3u var(--yellow),0 0 18u rgba(255,209,102,.7)}
.td-r{display:flex;gap:26u;align-items:flex-end}
.speed-pick{display:flex;flex-direction:column;gap:6u;align-items:flex-end}
.sp-row{display:flex;flex-direction:column;align-items:flex-end;gap:6u}
.sp-row .lbl{font-size:10f;font-weight:900;letter-spacing:.18em;text-transform:uppercase;color:var(--cyan)}
.sp-row .seg{flex:none;min-width:236u}
.sp-row .seg button{min-width:50u;min-height:32u}
.sp-row .seg button.is-focus{outline:0;box-shadow:0 0 0 3u var(--yellow),0 0 18u rgba(255,209,102,.7)}
.sp-cap{max-width:300u;text-align:right;font-size:11f;line-height:1.25;font-weight:700;opacity:.95}
.sp-cap b{font-family:var(--font-display);font-style:italic;font-weight:900;letter-spacing:.04em;color:var(--yellow)}
.speed-pick[data-speed="50"] .sp-cap b{color:#9FD8FF}
.speed-pick[data-speed="150"] .sp-cap b{color:#FFB020}
.speed-pick[data-speed="200"] .sp-cap b{color:#FF5C6A}
.diff-body{flex-wrap:wrap;align-content:center}
.diff-body .speed-pick{flex:0 0 100%;flex-direction:row;justify-content:center;align-items:center;gap:22u;margin-top:10u}
.diff-body .sp-row{flex-direction:row;align-items:center;gap:14u}
.diff-body .sp-cap{text-align:left}
@media (max-height:460px){
  .char-grid{gap:8u}.card-n{font-size:9f}.blurb-panel{display:none}.pv{padding:10u 14u}.pv-stats{padding:6u 10u}.stats{gap:4u}.tt{inset:4u 4u 64u 4u}.pv-drag{display:none}
  .kcard{min-height:64u}.kc-b{display:none}.diff-p{min-height:0}
  .pv-feel small{display:none}.pv-feel{max-width:58%;font-size:11.5f}.pv-stats .stat-l{white-space:nowrap;font-size:9.5f}
  .speed-pick{gap:3u}.sp-cap{font-size:10f}
  .trk-detail{padding:8u 16u}
}
`;
