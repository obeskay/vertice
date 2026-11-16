import * as THREE from 'three';
import { SCENES, SHIP, DATA } from '../palette.js';

const TAU = Math.PI * 2;
const CENTER_R = 1.05;   // WallManager.centerRadius
const MIN_HALF_W = 3.3;  // world units always visible left/right of the center (phones)
const MIN_HALF_H = 4.2;  // and above/below it (desktop)
const WAVE_SPEED = 2.6;  // half-diagonals per second: how fast a new scene sweeps out
const WAVE_DONE = 1.6;   // past the corners
const FOV = 24;          // deg with the plane flat; narrow, so a lean reads as depth, not fisheye
const FOV_LEAN = 20;     // extra deg at full lean: the perspective deepens with the stages
const LEAN_MAX = 0.6;    // rad the plane tips at full lean
const LEAN_EASE = 2.4;   // 1/s: a new lean settles in about a bar, with no overshoot
const DOLLY = 14;        // deg of fov kicked at a drop, framing kept (a dolly zoom)

const data = (r, g = 0, b = 0) => new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(r, g, b) });

/**
 * Two passes. The game draws flat "data" colors into a render target (light,
 * killer flag, solid), then a full-screen pass turns the screen into glyphs:
 * flat areas get big cells, walls and edges the fine grid, hard edges a line
 * glyph. Glyphs take a soft two-color field; the ship skips the glyphs.
 * World transform: lean axis > lean (perspective tilt) > world (spin, zoom).
 */
