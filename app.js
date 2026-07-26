import * as THREE from 'three';

/**
 * FPS Tracker
 */
class PerformanceMonitor {
  constructor(onUpdate) {
    this.onUpdate = onUpdate;
    this.frameCount = 0;
    this.lastTime = performance.now();
  }

  tick() {
    this.frameCount++;
    const now = performance.now();
    const elapsed = now - this.lastTime;

    if (elapsed >= 500) {
      const fps = Math.round((this.frameCount * 1000) / elapsed);
      if (this.onUpdate) this.onUpdate(fps);
      this.frameCount = 0;
      this.lastTime = now;
    }
  }
}

/**
 * Procedural Particle Universe System
 */
class ParticleUniverse {
  constructor(totalCount = 80000) {
    this.count = totalCount;
    this.geometry = new THREE.BufferGeometry();
    
    const positions = new Float32Array(this.count * 3);
    const colors = new Float32Array(this.count * 3);
    const sizes = new Float32Array(this.count);
    const phases = new Float32Array(this.count);
    const types = new Float32Array(this.count); // 0: Core, 1: Spiral, 2: Ambient outer

    const colorCoreInner = new THREE.Color(0xffffff); // Bright White
    const colorCoreMid = new THREE.Color(0xffaa00);   // Glowing Gold
    const colorCoreOuter = new THREE.Color(0xff4400); // Vivid Orange
    const colorAmbient = new THREE.Color(0xff8833);   // Amber Dust
    const colorAccent = new THREE.Color(0x33aaff);    // Soft Cyan Accent

    const coreCount = Math.floor(this.count * 0.45);
    const spiralCount = Math.floor(this.count * 0.35);

    for (let i = 0; i < this.count; i++) {
      let x, y, z, size, type, color;
      const phase = Math.random() * Math.PI * 2;

      if (i < coreCount) {
        // --- CENTRAL DENSE GLOWING CORE ---
        type = 0;
        const radius = Math.pow(Math.random(), 2.0) * 4.5 + 0.1;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        x = radius * Math.sin(phi) * Math.cos(theta);
        y = radius * Math.sin(phi) * Math.sin(theta) * 0.7; // Slightly flattened
        z = radius * Math.cos(phi);

        size = (1.0 - radius / 4.6) * 14.0 + Math.random() * 6.0;

        // Color interpolation by radial distance
        const normDist = radius / 4.6;
        if (normDist < 0.25) {
          color = colorCoreInner.clone().lerp(colorCoreMid, normDist * 4);
        } else {
          color = colorCoreMid.clone().lerp(colorCoreOuter, (normDist - 0.25) * 1.33);
        }
      } else if (i < coreCount + spiralCount) {
        // --- SPIRAL FILAMENTS ---
        type = 1;
        const armIndex = i % 3;
        const armOffset = (armIndex * Math.PI * 2) / 3;
        const dist = 3.5 + Math.random() * 12.0;
        const angle = dist * 0.4 + armOffset + (Math.random() - 0.5) * 0.4;

        x = Math.cos(angle) * dist + (Math.random() - 0.5) * 1.5;
        y = (Math.random() - 0.5) * (1.8 + dist * 0.1);
        z = Math.sin(angle) * dist + (Math.random() - 0.5) * 1.5;

        size = Math.random() * 8.0 + 4.0;
        color = Math.random() > 0.85 ? colorAccent : colorCoreOuter;
      } else {
        // --- AMBIENT DEEP SPACE UNIVERSE ---
        type = 2;
        const radius = 12.0 + Math.random() * 32.0;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        x = radius * Math.sin(phi) * Math.cos(theta);
        y = radius * Math.sin(phi) * Math.sin(theta);
        z = radius * Math.cos(phi);

        size = Math.random() * 6.0 + 2.0;
        color = Math.random() > 0.92 ? colorAccent : colorAmbient;
      }

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      sizes[i] = size;
      phases[i] = phase;
      types[i] = type;
    }

    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    this.geometry.setAttribute('aType', new THREE.BufferAttribute(types, 1));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }
      },
      vertexShader: `
        uniform float uTime;
        attribute float aSize;
        attribute float aPhase;
        attribute float aType;
        attribute vec3 color;
        varying vec3 vColor;

        void main() {
          vColor = color;
          vec3 pos = position;

          if (aType < 0.5) {
            // Core: Rotation + Gentle pulsing expansion
            float angle = uTime * 0.15 + aPhase * 0.1;
            float c = cos(angle);
            float s = sin(angle);
            float nx = pos.x * c - pos.z * s;
            float nz = pos.x * s + pos.z * c;
            pos.x = nx;
            pos.z = nz;

            float pulse = 1.0 + 0.06 * sin(uTime * 1.8 + aPhase * 2.0);
            pos *= pulse;
          } else if (aType < 1.5) {
            // Spiral arms rotation
            float angle = uTime * 0.08;
            float c = cos(angle);
            float s = sin(angle);
            float nx = pos.x * c - pos.z * s;
            float nz = pos.x * s + pos.z * c;
            pos.x = nx;
            pos.z = nz;
            
            pos.y += sin(uTime * 0.5 + aPhase) * 0.25;
          } else {
            // Ambient outer field drift
            pos.x += sin(uTime * 0.2 + aPhase) * 0.4;
            pos.y += cos(uTime * 0.25 + aPhase * 1.5) * 0.4;
            pos.z += sin(uTime * 0.15 + aPhase * 2.0) * 0.4;
          }

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          
          // Distance size attenuation
          gl_PointSize = aSize * (260.0 / -mvPosition.z);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;

        void main() {
          // Point radial glowing circle
          vec2 coord = gl_PointCoord - vec2(0.5);
          float dist = length(coord);
          if (dist > 0.5) discard;

          // Soft volumetric particle profile
          float glow = pow(1.0 - (dist * 2.0), 1.8);
          float coreHalo = exp(-dist * 7.0) * 0.6;

          vec3 finalColor = vColor + vec3(coreHalo);
          gl_FragColor = vec4(finalColor, clamp(glow + coreHalo, 0.0, 1.0));
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.points = new THREE.Points(this.geometry, this.material);
  }

  update(time) {
    this.material.uniforms.uTime.value = time;
  }
}

/**
 * Main Application Engine
 */
class Application {
  constructor() {
    this.canvas = document.getElementById('webgl-canvas');
    this.fpsElement = document.getElementById('hud-fps');
    this.particleCountElement = document.getElementById('hud-particles');
    this.errorPanel = document.getElementById('error-dialog');
    this.errorText = document.getElementById('error-text');

    this.targetCameraPos = new THREE.Vector3();
    this.time = 0;

    if (!this.checkWebGLSupport()) {
      this.showError("WebGL hardware acceleration is not supported on your device or browser.");
      return;
    }

    try {
      this.initGraphics();
      this.initEvents();
      this.initMonitor();
      this.animate();
    } catch (err) {
      console.error("Initialization failure:", err);
      this.showError("Failed to initialize graphics engine: " + err.message);
    }
  }

  checkWebGLSupport() {
    try {
      const canvas = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && 
        (canvas.getContext('webgl') || canvas.getContext('experimental-webgl') || canvas.getContext('webgl2')));
    } catch (e) {
      return false;
    }
  }

  showError(message) {
    if (this.errorText && this.errorPanel) {
      this.errorText.textContent = message;
      this.errorPanel.classList.remove('hidden');
    }
  }

  initGraphics() {
    // 1. Scene setup
    this.scene = new THREE.Scene();

    // 2. Camera setup
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    this.camera.position.set(0, 8, 22);

    // 3. Renderer setup
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: "high-performance",
      alpha: false
    });

    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // 4. Particle Universe Creation
    const PARTICLE_COUNT = 80000;
    this.universe = new ParticleUniverse(PARTICLE_COUNT);
    this.scene.add(this.universe.points);

    if (this.particleCountElement) {
      this.particleCountElement.textContent = PARTICLE_COUNT.toLocaleString();
    }
  }

  initEvents() {
    window.addEventListener('resize', () => this.onResize(), false);
  }

  initMonitor() {
    this.monitor = new PerformanceMonitor((fps) => {
      if (this.fpsElement) {
        this.fpsElement.textContent = fps;
      }
    });
  }

  onResize() {
    if (!this.camera || !this.renderer) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  updateCamera(elapsedTime) {
    // Smooth cinematic orbiting float
    const radius = 22.0 + Math.sin(elapsedTime * 0.1) * 3.0;
    const speed = elapsedTime * 0.06;

    this.targetCameraPos.x = Math.sin(speed) * radius;
    this.targetCameraPos.z = Math.cos(speed) * radius;
    this.targetCameraPos.y = 6.0 + Math.sin(elapsedTime * 0.12) * 3.0;

    // Smooth camera interpolation (lerp)
    this.camera.position.lerp(this.targetCameraPos, 0.025);
    this.camera.lookAt(0, 0, 0);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    this.time += 0.016;

    if (this.monitor) this.monitor.tick();
    if (this.universe) this.universe.update(this.time);

    this.updateCamera(this.time);

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }
}

// Start Application on DOM Load
window.addEventListener('DOMContentLoaded', () => {
  new Application();
});
