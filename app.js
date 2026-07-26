import * as THREE from 'three';

/**
 * Performance Monitor
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
 * MediaPipe Hand Tracking Manager
 */
class HandTracker {
  constructor(onHandUpdate, onError) {
    this.onHandUpdate = onHandUpdate;
    this.onError = onError;

    this.trackingStatusEl = document.getElementById('hud-tracking');
    this.gestureStatusEl = document.getElementById('hud-gesture');
    this.statusDot = document.getElementById('status-dot');
    this.videoElement = document.getElementById('webcam');

    this.rawHandPos = new THREE.Vector3(0, 0, 0);
    this.rawPointerPos = new THREE.Vector3(0, 0, 0);
    this.currentGesture = 'None';
    this.pinchRatio = 0.1;
    this.isHandPresent = false;

    this.init();
  }

  async init() {
    if (!window.Hands || !window.Camera) {
      this.updateHUD('Lib Error', 'None', false);
      if (this.onError) this.onError("MediaPipe tracking libraries failed to load.");
      return;
    }

    try {
      this.hands = new window.Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
      });

      this.hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.55,
        minTrackingConfidence: 0.55
      });

      this.hands.onResults((results) => this.handleResults(results));

      this.camera = new window.Camera(this.videoElement, {
        onFrame: async () => {
          if (this.videoElement && this.videoElement.readyState >= 2) {
            await this.hands.send({ image: this.videoElement });
          }
        },
        width: 640,
        height: 480,
        facingMode: 'user'
      });

      this.updateHUD('Searching...', 'None', false);
      await this.camera.start();
    } catch (err) {
      console.error("Camera access error:", err);
      this.updateHUD('Permission Denied', 'None', false);
      if (this.onError) this.onError("Camera access was denied or device webcam is unavailable.");
    }
  }

  handleResults(results) {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const landmarks = results.multiHandLandmarks[0];
      this.isHandPresent = true;

      // Calculate Palm Center 3D position
      const wrist = landmarks[0];
      const indexMcp = landmarks[5];
      const pinkyMcp = landmarks[17];

      const palmX = (wrist.x + indexMcp.x + pinkyMcp.x) / 3.0;
      const palmY = (wrist.y + indexMcp.y + pinkyMcp.y) / 3.0;
      const palmZ = (wrist.z + indexMcp.z + pinkyMcp.z) / 3.0;

      // Horizontally flipped normalized coordinates [-0.5, 0.5]
      const normX = (1.0 - palmX) - 0.5;
      const normY = 0.5 - palmY;
      const normZ = -palmZ;

      // View frustum scale mapping
      const viewWidth = 26.0;
      const viewHeight = 16.0;

      this.rawHandPos.set(normX * viewWidth, normY * viewHeight, normZ * 12.0);

      // Index Tip position for pointing gesture
      const indexTip = landmarks[8];
      const idxX = (1.0 - indexTip.x) - 0.5;
      const idxY = 0.5 - indexTip.y;
      const idxZ = -indexTip.z;
      this.rawPointerPos.set(idxX * viewWidth, idxY * viewHeight, idxZ * 12.0);

      // Classify Gesture
      const gestureData = this.classifyGesture(landmarks);
      this.currentGesture = gestureData.name;
      this.pinchRatio = gestureData.pinchRatio || 0.1;

      this.updateHUD('Hand Detected', this.currentGesture, true);
    } else {
      this.isHandPresent = false;
      this.currentGesture = 'None';
      this.updateHUD('Lost', 'None', false);
    }

    if (this.onHandUpdate) {
      this.onHandUpdate({
        isHandPresent: this.isHandPresent,
        handPos: this.rawHandPos,
        pointerPos: this.rawPointerPos,
        gesture: this.currentGesture,
        pinchRatio: this.pinchRatio
      });
    }
  }

  classifyGesture(landmarks) {
    const wrist = landmarks[0];
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];

    const indexMcp = landmarks[5];
    const middleMcp = landmarks[9];
    const ringMcp = landmarks[13];
    const pinkyMcp = landmarks[17];

    const dist3D = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z);
    const distWrist = (pt) => dist3D(pt, wrist);

    // 1. Pinch Gesture: Thumb Tip to Index Tip
    const pinchDist = dist3D(thumbTip, indexTip);
    if (pinchDist < 0.058) {
      return { name: 'Pinch', pinchRatio: pinchDist };
    }

    // Distances from Wrist
    const dIndexTip = distWrist(indexTip);
    const dMiddleTip = distWrist(middleTip);
    const dRingTip = distWrist(ringTip);
    const dPinkyTip = distWrist(pinkyTip);

    const dIndexMcp = distWrist(indexMcp);
    const dMiddleMcp = distWrist(middleMcp);
    const dRingMcp = distWrist(ringMcp);
    const dPinkyMcp = distWrist(pinkyMcp);

    // Folded states
    const isIndexFolded = dIndexTip < dIndexMcp * 1.25;
    const isMiddleFolded = dMiddleTip < dMiddleMcp * 1.25;
    const isRingFolded = dRingTip < dRingMcp * 1.25;
    const isPinkyFolded = dPinkyTip < dPinkyMcp * 1.25;

    // 2. Closed Fist: All 4 finger tips folded inward
    if (isIndexFolded && isMiddleFolded && isRingFolded && isPinkyFolded) {
      return { name: 'Closed Fist' };
    }

    // 3. Pointing: Index extended, others folded
    const isIndexExtended = dIndexTip > dIndexMcp * 1.4;
    if (isIndexExtended && isMiddleFolded && isRingFolded && isPinkyFolded) {
      return { name: 'Pointing' };
    }

    // 4. Open Hand: Most fingers extended
    if (dIndexTip > dIndexMcp * 1.2 && dMiddleTip > dMiddleMcp * 1.2 && dRingTip > dRingMcp * 1.2) {
      return { name: 'Open Hand' };
    }

    return { name: 'Tracking' };
  }

  updateHUD(trackingText, gestureText, isOk) {
    if (this.trackingStatusEl) this.trackingStatusEl.textContent = trackingText;
    if (this.gestureStatusEl) this.gestureStatusEl.textContent = gestureText;

    if (this.statusDot) {
      this.statusDot.classList.remove('tracking-ok', 'tracking-lost');
      if (isOk) {
        this.statusDot.classList.add('tracking-ok');
      } else {
        this.statusDot.classList.add('tracking-lost');
      }
    }
  }
}

