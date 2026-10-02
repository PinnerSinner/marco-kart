// Environment: gradient sky dome (procedural clouds, stars, aurora, sun glow), fog, sun + fill + hemisphere lights, real-time sun shadow on
// `high`, cloud sprites and shader-driven rain. One call per track: `applyEnvironment(scene, renderer, track.environment, quality)`.
import * as THREE from 'three';
import { makeCanvas, toTexture } from './canvas.js';
import { makeRng } from '../core/util.js';

const KIND = { day: 0, overcast: 1, dusk: 2, indoor: 3, space: 4 };
const EXPOSURE = { day: 1.05, overcast: 1.05, dusk: 1.0, indoor: 1.15, space: 1.1 };

const SKY_VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    gl_Position = p.xyww; // pinned to the far plane
  }`;

const SKY_FRAG = /* glsl */`
  uniform vec3 uTop; uniform vec3 uBottom; uniform vec3 uFog; uniform vec3 uSunDir; uniform vec3 uSunColor;
  uniform float uTime; uniform float uKind; uniform float uClouds; uniform float uStars; uniform float uQuality;
  varying vec3 vDir;

  float hash( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
  float hash3( vec3 p ) { p = fract( p * vec3( 443.897, 441.423, 437.195 ) ); p += dot( p, p.yzx + 19.19 ); return fract( ( p.x + p.y ) * p.z ); }
  float vnoise( vec2 p ) {
    vec2 i = floor( p ), f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    return mix( mix( hash( i ), hash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( hash( i + vec2( 0.0, 1.0 ) ), hash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
  }
  float fbm( vec2 p ) {
    float s = 0.0, a = 0.5;
    for ( int i = 0; i < 5; i++ ) { if ( float( i ) > uQuality ) break; s += a * vnoise( p ); p = p * 2.03 + 17.1; a *= 0.5; }
    return s;
  }

  // ---- space helpers (3D value noise on the view direction: no seams, no pole pinching)
  uniform vec4 uPA[4]; uniform vec4 uPB[4]; uniform vec4 uPC[4]; uniform vec4 uPD[4]; uniform vec4 uPE[4];
  float vnoise3( vec3 p ) {
    vec3 i = floor( p ), f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    float a = hash3( i ), b = hash3( i + vec3( 1.0, 0.0, 0.0 ) ), c = hash3( i + vec3( 0.0, 1.0, 0.0 ) ), d = hash3( i + vec3( 1.0, 1.0, 0.0 ) );
    float e = hash3( i + vec3( 0.0, 0.0, 1.0 ) ), g = hash3( i + vec3( 1.0, 0.0, 1.0 ) ), h = hash3( i + vec3( 0.0, 1.0, 1.0 ) ), k = hash3( i + vec3( 1.0, 1.0, 1.0 ) );
    return mix( mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y ), mix( mix( e, g, f.x ), mix( h, k, f.x ), f.y ), f.z );
  }
  float fbm3( vec3 p, int oct ) {
    float s = 0.0, a = 0.5;
    for ( int i = 0; i < 5; i++ ) { if ( i >= oct ) break; s += a * vnoise3( p ); p = p * 2.07 + vec3( 11.3, 5.7, 17.1 ); a *= 0.5; }
    return s;
  }

  // Round stars in a jittered 3D grid on the view sphere: scale = cells per radian-ish, density = fraction of cells holding a star.
  vec3 starLayer( vec3 d, float scale, float density, float rMin, float rMax, float halo, float twinkle ) {
    vec3 g = d * scale, cell = floor( g );
    float r = hash3( cell );
    if ( r < 1.0 - density ) return vec3( 0.0 );
    vec3 jit = vec3( hash3( cell + 1.7 ), hash3( cell + 9.3 ), hash3( cell + 4.1 ) ) * 0.3 + 0.35;
    float dist = length( fract( g ) - jit );
    float size = mix( rMin, rMax, hash3( cell + 7.7 ) );
    float core = smoothstep( size, size * 0.2, dist );
    float glow = pow( clamp( 1.0 - dist / 0.34, 0.0, 1.0 ), 3.0 ) * halo;
    float tw = 1.0 - twinkle + twinkle * sin( uTime * ( 1.3 + r * 4.0 ) + r * 80.0 );
    vec3 sc = mix( vec3( 0.62, 0.78, 1.0 ), vec3( 1.0, 0.86, 0.62 ), hash3( cell + 3.3 ) );
    sc = mix( sc, vec3( 1.0, 0.55, 0.85 ), step( 0.93, hash3( cell + 5.9 ) ) );
    return sc * ( core + glow ) * tw;
  }

  // Aurora curtain: a soft-bottomed veil of vertical rays; y is height above its base (0..1 across the curtain).
  float aurora( float az, float h, float base, float height, float seed ) {
    float wob = 0.045 * sin( az * 3.0 + uTime * 0.17 + seed ) + 0.025 * sin( az * 7.0 - uTime * 0.31 + seed * 2.0 );
    float y = ( h - base - wob ) / height;
    float prof = smoothstep( 0.0, 0.07, y ) * exp( -max( y, 0.0 ) * 2.6 );
    float rays = 0.25 + 0.75 * smoothstep( 0.25, 0.85, vnoise( vec2( az * 70.0 + seed * 5.0, uTime * 0.1 + seed + y * 0.6 ) ) );
    float drift = 0.6 + 0.4 * sin( az * 4.0 - uTime * 0.23 + seed * 3.0 );
    return prof * rays * drift;
  }

  // One backdrop planet (all at infinity: the dome follows the camera). A: dir.xyz + radius, B: colour A + type
  // (0 gas giant, 1 rock, 2 ocean, 3 night world), C: colour B + night amount, D: ring axis + ring amount, E: atmosphere colour + spare.
  vec4 planetLayer( vec3 d, vec4 A, vec4 B, vec4 C, vec4 D, vec4 E, vec3 L ) {
    float r = A.w;
    if ( r <= 0.0 ) return vec4( 0.0 );
    vec3 c = normalize( A.xyz );
    float b = dot( d, c );
    if ( b <= 0.0 ) return vec4( 0.0 );
    float cr = length( cross( d, c ) );
    if ( cr > r * 3.2 && D.w <= 0.0 ) return vec4( 0.0 );
    vec3 oc = vec3( 0.0 ); float oa = 0.0;
    float ts = 1e9; bool hit = false; vec3 n = vec3( 0.0 );
    float disc = b * b - ( 1.0 - r * r );
    if ( disc > 0.0 ) { ts = b - sqrt( disc ); n = normalize( d * ts - c ); hit = true; }
    if ( hit ) {
      float night = C.w;
      float lit = smoothstep( -0.12, 0.6, dot( n, L ) ) * ( 1.0 - night * 0.9 );
      vec3 p = n * ( B.w > 2.5 ? 6.0 : 2.4 ) + c * 3.1;
      vec3 alb;
      float type = B.w;
      vec3 axis = normalize( vec3( 0.12, 1.0, 0.08 ) );
      if ( type < 0.5 ) {
        float w = dot( n, axis ) * 10.0 + 1.6 * fbm3( p * 1.1, 3 );
        float bands = 0.5 + 0.5 * sin( w * 3.14159 );
        alb = mix( B.xyz, C.xyz, bands * bands );
        alb *= 0.82 + 0.36 * fbm3( p * 3.2 + 4.0, 3 );
      } else if ( type < 1.5 ) {
        float nz = fbm3( p * 1.7, 4 );
        alb = mix( B.xyz, C.xyz, smoothstep( 0.38, 0.66, nz ) );
        float cr2 = fbm3( p * 6.5, 3 );
        alb *= 0.72 + 0.5 * cr2;
      } else {
        float land = smoothstep( 0.5, 0.58, fbm3( p * 1.5, 4 ) );
        alb = mix( B.xyz, C.xyz, land );
        alb = mix( alb, vec3( 0.95 ), smoothstep( 0.58, 0.8, fbm3( p * 3.0 + 9.0, 4 ) ) * 0.55 );
      }
      vec3 shaded = alb * mix( 0.05, 1.05, lit );
      if ( type > 2.5 ) {
        // the world far below: a dark ocean planet with a glowing network of city lights on the night side
        float land2 = smoothstep( 0.49, 0.56, fbm3( p * 1.5, 4 ) );
        float pop = smoothstep( 0.48, 0.72, fbm3( p * 0.5 + 7.0, 3 ) );
        float lights = smoothstep( 0.56, 0.78, fbm3( p * 6.0, 3 ) ) * land2 * pop;
        float hue = fbm3( p * 0.7 + 5.0, 2 );
        shaded += mix( vec3( 1.0, 0.62, 0.28 ), vec3( 0.25, 0.85, 1.0 ), smoothstep( 0.4, 0.62, hue ) ) * lights * 0.8;
      }
      float rim = pow( 1.0 - clamp( dot( n, -d ), 0.0, 1.0 ), type > 2.5 ? 14.0 : 3.0 );
      shaded += E.xyz * rim * ( type > 2.5 ? 0.9 : ( 0.25 + 0.75 * lit ) * 0.9 );
      oc = shaded; oa = 1.0;
    } else {
      float halo = exp( -max( asin( clamp( cr, 0.0, 1.0 ) ) - asin( r ), 0.0 ) / ( asin( r ) * ( B.w > 2.5 ? 0.035 : 0.28 ) ) );
      oc = E.xyz * halo * ( B.w > 2.5 ? 0.55 : 0.6 ); oa = 0.0;
    }
    if ( D.w > 0.0 ) {
      vec3 ax = normalize( D.xyz );
      float den = dot( d, ax );
      if ( abs( den ) > 1e-4 ) {
        float tr = dot( c, ax ) / den;
        if ( tr > 0.0 && ( !hit || tr < ts ) ) {
          float rr = length( d * tr - c ) / r;
          if ( rr > 1.4 && rr < 2.5 ) {
            float band = 0.55 + 0.45 * sin( rr * 46.0 + 3.0 * sin( rr * 9.0 ) );
            float gap = smoothstep( 1.4, 1.5, rr ) * ( 1.0 - smoothstep( 2.35, 2.5, rr ) ) * ( 1.0 - 0.85 * smoothstep( 0.02, 0.0, abs( rr - 1.93 ) - 0.05 ) );
            float ra = gap * ( 0.35 + 0.55 * band ) * D.w;
            vec3 rc = mix( B.xyz, vec3( 1.0, 0.92, 0.78 ), 0.45 ) * ( 0.32 + 0.9 * smoothstep( -0.3, 0.7, dot( normalize( d * tr - c ), L ) * 0.6 + 0.4 ) );
            oc = oc * ( 1.0 - ra ) + rc * ra; oa = oa * ( 1.0 - ra ) + ra;
          }
        }
      }
    }
    return vec4( oc, oa );
  }

  vec3 spaceSky( vec3 d ) {
    float t = uTime;
    float h = d.y;
    // base: deep indigo zenith melting into a violet glow at the horizon, mirrored below (space has no ground)
    float up = pow( clamp( abs( h ), 0.0, 1.0 ), 0.62 );
    vec3 col = mix( uBottom, uTop, up );
    if ( h < 0.0 ) col = mix( col, col.bgr, 0.3 ) * 0.8;

    // nebula: two domain-warped fbm layers (violet / magenta and teal), with dark dust lanes
    vec3 q = d * 1.5 + vec3( t * 0.0035, 0.0, t * 0.002 );
    float n1 = fbm3( q * 1.25, 4 );
    float n2 = fbm3( q * 2.3 + n1 * 1.7 + 7.0, 4 );
    float n3 = fbm3( q * 1.6 - n1 * 1.2 - 3.0, 3 );
    vec3 neb = vec3( 0.0 );
    neb += mix( vec3( 0.30, 0.06, 0.60 ), vec3( 0.80, 0.09, 0.45 ), smoothstep( 0.35, 0.75, n1 ) ) * smoothstep( 0.46, 0.95, n2 );
    neb += mix( vec3( 0.03, 0.25, 0.55 ), vec3( 0.05, 0.55, 0.55 ), smoothstep( 0.4, 0.8, n3 ) ) * smoothstep( 0.52, 0.95, n3 ) * 0.8;
    float lane = smoothstep( 0.52, 0.72, fbm3( d * 3.1 + 21.0, 3 ) );
    col += neb * ( 1.0 - 0.7 * lane ) * 0.30;

    // milky band: a great circle of dense dust and stars
    vec3 mwAxis = normalize( vec3( 0.32, 0.74, -0.59 ) );
    float mw = dot( d, mwAxis );
    float band = exp( -mw * mw * 16.0 );
    float dust = fbm3( d * 4.4 + 2.0, 4 );
    col += mix( vec3( 0.30, 0.22, 0.60 ), vec3( 0.85, 0.50, 0.70 ), dust ) * band * smoothstep( 0.32, 0.8, dust ) * 0.22 * ( 1.0 - 0.55 * lane );

    // stars: three layers, denser inside the milky band
    vec3 st = starLayer( d, 240.0, 0.10 + band * 0.25, 0.10, 0.22, 0.10, 0.25 ) * 0.55;
    st += starLayer( d, 105.0, 0.05 + band * 0.10, 0.10, 0.26, 0.25, 0.4 ) * 1.0;
    st += starLayer( d, 36.0, 0.05, 0.10, 0.22, 0.45, 0.3 ) * 1.8;
    col += st * uStars * ( 1.0 - 0.6 * lane );

    // aurora curtains above (and a faint mirror below): mint at the base, violet then magenta higher up
    float az = atan( d.z, d.x );
    float ha = abs( h );
    vec3 au = vec3( 0.0 );
    for ( int i = 0; i < 3; i++ ) {
      float fi = float( i );
      float a = aurora( az + fi * 1.9, ha, 0.05 + fi * 0.15, 0.30 - fi * 0.04, fi * 2.3 + 1.0 );
      vec3 ac = mix( mix( vec3( 0.10, 1.0, 0.60 ), vec3( 0.45, 0.35, 1.0 ), fi * 0.5 ), vec3( 1.0, 0.25, 0.85 ), smoothstep( 0.1, 0.5, ha - fi * 0.08 ) );
      au += ac * a;
    }
    col += au * ( h < 0.0 ? 0.10 : 0.26 ) * smoothstep( 0.0, 0.05, ha );

    // horizon shimmer where the two hemispheres meet
    col += mix( vec3( 0.35, 0.10, 0.75 ), vec3( 0.05, 0.55, 0.85 ), 0.5 + 0.5 * sin( az * 2.0 + t * 0.07 ) ) * exp( -ha * 18.0 ) * 0.16;

    // backdrop planets
    vec3 L = normalize( uSunDir );
    for ( int i = 0; i < 4; i++ ) {
      vec4 P = planetLayer( d, uPA[i], uPB[i], uPC[i], uPD[i], uPE[i], L );
      col = col * ( 1.0 - P.a ) + P.rgb;
    }

    // the system's sun: a tiny blinding star with a soft flare
    float sd = max( dot( d, L ), 0.0 );
    col += uSunColor * ( smoothstep( 0.99935, 0.9998, sd ) * 7.0 + pow( sd, 700.0 ) * 0.9 + pow( sd, 60.0 ) * 0.10 + pow( sd, 8.0 ) * 0.03 );
    return col;
  }

  void main() {
    vec3 d = normalize( vDir );
    float h = d.y;
    float t = uTime;
    vec3 col;

    if ( uKind > 2.5 && uKind < 3.5 ) {
      // INDOOR: dark hall ceiling with faint light strips and a perspective grid
      col = mix( uBottom, uTop, smoothstep( -0.1, 0.9, h ) );
      float az = atan( d.z, d.x );
      float strips = smoothstep( 0.965, 1.0, sin( az * 24.0 ) ) * smoothstep( 0.05, 0.5, h );
      float rings = smoothstep( 0.97, 1.0, sin( h * 26.0 + t * 0.4 ) ) * smoothstep( 0.05, 0.7, h ) * 0.6;
      col += vec3( 0.1, 0.45, 0.8 ) * ( strips + rings ) * 0.3;
      col = mix( col, uFog, exp( -max( h, 0.0 ) * 6.0 ) * 0.55 );
      col = mix( uFog, col, smoothstep( -0.25, 0.02, h ) );
    } else if ( uKind > 3.5 ) {
      col = spaceSky( d );
    } else {
      float hz = pow( clamp( h, 0.0, 1.0 ), 0.55 );
      col = mix( uBottom, uTop, hz );
      col = mix( col, uFog, exp( -max( h, 0.0 ) * ( uKind > 1.5 && uKind < 2.5 ? 5.0 : 7.5 ) ) * 0.85 );
      if ( h < 0.0 ) col = mix( uFog, uBottom, clamp( -h * 4.0, 0.0, 1.0 ) * 0.35 );

      // sun (not in space / overcast)
      if ( uKind != 1.0 ) {
        float sd = max( dot( d, uSunDir ), 0.0 );
        float disc = smoothstep( 0.9993, 0.99965, sd );
        float glow = pow( sd, 96.0 ) * 0.7 + pow( sd, 10.0 ) * 0.22 + pow( sd, 3.0 ) * 0.06;
        col += uSunColor * ( disc * 4.0 + glow );
      }

      // stars
      float starMask = uStars * smoothstep( 0.05, 0.6, h );
      if ( starMask > 0.0 ) {
        vec3 g = d * 90.0;
        vec3 cell = floor( g );
        float r = hash3( cell );
        if ( r > 0.965 ) {
          vec3 f = fract( g ) - 0.5;
          float dist = length( f );
          float size = mix( 0.12, 0.34, hash3( cell + 7.7 ) );
          float tw = 0.65 + 0.35 * sin( t * ( 1.5 + r * 5.0 ) + r * 60.0 );
          float star = smoothstep( size, 0.0, dist ) * tw;
          vec3 sc = mix( vec3( 0.75, 0.85, 1.0 ), vec3( 1.0, 0.9, 0.7 ), hash3( cell + 3.3 ) );
          col += sc * star * starMask;
        }
      }

      // clouds
      if ( uClouds > 0.01 && h > -0.02 ) {
        vec2 uv = d.xz / ( h + 0.22 ) * 0.9 + vec2( t * 0.006, t * 0.003 );
        float n = fbm( uv );
        float cover = mix( 0.62, 0.32, uClouds );
        float c = smoothstep( cover, cover + 0.28, n );
        float lit = smoothstep( 0.0, 1.0, fbm( uv + uSunDir.xz * 0.12 ) - n * 0.4 + 0.55 );
        vec3 cShadow = mix( uTop, uFog, 0.35 ) * 0.78 + vec3( 0.03 );
        vec3 cLight = mix( vec3( 1.0 ), uSunColor, 0.18 ) * ( uKind == 1.0 ? 0.82 : 1.05 );
        vec3 cc = mix( cShadow, cLight, clamp( lit, 0.0, 1.0 ) );
        if ( uKind > 1.5 && uKind < 2.5 ) cc = mix( cc, uSunColor * 1.1, pow( max( dot( d, uSunDir ), 0.0 ), 2.0 ) * 0.7 );
        float fade = smoothstep( -0.02, 0.18, h );
        col = mix( col, cc, c * fade * ( uKind == 1.0 ? 0.95 : 0.9 ) );
      }
    }
    gl_FragColor = vec4( col, 1.0 );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

const RAIN_VERT = /* glsl */`
  attribute vec4 aSeed;
  uniform float uTime; uniform vec3 uCam; uniform vec3 uBox; uniform float uSpeed; uniform vec2 uWind; uniform float uLen; uniform float uWidth;
  varying float vA;
  void main() {
    vec3 base = aSeed.xyz;
    float fall = uTime * uSpeed * ( 0.85 + aSeed.w * 0.3 );
    vec3 p;
    p.x = fract( base.x + uWind.x * uTime * 0.02 ) ;
    p.z = fract( base.z + uWind.y * uTime * 0.02 );
    p.y = fract( base.y - fall / uBox.y );
    vec3 rel = ( p - 0.5 ) * uBox;
    vec3 centre = floor( uCam / uBox ) * uBox + uBox * 0.5;
    // wrap around the camera so rain always surrounds it
    vec3 w = rel + centre;
    w.x += uBox.x * floor( ( uCam.x - w.x ) / uBox.x + 0.5 );
    w.z += uBox.z * floor( ( uCam.z - w.z ) / uBox.z + 0.5 );
    w.y += uBox.y * floor( ( uCam.y - w.y ) / uBox.y + 0.5 );
    vec3 fallDir = normalize( vec3( uWind.x * 0.06, -1.0, uWind.y * 0.06 ) );
    vec3 toCam = normalize( uCam - w );
    vec3 side = normalize( cross( fallDir, toCam ) );
    float end = position.y;              // 0 top, 1 bottom of streak
    float lat = position.x;              // -0.5 .. 0.5
    vec3 pos = w + fallDir * end * uLen * ( 0.7 + aSeed.w * 0.6 ) + side * lat * uWidth;
    float dist = length( uCam - w );
    vA = ( 1.0 - end * 0.8 ) * smoothstep( 1.5, 5.0, dist ) * ( 1.0 - smoothstep( 20.0, 32.0, dist ) );
    gl_Position = projectionMatrix * viewMatrix * vec4( pos, 1.0 );
  }`;
const RAIN_FRAG = /* glsl */`
  uniform vec3 uColor; uniform float uAlpha; varying float vA;
  void main() { gl_FragColor = vec4( uColor, vA * uAlpha ); if ( gl_FragColor.a < 0.01 ) discard; }`;

/** Fill the planet uniform arrays (4 slots; radius 0 = empty) of the sky material. @param {object} uniforms @param {Array|false} list */
function setPlanetUniforms(uniforms, list) {
  const mk = () => Array.from({ length: 4 }, () => new THREE.Vector4());
  const A = mk(), B = mk(), C = mk(), D = mk(), E = mk(), col = new THREE.Color();
  (list || []).slice(0, 4).forEach((p, i) => {
    const dir = new THREE.Vector3(...p.dir).normalize();
    A[i].set(dir.x, dir.y, dir.z, p.radius);
    col.set(p.a ?? 0x888888); B[i].set(col.r, col.g, col.b, PLANET_TYPE[p.type] ?? 0);
    col.set(p.b ?? 0xcccccc); C[i].set(col.r, col.g, col.b, p.night ?? 0);
    const r = p.ring; if (r) { const ax = new THREE.Vector3(r[0], r[1], r[2]).normalize(); D[i].set(ax.x, ax.y, ax.z, r[3] ?? 1); }
    col.set(p.glow ?? 0x88aaff); E[i].set(col.r, col.g, col.b, 0);
  });
  uniforms.uPA = { value: A }; uniforms.uPB = { value: B }; uniforms.uPC = { value: C }; uniforms.uPD = { value: D }; uniforms.uPE = { value: E };
}

function cloudTexture() {
  const c = makeCanvas(256, 128);
  if (!c) return null;
  const g = c.getContext('2d');
  const rng = makeRng(31);
  for (let i = 0; i < 26; i++) {
    const x = 40 + rng() * 176, y = 50 + rng() * 40, r = 16 + rng() * 26;
    const grad = g.createRadialGradient(x, y - r * 0.2, r * 0.1, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)'); grad.addColorStop(0.6, 'rgba(255,255,255,0.4)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const grad = g.createLinearGradient(0, 40, 0, 110);
  grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(1, 'rgba(120,130,160,0.35)');
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = grad; g.fillRect(0, 0, 256, 128);
  return toTexture(c, { aniso: 1 });
}

const PLANET_TYPE = { gas: 0, rock: 1, ocean: 2, night: 3 };

/**
 * Backdrop planets for the 'space' sky (fixed directions at infinity, drawn inside the sky shader). Override with `env.planets`
 * (an array of the same shape, or `false` for none). `dir` points at the planet, `radius` is its size on a unit sphere (0.2 = about 11.5 degrees),
 * `ring` = [axisX, axisY, axisZ, opacity] adds a ring, `night` darkens the lit side (0..1).
 */
export const DEFAULT_SPACE_PLANETS = [
  { dir: [0.62, 0.26, -0.74], radius: 0.225, type: 'gas', a: 0x7b5cff, b: 0xffc27a, glow: 0x9f86ff, ring: [0.22, 1.0, 0.12, 0.9] },
  { dir: [-0.80, 0.14, 0.58], radius: 0.10, type: 'rock', a: 0xf0743a, b: 0x8f2a45, glow: 0xff9a66 },
  { dir: [-0.30, 0.50, -0.81], radius: 0.05, type: 'ocean', a: 0x2fb8d6, b: 0x8de0a0, glow: 0x7fe7ff },
  { dir: [0.10, -1.0, 0.16], radius: 0.93, type: 'night', a: 0x0a1e5c, b: 0x123a5a, glow: 0x56d4ff, night: 0.8 },
];

const _rot = new THREE.Matrix4();
const _inv = new THREE.Matrix4();

/**
 * Build the sky, fog and lights for a track and return a handle. Call `update` every frame.
 * @param {THREE.Scene} scene
 * @param {THREE.WebGLRenderer} renderer
 * @param {object} env `track.environment` (SPEC section 3)
 * @param {'low'|'medium'|'high'} [quality='high']
 * @returns {{update: (dt: number, cameraPos: THREE.Vector3, followPos?: THREE.Vector3) => void, setQuality: (q: string) => void, dispose: () => void, sun: THREE.DirectionalLight, dome: THREE.Mesh, group: THREE.Group}}
 */
export function applyEnvironment(scene, renderer, env, quality = 'high') {
  const kind = KIND[env.skyKind] !== undefined ? env.skyKind : 'day';
  const group = new THREE.Group();
  group.name = 'environment';
  scene.add(group);

  const fogColor = new THREE.Color(env.fogColor ?? env.skyBottom ?? 0xcfeaff);
  const prevFog = scene.fog, prevBg = scene.background, prevTone = renderer.toneMapping, prevExp = renderer.toneMappingExposure;
  scene.fog = new THREE.Fog(fogColor, env.fogNear ?? 150, env.fogFar ?? 700);
  scene.background = fogColor.clone();
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = EXPOSURE[kind];
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const sunDir = (env.sunDir ? env.sunDir.clone() : new THREE.Vector3(0.4, 1, 0.3)).normalize();
  const sunColor = new THREE.Color(env.sunColor ?? 0xffffff);

  // ---- sky dome
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, toneMapped: false,
    uniforms: {
      uTop: { value: new THREE.Color(env.skyTop ?? 0x4aa8ff) },
      uBottom: { value: new THREE.Color(env.skyBottom ?? 0xcfeaff) },
      uFog: { value: fogColor.clone() },
      uSunDir: { value: sunDir },
      uSunColor: { value: sunColor.clone() },
      uTime: { value: 0 },
      uKind: { value: KIND[kind] },
      uClouds: { value: env.clouds ?? (kind === 'day' ? 0.45 : kind === 'overcast' ? 0.9 : kind === 'dusk' ? 0.4 : 0) },
      uStars: { value: env.stars === undefined ? (kind === 'space' ? 1 : kind === 'dusk' ? 0.5 : 0) : env.stars ? 1 : 0 },
      uQuality: { value: quality === 'low' ? 1 : quality === 'medium' ? 3 : 4 },
    },
  });
  setPlanetUniforms(skyMat.uniforms, false);
  if (kind === 'space') setPlanetUniforms(skyMat.uniforms, env.planets === undefined ? DEFAULT_SPACE_PLANETS : env.planets);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 20), skyMat);
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  dome.name = 'sky-dome';
  group.add(dome);

  // ---- lights
  const hemi = new THREE.HemisphereLight(env.ambientColor ?? 0x9fc4ff, new THREE.Color(env.fogColor ?? 0x556677).multiplyScalar(0.55).lerp(new THREE.Color(0x6b5a48), 0.4), env.ambientIntensity ?? 0.9);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(sunColor, env.sunIntensity ?? 2.2);
  sun.name = 'sun';
  group.add(sun, sun.target);
  const fillDir = new THREE.Vector3(-sunDir.x, 0.35, -sunDir.z).normalize();
  const fill = new THREE.DirectionalLight(new THREE.Color(env.ambientColor ?? 0x9fc4ff).lerp(new THREE.Color(0x8fa8ff), 0.5), (env.sunIntensity ?? 2.2) * 0.22);
  fill.name = 'fill';
  fill.position.copy(fillDir).multiplyScalar(100);
  group.add(fill, fill.target);

  const SHADOW_EXT = 62, SHADOW_RES = 2048;
  let shadows = false;
  const setShadows = (on) => {
    shadows = on && kind !== 'space';
    renderer.shadowMap.enabled = shadows;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    sun.castShadow = shadows;
    if (shadows) {
      sun.shadow.mapSize.set(SHADOW_RES, SHADOW_RES);
      const c = sun.shadow.camera;
      c.left = -SHADOW_EXT; c.right = SHADOW_EXT; c.top = SHADOW_EXT; c.bottom = -SHADOW_EXT; c.near = 1; c.far = 320;
      c.updateProjectionMatrix();
      sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06;
      scene.traverse((o) => {
        if (o.isMesh && !o.userData?.noShadow && o.material && !o.material.isShaderMaterial && !o.material.isMeshBasicMaterial && !o.material.transparent) o.receiveShadow = true;
      });
    } else if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  };
  setShadows(quality === 'high');
  const texel = (2 * SHADOW_EXT) / SHADOW_RES;
  _rot.lookAt(new THREE.Vector3(), sunDir.clone().negate(), new THREE.Vector3(0, 1, 0));
  _inv.copy(_rot).invert();

  // ---- cloud sprites
  const sprites = [];
  const ctex = kind === 'day' || kind === 'overcast' || kind === 'dusk' ? cloudTexture() : null;
  const cloudAmt = env.clouds ?? (kind === 'day' ? 0.45 : kind === 'overcast' ? 0.9 : kind === 'dusk' ? 0.4 : 0);
  if (ctex && cloudAmt > 0.05) {
    const rng = makeRng(77);
    const tint = new THREE.Color(kind === 'dusk' ? 0xffb28a : kind === 'overcast' ? 0xb9c0cc : 0xffffff);
    const n = Math.round(6 + cloudAmt * 12);
    for (let i = 0; i < n; i++) {
      const m = new THREE.SpriteMaterial({ map: ctex, color: tint, transparent: true, opacity: kind === 'overcast' ? 0.55 : 0.75, depthWrite: false, fog: false, toneMapped: false });
      const s = new THREE.Sprite(m);
      const a = rng() * Math.PI * 2, r = 300 + rng() * 150, y = 90 + rng() * 120;
      s.userData = { a, r, y, sp: 0.002 + rng() * 0.004 };
      s.scale.set(190 + rng() * 170, 80 + rng() * 60, 1);
      s.renderOrder = -900;
      group.add(s); sprites.push(s);
    }
  }

  // ---- rain
  let rain = null;
  const rainAmt = env.rain ?? 0;
  if (rainAmt > 0.02) {
    const count = Math.round(2600 * rainAmt);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0, 0.5, 1, 0], 3));
    geo.setIndex([0, 1, 2, 1, 3, 2]);
    const seeds = new Float32Array(count * 4);
    const rng = makeRng(5);
    for (let i = 0; i < seeds.length; i++) seeds[i] = rng();
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    geo.instanceCount = count;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const mat = new THREE.ShaderMaterial({
      vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, transparent: true, depthWrite: false, fog: false, toneMapped: false,
      uniforms: {
        uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(46, 30, 46) }, uSpeed: { value: 26 },
        uWind: { value: new THREE.Vector2(6, 2) }, uLen: { value: 1.6 }, uWidth: { value: 0.028 },
        uColor: { value: new THREE.Color(0xcfdcf0) }, uAlpha: { value: 0.5 },
      },
    });
    rain = new THREE.Mesh(geo, mat);
    rain.frustumCulled = false;
    rain.renderOrder = 15;
    rain.name = 'rain';
    group.add(rain);
  }

  let time = 0;
  const sunPos = new THREE.Vector3();
  const snapped = new THREE.Vector3();

  return {
    group, sun, dome, hemi, fill,
    /**
     * @param {number} dt seconds
     * @param {THREE.Vector3} cameraPos world position of the camera
     * @param {THREE.Vector3} [followPos] point the sun shadow follows (the player kart)
     */
    update(dt, cameraPos, followPos = cameraPos) {
      time += dt;
      skyMat.uniforms.uTime.value = time;
      dome.position.copy(cameraPos);
      // sun + shadow camera follow the player; snap to shadow texels so edges do not shimmer
      snapped.copy(followPos).applyMatrix4(_rot);
      snapped.x = Math.round(snapped.x / texel) * texel;
      snapped.y = Math.round(snapped.y / texel) * texel;
      snapped.applyMatrix4(_inv);
      sun.target.position.copy(snapped);
      sunPos.copy(snapped).addScaledVector(sunDir, 140);
      sun.position.copy(sunPos);
      fill.target.position.copy(followPos);
      fill.position.copy(followPos).addScaledVector(fillDir, 100);
      for (let i = 0; i < sprites.length; i++) {
        const s = sprites[i], u = s.userData;
        u.a += u.sp * dt;
        s.position.set(cameraPos.x * 0.92 + Math.cos(u.a) * u.r, u.y, cameraPos.z * 0.92 + Math.sin(u.a) * u.r);
      }
      if (rain) {
        const u = rain.material.uniforms;
        u.uTime.value = time; u.uCam.value.copy(cameraPos);
      }
    },
    /** @param {'low'|'medium'|'high'} q */
    setQuality(q) {
      skyMat.uniforms.uQuality.value = q === 'low' ? 1 : q === 'medium' ? 3 : 4;
      setShadows(q === 'high');
      if (rain) rain.material.uniforms.uAlpha.value = q === 'low' ? 0.4 : 0.5;
    },
    dispose() {
      scene.remove(group);
      dome.geometry.dispose(); skyMat.dispose();
      for (const s of sprites) s.material.dispose();
      ctex?.dispose();
      if (rain) { rain.geometry.dispose(); rain.material.dispose(); }
      sun.dispose?.();
      if (sun.shadow.map) sun.shadow.map.dispose();
      scene.fog = prevFog; scene.background = prevBg;
      renderer.toneMapping = prevTone; renderer.toneMappingExposure = prevExp;
      renderer.shadowMap.enabled = false;
    },
  };
}
