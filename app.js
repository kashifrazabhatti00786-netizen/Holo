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
 * MediaPipe Multi-Hand Tracker (Up to 2 hands)
 */
class MultiHandTracker {
  constructor(onHandsUpdate, onError) {
    this.onHandsUpdate = onHandsUpdate;
    this.onError = onError;

    this.trackingStatusEl = document.getElementById('hud-tracking');
    this.handsCountEl = document.getElementById('hud-hands');
    this.gestureStatusEl = document.getElementById('hud-gesture');
    this.modeStatusEl = document.getElementById('hud-mode');
    this.statusDot = document.getElementById('status-dot');
    this.videoElement = document.getElementById('webcam');

    this.init();
  }

  async init() {
    if (!window.Hands || !window.Camera) {
      this.updateHUD('Lib Error', 0, 'None', 'Idle', false);
      if (this.onError) this.onError("MediaPipe tracking libraries failed to load.");
      return;
    }

    try {
      this.hands = new window.Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
      });

      this.hands.setOptions({
        maxNumHands: 2,
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

      this.updateHUD('Searching...', 0, 'None', 'Idle', false);
      await this.camera.start();
    } catch (err) {
      console.error("Camera access error:", err);
      this.updateHUD('Permission Denied', 0, 'None', 'Idle', false);
      if (this.onError) this.onError("Camera access was denied or device webcam is unavailable.");
    }
  }