/**
 * Procedural Interactive Particle Universe System
 */
class ParticleUniverse {
  constructor(totalCount = 80000) {
    this.count = totalCount;
    this.geometry = new THREE.BufferGeometry();

    const positions = new Float32Array(this.count * 3);
    const colors = new Float32Array(this.count * 3);
    const sizes = new Float32Array(this.count);
    const phases = new Float32Array(this.count);
    const types = new Float32Array(this.count);

    const colorCoreInner = new THREE.Color(0xffffff); // White
    const colorCoreMid = new THREE.Color(0xffaa00);   // Gold
    const colorCoreOuter = new THREE.Color(0xff4400); // Orange
    const colorAmbient = new THREE.Color(0xff8833);   // Amber
    const colorAccent = new THREE.Color(0x33aaff);    // Cyan accent

    const coreCount = Math.floor(this.count * 0.45);
    const spiralCount = Math.floor(this.count * 0.35);

    for (let i = 0; i < this.count; i++) {
      let x, y, z, size, type, color;
      const phase = Math.random() * Math.PI * 2;

      if (i < coreCount) {
        type = 0; // Central Core
        const radius = Math.pow(Math.random(), 2.0) * 4.5 + 0.1;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        x = radius * Math.sin(phi) * Math.cos(theta);
        y = radius * Math.sin(phi) * Math.sin(theta) * 0.7;
        z = radius * Math.cos(phi);

        size = (1.0 - radius / 4.6) * 14.0 + Math.random() * 6.0;

        const normDist = radius / 4.6;
        if (normDist < 0.25) {
          color = colorCoreInner.clone().lerp(colorCoreMid, normDist * 4);
        } else {
          color = colorCoreMid.clone().lerp(colorCoreOuter, (normDist - 0.25) * 1.33);
        }
      } else if (i < coreCount + spiralCount) {
        type = 1; // Spiral Arms
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
        type = 2; // Ambient Outer Field
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
        uTime: { value: 0 },
        uHandPos: { value: new THREE.Vector3(0, 0, 0) },
        uHandActive: { value: 0.0 },
        uCollapse: { value: 0.0 },
        uPointerPos: { value: new THREE.Vector3(0, 0, 0) },
        uPointerActive: { value: 0.0 }
      },
      vertexShader: `
        uniform float uTime;
        uniform vec3 uHandPos;
        uniform float uHandActive;
        uniform float uCollapse;
        uniform vec3 uPointerPos;
        uniform float uPointerActive;

        attribute float aSize;
        attribute float aPhase;
        attribute float aType;
        attribute vec3 color;
        varying vec3 vColor;
        varying float vHighlight;

        void main() {
          vColor = color;
          vec3 pos = position;

          // Base Animation
          if (aType < 0.5) {
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
            float angle = uTime * 0.08;
            float c = cos(angle);
            float s = sin(angle);
            float nx = pos.x * c - pos.z * s;
            float nz = pos.x * s + pos.z * c;
            pos.x = nx;
            pos.z = nz;
            pos.y += sin(uTime * 0.5 + aPhase) * 0.25;
          } else {
            pos.x += sin(uTime * 0.2 + aPhase) * 0.4;
            pos.y += cos(uTime * 0.25 + aPhase * 1.5) * 0.4;
            pos.z += sin(uTime * 0.15 + aPhase * 2.0) * 0.4;
          }

          // Smooth Hand Follow Translation for Core/Spiral
          if (aType < 1.5) {
            pos += uHandPos * uHandActive;
          }

          // Closed Fist Collapse Attraction
          if (uCollapse > 0.001) {
            vec3 target = (aType < 1.5) ? uHandPos : vec3(0.0);
            pos = mix(pos, target, uCollapse * 0.88);
          }

          // Pointing Gesture Nearest Cluster Highlight
          vHighlight = 0.0;
          if (uPointerActive > 0.5) {
            float distToPointer = length(pos - uPointerPos);
            if (distToPointer < 4.5) {
              vHighlight = (1.0 - distToPointer / 4.5);
            }
          }

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          
          float sizeMultiplier = 1.0 + vHighlight * 1.2;
          gl_PointSize = aSize * sizeMultiplier * (260.0 / -mvPosition.z);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vHighlight;

        void main() {
          vec2 coord = gl_PointCoord - vec2(0.5);
          float dist = length(coord);
          if (dist > 0.5) discard;

          float glow = pow(1.0 - (dist * 2.0), 1.8);
          float coreHalo = exp(-dist * 7.0) * 0.6;

          // Pointing gesture glow boost
          vec3 finalColor = vColor + vec3(coreHalo) + vec3(vHighlight * 0.4);
          gl_FragColor = vec4(finalColor, clamp(glow + coreHalo + vHighlight * 0.3, 0.0, 1.0));
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.points = new THREE.Points(this.geometry, this.material);
  }

  update(time, handPos, isHandPresent, collapseFactor, pointerPos, isPointing) {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uHandPos.value.copy(handPos);
    this.material.uniforms.uHandActive.value = isHandPresent ? 1.0 : 0.0;
    this.material.uniforms.uCollapse.value = collapseFactor;
    this.material.uniforms.uPointerPos.value.copy(pointerPos);
    this.material.uniforms.uPointerActive.value = isPointing ? 1.0 : 0.0;
  }
}

/**
 * Main Application Engine
 */
class Application {
  constructor() {
    this.canvas = document.getElementById('webgl-canvas');
    this.fpsElement = document.getElementById('hud-fps');
    this.zoomElement = document.getElementById('hud-zoom');
    this.statusElement = document.getElementById('hud-status');
    this.errorPanel = document.getElementById('error-dialog');
    this.errorText = document.getElementById('error-text');

    this.time = 0;

    // Smoothed interaction vectors & factors
    this.smoothedHandPos = new THREE.Vector3(0, 0, 0);
    this.smoothedPointerPos = new THREE.Vector3(0, 0, 0);
    this.smoothedCollapse = 0.0;
    this.targetZoom = 1.0;
    this.currentZoom = 1.0;
    this.targetCamPos = new THREE.Vector3(0, 8, 22);

    this.handState = {
      isHandPresent: false,
      handPos: new THREE.Vector3(),
      pointerPos: new THREE.Vector3(),
      gesture: 'None',
      pinchRatio: 0.1
    };

    if (!this.checkWebGLSupport()) {
      this.showError("WebGL hardware acceleration is not supported on your device or browser.");
      return;
    }

    try {
      this.initGraphics();
      this.initHandTracking();
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
    if (this.statusElement) {
      this.statusElement.textContent = "Error";
      this.statusElement.classList.remove('status-active');
    }
  }

  initGraphics() {
    this.scene = new THREE.Scene();

    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    this.camera.position.set(0, 8, 22);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: "high-performance",
      alpha: false
    });

    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.universe = new ParticleUniverse(80000);
    this.scene.add(this.universe.points);
  }

  initHandTracking() {
    this.handTracker = new HandTracker(
      (data) => {
        this.handState = data;
      },
      (errorMsg) => {
        this.showError(errorMsg);
      }
    );
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

  updateInteractions() {
    const lerpSpeed = 0.08;

    if (this.handState.isHandPresent) {
      // Smooth 3D cursor position
      this.smoothedHandPos.lerp(this.handState.handPos, lerpSpeed);
      this.smoothedPointerPos.lerp(this.handState.pointerPos, lerpSpeed);

      // 1. Pinch Gesture -> Zooming
      if (this.handState.gesture === 'Pinch') {
        const mappedZoom = THREE.MathUtils.mapLinear(
          THREE.MathUtils.clamp(this.handState.pinchRatio, 0.015, 0.055),
          0.015, 0.055,
          0.4, 2.2
        );
        this.targetZoom = mappedZoom;
      }

      // 2. Closed Fist -> Core Collapse
      if (this.handState.gesture === 'Closed Fist') {
        this.smoothedCollapse = THREE.MathUtils.lerp(this.smoothedCollapse, 1.0, 0.08);
      } else {
        this.smoothedCollapse = THREE.MathUtils.lerp(this.smoothedCollapse, 0.0, 0.08);
      }
    } else {
      // Return smoothly to origin / default state
      this.smoothedHandPos.lerp(new THREE.Vector3(0, 0, 0), 0.03);
      this.smoothedPointerPos.lerp(new THREE.Vector3(0, 0, 0), 0.03);
      this.smoothedCollapse = THREE.MathUtils.lerp(this.smoothedCollapse, 0.0, 0.05);
    }

    // Smooth continuous zoom lerp
    this.currentZoom = THREE.MathUtils.lerp(this.currentZoom, this.targetZoom, 0.05);
    if (this.zoomElement) {
      this.zoomElement.textContent = `${Math.round(this.currentZoom * 100)}%`;
    }
  }

  updateCamera(elapsedTime) {
    const baseRadius = 22.0 / this.currentZoom;
    const speed = elapsedTime * 0.05;

    // Drifting camera orbit adjusted by zoom factor
    this.targetCamPos.x = Math.sin(speed) * baseRadius;
    this.targetCamPos.z = Math.cos(speed) * baseRadius;
    this.targetCamPos.y = (6.0 + Math.sin(elapsedTime * 0.1) * 3.0) / this.currentZoom;

    this.camera.position.lerp(this.targetCamPos, 0.03);
    this.camera.lookAt(0, 0, 0);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    this.time += 0.016;

    if (this.monitor) this.monitor.tick();

    this.updateInteractions();

    const isPointing = this.handState.isHandPresent && this.handState.gesture === 'Pointing';
    if (this.universe) {
      this.universe.update(
        this.time,
        this.smoothedHandPos,
        this.handState.isHandPresent,
        this.smoothedCollapse,
        this.smoothedPointerPos,
        isPointing
      );
    }

    this.updateCamera(this.time);

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }
}

// Start Application on DOM Content Loaded
window.addEventListener('DOMContentLoaded', () => {
  new Application();
});
