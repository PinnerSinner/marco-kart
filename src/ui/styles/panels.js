// Styles for settings, controls, about and the pause menu.
import { ring } from './util.js';

export const panelsCss = () => `
.ftr-btns{display:flex;gap:12u;align-items:center}
.set-h{margin-bottom:8u;font-size:10.5f;font-weight:900;letter-spacing:.22em;text-transform:uppercase;color:var(--cyan)}

/* settings */
.set-body{gap:26u;align-items:flex-start;min-height:0}
.set-col{flex:1;min-width:0;display:flex;flex-direction:column;gap:6u}
.set-col .row{min-height:39u;padding-top:3u;padding-bottom:3u}
.seg button.is-focus{outline:0}

/* controls */
.ctl-body{gap:20u;min-height:0}
.ctl-table{flex:1.5;min-width:0;align-self:flex-start;display:flex;flex-direction:column;gap:3u;padding:12u 20u}
.ctl-row{display:grid;grid-template-columns:1.1fr 1.4fr 1.2fr;gap:10u;align-items:center;padding:6u 0;border-bottom:2u solid rgba(255,248,236,.14)}
.ctl-row:last-child{border-bottom:0}
.ctl-row.head{padding:0 0 5u;font-size:10f;font-weight:900;letter-spacing:.2em;text-transform:uppercase;color:var(--cyan);border-bottom:3u solid rgba(255,248,236,.3)}
.ctl-a{font-family:var(--font-display);font-style:italic;font-weight:900;font-size:14f;text-transform:uppercase}
.ctl-k{display:flex;flex-wrap:wrap;gap:6u}
.ctl-k .key{min-width:24u;height:24u;font-size:11f}
.ctl-side{flex:1;min-width:0;display:flex;flex-direction:column;gap:16u;align-self:flex-start}
.ctl-pad .pad-art{width:100%;max-width:220u;margin:0 auto 10u}
.pad-legend{display:flex;flex-direction:column;gap:6u;font-size:11.5f;font-weight:800}
.pad-legend span{display:flex;align-items:center;gap:8u}
.ctl-touch p{margin:0;font-size:12f;line-height:1.35;font-weight:700;opacity:.95}

/* about */
.ab-body{gap:26u;min-height:0;align-items:flex-start}
.ab-card{flex:0 0 min(250u,30%);position:relative;display:flex;flex-direction:column;align-items:center}
.ab-photo{position:relative;width:100%;aspect-ratio:1;display:grid;place-items:center}
.ab-burst{position:absolute;inset:-14u;border-radius:50%;background:repeating-conic-gradient(rgba(255,209,102,.5) 0 8deg,transparent 8deg 20deg);-webkit-mask-image:radial-gradient(closest-side,#000 45%,transparent 100%);mask-image:radial-gradient(closest-side,#000 45%,transparent 100%);animation:spin 30s linear infinite}
.ab-img{position:relative;width:88%;aspect-ratio:1;object-fit:cover;border-radius:16u;border:5u solid var(--paper);box-shadow:0 8u 0 var(--ink);transform:rotate(-3deg)}
.ab-toon{position:relative;width:78%;animation:floaty 3.6s ease-in-out infinite}
.ab-toon .pt{border-radius:50%;border:5u solid var(--paper);box-shadow:0 8u 0 var(--ink)}
.ab-face{position:absolute;right:2%;bottom:0;width:32%}
.ab-face .pt{border-radius:50%;border:4u solid var(--paper);box-shadow:0 4u 0 var(--ink)}
.ab-plate{position:relative;isolation:isolate;margin-top:8u;padding:8u 26u 9u;text-align:center}
.ab-plate::before{content:"";position:absolute;inset:0;z-index:-1;transform:skewX(-10deg);border-radius:8u;background:linear-gradient(180deg,#F25A66,var(--red) 55%,var(--red-d));border:3u solid var(--paper);box-shadow:0 5u 0 var(--ink)}
.ab-name{font-size:26f;line-height:1;text-shadow:${ring(1.6, 'var(--ink)', 2)}}
.ab-role{margin-top:3u;font-size:10.5f;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
.ab-flag{position:absolute;right:-12u;top:-12u;width:36u;height:18u;transform:rotate(8deg);border:2.4u solid var(--paper);box-shadow:0 3u 0 var(--ink);border-radius:3u;overflow:hidden}
.ab-flag svg{width:100%;height:100%}
.ab-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:8u;padding:14u 22u}
.ab-text p{margin:0;font-size:12.5f;line-height:1.36;font-weight:700}
.ab-badges{display:flex;flex-wrap:wrap;gap:6u}
.ab-facts{display:grid;grid-template-columns:1fr 1fr;gap:4u 18u;margin-top:2u;padding-top:8u;border-top:2u solid rgba(255,248,236,.2)}
.ab-facts div{display:flex;flex-direction:column;font-size:11.5f;font-weight:800}
.ab-facts b{font-size:9f;letter-spacing:.18em;text-transform:uppercase;color:var(--cyan)}
.ab-quirks{margin:0;padding-left:16u;font-size:11f;font-weight:700;opacity:.92;line-height:1.35}
a.btn{text-decoration:none}
.ab-card.has-strip .ab-photo{width:74%}
.ab-strip{display:flex;gap:12u;width:100%;margin-top:14u;padding:0 6u}
.ab-strip .polaroid{flex:1;min-width:0}
.ab-strip .polaroid img{aspect-ratio:4/3}

/* photo cards (marco_rio, marco_desk) */
.polaroid{margin:0;position:relative;padding:4u 4u 0;background:var(--paper);border-radius:4u;box-shadow:0 4u 0 var(--ink),0 8u 14u rgba(0,0,0,.3);transform:rotate(var(--tilt,0deg))}
.polaroid img{display:block;width:100%;aspect-ratio:1;object-fit:cover;object-position:var(--focus,50% 50%);border-radius:2u;background:var(--navy-3)}
.polaroid figcaption{padding:3u 0 4u;text-align:center;font-family:var(--font-display);font-style:italic;font-weight:900;font-size:9.5f;line-height:1.1;letter-spacing:.03em;text-transform:uppercase;color:var(--ink);white-space:nowrap}
.polaroid.stamp{position:absolute;z-index:3;width:82u;animation:stampIn .5s .5s var(--spring) both}
@keyframes stampIn{from{opacity:0;transform:rotate(var(--tilt,0deg)) scale(2.2)}to{opacity:1;transform:rotate(var(--tilt,0deg)) scale(1)}}
.res-me{position:relative}
.res-me .polaroid.stamp{right:-14u;top:-26u}
.pod-card{position:relative}
.pod-card .polaroid.stamp{right:-12u;top:-46u;width:92u}
.load-snaphost{position:absolute;right:max(24u,4vw);top:50%;width:min(150u,17vw);transform:translateY(-50%)}
.load-snaphost .polaroid{animation:snapIn .6s var(--spring) both}
@keyframes snapIn{from{opacity:0;transform:rotate(calc(var(--tilt,0deg)*3)) scale(.5)}to{opacity:1;transform:rotate(var(--tilt,0deg)) scale(1)}}
@media (max-width:820px),(max-height:460px){.load-snaphost{display:none}}

/* pause */
.pause{position:absolute;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;pointer-events:auto}
.pause[hidden]{display:none}
.pause-dim{position:absolute;inset:0;background:radial-gradient(90% 90% at 50% 45%,rgba(6,18,42,.6),rgba(6,18,42,.9));backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}
.pause.is-in .pause-dim{animation:fadeIn .25s both}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
.pause-in{position:relative;display:flex;flex-direction:column;align-items:center;gap:20u;width:min(700u,88vw);animation:zoomIn .4s var(--spring) both}
.pause-title{position:relative;isolation:isolate;padding:8u 46u 10u;font-size:40f;line-height:1;text-shadow:${ring(2.2, 'var(--ink)', 4)}}
.pause-title::before{content:"";position:absolute;inset:0;z-index:-1;transform:skewX(-14deg);border-radius:10u;background:linear-gradient(180deg,#F25A66,var(--red) 55%,var(--red-d));border:4u solid var(--paper);box-shadow:0 7u 0 var(--ink)}
.pause-main{display:flex;gap:26u;align-items:stretch;width:100%}
.pause-list{display:flex;flex-direction:column;gap:11u;flex:1}
.pause-vol{flex:1.1;display:flex;flex-direction:column;gap:9u;justify-content:center}
.pause-vol .row{padding:4u 12u;min-height:38u}
.pause-vol .row-l{flex:0 0 42%;font-size:12f}
.pause-vol .row-l .glyph{display:none}
.pause-ctl{width:min(660u,100%);display:flex;flex-direction:column}
.pause-ctl .ctl-table{width:100%}
.pause-confirm{width:min(460u,100%);text-align:center;display:flex;flex-direction:column;gap:8u;padding:18u 24u}
.pause-ct{font-size:24f;line-height:1;text-shadow:${ring(1.4, 'var(--ink)', 2)}}
.pause-confirm p{margin:0 0 6u;font-size:13f;line-height:1.35;font-weight:700}
.pause-yn{display:flex;gap:14u}
.pause-yn .btn{flex:1}
@media (max-height:460px){
  .ab-strip,.polaroid.stamp{display:none}
  .pause-in{gap:10u}.pause-title{font-size:30f}.pause-list{gap:8u}.pause .btn{min-height:36u;font-size:15f}
  .ctl-row{padding:3u 0}.ctl-side{display:none}.ab-text p:nth-of-type(3){display:none}.ab-quirks{display:none}
}
`;
