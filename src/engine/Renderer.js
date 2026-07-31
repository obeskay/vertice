import * as THREE from 'three';
import { ShaderPass } from './ShaderPass.js?v=1.0.2';

/**
 * Renderer
 * Dramatic 3D Perspective camera with 100% crystal clear readability.
 * Zero light glare, high contrast, clean central polygon, screen shake,
 * and 2D Cartoon Neobrutalism ShaderPass with Turbo motion warp.
 */
export class Renderer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    
    // Scene setup
    this.scene = new THREE.Scene();
    this.bgColor = new THREE.Color(0x0c0d12);
    this.scene.background = this.bgColor;

    // Dramatic 3D Perspective Camera (Perfect Distance & Reading Angle)
    this.camera = new THREE.PerspectiveCamera(
      65,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    this.baseCameraPos = new THREE.Vector3(0, -2.1, 7.7);
    this.camera.position.copy(this.baseCameraPos);
    this.camera.lookAt(0, 0.15, 0);

    // WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // Custom Post-Processing Shader Pass (Cartoon Neobrutalism & Turbo Speed-Warp)
    this.shaderPass = new ShaderPass(this.renderer, window.innerWidth, window.innerHeight);
    this.totalTime = 0;
    this.turboAmount = 0;

    // Central Polygon Mesh Group
    this.centerGroup = new THREE.Group();
    this.scene.add(this.centerGroup);
    this.centerMesh = null;
    this.centerEdges = null;

    // GAJOS: campo de cuñas del fondo que une las simetrías del nivel.
    // Dos tonos alternados del hue activo, con parallax contra el mundo
    // (giran más lento → ilusión óptica de túnel profundo).
    this.wedgeGroup = new THREE.Group();
    this.wedgeGroup.position.z = -2.5;
    this.scene.add(this.wedgeGroup);
    this._wedgeSides = 0;
    this.wedgeMatA = new THREE.MeshBasicMaterial({ color: 0x141a18, side: THREE.DoubleSide });
    this.wedgeMatB = new THREE.MeshBasicMaterial({ color: 0x0c100f, side: THREE.DoubleSide });

    // Camera FOV Kick & Screen Shake
    this.fovKick = 0;
    this.shakeIntensity = 0;
    this.shakeDecay = 5.0;
    this.shakeOffset = new THREE.Vector3();

    // High-Contrast Flat Lighting (No over-exposed specular glares!)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.4);
    dirLight.position.set(0, 5, 12);
    this.scene.add(dirLight);

    window.addEventListener('resize', () => this.onWindowResize());
  }

  /**
   * Gajos del fondo: `sides` cuñas alternadas A/B que salen del centro.
   * Cacheado por número de lados; los colores se actualizan siempre.
   */
  updateWedges(sides, colorA, colorB) {
    if (this._wedgeSides !== sides) {
      this._wedgeSides = sides;
      while (this.wedgeGroup.children.length) {
        const m = this.wedgeGroup.children.pop();
        m.geometry.dispose();
      }
      const TAU = Math.PI * 2;
      const sector = TAU / sides;
      const R0 = 1.0;
      const R1 = 60;
      for (let i = 0; i < sides; i++) {
        const a0 = i * sector;
        const a1 = (i + 1) * sector;
        const shape = new THREE.Shape();
        shape.moveTo(Math.cos(a0) * R0, Math.sin(a0) * R0);
        shape.lineTo(Math.cos(a1) * R0, Math.sin(a1) * R0);
        shape.lineTo(Math.cos(a1) * R1, Math.sin(a1) * R1);
        shape.lineTo(Math.cos(a0) * R1, Math.sin(a0) * R1);
        shape.closePath();
        const mesh = new THREE.Mesh(
          new THREE.ShapeGeometry(shape),
          i % 2 === 0 ? this.wedgeMatA : this.wedgeMatB
        );
        this.wedgeGroup.add(mesh);
      }
    }
    if (typeof colorA === 'number') this.wedgeMatA.color.setHex(colorA);
    if (typeof colorB === 'number') this.wedgeMatB.color.setHex(colorB);
  }

  /**
   * Polígono central estilo Super Hexagon: relleno casi negro + contorno
   * de ACENTO brillante. CACHEADO por número de lados — jamás reconstruye
   * geometría por frame; el color se aplica vía material.
   */
  updateCenterPolygon(sides, colorHex, outlineHex = null) {
    if (this._centerSides !== sides) {
      this._centerSides = sides;

      if (this.centerMesh) {
        this.centerGroup.remove(this.centerMesh);
        this.centerMesh.geometry.dispose();
      }
      if (this.centerEdges) {
        this.centerGroup.remove(this.centerEdges);
        this.centerEdges.geometry.dispose();
      }

      const radius = 1.05;
      const shape = new THREE.Shape();
      const sectorAngle = (Math.PI * 2) / sides;
      if (sides < 3) {
        // PUNTO/LÍNEA: el centro es una BARRA (la forma de 2 lados)
        shape.moveTo(-radius, -radius * 0.26);
        shape.lineTo(radius, -radius * 0.26);
        shape.lineTo(radius, radius * 0.26);
        shape.lineTo(-radius, radius * 0.26);
        shape.closePath();
      } else {
        for (let i = 0; i < sides; i++) {
          const angle = i * sectorAngle;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          if (i === 0) shape.moveTo(x, y);
          else shape.lineTo(x, y);
        }
        shape.closePath();
      }

      // Sólido extruido con profundidad (look 3D del original)
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: 0.22,
        bevelEnabled: false
      });
      geometry.center();

      this.centerMat = new THREE.MeshBasicMaterial({
        color: typeof colorHex === 'number' ? colorHex : 0x0a0b10,
        side: THREE.DoubleSide
      });
      this.centerMesh = new THREE.Mesh(geometry, this.centerMat);
      this.centerGroup.add(this.centerMesh);

      // Contorno de acento (anillo de líneas del polígono)
      const outlinePts = [];
      const innerOutlinePts = [];
      const innerRadius = radius * 0.55;

      for (let i = 0; i <= sides; i++) {
        const a = (i % sides) * sectorAngle;
        outlinePts.push(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0.13));
        innerOutlinePts.push(new THREE.Vector3(Math.cos(a) * innerRadius, Math.sin(a) * innerRadius, 0.14));
      }

      this.centerOutlineMat = new THREE.LineBasicMaterial({ color: 0x00ff66 });
      this.centerEdges = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(outlinePts),
        this.centerOutlineMat
      );
      this.centerGroup.add(this.centerEdges);

      // Emblema concéntrico interno
      this.centerInnerEdges = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(innerOutlinePts),
        this.centerOutlineMat
      );
      this.centerGroup.add(this.centerInnerEdges);
    } else {
      if (this.centerMat && typeof colorHex === 'number') {
        this.centerMat.color.setHex(colorHex);
      } else if (this.centerMat && colorHex && colorHex.getHex) {
        this.centerMat.color.copy(colorHex);
      }
    }

    // Contorno de acento siempre actualizable (barato)
    if (this.centerOutlineMat && outlineHex !== null) {
      if (typeof outlineHex === 'number') this.centerOutlineMat.color.setHex(outlineHex);
      else if (outlineHex && outlineHex.getHex) this.centerOutlineMat.color.copy(outlineHex);
    }
  }

  triggerScreenShake(intensity = 0.7) {
    this.shakeIntensity = intensity;
  }

  triggerFovKick(amount = 8) {
    this.fovKick = amount;
  }

  /** Flash de fondo al beat: mezcla el acento brevemente */
  triggerBgFlash(color, intensity = 0.055) {
    if (!this._flashColor) this._flashColor = new THREE.Color(0x00ff66);
    if (typeof color === 'number') this._flashColor.setHex(color);
    else if (color && color.getHex) this._flashColor.copy(color);
    this._flashIntensity = intensity;
  }

  render(audioBeatPulse = 0, deltaTime = 0.016, worldRotation = 0, turboActive = false) {
    this.totalTime += deltaTime;
    const targetTurbo = turboActive ? 1.0 : 0.0;
    this.turboAmount += (targetTurbo - this.turboAmount) * Math.min(1, deltaTime * 12.0);

    if (this.fovKick > 0) {
      this.fovKick = Math.max(0, this.fovKick - deltaTime * 30.0);
    }

    const targetFov = 65 + audioBeatPulse * 1.8 + this.fovKick + this.turboAmount * 5.0;
    this.camera.fov += (targetFov - this.camera.fov) * 0.15;
    this.camera.updateProjectionMatrix();

    const zSurge = this.baseCameraPos.z - audioBeatPulse * 0.15;
    this.camera.position.z = zSurge;

    if (this.shakeIntensity > 0) {
      this.shakeOffset.set(
        (Math.random() - 0.5) * this.shakeIntensity,
        (Math.random() - 0.5) * this.shakeIntensity,
        0
      );
      this.shakeIntensity = Math.max(0, this.shakeIntensity - deltaTime * this.shakeDecay);
    } else {
      this.shakeOffset.set(0, 0, 0);
    }

    this.camera.position.x = this.baseCameraPos.x + this.shakeOffset.x;
    this.camera.position.y = this.baseCameraPos.y + this.shakeOffset.y;

    // Flash de fondo con decaimiento exponencial
    if (this._flashIntensity > 0.001) {
      this.scene.background.copy(this.bgColor).lerp(this._flashColor, this._flashIntensity);
      this._flashIntensity *= Math.pow(0.001, deltaTime * 2.4);
    } else {
      this.scene.background.copy(this.bgColor);
    }

    this.scene.rotation.z = worldRotation;

    // Pulso rítmico y dinámico de la figura central al ritmo del bombo
    const centerPulse = 1 + audioBeatPulse * 0.075;
    this.centerGroup.scale.set(centerPulse, centerPulse, 1);
    if (this.centerInnerEdges) {
      this.centerInnerEdges.rotation.z = worldRotation * 0.45;
    }

    // Parallax de gajos: contra-rotan 0.38x → giran a 0.62x del mundo.
    // La ilusión: el túnel respira detrás de los muros (hipnótico, no estrobo).
    this.wedgeGroup.rotation.z = -worldRotation * 0.38;
    const wedgePulse = 1 + audioBeatPulse * 0.012;
    this.wedgeGroup.scale.set(wedgePulse, wedgePulse, 1);

    // 2D Cartoon Neobrutalism Post-Processing Shader Pass
    this.shaderPass.render(this.scene, this.camera, this.totalTime, this.turboAmount, audioBeatPulse);
  }

  setBackgroundColor(colorHex) {
    if (typeof colorHex === 'number') {
      this.bgColor.setHex(colorHex);
    } else if (colorHex && colorHex.getHex) {
      this.bgColor.copy(colorHex);
    }
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    if (this.shaderPass) {
      this.shaderPass.setSize(window.innerWidth, window.innerHeight);
    }
  }
}
