// Floating speech text (src/ui/worldBubbles.js): see-through white text that follows a racer's kart, with a thin outline and a glow in the character's colour (--pc).
// No box, portrait or tail. One delivery style per character (the class suffix comes from bubbleStyle() in dialogue/bubbleMath.js) changes only the lettering.
// The layer sits between the menus and the HUD, so the HUD is always on top. `.subtitle` is the small bottom-centre line for menu barks (no kart to float over).
export const bubblesCss = () => `
.wb-layer{position:absolute;inset:0;overflow:hidden;pointer-events:none;contain:layout paint style}
.wb{--pc:var(--red);position:absolute;left:0;top:0;width:max-content;max-width:170u;transform-origin:50% 100%;opacity:0;visibility:hidden;will-change:transform,opacity;line-height:1.14}
.wb.on{visibility:visible}
.wb-t{color:#fff;text-align:center;font-weight:800;font-size:12f;overflow-wrap:anywhere;
  text-shadow:0 0 3u rgba(0,0,0,.95),0 1u 2u rgba(0,0,0,.9),0 0 8u color-mix(in srgb,var(--pc) 70%,transparent)}

/* delivery styles, one per character */
.wb-shout .wb-t{font-weight:900;letter-spacing:.01em;text-transform:uppercase;animation:wbShake .16s steps(2) infinite}
.wb-posh .wb-t{font-family:Georgia,'Times New Roman',serif;font-style:italic;font-weight:700}
.wb-glitch .wb-t{text-shadow:1.5u 0 rgba(255,40,120,.75),-1.5u 0 rgba(0,200,255,.75),0 1u 2u rgba(0,0,0,.9);animation:wbGlitch .9s steps(1) infinite}
.wb-drawl .wb-t{letter-spacing:.05em;font-weight:700}
.wb-whisper .wb-t{font-style:italic;font-weight:700;opacity:.9}
.wb-robot .wb-t{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:700;letter-spacing:.01em}
.wb-squeak .wb-t{font-weight:900;animation:wbBounce .42s ease-in-out infinite alternate}
@keyframes wbShake{0%{translate:0 0}50%{translate:.8u -.6u}100%{translate:-.8u .4u}}
@keyframes wbGlitch{0%{transform:none}30%{transform:translateX(1.5u) skewX(-6deg)}34%{transform:none}70%{transform:translateX(-1.5u)}74%{transform:none}}
@keyframes wbBounce{from{translate:0 0}to{translate:0 -2.5u}}
@media (prefers-reduced-motion:reduce){.wb .wb-t{animation:none}}

/* menu barks: a small white line at the bottom centre, above the screens and the wipe */
.subtitle{--pc:var(--red);position:absolute;left:50%;bottom:calc(max(env(safe-area-inset-bottom),14u) + 8u);z-index:55;transform:translateX(-50%);width:min(60%,420u);text-align:center;pointer-events:none;
  font-size:13f;font-weight:800;line-height:1.15;color:#fff;opacity:0;visibility:hidden;transition:opacity .25s,visibility 0s .25s;
  text-shadow:0 0 3u rgba(0,0,0,.95),0 1u 2u rgba(0,0,0,.9),0 0 8u color-mix(in srgb,var(--pc) 70%,transparent)}
.subtitle.on{opacity:1;visibility:visible;transition:opacity .25s}
`;
