import * as THREE from 'three';

/**
 * ShaderPass — 2D Cartoon Neobrutalism & Turbo Motion Warp
 * WebGL post-processing shader for VÉRTICE:
 * - High-DPI Retina native render target (pixel-perfect sharpness)
 * - Radial speed warp & tunnel distortion when holding SHIFT (uTurbo)
 * - Beat-reactive chromatic aberration & radial vignette
 * - Subtle film grain texture for tactile arcade monitor feel
 */
export class ShaderPass {
  constructor(renderer, width, height) {
    this.renderer = renderer;
    this.width = width;
    this.height = height;

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.renderTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat
    });

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uTurbo: { value: 0 },
        uBeatPulse: { value: 0 },
        uDashPulse: { value: 0 },
        uResolution: { value: new THREE.Vector2(width, height) }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uTime;
        uniform float uTurbo;
        uniform float uBeatPulse;
        uniform float uDashPulse;
        uniform vec2 uResolution;
        varying vec2 vUv;

        float rand(vec2 co) {
          return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
          vec2 uv = vUv;
          vec2 center = vec2(0.5);
          vec2 distVec = uv - center;
          float dist = length(distVec);

          // 1. Radial Motion Warp in Turbo & Phase Dash
          float warpFactor = (uTurbo * 0.045 + uDashPulse * 0.08) * sin(dist * 18.0 - uTime * 14.0);
          vec2 warpedUv = uv - distVec * warpFactor;

          // 2. Chromatic Aberration (kicks with bass beats, turbo, and phase dash)
          float shiftAmount = (0.0018 + uBeatPulse * 0.0045 + uTurbo * 0.010 + uDashPulse * 0.022) * (dist + 0.2);
          float r = texture2D(tDiffuse, warpedUv + vec2(shiftAmount, 0.0)).r;
          float g = texture2D(tDiffuse, warpedUv).g;
          float b = texture2D(tDiffuse, warpedUv - vec2(shiftAmount, 0.0)).b;
          vec3 color = vec3(r, g, b);

          // 3. Radial Speed Lines during Turbo or Dash
          float speedIntensity = max(uTurbo, uDashPulse * 1.5);
          if (speedIntensity > 0.01) {
            float angle = atan(distVec.y, distVec.x);
            float speedLine = sin(angle * 32.0 + uTime * 28.0);
            speedLine = smoothstep(0.70, 1.0, speedLine) * speedIntensity * smoothstep(0.20, 0.8, dist);
            color += vec3(speedLine * 0.38);
          }

          // 4. Subtle Tactile Grain
          float grain = (rand(uv * uTime) - 0.5) * 0.025;
          color += grain;

          // 5. High-Contrast Vignette
          float vignette = 1.0 - smoothstep(0.50, 0.98, dist);
          color *= mix(0.82, 1.0, vignette);

          gl_FragColor = vec4(color, 1.0);
        }
      `
    });

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.scene.add(quad);
  }

  setSize(width, height) {
    this.width = width;
    this.height = height;
    this.renderTarget.setSize(width, height);
    this.material.uniforms.uResolution.value.set(width, height);
  }

  render(scene, camera, time, turboAmount, beatPulse, dashPulse = 0) {
    this.renderer.setRenderTarget(this.renderTarget);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);

    this.material.uniforms.tDiffuse.value = this.renderTarget.texture;
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uTurbo.value = turboAmount;
    this.material.uniforms.uBeatPulse.value = beatPulse;
    this.material.uniforms.uDashPulse.value = dashPulse;

    this.renderer.render(this.scene, this.camera);
  }
}
