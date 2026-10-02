// Styles for race results, GP standings and the podium.
import { ring } from './util.js';

export const resultsCss = () => `
.res-body{gap:22u;min-height:0}
.res-table{flex:1.6;min-width:0;align-self:flex-start;display:flex;flex-direction:column;gap:5u;padding:12u 16u}
.res-row{position:relative;isolation:isolate;display:grid;grid-template-columns:44u 30u 1.5fr 1fr 1fr 44u;gap:10u;align-items:center;min-height:32u;padding:0 12u 0 6u;font-size:12.5f;font-weight:800}
.res-row.head{min-height:20u;font-size:9.5f;letter-spacing:.2em;text-transform:uppercase;color:var(--cyan);font-weight:900}
.res-row:not(.head)::before{content:"";position:absolute;inset:0;z-index:-1;transform:skewX(-12deg);border-radius:6u;background:rgba(6,18,42,.6);border:2u solid rgba(255,248,236,.2)}
.res-row.me{color:var(--ink)}
.res-row.me::before{background:linear-gradient(180deg,#FFF3C0,var(--yellow) 60%,var(--yellow-d));border-color:var(--ink);box-shadow:0 3u 0 var(--ink),0 0 20u rgba(255,209,102,.5)}
.res-row.dnf .rt.strong{opacity:.6}
.res-row:not(.head):nth-child(2)::before{border-color:rgba(255,209,102,.7)}
.res-row.head .rp{font-size:9.5f}
.rp{font-size:17f;text-align:center;line-height:1;letter-spacing:0}
.rp small{font-size:.55em;margin-left:1u}
.rp.m1{color:var(--yellow);text-shadow:${ring(1.2, 'var(--ink)', 0)}}.rp.m2{color:var(--silver);text-shadow:${ring(1.2, 'var(--ink)', 0)}}.rp.m3{color:var(--bronze);text-shadow:${ring(1.2, 'var(--ink)', 0)}}
.res-row.me .rp{color:var(--ink);text-shadow:none}
.rpt{display:block;width:26u}
.rpt .pt{border-width:2u;border-radius:30%}
.rn{display:flex;align-items:center;gap:8u;min-width:0}
.rn>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rt{font-variant-numeric:tabular-nums;text-align:right;font-size:12f}
.rt.strong{font-weight:900}
.rpts{text-align:right;font-size:14f}
.res-empty{padding:20u;text-align:center;opacity:.7}
.res-side{flex:1;min-width:0;display:flex;flex-direction:column;gap:18u;align-self:flex-start;max-width:330u}
.res-me{display:flex;align-items:center;gap:14u;padding:14u 18u}
.res-me-pt{width:78u;flex:none}
.res-me-pt .pt{border-radius:50%;border:4u solid var(--paper);box-shadow:0 5u 0 var(--ink)}
.res-me-t small{font-size:10f;font-weight:900;letter-spacing:.2em;color:var(--cyan)}
.res-me-p{font-size:52f;line-height:.95;text-shadow:${ring(2.4, 'var(--ink)', 4)};color:var(--yellow)}
.res-me-p small{font-size:.42em;margin-left:2u}
.res-me-time{font-family:var(--font-display);font-style:italic;font-weight:900;font-size:16f;font-variant-numeric:tabular-nums;margin-top:2u}
.res-tags{display:flex;flex-wrap:wrap;gap:5u;margin-top:7u}
.res-btns{display:flex;flex-direction:column;gap:11u}

/* GP standings */
.st-list{flex:1.7;min-width:0;align-self:flex-start;padding:12u 16u}
.st-rows{position:relative}
.st-row{position:absolute;left:0;right:0;top:0;isolation:isolate;display:grid;grid-template-columns:30u 30u 1.3fr 1.4fr 40u 40u;gap:10u;align-items:center;height:calc(var(--u)*34);padding:0 12u 0 4u;font-size:12.5f;font-weight:800;
  transform:translateY(calc(var(--y)*var(--u)*var(--rowh)));transition:transform .9s cubic-bezier(.3,1.25,.4,1)}
.st-row::before{content:"";position:absolute;inset:0;z-index:-1;transform:skewX(-12deg);border-radius:6u;background:rgba(6,18,42,.6);border:2u solid rgba(255,248,236,.2)}
.st-row.me{color:var(--ink)}
.st-row.me::before{background:linear-gradient(180deg,#FFF3C0,var(--yellow) 60%,var(--yellow-d));border-color:var(--ink);box-shadow:0 3u 0 var(--ink)}
.st-bar{height:12u;border-radius:99u;background:rgba(6,18,42,.55);transform:skewX(-14deg);overflow:hidden;border:2u solid rgba(6,18,42,.6)}
.st-bar i{display:block;height:100%;background:linear-gradient(180deg,#8BEAFB,var(--cyan) 55%,var(--cyan-d))}
.st-row.me .st-bar i{background:linear-gradient(180deg,#FF9AA3,var(--red) 55%,var(--red-d))}
.st-pts{text-align:right;font-size:16f}
.st-gain{text-align:right;font-size:11f;color:var(--green)}
.st-row.me .st-gain{color:#0B7A3E}

/* podium */
.pod-body{gap:16u;align-items:flex-end;min-height:0;padding-bottom:4u}
.pod-list{flex:0 0 min(236u,26%);align-self:center;display:flex;flex-direction:column;gap:5u;padding:10u 12u}
.pl-row{position:relative;isolation:isolate;display:grid;grid-template-columns:34u 22u 1fr 22u;gap:6u;align-items:center;min-height:28u;padding:0 8u 0 2u;font-size:11f;font-weight:800}
.pl-row::before{content:"";position:absolute;inset:0;z-index:-1;transform:skewX(-12deg);border-radius:5u;background:rgba(6,18,42,.6);border:1.5u solid rgba(255,248,236,.2)}
.pl-row.me{color:var(--ink)}
.pl-row.me::before{background:linear-gradient(180deg,#FFF3C0,var(--yellow));border-color:var(--ink)}
.pl-row .rp{font-size:13f}
.pl-row .rn{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;display:block}
.pl-row .rpts{font-size:11f}
.pod-stage{flex:1;min-width:0;display:flex;align-items:flex-end;justify-content:center;gap:10u;height:100%}
.pod-col{position:relative;display:flex;flex-direction:column;align-items:center;flex:1;max-width:150u;animation:rise .6s var(--spring) both;animation-delay:calc(var(--i,0)*260ms + 200ms)}
.pod-pt{width:64u;margin-bottom:5u}
.pod-col.p1 .pod-pt{width:82u}
.pod-pt .pt{border-radius:50%;border:4u solid var(--paper);box-shadow:0 5u 0 var(--ink)}
.pod-trophy{position:absolute;top:-56u;width:52u}
.pod-col.p1 .pod-pt{margin-top:42u}
.pod-n{display:flex;flex-direction:column;align-items:center;gap:2u;margin-bottom:6u;font-size:11f;text-align:center;line-height:1.05;text-shadow:${ring(1.2, 'var(--ink)', 2)}}
.pod-block{position:relative;width:100%;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:8u;border:4u solid var(--ink);border-bottom:0;border-radius:10u 10u 0 0;
  background:linear-gradient(180deg,var(--b1),var(--b2));box-shadow:inset 0 0 0 3u rgba(255,255,255,.3)}
.pod-block span{font-size:44f;line-height:1;color:var(--ink)}
.pod-block small{font-size:10f;font-weight:900;letter-spacing:.1em;color:var(--ink);opacity:.8}
.pod-col.p1{--b1:#FFF3B0;--b2:#E0A020}.pod-col.p2{--b1:#FFFFFF;--b2:#A5B4CC}.pod-col.p3{--b1:#FFD3A8;--b2:#C4703A}
.pod-right{flex:0 0 min(244u,27%);display:flex;flex-direction:column;gap:12u;align-self:center}
.pod-card{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6u;padding:14u 16u}
.pod-tr{width:86u;filter:drop-shadow(0 5u 0 rgba(0,0,0,.35))}
.pod-card.tier-gold .pod-tr{animation:glowPulse 1.6s ease-in-out infinite}
.pod-ct small{font-size:10f;font-weight:900;letter-spacing:.2em;color:var(--cyan)}
.pod-tt{font-size:20f;line-height:1.05;margin:3u 0 4u;text-shadow:${ring(1.4, 'var(--ink)', 2)}}
.pod-ct p{margin:0 0 6u;font-size:11.5f;line-height:1.3;font-weight:700}
.pod-me{display:flex;align-items:center;justify-content:center;gap:10u}
.pod-me-pt{display:block;width:44u}
.pod-me-pt .pt{border-radius:50%;border:3u solid var(--paper)}
.pod-me b{display:block;font-size:22f;line-height:1;text-align:left;color:var(--yellow);text-shadow:${ring(1.4, 'var(--ink)', 2)}}
.pod-me small{display:block;font-size:10f;text-align:left;color:var(--paper);letter-spacing:.06em}
.confetti{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:5}
.confetti i{position:absolute;top:-20u;left:var(--x);width:var(--w);height:calc(var(--w)*1.7);background:var(--c);border-radius:1.5u;animation:conf var(--d) linear infinite;animation-delay:var(--dl)}
@keyframes conf{0%{transform:translate3d(0,0,0) rotateX(var(--rx)) rotateZ(0)}100%{transform:translate3d(var(--sw),115vh,0) rotateX(calc(var(--rx) + 720deg)) rotateZ(540deg)}}
@media (max-height:460px){
  .res-row{min-height:26u;font-size:11.5f}.res-table{gap:3u;padding:8u 12u}.rpt{width:20u}
  .pod-pt{width:50u}.pod-col.p1 .pod-pt{width:62u;margin-top:30u}.pod-trophy{width:40u;top:-44u}.pod-list{display:none}
  .st-row{height:calc(var(--u)*30)}
}
`;
