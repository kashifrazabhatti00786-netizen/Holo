import * as THREE from 'three';

// Application Configuration & Parameters
const CONFIG = {
  particleCount: 3500,
  dustCount: 400,
  sphereRadius: 2.2,
  smoothingFactor: 0.12,
  scaleSmoothing: 0.15,
  implosionDuration: 250, // ms
  burstDuration: 350,     // ms
  recoveryDuration: 500   // ms
};

// Global Application State
const state = {
  handDetected: false,
  handRaw: { x: 0.5, y: 0.5, z: 0 },
  targetWorldPos: new THREE.Vector3(0, 0, 0),
  currentWorldPos: new THREE.Vector3(0, 0, 0),
  handScreenPos: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
  
  pinchRatio: 1.0,
  targetScale: 1.0,
  currentScale: 1.0,
  
  isFist: false,
  gesture: 'SEARCHING',
  
  // Implosion State Machine: 'NORMAL', 'IMPLODING', 'BURST', 'RECOVERING'
  implosionState: 'NORMAL',
  implosionStartTime: 0,
  implosionFactor: 1.0,
  
  confidence: 0,
  fps: 0,
  frameCount: 0,
  lastFpsUpdate: performance.now(),
  
  mouseFallback: false,
  mouseDown: false
};

// Procedural Radial Texture Generator for Glowing Particles
function createGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
  gradient.addColorStop(0.25, 'rgba(255, 180, 40, 0.85)');
  gradient.addColorStop(0.6, 'rgba(255, 70, 0, 0.35)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

// Three.js Scene Setup & Management
class HologramScene {
  constructor(container) {
    this.container = container;
    
    // Scene & Fog
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x030509, 0.025);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 0, 10);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.container.appendChild(this.renderer.domElement);

    // Dynamic Objects Group
    this.coreGroup = new THREE.Group();
    this.scene.add(this.coreGroup);

    // Lighting
    this.setupLighting();

    // Core Components
    this.particleTexture = createGlowTexture();
    this.buildParticleSphere();
    this.buildEnergyRings();
    this.buildCentralPlasmaCore();
    this.buildAmbientDust();

    // Window Resize Event
    window.addEventListener('resize', () => this.onWindowResize());
  }

  setupLighting() {
    this.ambientLight = new THREE.AmbientLight(0xffaa00, 0.6);
    this.scene.add(this.ambientLight);

    this.corePointLight = new THREE.PointLight(0xff8800, 4, 20);
    this.coreGroup.add(this.corePointLight);

    this.implosionLight = new THREE.PointLight(0x00ffff, 0, 30);
    this.coreGroup.add(this.implosionLight);
  }

  buildParticleSphere() {
    const count = CONFIG.particleCount;
    this.particleGeometry = new THREE.BufferGeometry();
    
    this.particlePositions = new Float32Array(count * 3);
    this.basePositions = new Float32Array(count * 3);
    this.particleColors = new Float32Array(count * 3);
    this.particleSizes = new Float32Array(count);
    this.velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      // Golden Spiral / Fibonacci Sphere Distribution
      const phi = Math.acos(-1 + (2 * i) / count);
      const theta = Math.sqrt(count * Math.PI) * phi;
      const radius = CONFIG.sphereRadius * (0.55 + 0.45 * Math.cbrt(Math.random()));

      const x = radius * Math.cos(theta) * Math.sin(phi);
      const y = radius * Math.sin(theta) * Math.sin(phi);
      const z = radius * Math.cos(phi);

      this.particlePositions[i * 3] = x;
      this.particlePositions[i * 3 + 1] = y;
      this.particlePositions[i * 3 + 2] = z;

      this.basePositions[i * 3] = x;
      this.basePositions[i * 3 + 1] = y;
      this.basePositions[i * 3 + 2] = z;

      // Primary Warm Gold to Amber Color Spectrum
      const color = new THREE.Color();
      color.setHSL(0.07 + Math.random() * 0.05, 1.0, 0.5 + Math.random() * 0.3);
      
      this.particleColors[i * 3] = color.r;
      this.particleColors[i * 3 + 1] = color.g;
      this.particleColors[i * 3 + 2] = color.b;

      this.particleSizes[i] = 0.12 + Math.random() * 0.18;

      this.velocities[i * 3] = (Math.random() - 0.5) * 0.01;
      this.velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.01;
      this.velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.01;
    }

    this.particleGeometry.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));
    this.particleGeometry.setAttribute('color', new THREE.BufferAttribute(this.particleColors, 3));
    this.particleGeometry.setAttribute('size', new THREE.BufferAttribute(this.particleSizes, 1));

    this.particleMaterial = new THREE.PointsMaterial({
      size: 0.35,
      map: this.particleTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true
    });

    this.particleSystem = new THREE.Points(this.particleGeometry, this.particleMaterial);
    this.coreGroup.add(this.particleSystem);
  }

  buildEnergyRings() {
    this.rings = [];
    const ringSpecs = [
      { radius: 2.8, tube: 0.02, color: 0xffaa00, rotX: Math.PI / 3, rotY: 0 },
      { radius: 3.2, tube: 0.015, color: 0xff5500, rotX: -Math.PI / 4, rotY: Math.PI / 6 },
      { radius: 3.6, tube: 0.01, color: 0xffd700, rotX: Math.PI / 6, rotY: -Math.PI / 3 }
    ];

    ringSpecs.forEach((spec) => {
      const geom = new THREE.TorusGeometry(spec.radius, spec.tube, 16, 100);
      const mat = new THREE.MeshBasicMaterial({
        color: spec.color,
        wireframe: true,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending
      });
      const ring = new THREE.Mesh(geom, mat);
      ring.rotation.x = spec.rotX;
      ring.rotation.y = spec.rotY;
      this.coreGroup.add(ring);
      this.rings.push(ring);
    });
  }

  buildCentralPlasmaCore() {
    const geom = new THREE.IcosahedronGeometry(0.8, 4);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending
    });
    this.plasmaCore = new THREE.Mesh(geom, mat);
    this.coreGroup.add(this.plasmaCore);
  }

  buildAmbientDust() {
    const count = CONFIG.dustCount;
    const geom = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);

    for (let i = 0; i < count * 3; i += 3) {
      pos[i] = (Math.random() - 0.5) * 40;
      pos[i + 1] = (Math.random() - 0.5) * 30;
      pos[i + 2] = (Math.random() - 0.5) * 30 - 5;
    }

    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.15,
      color: 0xffa500,
      map: this.particleTexture,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.ambientDust = new THREE.Points(geom, mat);
    this.scene.add(this.ambientDust);
  }

  updateParticles(time, implosionFactor, isImploding) {
    const positions = this.particleGeometry.attributes.position.array;
    const colors = this.particleGeometry.attributes.color.array;

    for (let i = 0; i < CONFIG.particleCount; i++) {
      const idx = i * 3;
      const bx = this.basePositions[idx];
      const by = this.basePositions[idx + 1];
      const bz = this.basePositions[idx + 2];

      const t = time * 0.0015 + i * 0.05;
      const noise = Math.sin(t) * 0.08;

      let factor = implosionFactor;

      if (isImploding) {
        // High-energy inward turbulence
        positions[idx] = bx * factor + (Math.random() - 0.5) * 0.1;
        positions[idx + 1] = by * factor + (Math.random() - 0.5) * 0.1;
        positions[idx + 2] = bz * factor + (Math.random() - 0.5) * 0.1;

        // Shift color to intense plasma cyan
        colors[idx] = THREE.MathUtils.lerp(colors[idx], 0.0, 0.2);
        colors[idx + 1] = THREE.MathUtils.lerp(colors[idx + 1], 0.95, 0.2);
        colors[idx + 2] = THREE.MathUtils.lerp(colors[idx + 2], 1.0, 0.2);
      } else {
        positions[idx] = bx * (factor + noise);
        positions[idx + 1] = by * (factor + noise);
        positions[idx + 2] = bz * (factor + noise);

        // Restore orange/gold warmth
        const baseCol = new THREE.Color().setHSL(0.07 + (i % 10) * 0.005, 1.0, 0.55);
        colors[idx] = THREE.MathUtils.lerp(colors[idx], baseCol.r, 0.08);
        colors[idx + 1] = THREE.MathUtils.lerp(colors[idx + 1], baseCol.g, 0.08);
        colors[idx + 2] = THREE.MathUtils.lerp(colors[idx + 2], baseCol.b, 0.08);
      }
    }

    this.particleGeometry.attributes.position.needsUpdate = true;
    this.particleGeometry.attributes.color.needsUpdate = true;

    // Rotate energy rings
    this.rings[0].rotation.x += 0.015;
    this.rings[0].rotation.y += 0.008;
    this.rings[1].rotation.y += 0.02;
    this.rings[1].rotation.z += 0.012;
    this.rings[2].rotation.z += 0.018;
    this.rings[2].rotation.x += 0.01;

    // Rotate core plasma mesh
    this.plasmaCore.rotation.y += 0.025;
    this.plasmaCore.rotation.x += 0.015;

    // Rotate dust field gently
    this.ambientDust.rotation.y = time * 0.00005;
  }

  // Map 2D Normalized Screen Coords (0..1) to 3D World Space at Camera Depth
  getScreenToWorldPoint(normX, normY) {
    const depth = 0;
    const aspect = window.innerWidth / window.innerHeight;
    const vFOV = THREE.MathUtils.degToRad(this.camera.fov);
    const height = 2 * Math.tan(vFOV / 2) * (this.camera.position.z - depth);
    const width = height * aspect;

    const x = (normX - 0.5) * width;
    const y = -(normY - 0.5) * height;
    return new THREE.Vector3(x, y, depth);
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

// MediaPipe Hand Detection & Gesture Analysis
class HandTracker {
  constructor(onResultsCallback, onErrorCallback) {
    this.onResultsCallback = onResultsCallback;
    this.onErrorCallback = onErrorCallback;
    this.videoElement = document.getElementById('webcam');
    
    this.initMediaPipe();
  }

  initMediaPipe() {
    try {
      this.hands = new window.Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
      });

      this.hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.6
      });

      this.hands.onResults((results) => this.onResultsCallback(results));

      this.camera = new window.Camera(this.videoElement, {
        onFrame: async () => {
          await this.hands.send({ image: this.videoElement });
        },
        width: 1280,
        height: 720
      });

      this.camera.start().catch((err) => {
        console.warn('Camera initialization failed:', err);
        this.onErrorCallback(err);
      });
    } catch (err) {
      console.warn('MediaPipe initialization failed:', err);
      this.onErrorCallback(err);
    }
  }
}