export class Renderer {
  constructor(containerId, reducedMotion = false) {
    this.reducedMotion = reducedMotion;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color().setRGB(0, 0, 0);

    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
    this.halfH = MIN_HALF_H;

    this.gl = new THREE.WebGLRenderer({ antialias: false });
    document.getElementById(containerId).appendChild(this.gl.domElement);
    this.target = new THREE.WebGLRenderTarget(1, 1, { samples: 4 });

    this.tiltOuter = new THREE.Group(); // turns the axis of the lean
    this.tiltPlane = new THREE.Group(); // tips the plane along it
    this.world = new THREE.Group();
    this.scene.add(this.tiltOuter);
    this.tiltOuter.add(this.tiltPlane);
    this.tiltPlane.add(this.world);

    this.wedges = new THREE.Group();
    this.wedges.position.z = -0.02; // flush with the plane: no parallax once it leans
    this.world.add(this.wedges);
    this.wedgeMats = DATA.wedge.map((r) => data(r));
    this.centerMat = data(DATA.center);
    this.center = null;
    this.sides = 0;

    this.shakeAmount = 0;
    this.punch = 0;
    this.dolly = 0;
    this.lean = 0;
    this.axis = this.axisTarget = 0;
    this.sceneIndex = 0;
    this.wave = WAVE_DONE;
    this._origin = new THREE.Vector3();

    const pal = () => ({ value: new THREE.Vector3() });
    this.post = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: this.target.texture },
        tAtlas: { value: buildAtlas(SCENES.map((s) => s.glyphs)) },
        uRows: { value: SCENES.length + 1 },
        uEdgeRow: { value: SCENES.length },
        uRes: { value: new THREE.Vector2() },
        uCell: { value: new THREE.Vector2() },
        uCenter: { value: new THREE.Vector2() },
        uSpin: { value: 0 },
        uWave: { value: WAVE_DONE },
        uPulse: { value: 0 },
        uRowA: { value: 0 }, uRowB: { value: 0 },
        uBgA: pal(), uInkA: pal(), uFaA: pal(), uFbA: pal(), uAccA: pal(),
        uBgB: pal(), uInkB: pal(), uFaB: pal(), uFbB: pal(), uAccB: pal(),
        uShip: { value: new THREE.Vector3(...SHIP) }
      },
      vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: GLYPH_PASS,
      depthTest: false,
      depthWrite: false
    });
    this.postScene = new THREE.Scene();
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post));
    this.postCamera = new THREE.Camera();
    this._setPalette('A', 0);
    this._setPalette('B', 0);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Rebuilds the center polygon and the background wedges for a side count */
  setSides(sides) {
    if (sides === this.sides) return;
    this.sides = sides;
    const sector = TAU / sides;
    const corner = (i, r) => new THREE.Vector2(Math.cos(i * sector) * r, Math.sin(i * sector) * r);

    for (const m of this.wedges.children) m.geometry.dispose();
    this.wedges.clear();
    for (let i = 0; i < sides; i++) {
      const shape = new THREE.Shape([corner(i, CENTER_R), corner(i + 1, CENTER_R), corner(i + 1, 40), corner(i, 40)]);
      // An odd count would put two equal wedges side by side: the last one takes the middle shade
      const mat = sides % 2 && i === sides - 1 ? this.wedgeMats[2] : this.wedgeMats[i % 2];
      this.wedges.add(new THREE.Mesh(new THREE.ShapeGeometry(shape), mat));
    }

    if (this.center) {
      this.center.geometry.dispose();
      this.world.remove(this.center);
    }
    const poly = new THREE.Shape(Array.from({ length: sides }, (_, i) => corner(i, CENTER_R)));
    this.center = new THREE.Mesh(new THREE.ShapeGeometry(poly), this.centerMat);
    this.center.position.z = 0.02; // above the walls sliding into it
    this.world.add(this.center);
  }

  /** Sweeps a new scene out from the center and turns the lean; instant when `sweep` is false */
  setScene(index, sweep = true) {
    index %= SCENES.length;
    if (this.wave < WAVE_DONE) this._setPalette('A', this.sceneIndex); // finish the previous sweep
    else if (!sweep && index === this.sceneIndex) return;
    this.sceneIndex = index;
    this._setPalette('B', index);
    if (sweep) {
      this.wave = 0;
      if (!this.reducedMotion) {
        this.punch = 0.1;
        this.dolly = DOLLY;
        this.axisTarget += (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 1.3);
      }
    } else {
      this._setPalette('A', index);
      this.wave = WAVE_DONE;
    }
  }

  _setPalette(slot, index) {
    const s = SCENES[index];
    const u = this.post.uniforms;
    u[`uRow${slot}`].value = index;
    u[`uBg${slot}`].value.set(...s.bg);
    u[`uInk${slot}`].value.set(...s.ink);
    u[`uFa${slot}`].value.set(...s.fa);
    u[`uFb${slot}`].value.set(...s.fb);
    u[`uAcc${slot}`].value.set(...s.acc);
  }

  shake(amount) {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  /**
   * rotation: world spin (rad). fx.pulse: 0..1 on each beat. fx.tilt: 0..1,
   * how far the plane leans in perspective (eased; the axis turns at drops).
   */
  render(dt, rotation, fx = { pulse: 0, tilt: 0 }) {
    const calm = this.reducedMotion;
    const pulse = fx.pulse * (calm ? 0.3 : 1);

    // Exponential approach: smooth into a new lean, never past it
    const k = 1 - Math.exp(-dt * LEAN_EASE);
    this.lean += ((calm ? 0 : fx.tilt * LEAN_MAX) - this.lean) * k;
    this.axis += (this.axisTarget - this.axis) * k;
    this.tiltOuter.rotation.z = this.axis;
    this.tiltPlane.rotation.x = this.lean * (1 + 0.04 * pulse); // breathes on the beat
    this.world.rotation.z = rotation - this.axis;
    const zoom = 1 + 0.03 * pulse + this.punch;
    this.world.scale.set(zoom, zoom, 1);
    if (this.center) this.center.scale.setScalar(1 + 0.12 * pulse);
    this.punch *= Math.exp(-dt * 6);
    this.dolly *= Math.exp(-dt * 3);

    // Wider fov, camera closer: the flat frame holds while the leaning plane deepens
    const cam = this.camera;
    cam.fov = FOV + FOV_LEAN * (this.lean / LEAN_MAX) + this.dolly;
    cam.updateProjectionMatrix();
    const s = this.shakeAmount;
    cam.position.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s,
      this.halfH / Math.tan(cam.fov * Math.PI / 360));
    cam.updateMatrixWorld();
    this.shakeAmount = Math.max(0, s - dt * 2.5);

    if (this.wave < WAVE_DONE) {
      this.wave += dt * WAVE_SPEED;
      if (this.wave >= WAVE_DONE) this._setPalette('A', this.sceneIndex);
    }

    const u = this.post.uniforms;
    u.uWave.value = this.wave;
    u.uPulse.value = pulse;
    u.uSpin.value = rotation;
    const { x: w, y: h } = u.uRes.value;
    const o = this._origin.set(0, 0, 0).project(cam);
    u.uCenter.value.set((o.x + 1) * w / 2, (o.y + 1) * h / 2);

    this.gl.setRenderTarget(this.target);
    this.gl.render(this.scene, cam);
    this.gl.setRenderTarget(null);
    this.gl.render(this.postScene, this.postCamera);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const aspect = w / h;
    this.halfH = Math.max(MIN_HALF_H, MIN_HALF_W / aspect);
    this.camera.aspect = aspect;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.gl.setPixelRatio(dpr);
    this.gl.setSize(w, h);
    const size = this.gl.getDrawingBufferSize(new THREE.Vector2());
    size.max(new THREE.Vector2(1, 1)); // a hidden page reports 0x0: keep the target valid
    this.target.setSize(size.x, size.y);
    this.post.uniforms.uRes.value.copy(size);
    // Finest glyph cell: taller than wide, like type; finer on small screens
    const cellH = Math.max(9, Math.min(15, Math.min(w, h) / 64)) * dpr;
    this.post.uniforms.uCell.value.set(Math.round(cellH * 0.7), Math.round(cellH));
  }
}

