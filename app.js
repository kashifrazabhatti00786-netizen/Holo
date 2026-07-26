import * as THREE from 'three';

/**
 * Seeded PRNG Generator (Mulberry32)
 */
function createPRNG(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Performance Monitor & Adaptive LOD Manager
 */
class PerformanceMonitor {
  constructor(onUpdate, onAdaptiveDrop) {
    this.onUpdate = onUpdate;
    this.onAdaptiveDrop = onAdaptiveDrop;
    this.frameCount = 0;
    this.lastTime = performance.now();
    this.lowFpsCount = 0;
    this.isLowPerformance = false;
  }

  tick() {
    this.frameCount++;
    const now = performance.now();
    const elapsed = now - this.lastTime;

    if (elapsed >= 500) {
      const fps = Math.round((this.frameCount * 1000) / elapsed);
      if (this.onUpdate) this.onUpdate(fps);

      // Adaptive Performance Trigger for slower devices
      if (fps < 40 && !this.isLowPerformance) {
        this.lowFpsCount++;
        if (this.lowFpsCount >= 3) {
          this.isLowPerformance = true;
          if (this.onAdaptiveDrop) this.onAdaptiveDrop();
        }
      } else if (fps >= 50) {
        this.lowFpsCount = 0;
      }

      this.frameCount = 0;
      this.lastTime = now;
    }
  }
}

/**
 * Ambient Background Dust & Atmospheric Glow
 */
class AmbientBackground {
  constructor(count = 3000) {
    this.count = count;
    this.geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.count * 3);
    const colors = new Float32Array(this.count * 3);

    const baseColor = new THREE.Color(0x334466);

    for (let i = 0; i < this.count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 120.0;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 120.0;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 120.0;

      const c = baseColor.clone().multiplyScalar(0.2 + Math.random() * 0.3);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    this.material = new THREE.PointsMaterial({
      size: 1.8,
      vertexColors: true,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.points = new THREE.Points(this.geometry, this.material);
  }

  update(time) {
    this.points.rotation.y = time * 0.012;
    this.points.rotation.x = Math.sin(time * 0.008) * 0.05;
  }
}

/**
 * MediaPipe Multi-Hand Tracker
 */
class MultiHandTracker {
  constructor(onHandsUpdate, onError, onGestureEvent) {
    this.onHandsUpdate = onHandsUpdate;
    this.onError = onError;
    this.onGestureEvent = onGestureEvent;

    this.trackingStatusEl = document.getElementById('hud-tracking');
    this.gestureStatusEl = document.getElementById('hud-gesture');
    this.modeStatusEl = document.getElementById('hud-mode');
    this.statusDot = document.getElementById('status-dot');
    this.videoElement = document.getElementById('webcam');

    this.prevMode = 'Idle';
    this.init();
  }

  async init() {
    if (!window.Hands || !window.Camera) {
      this.updateHUD('Lib Error', 'None', 'Idle', false);
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

      this.updateHUD('Searching...', 'None', 'Idle', false);
      await this.camera.start();
    } catch (err) {
      console.error("Camera access error:", err);
      this.updateHUD('Permission Denied', 'None', 'Idle', false);
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

        const wrist = landmarks[0];
        const indexMcp = landmarks[5];
        const pinkyMcp = landmarks[17];

        const palmX = (wrist.x + indexMcp.x + pinkyMcp.x) / 3.0;
        const palmY = (wrist.y + indexMcp.y + pinkyMcp.y) / 3.0;
        const palmZ = (wrist.z + indexMcp.z + pinkyMcp.z) / 3.0;

        const normX = (1.0 - palmX) - 0.5;
        const normY = 0.5 - palmY;
        const normZ = -palmZ;

        const palmPos = new THREE.Vector3(normX * viewWidth, normY * viewHeight, normZ * 12.0);

        const indexTip = landmarks[8];
        const idxX = (1.0 - indexTip.x) - 0.5;
        const idxY = 0.5 - indexTip.y;
        const idxZ = -indexTip.z;
        const pointerPos = new THREE.Vector3(idxX * viewWidth, idxY * viewHeight, idxZ * 12.0);

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
      modeText = 'Infinite Travel';
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

    // Trigger Energy Wave on Event Transitions
    if (this.onGestureEvent && modeText !== this.prevMode) {
      if (modeText === 'Two-Hand Holographic') {
        const mid = parsedHands.length === 2 ?
          new THREE.Vector3().addVectors(parsedHands[0].palmPos, parsedHands[1].palmPos).multiplyScalar(0.5) :
          new THREE.Vector3(0, 0, 0);
        this.onGestureEvent('grab', mid);
      } else if (this.prevMode === 'Two-Hand Holographic') {
        this.onGestureEvent('release', new THREE.Vector3(0, 0, 0));
      }
      this.prevMode = modeText;
    }

    this.updateHUD(trackingText, gestureText, modeText, numHands > 0);

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

    if (isIndexFolded && isMiddleFolded && isRingFolded && isPinkyFolded) {
      return { name: 'Closed Fist' };
    }

    const isIndexExtended = dIndexTip > dIndexMcp * 1.4;
    if (isIndexExtended && isMiddleFolded && isRingFolded && isPinkyFolded) {
      return { name: 'Pointing' };
    }

    if (dIndexTip > dIndexMcp * 1.2 && dMiddleTip > dMiddleMcp * 1.2 && dRingTip > dRingMcp * 1.2) {
      return { name: 'Open Hand' };
    }

    return { name: 'Tracking' };
  }

  updateHUD(trackingText, gestureText, modeText, isOk) {
    if (this.trackingStatusEl) this.trackingStatusEl.textContent = trackingText;
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
 * Advanced Holographic Particle Level Builder with Custom GLSL Shaders
 */
class ProceduralUniverseLevel {
  constructor(levelIndex, seed = 1337, count = 40000) {
    this.levelIndex = levelIndex;
    this.seed = seed;
    this.count = count;
    this.rng = createPRNG(seed + levelIndex * 9999);

    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(this.count * 3);
    const colors = new Float32Array(this.count * 3);
    const sizes = new Float32Array(this.count);
    const phases = new Float32Array(this.count);
    const types = new Float32Array(this.count);

    const palettes = [
      [new THREE.Color(0xffffff), new THREE.Color(0xffaa00), new THREE.Color(0xff4400), new THREE.Color(0x33aaff)],
      [new THREE.Color(0xffffff), new THREE.Color(0x00ffcc), new THREE.Color(0xaa00ff), new THREE.Color(0xffaa00)],
      [new THREE.Color(0xffffff), new THREE.Color(0x0099ff), new THREE.Color(0xff00aa), new THREE.Color(0x00ff66)],
      [new THREE.Color(0xffffff), new THREE.Color(0xaa00ff), new THREE.Color(0x00ffff), new THREE.Color(0xff8800)],
      [new THREE.Color(0xffffff), new THREE.Color(0xff0055), new THREE.Color(0x00e1ff), new THREE.Color(0xffdd00)]
    ];

    const currentPalette = palettes[Math.abs(levelIndex) % palettes.length];
    const coreCount = Math.floor(this.count * 0.45);
    const spiralCount = Math.floor(this.count * 0.35);

    for (let i = 0; i < this.count; i++) {
      let x, y, z, size, type, color;
      const phase = this.rng() * Math.PI * 2;

      if (i < coreCount) {
        type = 0;
        const radius = Math.pow(this.rng(), 2.0) * 4.5 + 0.1;
        const theta = this.rng() * Math.PI * 2;
        const phi = Math.acos(2 * this.rng() - 1);

        x = radius * Math.sin(phi) * Math.cos(theta);
        y = radius * Math.sin(phi) * Math.sin(theta) * 0.7;
        z = radius * Math.cos(phi);

        size = (1.0 - radius / 4.6) * 12.0 + this.rng() * 5.0;
        const normDist = radius / 4.6;
        color = currentPalette[0].clone().lerp(currentPalette[1], normDist * 2.0);
      } else if (i < coreCount + spiralCount) {
        type = 1;
        const armIndex = i % 3;
        const armOffset = (armIndex * Math.PI * 2) / 3;
        const dist = 3.5 + this.rng() * 12.0;
        const angle = dist * 0.4 + armOffset + (this.rng() - 0.5) * 0.4;

        x = Math.cos(angle) * dist + (this.rng() - 0.5) * 1.5;
        y = (this.rng() - 0.5) * (1.8 + dist * 0.1);
        z = Math.sin(angle) * dist + (this.rng() - 0.5) * 1.5;

        size = this.rng() * 7.0 + 3.0;
        color = this.rng() > 0.85 ? currentPalette[3] : currentPalette[2];
      } else {
        type = 2;
        const radius = 12.0 + this.rng() * 30.0;
        const theta = this.rng() * Math.PI * 2;
        const phi = Math.acos(2 * this.rng() - 1);

        x = radius * Math.sin(phi) * Math.cos(theta);
        y = radius * Math.sin(phi) * Math.sin(theta);
        z = radius * Math.cos(phi);

        size = this.rng() * 5.0 + 2.0;
        color = this.rng() > 0.9 ? currentPalette[3] : currentPalette[1];
      }

      this.positions[i * 3] = x;
      this.positions[i * 3 + 1] = y;
      this.positions[i * 3 + 2] = z;

      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      sizes[i] = size;
      phases[i] = phase;
      types[i] = type;
    }

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
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
        uGlowBoost: { value: 0.0 },
        uLevelScale: { value: 1.0 },
        uOpacity: { value: 1.0 },
        uLevelIndex: { value: levelIndex },
        uWaveOrigin: { value: new THREE.Vector3(0, 0, 0) },
        uWaveProgress: { value: 0.0 },
        uWaveIntensity: { value: 0.0 }
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
        uniform float uLevelScale;
        uniform float uLevelIndex;
        uniform vec3 uWaveOrigin;
        uniform float uWaveProgress;
        uniform float uWaveIntensity;

        attribute float aSize;
        attribute float aPhase;
        attribute float aType;
        attribute vec3 color;
        varying vec3 vColor;
        varying float vHighlight;
        varying float vFlicker;

        void main() {
          vColor = color;
          vec3 pos = position;

          float levelSpeed = 1.0 + abs(uLevelIndex) * 0.35;

          // Per-particle organic flicker
          vFlicker = sin(uTime * 4.0 + aPhase * 10.0) * 0.15 + 0.85;

          // Floating & Rotation Dynamics
          if (aType < 0.5) {
            float angle = uTime * 0.15 * levelSpeed + aPhase * 0.1;
            float c = cos(angle);
            float s = sin(angle);
            float nx = pos.x * c - pos.z * s;
            float nz = pos.x * s + pos.z * c;
            pos.x = nx;
            pos.z = nz;

            float pulse = 1.0 + 0.06 * sin(uTime * 1.8 * levelSpeed + aPhase * 2.0);
            pos *= pulse;
          } else if (aType < 1.5) {
            float angle = uTime * 0.08 * levelSpeed;
            float c = cos(angle);
            float s = sin(angle);
            float nx = pos.x * c - pos.z * s;
            float nz = pos.x * s + pos.z * c;
            pos.x = nx;
            pos.z = nz;
            pos.y += sin(uTime * 0.5 * levelSpeed + aPhase) * 0.25;
          } else {
            pos.x += sin(uTime * 0.2 * levelSpeed + aPhase) * 0.4;
            pos.y += cos(uTime * 0.25 * levelSpeed + aPhase * 1.5) * 0.4;
            pos.z += sin(uTime * 0.15 * levelSpeed + aPhase * 2.0) * 0.4;
          }

          // Elastic Holographic Stretching
          if (aType < 1.5 && abs(uStretchAmount) > 0.001) {
            float proj = dot(pos, uStretchVec);
            pos += uStretchVec * proj * uStretchAmount * 0.35;
          }

          // Hand Follow Translation
          if (aType < 1.5) {
            pos += uHandPos * uHandActive;
          }

          // Fist Collapse Attraction
          if (uCollapse > 0.001) {
            vec3 target = (aType < 1.5) ? uHandPos : vec3(0.0);
            pos = mix(pos, target, uCollapse * 0.88);
          }

          // Holographic Energy Shockwave Wave Propagation
          vHighlight = 0.0;
          if (uWaveIntensity > 0.01) {
            float distToWave = length(pos - uWaveOrigin);
            float waveRadius = uWaveProgress * 32.0;
            float waveDist = abs(distToWave - waveRadius);
            if (waveDist < 4.0) {
              float waveFactor = (1.0 - waveDist / 4.0) * (1.0 - uWaveProgress) * uWaveIntensity;
              vec3 waveDir = normalize(pos - uWaveOrigin + vec3(0.001));
              pos += waveDir * waveFactor * 2.2;
              vHighlight += waveFactor * 2.5;
            }
          }

          pos *= uLevelScale;

          // Pointing Cluster Highlight
          if (uPointerActive > 0.5) {
            float distToPointer = length(pos - uPointerPos);
            if (distToPointer < 4.5 * uLevelScale) {
              vHighlight += (1.0 - distToPointer / (4.5 * uLevelScale));
            }
          }

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          
          float sizeMultiplier = (1.0 + vHighlight * 1.2) * sqrt(max(uLevelScale, 0.1));
          gl_PointSize = aSize * sizeMultiplier * (260.0 / -mvPosition.z);
        }
      `,
      fragmentShader: `
        uniform float uGlowBoost;
        uniform float uOpacity;
        uniform float uTime;

        varying vec3 vColor;
        varying float vHighlight;
        varying float vFlicker;

        void main() {
          vec2 coord = gl_PointCoord - vec2(0.5);
          float dist = length(coord);
          if (dist > 0.5) discard;

          // Multi-layer Fresnel Corona Glow
          float glow = pow(1.0 - (dist * 2.0), 1.8);
          float coreHalo = exp(-dist * 7.5) * 0.65;

          // Color Breathing
          float breath = sin(uTime * 2.2) * 0.08 + 1.0;
          vec3 boostedColor = vColor * breath * vFlicker + vec3(0.2, 0.15, 0.05) * uGlowBoost;
          vec3 finalColor = boostedColor + vec3(coreHalo) + vec3(vHighlight * 0.45);

          float alpha = clamp(glow + coreHalo + vHighlight * 0.35 + uGlowBoost * 0.25, 0.0, 1.0) * uOpacity;
          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.points = new THREE.Points(this.geometry, this.material);
  }

  update(time, handPos, isOneHand, collapseFactor, pointerPos, isPointing, stretchVec, stretchAmount, glowBoost, scale, opacity, waveOrigin, waveProgress, waveIntensity) {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uHandPos.value.copy(handPos);
    this.material.uniforms.uHandActive.value = isOneHand ? 1.0 : 0.0;
    this.material.uniforms.uCollapse.value = collapseFactor;
    this.material.uniforms.uPointerPos.value.copy(pointerPos);
    this.material.uniforms.uPointerActive.value = isPointing ? 1.0 : 0.0;
    this.material.uniforms.uStretchVec.value.copy(stretchVec);
    this.material.uniforms.uStretchAmount.value = stretchAmount;
    this.material.uniforms.uGlowBoost.value = glowBoost;
    this.material.uniforms.uLevelScale.value = scale;
    this.material.uniforms.uOpacity.value = opacity;
    this.material.uniforms.uWaveOrigin.value.copy(waveOrigin);
    this.material.uniforms.uWaveProgress.value = waveProgress;
    this.material.uniforms.uWaveIntensity.value = waveIntensity;
  }

  findClosestParticle(pointerPos) {
    let minDist = Infinity;
    let closestIndex = -1;
    let closestPos = new THREE.Vector3();

    for (let i = 0; i < this.count; i += 12) {
      const px = this.positions[i * 3];
      const py = this.positions[i * 3 + 1];
      const pz = this.positions[i * 3 + 2];

      const d = Math.hypot(px - pointerPos.x, py - pointerPos.y, pz - pointerPos.z);
      if (d < minDist) {
        minDist = d;
        closestIndex = i;
        closestPos.set(px, py, pz);
      }
    }
    return { index: closestIndex, pos: closestPos, dist: minDist };
  }

  setLowPerformanceLOD() {
    this.geometry.setDrawRange(0, Math.floor(this.count * 0.65));
  }
}

/**
 * Infinite Procedural Manager with Holographic Energy Waves
 */
class InfiniteUniverseManager {
  constructor(scene) {
    this.scene = scene;
    this.containerGroup = new THREE.Group();
    this.scene.add(this.containerGroup);

    this.currentLevelIndex = 0;
    this.primaryLevel = new ProceduralUniverseLevel(0, 1337);
    this.secondaryLevel = new ProceduralUniverseLevel(1, 1337);

    this.containerGroup.add(this.primaryLevel.points);
    this.containerGroup.add(this.secondaryLevel.points);

    this.waveOrigin = new THREE.Vector3(0, 0, 0);
    this.waveProgress = 0.0;
    this.waveIntensity = 0.0;
    this.isWaveActive = false;

    this.levelNames = [
      "L0 [Macro Universe]",
      "L1 [Atomic Structure]",
      "L2 [Sub-atomic Field]",
      "L3 [Micro-quantum Grid]",
      "L4 [Quantum Singularity]"
    ];
  }

  getLevelName(idx) {
    if (idx >= 0 && idx < this.levelNames.length) return this.levelNames[idx];
    return `L${idx} [Quantum Depth]`;
  }

  triggerWave(origin, intensity = 1.0) {
    this.waveOrigin.copy(origin);
    this.waveProgress = 0.0;
    this.waveIntensity = intensity;
    this.isWaveActive = true;
  }

  updateLevels(continuousDepth, deltaTime) {
    const baseIndex = Math.floor(continuousDepth);
    const progress = continuousDepth - baseIndex;

    // Transition between level buffers
    if (baseIndex !== this.currentLevelIndex) {
      this.containerGroup.remove(this.primaryLevel.points);
      this.containerGroup.remove(this.secondaryLevel.points);

      this.currentLevelIndex = baseIndex;
      this.primaryLevel = new ProceduralUniverseLevel(baseIndex, 1337);
      this.secondaryLevel = new ProceduralUniverseLevel(baseIndex + 1, 1337);

      this.containerGroup.add(this.primaryLevel.points);
      this.containerGroup.add(this.secondaryLevel.points);

      this.triggerWave(new THREE.Vector3(0, 0, 0), 1.2);
  }
        // Animate Shockwave
    if (this.isWaveActive) {
      this.waveProgress += deltaTime * 1.5;
      if (this.waveProgress >= 1.0) {
        this.waveProgress = 1.0;
        this.waveIntensity = 0.0;
        this.isWaveActive = false;
      }
    }

    const primaryScale = 1.0 + progress * 3.5;
    const primaryOpacity = Math.max(0.0, 1.0 - progress * 0.85);

    const secondaryScale = 0.08 + progress * 0.92;
    const secondaryOpacity = Math.min(1.0, progress * 1.15);

    return {
      baseIndex,
      progress: Math.round(progress * 100),
      primaryScale,
      primaryOpacity,
      secondaryScale,
      secondaryOpacity
    };
  }

  enableLowPerformanceLOD() {
    if (this.primaryLevel) this.primaryLevel.setLowPerformanceLOD();
    if (this.secondaryLevel) this.secondaryLevel.setLowPerformanceLOD();
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
    this.depthElement = document.getElementById('hud-depth');
    this.selectedElement = document.getElementById('hud-selected');
    this.progressElement = document.getElementById('hud-progress');
    this.statusElement = document.getElementById('hud-status');
    this.errorPanel = document.getElementById('error-dialog');
    this.errorText = document.getElementById('error-text');

    this.time = 0;
    this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.continuousDepth = 0.0;
    this.targetDepth = 0.0;

    this.smoothedHandPos = new THREE.Vector3(0, 0, 0);
    this.smoothedPointerPos = new THREE.Vector3(0, 0, 0);
    this.smoothedCollapse = 0.0;

    this.universePosTarget = new THREE.Vector3(0, 0, 0);
    this.universeRotTarget = new THREE.Euler(0, 0, 0);
    this.targetScale = 1.0;
    this.currentScale = 1.0;

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

    // Ambient Background Field
    this.background = new AmbientBackground(2500);
    this.scene.add(this.background.points);

    // Infinite Universe System
    this.universeManager = new InfiniteUniverseManager(this.scene);
  }

  initHandTracking() {
    this.tracker = new MultiHandTracker(
      (data) => {
        this.trackingData = data;
      },
      (errorMsg) => {
        this.showError(errorMsg);
      },
      (eventType, position) => {
        if (this.universeManager) {
          this.universeManager.triggerWave(position, eventType === 'grab' ? 1.0 : 0.7);
        }
      }
    );
  }

  initEvents() {
    window.addEventListener('resize', () => this.onResize(), false);
  }

  initMonitor() {
    this.monitor = new PerformanceMonitor(
      (fps) => {
        if (this.fpsElement) this.fpsElement.textContent = fps;
      },
      () => {
        // Adaptive Performance Trigger for low-end hardware
        if (this.universeManager) {
          this.universeManager.enableLowPerformanceLOD();
        }
        this.renderer.setPixelRatio(1.0);
      }
    );
  }

  onResize() {
    if (!this.camera || !this.renderer) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.monitor.isLowPerformance ? 1.0 : 2));
  }
  updateInteractions() {
    const lerpSpeed = this.prefersReducedMotion ? 0.04 : 0.08;
    const { numHands, hands, mode } = this.trackingData;

    if (numHands === 1) {
      this.initialTwoHandDist = null;
      const h1 = hands[0];

      this.smoothedHandPos.lerp(h1.palmPos, lerpSpeed);
      this.smoothedPointerPos.lerp(h1.pointerPos, lerpSpeed);

      if (h1.gesture === 'Pinch') {
        const travelSpeed = THREE.MathUtils.mapLinear(
          THREE.MathUtils.clamp(h1.pinchRatio, 0.015, 0.055),
          0.015, 0.055,
          0.04, -0.04
        );
        this.targetDepth = Math.max(0.0, this.targetDepth + travelSpeed);
      }

      if (h1.gesture === 'Closed Fist') {
        this.smoothedCollapse = THREE.MathUtils.lerp(this.smoothedCollapse, 1.0, 0.08);
      } else {
        this.smoothedCollapse = THREE.MathUtils.lerp(this.smoothedCollapse, 0.0, 0.08);
      }

      this.smoothedStretchAmount = THREE.MathUtils.lerp(this.smoothedStretchAmount, 0.0, 0.08);
      this.smoothedGlowBoost = THREE.MathUtils.lerp(this.smoothedGlowBoost, 0.0, 0.08);
      this.universePosTarget.set(0, 0, 0);

    } else if (numHands === 2 && mode === 'Two-Hand Holographic') {
      const h1 = hands[0].palmPos;
      const h2 = hands[1].palmPos;

      const midpoint = new THREE.Vector3().addVectors(h1, h2).multiplyScalar(0.5);
      this.universePosTarget.copy(midpoint);

      const currentDist = h1.distanceTo(h2);
      if (this.initialTwoHandDist === null) {
        this.initialTwoHandDist = currentDist;
        this.initialTwoHandScale = this.currentScale;
      }

      const scaleRatio = currentDist / Math.max(this.initialTwoHandDist, 0.001);
      this.targetScale = THREE.MathUtils.clamp(this.initialTwoHandScale * scaleRatio, 0.35, 3.2);

      if (scaleRatio > 1.4) {
        this.targetDepth += 0.015;
      } else if (scaleRatio < 0.6) {
        this.targetDepth = Math.max(0.0, this.targetDepth - 0.015);
      }

      this.stretchVec.subVectors(h1, h2).normalize();
      const pitch = Math.atan2(this.stretchVec.y, Math.sqrt(this.stretchVec.x * this.stretchVec.x + this.stretchVec.z * this.stretchVec.z));
      const yaw = Math.atan2(this.stretchVec.x, this.stretchVec.z);
      const roll = (h1.y - h2.y) * 0.15;

      this.universeRotTarget.set(pitch * 1.2, yaw, roll);

      const stretchDelta = (currentDist - this.initialTwoHandDist) * 0.08;
      this.smoothedStretchAmount = THREE.MathUtils.lerp(this.smoothedStretchAmount, THREE.MathUtils.clamp(stretchDelta, -0.4, 0.6), 0.1);
      this.smoothedGlowBoost = THREE.MathUtils.lerp(this.smoothedGlowBoost, 0.6, 0.08);
      this.smoothedCollapse = THREE.MathUtils.lerp(this.smoothedCollapse, 0.0, 0.08);

    } else {
      this.initialTwoHandDist = null;
      this.smoothedHandPos.lerp(new THREE.Vector3(0, 0, 0), 0.03);
      this.smoothedPointerPos.lerp(new THREE.Vector3(0, 0, 0), 0.03);
      this.smoothedCollapse = THREE.MathUtils.lerp(this.smoothedCollapse, 0.0, 0.05);
      this.smoothedStretchAmount = THREE.MathUtils.lerp(this.smoothedStretchAmount, 0.0, 0.05);
      this.smoothedGlowBoost = THREE.MathUtils.lerp(this.smoothedGlowBoost, 0.0, 0.05);

      this.universePosTarget.set(0, 0, 0);
      this.universeRotTarget.x = THREE.MathUtils.lerp(this.universeRotTarget.x, 0, 0.02);
      this.universeRotTarget.z = THREE.MathUtils.lerp(this.universeRotTarget.z, 0, 0.02);
    }

    this.continuousDepth = THREE.MathUtils.lerp(this.continuousDepth, this.targetDepth, 0.06);

    this.universeManager.containerGroup.position.lerp(this.universePosTarget, 0.08);
    this.universeManager.containerGroup.rotation.x = THREE.MathUtils.lerp(this.universeManager.containerGroup.rotation.x, this.universeRotTarget.x, 0.06);
    this.universeManager.containerGroup.rotation.y = THREE.MathUtils.lerp(this.universeManager.containerGroup.rotation.y, this.universeRotTarget.y, 0.06);
    this.universeManager.containerGroup.rotation.z = THREE.MathUtils.lerp(this.universeManager.containerGroup.rotation.z, this.universeRotTarget.z, 0.06);

    this.currentScale = THREE.MathUtils.lerp(this.currentScale, this.targetScale, 0.06);
    this.universeManager.containerGroup.scale.setScalar(this.currentScale);
  }

  updateCamera(elapsedTime) {
    const baseRadius = 22.0;
    const speed = elapsedTime * (this.prefersReducedMotion ? 0.015 : 0.04);

    this.cameraTargetPos.x = this.universeManager.containerGroup.position.x * 0.35 + Math.sin(speed) * baseRadius;
    this.cameraTargetPos.z = this.universeManager.containerGroup.position.z * 0.35 + Math.cos(speed) * baseRadius;
    this.cameraTargetPos.y = this.universeManager.containerGroup.position.y * 0.35 + 6.0 + Math.sin(elapsedTime * 0.08) * 2.5;

    const levelProgress = this.continuousDepth - Math.floor(this.continuousDepth);
    this.camera.fov = 60 + Math.sin(levelProgress * Math.PI) * (this.prefersReducedMotion ? 2.0 : 5.0);
    this.camera.updateProjectionMatrix();

    this.camera.position.lerp(this.cameraTargetPos, 0.03);
    this.camera.lookAt(
      this.universeManager.containerGroup.position.x * 0.5,
      this.universeManager.containerGroup.position.y * 0.5,
      this.universeManager.containerGroup.position.z * 0.5
    );
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const deltaTime = 0.016;
    this.time += deltaTime;

    if (this.monitor) this.monitor.tick();
    if (this.background) this.background.update(this.time);

    this.updateInteractions();

    const levelData = this.universeManager.updateLevels(this.continuousDepth, deltaTime);

    const isOneHand = this.trackingData.numHands === 1;
    const isPointing = isOneHand && this.trackingData.primaryGesture === 'Pointing';
    const pointerPos = isOneHand && this.trackingData.hands[0] ? this.trackingData.hands[0].pointerPos : this.smoothedPointerPos;

    if (isPointing && this.universeManager.primaryLevel) {
      const hit = this.universeManager.primaryLevel.findClosestParticle(pointerPos);
      if (hit.closestIndex !== -1 && this.selectedElement) {
        this.selectedElement.textContent = `Cluster #${hit.index}`;
      }
    } else if (this.selectedElement) {
      this.selectedElement.textContent = 'None';
        }
    // Render Primary and Secondary Levels
    if (this.universeManager.primaryLevel) {
      this.universeManager.primaryLevel.update(
        this.time,
        this.smoothedHandPos,
        isOneHand,
        this.smoothedCollapse,
        pointerPos,
        isPointing,
        this.stretchVec,
        this.smoothedStretchAmount,
        this.smoothedGlowBoost,
        levelData.primaryScale,
        levelData.primaryOpacity,
        this.universeManager.waveOrigin,
        this.universeManager.waveProgress,
        this.universeManager.waveIntensity
      );
    }

    if (this.universeManager.secondaryLevel) {
      this.universeManager.secondaryLevel.update(
        this.time,
        this.smoothedHandPos,
        isOneHand,
        this.smoothedCollapse,
        pointerPos,
        isPointing,
        this.stretchVec,
        this.smoothedStretchAmount,
        this.smoothedGlowBoost,
        levelData.secondaryScale,
        levelData.secondaryOpacity,
        this.universeManager.waveOrigin,
        this.universeManager.waveProgress,
        this.universeManager.waveIntensity
      );
    }

    this.updateCamera(this.time);

    if (this.depthElement) {
      this.depthElement.textContent = this.universeManager.getLevelName(levelData.baseIndex);
    }
    if (this.progressElement) {
      this.progressElement.textContent = `${levelData.progress}%`;
    }
    if (this.zoomElement) {
      this.zoomElement.textContent = `${Math.round(this.currentScale * 100)}%`;
    }

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }
}

// Initialize Application on DOM Content Loaded
window.addEventListener('DOMContentLoaded', () => {
  new Application();
});
