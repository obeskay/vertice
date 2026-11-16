import * as THREE from 'three';
import { SCENES, SHIP, DATA } from '../palette.js';

const TAU = Math.PI * 2;
const CENTER_R = 1.05;   // WallManager.centerRadius
const MIN_HALF_W = 3.3;  // world units always visible left/right of the center (phones)
const MIN_HALF_H = 4.2;  // and above/below it (desktop)
const WAVE_SPEED = 2.6;  // half-diagonals per second: how fast a new scene sweeps out
const WAVE_DONE = 1.6;   // past the corners

const data = (r, g = 0, b = 0) => new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(r, g, b) });

/**
 * Two passes. The game draws flat "data" colors into a render target (light,
 * killer flag, solid), then a full-screen pass turns every cell of the screen
 * into a glyph whose density follows that light, colored by the scene's
 * duotone. The ship and sparks skip the glyphs so you always see yourself.
 * World transform: tilt (pseudo-3D squash) > world (spin, beat zoom).
 */
export class Renderer {
  constructor(containerId, reducedMotion = false) {
    this.reducedMotion = reducedMotion;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color().setRGB(0, 0, 0);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
    this.camera.position.z = 10;

    this.gl = new THREE.WebGLRenderer({ antialias: false });
    document.getElementById(containerId).appendChild(this.gl.domElement);
    this.target = new THREE.WebGLRenderTarget(1, 1, { samples: 4 });

    this.tiltOuter = new THREE.Group();
    this.tiltSquash = new THREE.Group();
    this.world = new THREE.Group();
    this.scene.add(this.tiltOuter);
    this.tiltOuter.add(this.tiltSquash);
    this.tiltSquash.add(this.world);

    this.wedges = new THREE.Group();
    this.wedges.position.z = -1;
    this.world.add(this.wedges);
    this.wedgeMats = DATA.wedge.map((r) => data(r));
    this.centerMat = data(DATA.center);
    this.center = null;
    this.sides = 0;

    this.shakeAmount = 0;
    this.punch = 0;
    this.flash = 0;
    this.sceneIndex = 0;
    this.wave = WAVE_DONE;

    this.post = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: this.target.texture },
        tAtlas: { value: buildAtlas(SCENES.map((s) => s.glyphs)) },
        uRows: { value: SCENES.length },
        uRes: { value: new THREE.Vector2() },
        uCell: { value: new THREE.Vector2() },
        uCenter: { value: new THREE.Vector2() },
        uWave: { value: WAVE_DONE },
        uPulse: { value: 0 },
        uFlash: { value: 0 },
        uRowA: { value: 0 }, uRowB: { value: 0 },
        uPriA: { value: new THREE.Vector3() }, uSecA: { value: new THREE.Vector3() }, uAccA: { value: new THREE.Vector3() },
        uPriB: { value: new THREE.Vector3() }, uSecB: { value: new THREE.Vector3() }, uAccB: { value: new THREE.Vector3() },
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
    this.center.position.z = 0.2; // above the walls sliding into it
    this.world.add(this.center);
  }

  /** Sweeps a new scene out from the center; instant when `sweep` is false */
  setScene(index, sweep = true) {
    index %= SCENES.length;
    if (this.wave < WAVE_DONE) this._setPalette('A', this.sceneIndex); // finish the previous sweep
    else if (!sweep && index === this.sceneIndex) return;
    this.sceneIndex = index;
    this._setPalette('B', index);
    if (sweep) {
      this.wave = 0;
      this.flash = 1;
      if (!this.reducedMotion) this.punch = 0.1;
    } else {
      this._setPalette('A', index);
      this.wave = WAVE_DONE;
    }
  }

  _setPalette(slot, index) {
    const s = SCENES[index];
    const u = this.post.uniforms;
    u[`uRow${slot}`].value = index;
    u[`uPri${slot}`].value.set(...s.pri);
    u[`uSec${slot}`].value.set(...s.sec);
    u[`uAcc${slot}`].value.set(...s.acc);
  }

  shake(amount) {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  /**
   * rotation: world spin (rad). fx.pulse: 0..1 on each beat. fx.tilt: 0..1
   * pseudo-3D squash. fx.time: seconds, drives the tilt axis.
   */
  render(dt, rotation, fx = { pulse: 0, tilt: 0, time: 0 }) {
    const calm = this.reducedMotion;
    const pulse = fx.pulse * (calm ? 0.3 : 1);
    const tilt = calm ? 0 : fx.tilt;

    // Tilt: squash along an axis that drifts, so the plane seems to lean in 3D
    const phi = fx.time * 0.45;
    this.tiltOuter.rotation.z = phi;
    this.tiltSquash.scale.set(1, 1 - 0.22 * tilt * (0.6 + 0.4 * Math.sin(fx.time * 0.9)), 1);
    this.world.rotation.z = rotation - phi;
    const zoom = 1 + 0.03 * pulse + this.punch;
    this.world.scale.set(zoom, zoom, 1);
    if (this.center) this.center.scale.setScalar(1 + 0.12 * pulse);
    this.punch *= Math.exp(-dt * 6);

    const s = this.shakeAmount;
    this.camera.position.x = (Math.random() - 0.5) * s;
    this.camera.position.y = (Math.random() - 0.5) * s;
    this.shakeAmount = Math.max(0, s - dt * 2.5);

    if (this.wave < WAVE_DONE) {
      this.wave += dt * WAVE_SPEED;
      if (this.wave >= WAVE_DONE) this._setPalette('A', this.sceneIndex);
    }
    this.flash *= Math.exp(-dt * 5);

    const u = this.post.uniforms;
    u.uWave.value = this.wave;
    u.uPulse.value = pulse;
    u.uFlash.value = this.flash;
    const { x: w, y: h } = u.uRes.value;
    u.uCenter.value.set(w / 2 - (this.camera.position.x / this.camera.right) * w / 2,
      h / 2 - (this.camera.position.y / this.camera.top) * h / 2);

    this.gl.setRenderTarget(this.target);
    this.gl.render(this.scene, this.camera);
    this.gl.setRenderTarget(null);
    this.gl.render(this.postScene, this.postCamera);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const aspect = w / h;
    const halfH = Math.max(MIN_HALF_H, MIN_HALF_W / aspect);
    const halfW = halfH * aspect;
    Object.assign(this.camera, { left: -halfW, right: halfW, top: halfH, bottom: -halfH });
    this.camera.updateProjectionMatrix();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.gl.setPixelRatio(dpr);
    this.gl.setSize(w, h);
    const size = this.gl.getDrawingBufferSize(new THREE.Vector2());
    size.max(new THREE.Vector2(1, 1)); // a hidden page reports 0x0: keep the target valid
    this.target.setSize(size.x, size.y);
    this.post.uniforms.uRes.value.copy(size);
    // Glyph cells: taller than wide, like type; finer on small screens
    const cellH = Math.max(10, Math.min(18, Math.min(w, h) / 55)) * dpr;
    this.post.uniforms.uCell.value.set(Math.round(cellH * 0.7), Math.round(cellH));
  }
}