  handleResults(results) {
    const parsedHands = [];
    const viewWidth = 26.0;
    const viewHeight = 16.0;

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const landmarks = results.multiHandLandmarks[i];

        // 3D Palm Center Calculation
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

        const palmPos = new THREE.Vector3(normX * viewWidth, normY * viewHeight, normZ * 12.0);

        // Index Tip position
        const indexTip = landmarks[8];
        const idxX = (1.0 - indexTip.x) - 0.5;
        const idxY = 0.5 - indexTip.y;
        const idxZ = -indexTip.z;
        const pointerPos = new THREE.Vector3(idxX * viewWidth, idxY * viewHeight, idxZ * 12.0);

        // Gesture Classification
        const gestureInfo = this.classifyGesture(landmarks);

        parsedHands.push({
          palmPos,
          pointerPos,
          gesture: gestureInfo.name,
          pinchRatio: gestureInfo.pinchRatio || 0.1
        });
      }
    }

    const numHands = parsedHands.length;
    let modeText = 'Idle';
    let gestureText = 'None';
    let trackingText = 'Lost';

    if (numHands === 1) {
      trackingText = '1 Hand Detected';
      gestureText = parsedHands[0].gesture;
      modeText = 'One-Hand Hover';
    } else if (numHands === 2) {
      trackingText = '2 Hands Detected';
      
      const isBothGrabbing = (parsedHands[0].gesture === 'Closed Fist' || parsedHands[0].gesture === 'Pinch' || parsedHands[0].gesture === 'Open Hand') &&
                             (parsedHands[1].gesture === 'Closed Fist' || parsedHands[1].gesture === 'Pinch' || parsedHands[1].gesture === 'Open Hand');
      
      if (isBothGrabbing) {
        gestureText = 'Two-Hand Grab';
        modeText = 'Two-Hand Holographic';
      } else {
        gestureText = `${parsedHands[0].gesture} / ${parsedHands[1].gesture}`;
        modeText = 'Two-Hand Hover';
      }
    }

    this.updateHUD(trackingText, numHands, gestureText, modeText, numHands > 0);

    if (this.onHandsUpdate) {
      this.onHandsUpdate({
        numHands,
        hands: parsedHands,
        mode: modeText,
        primaryGesture: gestureText
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

    // Pinch Gesture
    const pinchDist = dist3D(thumbTip, indexTip);
    if (pinchDist < 0.058) {
      return { name: 'Pinch', pinchRatio: pinchDist };
    }

    const dIndexTip = distWrist(indexTip);
    const dMiddleTip = distWrist(middleTip);
    const dRingTip = distWrist(ringTip);
    const dPinkyTip = distWrist(pinkyTip);

    const dIndexMcp = distWrist(indexMcp);
    const dMiddleMcp = distWrist(middleMcp);
    const dRingMcp = distWrist(ringMcp);
    const dPinkyMcp = distWrist(pinkyMcp);

    const isIndexFolded = dIndexTip < dIndexMcp * 1.25;
    const isMiddleFolded = dMiddleTip < dMiddleMcp * 1.25;
    const isRingFolded = dRingTip < dRingMcp * 1.25;
    const isPinkyFolded = dPinkyTip < dPinkyMcp * 1.25;

    // Closed Fist
    if (isIndexFolded && isMiddleFolded && isRingFolded && isPinkyFolded) {
      return { name: 'Closed Fist' };
    }

    // Pointing
    const isIndexExtended = dIndexTip > dIndexMcp * 1.4;
    if (isIndexExtended && isMiddleFolded && isRingFolded && isPinkyFolded) {
      return { name: 'Pointing' };
    }

    // Open Hand
    if (dIndexTip > dIndexMcp * 1.2 && dMiddleTip > dMiddleMcp * 1.2 && dRingTip > dRingMcp * 1.2) {
      return { name: 'Open Hand' };
    }

    return { name: 'Tracking' };
  }

  updateHUD(trackingText, count, gestureText, modeText, isOk) {
    if (this.trackingStatusEl) this.trackingStatusEl.textContent = trackingText;
    if (this.handsCountEl) this.handsCountEl.textContent = count;
    if (this.gestureStatusEl) this.gestureStatusEl.textContent = gestureText;
    if (this.modeStatusEl) this.modeStatusEl.textContent = modeText;

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
 * Procedural Dynamic Particle Universe
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
    const colorAccent = new THREE.Color(0x33aaff);    // Cyan

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
        type = 2; // Ambient Outer Universe
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
        uPointerActive: { value: 0.0 },
        uStretchVec: { value: new THREE.Vector3(1, 0, 0) },
        uStretchAmount: { value: 0.0 },
        uGlowBoost: { value: 0.0 }
      },
      vertexShader: `
        uniform float uTime;
        uniform vec3 uHandPos;
        uniform float uHandActive;
        uniform float uCollapse;
        uniform vec3 uPointerPos;
        uniform float uPointerActive;
        uniform vec3 uStretchVec;
        uniform float uStretchAmount;

        attribute float aSize;
        attribute float aPhase;
        attribute float aType;
        attribute vec3 color;
        varying vec3 vColor;
        varying float vHighlight;

        void main() {
          vColor = color;
          vec3 pos = position;

          // Rotation & Pulsing
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

          // Elastic Holographic Stretching for Two-Hand Grab
          if (aType < 1.5 && abs(uStretchAmount) > 0.001) {
            float proj = dot(pos, uStretchVec);
            pos += uStretchVec * proj * uStretchAmount * 0.35;
          }

          // One-Hand Follow Shift
          if (aType < 1.5) {
            pos += uHandPos * uHandActive;
          }

          // Fist Collapse Attraction
          if (uCollapse > 0.001) {
            vec3 target = (aType < 1.5) ? uHandPos : vec3(0.0);
            pos = mix(pos, target, uCollapse * 0.88);
          }

          // Pointing Cluster Highlight
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
        uniform float uGlowBoost;
        varying vec3 vColor;
        varying float vHighlight;

        void main() {
          vec2 coord = gl_PointCoord - vec2(0.5);
          float dist = length(coord);
          if (dist > 0.5) discard;

          float glow = pow(1.0 - (dist * 2.0), 1.8);
          float coreHalo = exp(-dist * 7.0) * 0.6;

          // Glow Boost for Two-Hand Energy Field
          vec3 boostedColor = vColor + vec3(0.2, 0.15, 0.05) * uGlowBoost;
          vec3 finalColor = boostedColor + vec3(coreHalo) + vec3(vHighlight * 0.4);

          gl_FragColor = vec4(finalColor, clamp(glow + coreHalo + vHighlight * 0.3 + uGlowBoost * 0.25, 0.0, 1.0));
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.points = new THREE.Points(this.geometry, this.material);
  }

  update(time, handPos, isOneHand, collapseFactor, pointerPos, isPointing, stretchVec, stretchAmount, glowBoost) {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uHandPos.value.copy(handPos);
    this.material.uniforms.uHandActive.value = isOneHand ? 1.0 : 0.0;
    this.material.uniforms.uCollapse.value = collapseFactor;
    this.material.uniforms.uPointerPos.value.copy(pointerPos);
    this.material.uniforms.uPointerActive.value = isPointing ? 1.0 : 0.0;
    this.material.uniforms.uStretchVec.value.copy(stretchVec);
    this.material.uniforms.uStretchAmount.value = stretchAmount;
    this.material.uniforms.uGlowBoost.value = glowBoost;
  }
}

/**
 * Main Application Engine
 */
class Application {
  constructor() {
    this.canvas = document.getElementById('webgl-canvas');
    this.fpsElement = document.getElementById('hud-fps');
    this.scaleElement = document.getElementById('hud-scale');
    this.rotationElement = document.getElementById('hud-rotation');
    this.statusElement = document.getElementById('hud-status');
    this.errorPanel = document.getElementById('error-dialog');
    this.errorText = document.getElementById('error-text');

    this.time = 0;

    // Smooth Interaction Vectors
    this.smoothedHandPos = new THREE.Vector3(0, 0, 0);
    this.smoothedPointerPos = new THREE.Vector3(0, 0, 0);
    this.smoothedCollapse = 0.0;

    // Holographic Object Transform Targets
    this.universePosTarget = new THREE.Vector3(0, 0, 0);
    this.universeRotTarget = new THREE.Euler(0, 0, 0);
    this.targetScale = 1.0;
    this.currentScale = 1.0;

    // Two-Hand Reference States
    this.initialTwoHandDist = null;
    this.initialTwoHandScale = 1.0;
    this.smoothedStretchAmount = 0.0;
    this.smoothedGlowBoost = 0.0;
    this.stretchVec = new THREE.Vector3(1, 0, 0);

    this.cameraTargetPos = new THREE.Vector3(0, 8, 22);

    this.trackingData = {
      numHands: 0,
      hands: [],
      mode: 'Idle',
      primaryGesture: 'None'
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

    // Holographic Group Container for Two-Hand Rotation/Translation/Scale
    this.universeGroup = new THREE.Group();
    this.scene.add(this.universeGroup);

    this.universe = new ParticleUniverse(80000);
    this.universeGroup.add(this.universe.points);
  }

  initHandTracking() {
    this.tracker = new MultiHandTracker(
      (data) => {
        this.trackingData = data;
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
    const { numHands, hands, mode } = this.trackingData;

    if (numHands === 1) {
      // --- ONE HAND INTERACTION MODE ---
      this.initialTwoHandDist = null; // Reset two hand reference
      const h1 = hands[0];

      this.smoothedHandPos.lerp(h1.palmPos, lerpSpeed);
      this.smoothedPointerPos.lerp(h1.pointerPos, lerpSpeed);

      // Pinch Zoom
      if (h1.gesture === 'Pinch') {
        const mappedZoom = THREE.MathUtils.mapLinear(
          THREE.MathUtils.clamp(h1.pinchRatio, 0.015, 0.055),
          0.015, 0.055,
          0.4, 2.2
        );
        this.targetScale = mappedZoom;
      }

      // Closed Fist Collapse
      if (h1.gesture === 'Closed Fist') {
        this.smoothedCollapse = THREE.MathUtils.lerp(this.smoothedCollapse, 1.0, 0.08);
      } else {
        this.smoothedCollapse = THREE.MathUtils.lerp(this.smoothedCollapse, 0.0, 0.08);
      }

      // Reset Two-Hand effects
      this.smoothedStretchAmount = THREE.MathUtils.lerp(this.smoothedStretchAmount, 0.0, 0.08);
      this.smoothedGlowBoost = THREE.MathUtils.lerp(this.smoothedGlowBoost, 0.0, 0.08);

      // Reset Universe translation to zero (handled by local hand shift)
      this.universePosTarget.set(0, 0, 0);

    } else if (numHands === 2 && mode === 'Two-Hand Holographic') {
      // --- TWO HAND HOLOGRAPHIC MANIPULATION MODE ---
      const h1 = hands[0].palmPos;
      const h2 = hands[1].palmPos;

      // 1. Translation: Hologram center follows Midpoint of both hands
      const midpoint = new THREE.Vector3().addVectors(h1, h2).multiplyScalar(0.5);
      this.universePosTarget.copy(midpoint);

      // 2. Scaling & Distance
      const currentDist = h1.distanceTo(h2);
      if (this.initialTwoHandDist === null) {
        this.initialTwoHandDist = currentDist;
        this.initialTwoHandScale = this.currentScale;
      }

      const scaleRatio = currentDist / Math.max(this.initialTwoHandDist, 0.001);
      this.targetScale = THREE.MathUtils.clamp(this.initialTwoHandScale * scaleRatio, 0.35, 3.2);

      // 3. Rotation: Orient relative to hand vector
      this.stretchVec.subVectors(h1, h2).normalize();

      const pitch = Math.atan2(this.stretchVec.y, Math.sqrt(this.stretchVec.x * this.stretchVec.x + this.stretchVec.z * this.stretchVec.z));
      const yaw = Math.atan2(this.stretchVec.x, this.stretchVec.z);
      const roll = (h1.y - h2.y) * 0.15;

      this.universeRotTarget.set(pitch * 1.2, yaw, roll);

      // 4. Elastic Stretch & Energy Glow
      const stretchDelta = (currentDist - this.initialTwoHandDist) * 0.08;
      this.smoothedStretchAmount = THREE.MathUtils.lerp(this.smoothedStretchAmount, THREE.MathUtils.clamp(stretchDelta, -0.4, 0.6), 0.1);
      this.smoothedGlowBoost = THREE.MathUtils.lerp(this.smoothedGlowBoost, 0.6, 0.08);

      // Reset single hand variables
      this.smoothedCollapse = THREE.MathUtils.lerp(this.smoothedCollapse, 0.0, 0.08);
      this.smoothedHandPos.lerp(new THREE.Vector3(0, 0, 0), 0.05);

    } else {
      // --- IDLE STATE ---
      this.initialTwoHandDist = null;

      this.smoothedHandPos.lerp(new THREE.Vector3(0, 0, 0), 0.03);
      this.smoothedPointerPos.lerp(new THREE.Vector3(0, 0, 0), 0.03);
      this.smoothedCollapse = THREE.MathUtils.lerp(this.smoothedCollapse, 0.0, 0.05);
      this.smoothedStretchAmount = THREE.MathUtils.lerp(this.smoothedStretchAmount, 0.0, 0.05);
      this.smoothedGlowBoost = THREE.MathUtils.lerp(this.smoothedGlowBoost, 0.0, 0.05);

      this.universePosTarget.set(0, 0, 0);

      // Slowly return universe to level orientation in idle
      this.universeRotTarget.x = THREE.MathUtils.lerp(this.universeRotTarget.x, 0, 0.02);
      this.universeRotTarget.z = THREE.MathUtils.lerp(this.universeRotTarget.z, 0, 0.02);
    }

    // Apply Smoothed Transforms to Universe Container
    this.universeGroup.position.lerp(this.universePosTarget, 0.08);

    this.universeGroup.rotation.x = THREE.MathUtils.lerp(this.universeGroup.rotation.x, this.universeRotTarget.x, 0.06);
    this.universeGroup.rotation.y = THREE.MathUtils.lerp(this.universeGroup.rotation.y, this.universeRotTarget.y, 0.06);
    this.universeGroup.rotation.z = THREE.MathUtils.lerp(this.universeGroup.rotation.z, this.universeRotTarget.z, 0.06);

    // Apply Smoothed Scale
    this.currentScale = THREE.MathUtils.lerp(this.currentScale, this.targetScale, 0.06);
    this.universeGroup.scale.setScalar(this.currentScale);

    // Update HUD Values
    if (this.scaleElement) {
      this.scaleElement.textContent = `${Math.round(this.currentScale * 100)}%`;
    }
    if (this.rotationElement) {
      const degX = Math.round(THREE.MathUtils.radToDeg(this.universeGroup.rotation.x));
      const degY = Math.round(THREE.MathUtils.radToDeg(this.universeGroup.rotation.y));
      const degZ = Math.round(THREE.MathUtils.radToDeg(this.universeGroup.rotation.z));
      this.rotationElement.textContent = `X:${degX}Â° Y:${degY}Â° Z:${degZ}Â°`;
    }
  }

  updateCamera(elapsedTime) {
    const baseRadius = 22.0;
    const speed = elapsedTime * 0.04;

    // Cinematic Camera Drift that follows hologram translation
    this.cameraTargetPos.x = this.universeGroup.position.x * 0.35 + Math.sin(speed) * baseRadius;
    this.cameraTargetPos.z = this.universeGroup.position.z * 0.35 + Math.cos(speed) * baseRadius;
    this.cameraTargetPos.y = this.universeGroup.position.y * 0.35 + 6.0 + Math.sin(elapsedTime * 0.08) * 2.5;

    this.camera.position.lerp(this.cameraTargetPos, 0.03);
    this.camera.lookAt(this.universeGroup.position.x * 0.5, this.universeGroup.position.y * 0.5, this.universeGroup.position.z * 0.5);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    this.time += 0.016;

    if (this.monitor) this.monitor.tick();

    this.updateInteractions();

    const isOneHand = this.trackingData.numHands === 1;
    const isPointing = isOneHand && this.trackingData.primaryGesture === 'Pointing';
    const pointerPos = isOneHand && this.trackingData.hands[0] ? this.trackingData.hands[0].pointerPos : this.smoothedPointerPos;

    if (this.universe) {
      this.universe.update(
        this.time,
        this.smoothedHandPos,
        isOneHand,
        this.smoothedCollapse,
        pointerPos,
        isPointing,
        this.stretchVec,
        this.smoothedStretchAmount,
        this.smoothedGlowBoost
      );
    }

    this.updateCamera(this.time);

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }
}

// Initialize Application on DOM Content Loaded
window.addEventListener('DOMContentLoaded', () => {
  new Application();
});
