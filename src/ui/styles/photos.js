// Styles for the photo extras: menu photo wall, intro card, pause snap, character-select snap, HUD face.

/** @returns {string} CSS with design units */
export function photosCss() {
  return `
.photo-wall{position:absolute;inset:-6% -4%;z-index:0;display:grid;grid-template-columns:repeat(5,1fr);grid-auto-rows:1fr;gap:14u;padding:10u;pointer-events:none;opacity:.16;filter:saturate(.8) blur(.6px);transform:rotate(-4deg) scale(1.08)}
.photo-wall .pw-cell{transform:rotate(var(--tilt,0deg));animation:pwFloat 9s ease-in-out infinite;animation-delay:var(--dl,0s);background:var(--paper);padding:5u;border-radius:4u;box-shadow:0 4u 10u rgba(0,0,0,.4)}
.photo-wall img{display:block;width:100%;height:100%;object-fit:cover;border-radius:2u}
@keyframes pwFloat{0%,100%{transform:rotate(var(--tilt,0deg)) translateY(0)}50%{transform:rotate(calc(var(--tilt,0deg) + 1.5deg)) translateY(-8u)}}
.screen[data-screen="menu"]>.screen-body,.screen[data-screen="menu"]>.menu-logo,.screen[data-screen="menu"]>.ftr{position:relative;z-index:1}
.polaroid.intro-snap{position:absolute;left:max(24u,3vw);bottom:max(60u,12vh);width:min(118u,15vw);z-index:5;animation:snapIn .7s var(--spring) both;pointer-events:none;transition:opacity .5s,transform .5s}
.polaroid.intro-snap.out{opacity:0;transform:translateX(-40u) rotate(-8deg)}
.pause-snap{position:absolute;right:max(20u,3.5vw);bottom:max(12u,2.5vh);width:min(104u,12vw);z-index:1}
.pause-snap .polaroid{animation:snapIn .6s var(--spring) both}
.sel-snap{position:absolute;right:max(26u,3vw);top:max(118u,22vh);width:min(84u,10vw);z-index:4;pointer-events:none}
.sel-snap figcaption,.intro-snap figcaption,.pause-snap figcaption{white-space:normal;font-size:8f;line-height:1.05;padding:2u 0 3u}
.sel-snap .polaroid{animation:snapIn .5s var(--spring) both}
.polaroid.stamp.l{left:-14u;right:auto}
.polaroid.stamp figcaption{white-space:normal;font-size:8f;line-height:1.05}
.hud-face{position:absolute;left:calc(max(env(safe-area-inset-left),24u) + 152u);bottom:max(env(safe-area-inset-bottom),16u);width:54u;height:54u;border-radius:50%;overflow:visible;background:var(--navy-3,#12244a);border:3u solid var(--paper,#fff8ec);box-shadow:0 3u 0 var(--ink,#0b1d3a),0 6u 12u rgba(0,0,0,.35);transition:border-color .2s,transform .2s}
.hud-face img,.hud-face .hud-face-svg,.hud-face .pt{display:block;width:100%;height:100%;object-fit:cover;border:0;border-radius:0}
.hud-face.pop{animation:faceHop .35s var(--spring)}
.hud-face[data-expr="hit"]{border-color:#e63946}.hud-face[data-expr="wow"]{border-color:#22d3ee}.hud-face[data-expr="happy"],.hud-face[data-expr="smug"]{border-color:#ffd166}.hud-face[data-expr="sad"]{border-color:#7fb0ff}
.hud-face[data-expr="hit"] img{filter:saturate(.7) contrast(1.08);transform:scale(1.12) rotate(-6deg)}
.hud-face[data-expr="sad"] img{filter:saturate(.5) brightness(.88);transform:translateY(5%) scale(1.08) rotate(-4deg)}
.hud-face[data-expr="wow"] img{transform:scale(1.08)}
@keyframes faceHop{0%{transform:scale(.7) rotate(-8deg)}60%{transform:scale(1.15) rotate(3deg)}100%{transform:scale(1) rotate(0)}}
.touch .hud-face{display:none}
@media (max-width:820px),(max-height:460px){.photo-wall{opacity:.12}.polaroid.intro-snap,.pause-snap,.sel-snap{display:none}}
`;
}