/**
 * One row of 16 glyph tiles per scene, ordered by measured ink so density
 * tracks light whatever font the device has. Column 0 stays empty. Glyphs the
 * device can't draw (they render like a known-missing code point) are dropped.
 */
function buildAtlas(sets) {
  const TW = 24, TH = 34, COLS = 16;
  const tile = document.createElement('canvas');
  tile.width = TW;
  tile.height = TH;
  const t = tile.getContext('2d', { willReadFrequently: true });
  const font = `${Math.round(TH * 0.74)}px ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace`;
  const draw = (ch) => {
    t.clearRect(0, 0, TW, TH);
    t.font = font;
    t.textAlign = 'center';
    t.textBaseline = 'middle';
    t.fillStyle = '#fff';
    t.fillText(ch, TW / 2, TH / 2);
    return t.getImageData(0, 0, TW, TH).data;
  };
  const missing = draw('\u{10FFFD}').join();

  const atlas = document.createElement('canvas');
  atlas.width = TW * COLS;
  atlas.height = TH * sets.length;
  const a = atlas.getContext('2d');
  a.fillStyle = '#000';
  a.fillRect(0, 0, atlas.width, atlas.height);
  sets.forEach((set, row) => {
    const glyphs = [...set].map((ch) => {
      const d = draw(ch);
      let ink = 0;
      for (let i = 3; i < d.length; i += 4) ink += d[i];
      return { ch, ink, ok: ink > 0 && d.join() !== missing };
    }).filter((g) => g.ok).sort((p, q) => p.ink - q.ink);
    if (!glyphs.length) glyphs.push({ ch: '#' });
    for (let col = 1; col < COLS; col++) {
      const g = glyphs[Math.round(((col - 1) / (COLS - 2)) * (glyphs.length - 1))];
      draw(g.ch);
      a.drawImage(tile, col * TW, row * TH);
    }
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
  uniform vec2 uRes;
  uniform vec2 uCell;
  uniform vec2 uCenter;
  uniform float uWave;
  uniform float uPulse;
  uniform float uFlash;
  uniform float uRowA;
  uniform float uRowB;
  uniform vec3 uPriA, uSecA, uAccA, uPriB, uSecB, uAccB;
  uniform vec3 uShip;

  void main() {
    vec2 frag = gl_FragCoord.xy;
    vec2 cc = (floor(frag / uCell) + 0.5) * uCell;
    vec4 c = texture2D(tScene, cc / uRes);   // one sample per cell picks the glyph
    vec4 p = texture2D(tScene, frag / uRes); // per pixel keeps edges and the ship sharp
    float d = length(cc - uCenter) / (0.5 * length(uRes));

    // The new scene fills everything inside the sweeping front
    float inB = step(d, uWave);
    float fd = (d - uWave) * 9.0; // squared by hand: pow() is undefined for a negative base
    float front = uWave < 1.6 ? exp(-fd * fd) : 0.0;
    vec3 pri = mix(uPriA, uPriB, inB);
    vec3 sec = mix(uSecA, uSecB, inB);
    vec3 acc = mix(uAccA, uAccB, inB);
    float row = mix(uRowA, uRowB, inB);

    // Each beat sends a soft ring of denser glyphs out from the center
    float rd = (d - (1.0 - uPulse) * 0.9) * 8.0;
    float ring = uPulse * exp(-rd * rd);
    float lum = clamp(c.r + 0.55 * front + ring * (0.1 + 0.4 * c.r) + 0.12 * uFlash, 0.0, 1.0);

    float level = floor(lum * 15.0 + 0.5);
    vec2 inCell = fract(frag / uCell);
    vec2 uv = vec2((level + inCell.x) / 16.0, (uRows - row - 1.0 + inCell.y) / uRows);
    float glyph = texture2D(tAtlas, uv).r;

    // Duotone: shadows lean secondary, light goes primary and then toward white
    vec3 ink = lum < 0.5 ? mix(sec * 1.6, pri, lum * 2.0) : mix(pri, vec3(1.0), (lum - 0.5) * 0.45);
    ink = mix(ink, acc, c.g);

    vec3 col = sec * 0.07;
    col += ink * p.r * 0.16; // faint solid body: the true wall edge stays readable
    col = mix(col, ink, glyph * clamp(0.3 + p.r, 0.0, 1.0));
    col *= 1.0 - 0.45 * smoothstep(0.6, 1.3, d);
    col = mix(col, uShip, clamp(p.b, 0.0, 1.0));
    gl_FragColor = vec4(col, 1.0);
  }
`;
