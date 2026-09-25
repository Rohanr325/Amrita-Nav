/**
 * AmritaNav - Live Location & Tracking Engine
 * Supports Real Device GPS, High-Fidelity Simulation, Voice Guidance, and Dynamic Rerouting
 */

class AmritaLiveTracker {
  constructor(router, data) {
    this.router = router;
    this.data = data || window.AMRITA_DATA;
    this.gpsCalibration = this.data.campusInfo.gpsCalibration || {
      referenceLat: 10.9038,
      referenceLon: 76.9003,
      latPerPixel: 0.00000135,
      lonPerPixel: 0.00000138,
      bearingDegrees: 354.0
    };

    // User Live Position State
    this.state = {
      x: 296, // Default: Main Reception Entrance
      y: 842,
      heading: 0, // Degrees 0-360
      accuracyMeters: 5,
      speedMps: 0,
      mode: 'manual', // 'gps' | 'simulation' | 'manual'
      gpsStatus: 'standby', // 'standby' | 'locating' | 'active' | 'out_of_bounds' | 'denied' | 'unsupported'
      isNavigating: false,
      isPaused: false,
      speedMultiplier: 1.0,
      followCamera: true,
      voiceEnabled: true,
      currentStepIndex: 0,
      remainingMeters: 0,
      activeRoute: null
    };

    this.listeners = new Map();
    this.watchId = null;
    this.animFrameId = null;
    this.simStartTime = null;
    this.simTraveledDist = 0;
    this.simTotalDist = 0;
    this.simPolyline = [];
    this.simSegments = [];
    this.lastSpokenStep = -1;
    this.speechSynth = window.speechSynthesis || null;

    this.initCompass();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  emit(event, payload) {
    const cbs = this.listeners.get(event) || [];
    for (const cb of cbs) {
      try {
        cb(payload);
      } catch (err) {
        console.error(`Error in listener for ${event}:`, err);
      }
    }
  }

  initCompass() {
    if (typeof window !== 'undefined' && window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', (e) => {
        if (this.state.mode === 'gps' && e.alpha !== null) {
          const heading = e.webkitCompassHeading || (360 - e.alpha);
          if (heading !== undefined) {
            this.state.heading = Math.round(heading);
            this.emit('headingChange', this.state.heading);
          }
        }
      }, { passive: true });
    }
  }

  setPosition(x, y, heading = null, accuracy = 5, mode = null) {
    this.state.x = Math.round(x * 10) / 10;
    this.state.y = Math.round(y * 10) / 10;
    if (heading !== null) {
      this.state.heading = Math.round(heading);
    }
    this.state.accuracyMeters = accuracy;
    if (mode) {
      this.state.mode = mode;
    }

    this.emit('positionChange', {
      x: this.state.x,
      y: this.state.y,
      heading: this.state.heading,
      accuracy: this.state.accuracyMeters,
      mode: this.state.mode
    });

    if (this.state.isNavigating && this.state.activeRoute && this.state.mode !== 'simulation') {
      this.checkOffRoute();
    }
  }

  // --- Real Device GPS Geolocation ---
  startGpsTracking() {
    if (!navigator.geolocation) {
      this.state.gpsStatus = 'unsupported';
      this.emit('gpsStatusChange', { status: 'unsupported', message: 'Geolocation is not supported by your browser.' });
      return;
    }

    this.state.gpsStatus = 'locating';
    this.state.mode = 'gps';
    this.emit('gpsStatusChange', { status: 'locating', message: 'Acquiring high-accuracy GPS fix...' });

    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
    }

    const options = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 2000
    };

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.handleGpsSuccess(pos),
      (err) => this.handleGpsError(err),
      options
    );
  }

  stopGpsTracking() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (this.state.mode === 'gps') {
      this.state.mode = 'manual';
      this.state.gpsStatus = 'standby';
      this.emit('gpsStatusChange', { status: 'standby', message: 'GPS tracking stopped.' });
    }
  }

  handleGpsSuccess(pos) {
    const { latitude, longitude, accuracy, heading, speed } = pos.coords;
    const campusPoint = this.gpsToCanvas(latitude, longitude);

    // Distance from reference point in meters (~campus radius)
    const distFromCenter = this.haversineDistance(
      latitude,
      longitude,
      this.gpsCalibration.referenceLat,
      this.gpsCalibration.referenceLon
    );

    const isInsideCampus = distFromCenter <= 750; // Within 750m of engineering block

    if (isInsideCampus) {
      this.state.gpsStatus = 'active';
      this.state.speedMps = speed || 0;
      this.setPosition(campusPoint.x, campusPoint.y, heading, Math.round(accuracy) || 5, 'gps');
      this.emit('gpsStatusChange', {
        status: 'active',
        coords: { latitude, longitude },
        accuracy: Math.round(accuracy),
        distFromCenter: Math.round(distFromCenter),
        insideCampus: true
      });
    } else {
      this.state.gpsStatus = 'out_of_bounds';
      this.emit('gpsStatusChange', {
        status: 'out_of_bounds',
        coords: { latitude, longitude },
        accuracy: Math.round(accuracy),
        distFromCenter: Math.round(distFromCenter),
        insideCampus: false,
        message: `GPS detected outside Ettimadai campus (${(distFromCenter / 1000).toFixed(1)} km away). Defaulted to Campus Reception.`
      });
    }
  }

  handleGpsError(err) {
    let msg = 'Failed to acquire GPS position.';
    if (err.code === 1) {
      msg = 'Location permission denied by user.';
      this.state.gpsStatus = 'denied';
    } else if (err.code === 2) {
      msg = 'Location unavailable or weak indoor GPS signal.';
      this.state.gpsStatus = 'standby';
    } else if (err.code === 3) {
      msg = 'GPS request timed out.';
      this.state.gpsStatus = 'standby';
    }

    this.emit('gpsStatusChange', { status: this.state.gpsStatus, message: msg });
  }

  gpsToCanvas(lat, lon) {
    const refLat = this.gpsCalibration.referenceLat;
    const refLon = this.gpsCalibration.referenceLon;
    const latScale = this.gpsCalibration.latPerPixel;
    const lonScale = this.gpsCalibration.lonPerPixel;
    const rotDeg = this.gpsCalibration.bearingDegrees;

    const dLat = lat - refLat;
    const dLon = lon - refLon;

    // Convert lat/lon diff to unrotated pixel offsets
    // Lat increases North (SVG Y decreases), Lon increases East (SVG X increases)
    const rawDx = dLon / lonScale;
    const rawDy = -dLat / latScale;

    // Apply rotation
    const rad = (-rotDeg * Math.PI) / 180;
    const cosR = Math.cos(rad);
    const sinR = Math.sin(rad);

    const rotX = rawDx * cosR - rawDy * sinR;
    const rotY = rawDx * sinR + rawDy * cosR;

    // Anchor point in SVG: West Admin Reception (380, 830)
    const anchorX = 380;
    const anchorY = 830;

    let targetX = anchorX + rotX;
    let targetY = anchorY + rotY;

    // Clamp within map bounds
    targetX = Math.max(20, Math.min(2080, targetX));
    targetY = Math.max(20, Math.min(1280, targetY));

    return { x: targetX, y: targetY };
  }

  haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // --- Walking Simulation Engine ---
  startSimulation(route, speedMultiplier = 1.0) {
    if (!route || !route.points || route.points.length < 2) return;

    this.stopGpsTracking();
    this.stopSimulation();

    this.state.mode = 'simulation';
    this.state.isNavigating = true;
    this.state.isPaused = false;
    this.state.speedMultiplier = speedMultiplier;
    this.state.activeRoute = route;
    this.state.currentStepIndex = 0;
    this.lastSpokenStep = -1;

    // Build segments with cumulative distances
    this.simPolyline = route.points;
    this.simSegments = [];
    let accum = 0;

    for (let i = 0; i < route.points.length - 1; i++) {
      const p1 = route.points[i];
      const p2 = route.points[i + 1];
      const dx = p2[0] - p1[0];
      const dy = p2[1] - p1[1];
      const len = Math.sqrt(dx * dx + dy * dy);
      const heading = (Math.atan2(dy, dx) * 180) / Math.PI + 90; // Compass heading
      this.simSegments.push({
        p1,
        p2,
        len,
        startDist: accum,
        endDist: accum + len,
        heading: (heading + 360) % 360
      });
      accum += len;
    }

    this.simTotalDist = accum;
    this.simTraveledDist = 0;
    this.state.remainingMeters = route.totalDistanceMeters;

    // Set initial position
    this.setPosition(this.simPolyline[0][0], this.simPolyline[0][1], this.simSegments[0].heading, 4, 'simulation');

    this.simStartTime = performance.now();
    this.lastFrameTime = performance.now();

    // Voice announcement for route start
    this.speak(`Starting navigation to ${route.dest.name}. Follow the highlighted corridor.`);

    this.emit('navigationStart', { route });
    this.runSimulationLoop();
  }

  runSimulationLoop() {
    const loop = (timestamp) => {
      if (!this.state.isNavigating || this.state.mode !== 'simulation') return;

      if (!this.state.isPaused) {
        const deltaSec = (timestamp - this.lastFrameTime) / 1000;
        this.lastFrameTime = timestamp;

        // Walking speed: 1.3 meters/sec -> converted to px/sec
        const walkingSpeedPx = (1.3 / (this.router.scale || 0.15)) * this.state.speedMultiplier;
        this.simTraveledDist += walkingSpeedPx * deltaSec;

        if (this.simTraveledDist >= this.simTotalDist) {
          // Completed route!
          this.simTraveledDist = this.simTotalDist;
          const endPt = this.simPolyline[this.simPolyline.length - 1];
          this.setPosition(endPt[0], endPt[1], null, 3, 'simulation');
          this.handleSimulationComplete();
          return;
        }

        // Find current segment along path
        let currSeg = this.simSegments[this.simSegments.length - 1];
        for (const seg of this.simSegments) {
          if (this.simTraveledDist >= seg.startDist && this.simTraveledDist <= seg.endDist) {
            currSeg = seg;
            break;
          }
        }

        const segProgress = (this.simTraveledDist - currSeg.startDist) / (currSeg.len || 1);
        const curX = currSeg.p1[0] + (currSeg.p2[0] - currSeg.p1[0]) * segProgress;
        const curY = currSeg.p1[1] + (currSeg.p2[1] - currSeg.p1[1]) * segProgress;

        this.setPosition(curX, curY, currSeg.heading, 4, 'simulation');

        // Update remaining metrics
        const remPx = this.simTotalDist - this.simTraveledDist;
        this.state.remainingMeters = Math.max(0, Math.round(remPx * (this.router.scale || 0.15)));

        // Update active turn-by-turn guidance
        this.updateGuidanceStep(curX, curY);

        this.emit('navigationProgress', {
          progress: this.simTraveledDist / this.simTotalDist,
          remainingMeters: this.state.remainingMeters,
          currentStepIndex: this.state.currentStepIndex
        });
      } else {
        this.lastFrameTime = timestamp;
      }

      this.animFrameId = requestAnimationFrame(loop);
    };

    this.animFrameId = requestAnimationFrame(loop);
  }

  updateGuidanceStep(curX, curY) {
    if (!this.state.activeRoute || !this.state.activeRoute.instructions) return;

    const instructions = this.state.activeRoute.instructions;
    let closestStepIdx = this.state.currentStepIndex;

    // Find the next upcoming instruction whose waypoint is ahead of current location
    for (let i = this.state.currentStepIndex; i < instructions.length; i++) {
      const step = instructions[i];
      if (step.coord) {
        const d = Math.hypot(curX - step.coord[0], curY - step.coord[1]) * this.router.scale;
        if (d < 12 && i > this.state.currentStepIndex) {
          closestStepIdx = i;
          break;
        }
      }
    }

    if (closestStepIdx !== this.state.currentStepIndex) {
      this.state.currentStepIndex = closestStepIdx;
      const step = instructions[closestStepIdx];
      this.emit('stepChange', { step, stepIndex: closestStepIdx });

      if (this.lastSpokenStep !== closestStepIdx) {
        this.lastSpokenStep = closestStepIdx;
        this.speak(`${step.text}. ${step.subtext || ''}`);
      }
    }
  }

  handleSimulationComplete() {
    this.state.isNavigating = false;
    cancelAnimationFrame(this.animFrameId);
    const destName = this.state.activeRoute?.dest?.name || 'your destination';
    this.speak(`You have arrived at ${destName}. Navigation complete.`);
    this.emit('navigationComplete', { dest: this.state.activeRoute?.dest });
  }

  pauseSimulation() {
    this.state.isPaused = true;
    this.emit('simulationPaused', true);
  }

  resumeSimulation() {
    this.state.isPaused = false;
    this.lastFrameTime = performance.now();
    this.emit('simulationPaused', false);
  }

  togglePause() {
    if (this.state.isPaused) {
      this.resumeSimulation();
    } else {
      this.pauseSimulation();
    }
  }

  setSpeed(multiplier) {
    this.state.speedMultiplier = multiplier;
    this.emit('speedChange', multiplier);
  }

  stopSimulation() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.state.isNavigating = false;
    this.state.isPaused = false;
    this.state.activeRoute = null;
    this.emit('navigationStopped');
  }

  // --- Dynamic Rerouting Engine ---
  checkOffRoute() {
    if (!this.state.activeRoute || !this.state.activeRoute.points) return;

    const cur = [this.state.x, this.state.y];
    let minD = Infinity;
    const pts = this.state.activeRoute.points;

    for (let i = 0; i < pts.length - 1; i++) {
      const res = this.router.pointToSegmentDist(cur, pts[i], pts[i + 1]);
      if (res.dist < minD) {
        minD = res.dist;
      }
    }

    const distM = minD * (this.router.scale || 0.15);
    // If deviating more than 20 meters from planned path
    if (distM > 20) {
      this.triggerReroute();
    }
  }

  triggerReroute() {
    if (!this.state.activeRoute || !this.state.activeRoute.dest) return;
    const dest = this.state.activeRoute.dest;

    console.log('Off route detected (> 20m). Recalculating route...');
    const newRoute = this.router.findRoute({ x: this.state.x, y: this.state.y, name: 'Current Location' }, dest);

    if (newRoute.success) {
      this.state.activeRoute = newRoute;
      this.state.currentStepIndex = 0;
      this.lastSpokenStep = -1;
      this.speak('Off route. Rerouting to destination.');
      this.emit('reroute', { newRoute });
    }
  }

  // --- Text-to-Speech Audio Guidance ---
  speak(text) {
    if (!this.state.voiceEnabled || !this.speechSynth) return;
    try {
      this.speechSynth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      utterance.lang = 'en-IN'; // Indian English accent / default English
      this.speechSynth.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
    }
  }

  toggleVoice() {
    this.state.voiceEnabled = !this.state.voiceEnabled;
    if (!this.state.voiceEnabled && this.speechSynth) {
      this.speechSynth.cancel();
    }
    this.emit('voiceToggle', this.state.voiceEnabled);
    return this.state.voiceEnabled;
  }
}

window.AmritaLiveTracker = AmritaLiveTracker;
