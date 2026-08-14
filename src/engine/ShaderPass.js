import * as THREE from 'three';

/**
 * ShaderPass — 2D Cartoon Neobrutalism & Turbo Motion Warp
 * WebGL post-processing shader for VÉRTICE:
 * - Radial speed warp & tunnel distortion when holding SHIFT (uTurbo)
 * - Beat-reactive chromatic aberration & radial vignette
 * - Subtle film grain texture for a tactile arcade screen aesthetic
 * - Razor-sharp edge enhancement
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

          // 1. Radial Motion Warp
          float warpFactor = uTurbo * 0.045 * sin(dist * 18.0 - uTime * 12.0);
          vec2 warpedUv = uv - distVec * warpFactor;

          // 2. Chromatic Aberration (reactive on kicks and turbo)
          float shiftAmount = (0.002 + uBeatPulse * 0.005 + uTurbo * 0.012) * (dist + 0.2);
          float r = texture2D(tDiffuse, warpedUv + vec2(shiftAmount, 0.0)).r;
          float g = texture2D(tDiffuse, warpedUv).g;
          float b = texture2D(tDiffuse, warpedUv - vec2(shiftAmount, 0.0)).b;
          vec3 color = vec3(r, g, b);

          // 3. Radial Speed Lines during Turbo
          if (uTurbo > 0.01) {
            float angle = atan(distVec.y, distVec.x);
            float speedLine = sin(angle * 32.0 + uTime * 25.0);
            speedLine = smoothstep(0.7, 1.0, speedLine) * uTurbo * smoothstep(0.25, 0.8, dist);
            color += vec3(speedLine * 0.35);
          }

          // 4. Subtle Film Grain
          float grain = (rand(uv * uTime) - 0.5) * 0.032;
          color += grain;

          // 5. Aesthetic Radial Vignette
          float vignette = 1.0 - smoothstep(0.48, 0.96, dist);
          color *= mix(0.80, 1.0, vignette);

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

  render(scene, camera, time, turboAmount, beatPulse) {
    this.renderer.setRenderTarget(this.renderTarget);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);

    this.material.uniforms.tDiffuse.value = this.renderTarget.texture;
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uTurbo.value = turboAmount;
    this.material.uniforms.uBeatPulse.value = beatPulse;

    this.renderer.render(this.scene, this.camera);
  }
}