// GUI & Holographic HUD UI Controller
class UIController {
  constructor() {
    this.dom = {
      statusText: document.getElementById('status-text'),
      statusDot: document.getElementById('status-dot'),
      fpsVal: document.getElementById('fps-val'),
      valX: document.getElementById('val-x'),
      valY: document.getElementById('val-y'),
      valZ: document.getElementById('val-z'),
      valConf: document.getElementById('val-conf'),
      sigFill: document.getElementById('sig-fill'),
      sigPerc: document.getElementById('sig-perc'),
      gestureName: document.getElementById('gesture-name'),
      valPinch: document.getElementById('val-pinch'),
      valScale: document.getElementById('val-scale'),
      densityFill: document.getElementById('density-fill'),
      densityPerc: document.getElementById('density-perc'),
      implosionBadge: document.getElementById('implosion-badge'),
      reticle: document.getElementById('reticle'),
      reticleLabel: document.getElementById('reticle-label'),
      errorOverlay: document.getElementById('error-overlay'),
      btnRetry: document.getElementById('btn-retry')
    };
  }

  update(state) {
    // Coordinates
    this.dom.valX.textContent = (state.currentWorldPos.x >= 0 ? '+' : '') + state.currentWorldPos.x.toFixed(3);
    this.dom.valY.textContent = (state.currentWorldPos.y >= 0 ? '+' : '') + state.currentWorldPos.y.toFixed(3);
    this.dom.valZ.textContent = (state.currentWorldPos.z >= 0 ? '+' : '') + state.currentWorldPos.z.toFixed(3);
    
    // Confidence & Signal
    const confPerc = Math.round(state.confidence * 100);
    this.dom.valConf.textContent = `${confPerc}%`;
    this.dom.sigPerc.textContent = `${confPerc}%`;
    this.dom.sigFill.style.width = `${confPerc}%`;

    // Gesture & Scaling
    this.dom.gestureName.textContent = state.gesture;
    this.dom.valPinch.textContent = state.pinchRatio.toFixed(3);
    this.dom.valScale.textContent = `${state.currentScale.toFixed(2)}x`;

    // Plasma Output Density
    const density = Math.min(100, Math.round((state.currentScale / 2.5) * 100));
    this.dom.densityPerc.textContent = `${density}%`;
    this.dom.densityFill.style.width = `${density}%`;

    // FPS
    this.dom.fpsVal.textContent = state.fps;

    // Reticle Positioning
    if (state.handDetected || state.mouseFallback) {
      this.dom.reticle.classList.add('active');
      this.dom.reticle.style.left = `${state.handScreenPos.x}px`;
      this.dom.reticle.style.top = `${state.handScreenPos.y}px`;
      this.dom.reticleLabel.textContent = state.mouseFallback ? 'TARGET [MOUSE]' : 'TARGET [LOCKED]';
    } else {
      this.dom.reticle.classList.remove('active');
    }

    // Status Dot & Text
    if (state.mouseFallback) {
      this.dom.statusText.textContent = 'MOUSE FALLBACK ACTIVE';
      this.dom.statusDot.className = 'status-dot error';
    } else if (state.handDetected) {
      this.dom.statusText.textContent = 'ONLINE // HAND TRACKING';
      this.dom.statusDot.className = 'status-dot pulsing';
    } else {
      this.dom.statusText.textContent = 'SEARCHING FOR TARGET...';
      this.dom.statusDot.className = 'status-dot';
    }

    // Implosion Badge Text
    if (state.implosionState === 'IMPLODING') {
      this.dom.implosionBadge.innerHTML = '<span class="pulse-icon">⚡</span> IMPLOSION: COLLAPSING CORE';
      this.dom.implosionBadge.style.borderColor = 'var(--accent-cyan)';
      this.dom.implosionBadge.style.color = 'var(--accent-cyan)';
    } else if (state.implosionState === 'BURST') {
      this.dom.implosionBadge.innerHTML = '<span class="pulse-icon">💥</span> IMPLOSION: SHOCKWAVE BURST';
      this.dom.implosionBadge.style.borderColor = 'var(--accent-fire)';
      this.dom.implosionBadge.style.color = 'var(--accent-fire)';
    } else {
      this.dom.implosionBadge.innerHTML = '<span class="pulse-icon">⚡</span> IMPLOSION STATE: READY';
      this.dom.implosionBadge.style.borderColor = 'var(--accent-amber)';
      this.dom.implosionBadge.style.color = '#ff7766';
    }
  }