/**
 * One row of 16 glyph tiles per scene, ordered by measured ink so density
 * tracks light whatever font the device has. Column 0 stays empty. Glyphs the
 * device can't draw (they render like a known-missing code point) are dropped.
 * A last row holds the edge lines - / | \ in columns 1 to 4.
 */
function buildAtlas(sets) {
  const TW = 32, TH = 46, COLS = 16;
  const tile = document.createElement('canvas');
  tile.width = TW;
  tile.height = TH;
  const t = tile.getContext('2d', { willReadFrequently: true });
  const draw = (ch, scale = 0.74) => {
    t.clearRect(0, 0, TW, TH);
    t.font = `${Math.round(TH * scale)}px ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace`;
    t.textAlign = 'center';
    t.textBaseline = 'middle';
    t.fillStyle = '#fff';
    t.fillText(ch, TW / 2, TH / 2);
    return t.getImageData(0, 0, TW, TH).data;
  };
  const missing = draw('\u{10FFFD}').join();
  const ink = (ch) => {
    const d = draw(ch);
    let sum = 0;
    for (let i = 3; i < d.length; i += 4) sum += d[i];
    return d.join() === missing ? 0 : sum;
  };

  const atlas = document.createElement('canvas');
  atlas.width = TW * COLS;
  atlas.height = TH * (sets.length + 1);
  const a = atlas.getContext('2d');
  a.fillStyle = '#000';
  a.fillRect(0, 0, atlas.width, atlas.height);
  sets.forEach((set, row) => {
    const glyphs = [...set].map((ch) => ({ ch, ink: ink(ch) }))
      .filter((g) => g.ink > 0).sort((p, q) => p.ink - q.ink);
    if (!glyphs.length) glyphs.push({ ch: '#' });
    for (let col = 1; col < COLS; col++) {
      draw(glyphs[Math.round(((col - 1) / (COLS - 2)) * (glyphs.length - 1))].ch);
      a.drawImage(tile, col * TW, row * TH);
    }
  });
  // Box-drawing lines run cell to cell; plain ASCII where the font lacks them
  [['─', '-'], ['╱', '/'], ['│', '|'], ['╲', '\\']].forEach(([line, plain], i) => {
    draw(ink(line) ? line : plain, 0.9);
    a.drawImage(tile, (i + 1) * TW, sets.length * TH);
  });
  const tex = new THREE.CanvasTexture(atlas);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

const GLYPH_PASS = /* glsl */ `
  precision highp float;
  uniform sampler2D tScene;
  uniform sampler2D tAtlas;
  uniform float uRows;
  uniform float uEdgeRow;
  uniform vec2 uRes;
  uniform vec2 uCell;
  uniform vec2 uCenter;
  uniform float uSpin;
  uniform float uWave;
  uniform float uPulse;
  uniform float uRowA;
  uniform float uRowB;
  uniform vec3 uBgA, uInkA, uFaA, uFbA, uAccA, uBgB, uInkB, uFaB, uFbB, uAccB;
  uniform vec3 uShip;

  vec4 S(vec2 px) { return texture2D(tScene, px / uRes); }

  // A block is calm when four samples agree: no wall, no ship, flat light
  bool calm(vec2 org, vec2 size) {
    vec4 a = S(org + size * vec2(0.25, 0.25));
    vec4 b = S(org + size * vec2(0.75, 0.25));
    vec4 c = S(org + size * vec2(0.25, 0.75));
    vec4 d = S(org + size * vec2(0.75, 0.75));
    float lo = min(min(a.r, b.r), min(c.r, d.r));
    float hi = max(max(a.r, b.r), max(c.r, d.r));
    float flags = a.g + a.b + b.g + b.b + c.g + c.b + d.g + d.b;
    return hi - lo < 0.04 && hi < 0.5 && flags < 0.01;
  }

  // Two soft blobs of the scene's field colors, turning with the world
  vec3 field(vec2 px, vec3 fa, vec3 fb, out float w) {
    vec2 v = (px - uCenter) / uRes.y;
    vec2 b = 0.42 * vec2(cos(uSpin + 0.7), sin(uSpin + 0.7));
    float w1 = exp(-dot(v - b, v - b) * 3.0);
    float w2 = exp(-dot(v + b, v + b) * 3.0);
    w = 0.5 * (w1 + w2);
    return (fa * w1 + fb * w2 + 0.3 * mix(fa, fb, 0.5)) / (w1 + w2 + 0.3);
  }

  void main() {
    vec2 frag = gl_FragCoord.xy;

    // Flat areas take 4x or 2x cells; walls, edges and the ship keep the fine grid
    vec2 B = uCell;
    vec2 cell = 4.0 * B;
    vec2 org = floor(frag / cell) * cell;
    float fine = 0.0;
    if (!calm(org, cell)) {
      cell = 2.0 * B;
      org = floor(frag / cell) * cell;
      if (!calm(org, cell)) {
        cell = B;
        org = floor(frag / cell) * cell;
        fine = 1.0;
      }
    }
    vec2 cc = org + 0.5 * cell;
    vec2 inCell = (frag - org) / cell;
    vec4 c = S(cc);    // one sample per cell picks the glyph
    vec4 p = S(frag);  // per pixel keeps edges and the ship sharp
    float d = length(cc - uCenter) / (0.5 * length(uRes));

    // The new scene fills everything inside the sweeping front
    float inB = step(d, uWave);
    float fd = (d - uWave) * 9.0; // squared by hand: pow() is undefined for a negative base
    float front = uWave < 1.6 ? exp(-fd * fd) : 0.0;
    vec3 bg = mix(uBgA, uBgB, inB);
    vec3 ink = mix(uInkA, uInkB, inB);
    vec3 acc = mix(uAccA, uAccB, inB);
    vec3 fa = mix(uFaA, uFaB, inB);
    vec3 fb = mix(uFbA, uFbB, inB);
    float row = mix(uRowA, uRowB, inB);

    // Each beat sends a soft ring of denser glyphs out from the center
    float rd = (d - (1.0 - uPulse) * 0.9) * 8.0;
    float ring = uPulse * exp(-rd * rd);
    float lum = clamp(c.r + 0.55 * front + ring * (0.1 + 0.4 * c.r), 0.0, 1.0);
    float level = floor(lum * 15.0 + 0.5);
    float alpha = clamp(0.3 + p.r, 0.0, 1.0);

    // A fine cell on the dim side of a hard edge draws the edge as a line
    if (fine > 0.5 && c.b < 0.01) {
      float l = S(cc - vec2(B.x, 0.0)).r;
      float r = S(cc + vec2(B.x, 0.0)).r;
      float dn = S(cc - vec2(0.0, B.y)).r;
      float up = S(cc + vec2(0.0, B.y)).r;
      vec2 g = vec2((r - l) * B.y / B.x, up - dn);
      if (length(g) > 0.45 && c.r < max(max(l, r), max(dn, up)) - 0.3) {
        float a = mod(atan(g.y, g.x) + 1.5707963, 3.1415927); // the edge runs across the gradient
        level = 1.0 + mod(floor(a / 0.7853982 + 0.5), 4.0);
        row = uEdgeRow;
        lum = 0.8;
        alpha = 0.9;
      }
    }

    vec2 uv = vec2((level + inCell.x) / 16.0, (uRows - row - 1.0 + inCell.y) / uRows);
    float glyph = texture2D(tAtlas, uv).r;

    // Glyphs take the field's color; the bright ones (walls) lean to the scene's ink
    float wc, wp;
    vec3 fCell = field(cc, fa, fb, wc);
    vec3 fPix = field(frag, fa, fb, wp);
    vec3 inkCol = mix(fCell * (0.45 + 0.55 * lum), ink, 0.75 * smoothstep(0.5, 1.0, lum));
    inkCol = mix(inkCol, acc, c.g);

    vec3 col = mix(bg, fPix, 0.08 + 0.12 * wp); // the soft color field behind everything
    col += inkCol * p.r * 0.12;                 // faint solid body: the true wall edge stays readable
    col = mix(col, inkCol, glyph * alpha);
    col *= 1.0 - 0.2 * smoothstep(0.8, 1.4, d);
    col = mix(col, uShip, clamp(p.b, 0.0, 1.0));
    gl_FragColor = vec4(col, 1.0);
  }
`;