  showErrorModal() {
    this.dom.errorOverlay.classList.remove('hidden');
  }

  hideErrorModal() {
    this.dom.errorOverlay.classList.add('hidden');
  }
}

// Main Controller Application
class App {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.scene = new HologramScene(this.container);
    this.ui = new UIController();

    this.initHandTracking();
    this.setupFallbackControls();

    // Start Main Render Loop
    requestAnimationFrame((t) => this.render(t));
  }

  initHandTracking() {
    this.tracker = new HandTracker(
      (results) => this.handleHandResults(results),
      (err) => this.handleCameraError(err)
    );
  }

  handleCameraError(err) {
    state.mouseFallback = true;
    this.ui.showErrorModal();

    this.ui.dom.btnRetry.onclick = () => {
      this.ui.hideErrorModal();
      location.reload();
    };
  }

  setupFallbackControls() {
    window.addEventListener('pointermove', (e) => {
      if (!state.mouseFallback && state.handDetected) return;

      state.handScreenPos.x = e.clientX;
      state.handScreenPos.y = e.clientY;

      state.handRaw.x = e.clientX / window.innerWidth;
      state.handRaw.y = e.clientY / window.innerHeight;
      state.confidence = 0.95;

      if (state.mouseDown) {
        state.targetScale = 0.4;
        state.pinchRatio = 0.25;
        state.gesture = 'PINCH / RESIZING';
      }
    });

    window.addEventListener('pointerdown', () => {
      if (!state.mouseFallback && state.handDetected) return;
      state.mouseDown = true;
      state.targetScale = 0.4;
      state.pinchRatio = 0.25;
      state.gesture = 'PINCH / RESIZING';
    });

    window.addEventListener('pointerup', () => {
      if (!state.mouseFallback && state.handDetected) return;
      state.mouseDown = false;
      state.targetScale = 1.0;
      state.pinchRatio = 1.0;
      state.gesture = 'MOUSE CONTROL';
    });

    window.addEventListener('dblclick', () => {
      if (state.implosionState === 'NORMAL') {
        this.triggerImplosion();
      }
    });
  }

  handleHandResults(results) {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      state.handDetected = true;
      state.confidence = results.multiHandedness[0]?.score || 0.9;
      
      const landmarks = results.multiHandLandmarks[0];

      // Mirror X coordinate for intuitive webcam interaction
      const handCenterX = 1.0 - landmarks[9].x;
      const handCenterY = landmarks[9].y;

      state.handRaw.x = handCenterX;
      state.handRaw.y = handCenterY;

      state.handScreenPos.x = handCenterX * window.innerWidth;
      state.handScreenPos.y = handCenterY * window.innerHeight;

      // Gesture Recognition Math
      this.analyzeGestures(landmarks);
    } else {
      state.handDetected = false;
      state.confidence = 0;
      if (!state.mouseFallback) {
        state.gesture = 'SEARCHING TARGET...';
      }
    }
  }

  analyzeGestures(landmarks) {
    // Distance 3D Helper
    const dist3D = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));

    // Reference Scale: Palm Length (Wrist 0 to Middle MCP 9)
    const palmLen = dist3D(landmarks[0], landmarks[9]);

    // Pinch Ratio: Distance between Index Tip (8) and Thumb Tip (4)
    const pinchDist = dist3D(landmarks[8], landmarks[4]);
    state.pinchRatio = pinchDist / (palmLen || 1.0);

    // Fist Detection: Finger Tips to Wrist Distances
    const rIndex = dist3D(landmarks[8], landmarks[0]) / palmLen;
    const rMiddle = dist3D(landmarks[12], landmarks[0]) / palmLen;
    const rRing = dist3D(landmarks[16], landmarks[0]) / palmLen;
    const rPinky = dist3D(landmarks[20], landmarks[0]) / palmLen;

    const isFistNow = (rIndex < 0.95 && rMiddle < 0.95 && rRing < 0.95 && rPinky < 0.95);

    // Gesture State Decision
    if (isFistNow) {
      state.gesture = 'FIST DETECTED';
      if (!state.isFist && state.implosionState === 'NORMAL') {
        this.triggerImplosion();
      }
      state.isFist = true;
    } else {
      state.isFist = false;

      if (state.pinchRatio < 0.42) {
        state.gesture = 'PINCH / RESIZING';
        // Map pinch distance smoothly to sphere scale between 0.3x and 2.5x
        state.targetScale = Math.max(0.35, Math.min(2.5, state.pinchRatio * 2.5));
      } else {
        state.gesture = 'OPEN PALM';
   state.targetScale = 1.0;
      }
    }
  }

  triggerImplosion() {
    state.implosionState = 'IMPLODING';
    state.implosionStartTime = performance.now();
  }

  updateImplosionStateMachine(now) {
    if (state.implosionState === 'NORMAL') return;

    const elapsed = now - state.implosionStartTime;

    if (state.implosionState === 'IMPLODING') {
      const progress = Math.min(1.0, elapsed / CONFIG.implosionDuration);
      // Collapse scale rapidly to center
      state.implosionFactor = THREE.MathUtils.lerp(1.0, 0.05, progress);
      this.scene.implosionLight.intensity = progress * 15;

      if (progress >= 1.0) {
        state.implosionState = 'BURST';
        state.implosionStartTime = now;
      }
    } else if (state.implosionState === 'BURST') {
      const progress = Math.min(1.0, elapsed / CONFIG.burstDuration);
      // Explode outward with high-energy shockwave
      state.implosionFactor = THREE.MathUtils.lerp(0.05, 2.3, Math.sin(progress * Math.PI * 0.5));
      this.scene.implosionLight.intensity = (1.0 - progress) * 20;

      if (progress >= 1.0) {
        state.implosionState = 'RECOVERING';
        state.implosionStartTime = now;
      }
    } else if (state.implosionState === 'RECOVERING') {
      const progress = Math.min(1.0, elapsed / CONFIG.recoveryDuration);
      // Smooth harmonic recovery back to current target scale
      state.implosionFactor = THREE.MathUtils.lerp(2.3, 1.0, Math.sin(progress * Math.PI * 0.5));
      this.scene.implosionLight.intensity = 0;

      if (progress >= 1.0) {
        state.implosionState = 'NORMAL';
        state.implosionFactor = 1.0;
      }
    }
  }

  calculateFps(now) {
    state.frameCount++;
    if (now - state.lastFpsUpdate >= 500) {
      state.fps = Math.round((state.frameCount * 1000) / (now - state.lastFpsUpdate));
      state.frameCount = 0;
      state.lastFpsUpdate = now;
    }
  }

  render(time) {
    this.calculateFps(time);

    // Update Implosion State Machine
    this.updateImplosionStateMachine(time);

    // Interpolate Hand/Core Target Position in 3D Space
    if (state.handDetected || state.mouseFallback) {
      state.targetWorldPos = this.scene.getScreenToWorldPoint(state.handRaw.x, state.handRaw.y);
    } else {
      // Idle floating at center origin
      state.targetWorldPos.set(0, Math.sin(time * 0.0015) * 0.4, 0);
    }

    // Smooth Position Lerp
    state.currentWorldPos.lerp(state.targetWorldPos, CONFIG.smoothingFactor);
    this.scene.coreGroup.position.copy(state.currentWorldPos);

    // Smooth Scale Lerp
    state.currentScale = THREE.MathUtils.lerp(
      state.currentScale,
      state.targetScale,
      CONFIG.scaleSmoothing
    );

    // Combine Gesture Scale with Implosion Multiplier
    const finalScale = state.currentScale * state.implosionFactor;
    this.scene.coreGroup.scale.set(finalScale, finalScale, finalScale);

    // Update Particle Swarm & Energy Rings Animation
    const isImploding = (state.implosionState === 'IMPLODING');
    this.scene.updateParticles(time, state.implosionFactor, isImploding);

    // Render 3D Scene
    this.scene.renderer.render(this.scene.scene, this.scene.camera);

    // Update Holographic UI HUD
    this.ui.update(state);

    requestAnimationFrame((t) => this.render(t));
  }
}

// Application Entry Point
window.addEventListener('DOMContentLoaded', () => {
  new App();
});
