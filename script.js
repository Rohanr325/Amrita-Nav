document.addEventListener('DOMContentLoaded', () => {
  // --- Room Selection Logic ---
  const rooms = document.querySelectorAll('.selectable-room');
  let selectedRoom = null;

  function selectRoom(room) {
    if (selectedRoom === room) {
      room.classList.remove('selected');
      room.setAttribute('aria-pressed', 'false');
      selectedRoom = null;
    } else {
      if (selectedRoom) {
        selectedRoom.classList.remove('selected');
        selectedRoom.setAttribute('aria-pressed', 'false');
      }
      room.classList.add('selected');
      room.setAttribute('aria-pressed', 'true');
      selectedRoom = room;
    }
  }

  rooms.forEach(room => {
    room.addEventListener('click', (e) => {
      e.stopPropagation();
      selectRoom(room);
    });

    room.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectRoom(room);
      }
    });
  });

  document.addEventListener('click', () => {
    if (selectedRoom) {
      selectedRoom.classList.remove('selected');
      selectedRoom.setAttribute('aria-pressed', 'false');
      selectedRoom = null;
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && selectedRoom) {
      selectedRoom.classList.remove('selected');
      selectedRoom.setAttribute('aria-pressed', 'false');
      selectedRoom = null;
    }
  });

  // ==========================================
  // --- GPS Live Location & Tracking Engine ---
  // ==========================================
  // GeoTIFF Affine Transform (from gdalinfo gf.tiff)
  // Origin (Upper Left): lon 76.4906642, lat 9.0946142
  // Pixel Size: 0.00000103926192 deg/px (both axes, no rotation)
  // Image Size: 2112 x 1300 (matches SVG viewBox)
  const GPS_CALIBRATION = {
    originLat: 9.0946142,                // Upper-left corner latitude
    originLon: 76.4906642,               // Upper-left corner longitude
    latPerPixel: 0.00000103926192,       // degrees latitude per pixel
    lonPerPixel: 0.00000103926192,       // degrees longitude per pixel
    mapWidth: 2112,
    mapHeight: 1300,
    // Center of map in GPS coords (for campus boundary check)
    centerLat: 9.0939387,               // (Upper Left + Lower Right) / 2
    centerLon: 76.4917617,
    campusRadiusMeters: 750,
    // Default marker position (Admin Reception Entrance in SVG pixels)
    defaultX: 380,
    defaultY: 830
  };

  // UI Element References
  const gpsDock = document.getElementById('gps-dock');
  const gpsToggleBtn = document.getElementById('gps-toggle-btn');
  const gpsBtnText = document.getElementById('gps-btn-text');
  const gpsStatusDot = document.getElementById('gps-status-dot');
  const gpsStatusCard = document.getElementById('gps-status-card');
  const gpsStatusText = document.getElementById('gps-status-text');
  const gpsCloseStatus = document.getElementById('gps-close-status');
  const gpsStatusMeta = document.getElementById('gps-status-meta');
  const gpsCoordsText = document.getElementById('gps-coords-text');
  const gpsAccuracyText = document.getElementById('gps-accuracy-text');
  const gpsSimBtn = document.getElementById('gps-sim-btn');
  const gpsSimBtnText = document.getElementById('gps-sim-btn-text');

  // SVG Marker References
  const gpsMarker = document.getElementById('gps-marker');
  const gpsAccuracyRing = document.getElementById('gps-accuracy-ring');
  const gpsHeadingCone = document.getElementById('gps-heading-cone');
  const mapContainer = document.querySelector('.map-container');
  const selectionOverlay = document.querySelector('.selection-overlay');

  let isGpsActive = false;
  let watchId = null;
  let isSimulating = false;
  let simAnimId = null;
  let currentHeading = null;
  let currentPos = { x: GPS_CALIBRATION.defaultX, y: GPS_CALIBRATION.defaultY };

  // Prevent dock clicks from bubbling to map/rooms
  if (gpsDock) {
    gpsDock.addEventListener('click', (e) => e.stopPropagation());
  }

  // --- Coordinate Transformation (Direct GeoTIFF Affine) ---
  // No rotation needed — the GeoTIFF is axis-aligned to WGS 84.
  // px = (lon - originLon) / lonPerPixel
  // py = (originLat - lat) / latPerPixel   (Y-axis is flipped)
  function gpsToCanvas(lat, lon) {
    let x = (lon - GPS_CALIBRATION.originLon) / GPS_CALIBRATION.lonPerPixel;
    let y = (GPS_CALIBRATION.originLat - lat) / GPS_CALIBRATION.latPerPixel;

    // Clamp inside map canvas bounds
    x = Math.max(0, Math.min(GPS_CALIBRATION.mapWidth, x));
    y = Math.max(0, Math.min(GPS_CALIBRATION.mapHeight, y));

    return { x, y };
  }

  function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad;
    const dLon = (lon2 - lon1) * toRad;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Update SVG Marker Position & Visuals
  function updateMarker(x, y, accuracyMeters = 5, headingDeg = null) {
    if (!gpsMarker) return;
    currentPos = { x, y };

    gpsMarker.style.display = 'block';
    gpsMarker.setAttribute('transform', `translate(${x.toFixed(1)}, ${y.toFixed(1)})`);

    if (gpsAccuracyRing) {
      // Scale accuracy in meters to SVG pixel radius (approx 6.67 px/m, clamp 20..95px)
      const r = Math.max(20, Math.min(95, accuracyMeters * 6.67));
      gpsAccuracyRing.setAttribute('r', r.toFixed(1));
    }

    if (headingDeg !== null && gpsHeadingCone) {
      gpsHeadingCone.style.display = 'block';
      gpsHeadingCone.setAttribute('transform', `rotate(${Math.round(headingDeg)})`);
    }
  }

  function hideMarker() {
    if (gpsMarker) {
      gpsMarker.style.display = 'none';
    }
    if (gpsHeadingCone) {
      gpsHeadingCone.style.display = 'none';
    }
  }

  // Device Compass Heading Listener
  if (window.DeviceOrientationEvent) {
    window.addEventListener('deviceorientation', (e) => {
      if (!isGpsActive || isSimulating) return;
      let heading = null;
      if (typeof e.webkitCompassHeading === 'number') {
        heading = e.webkitCompassHeading;
      } else if (e.alpha !== null) {
        heading = (360 - e.alpha) % 360;
      }
      if (heading !== null) {
        currentHeading = heading;
        if (gpsHeadingCone) {
          gpsHeadingCone.style.display = 'block';
          gpsHeadingCone.setAttribute('transform', `rotate(${Math.round(heading)})`);
        }
      }
    }, { passive: true });
  }

  // --- Real Device GPS Geolocation ---
  function startGpsTracking() {
    if (!navigator.geolocation) {
      setGpsStatus('unsupported');
      return;
    }

    isGpsActive = true;
    gpsToggleBtn.classList.add('active', 'locating');
    gpsBtnText.textContent = 'Locating...';
    setGpsStatus('locating');

    const options = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 2000
    };

    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
    }

    watchId = navigator.geolocation.watchPosition(
      handleGpsSuccess,
      handleGpsError,
      options
    );
  }

  function stopGpsTracking() {
    isGpsActive = false;
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    stopSimulation();
    hideMarker();

    gpsToggleBtn.classList.remove('active', 'locating');
    gpsBtnText.textContent = 'Locate Me';
    gpsStatusDot.className = 'gps-status-dot';
    gpsStatusCard.style.display = 'none';
  }

  function handleGpsSuccess(pos) {
    if (!isGpsActive || isSimulating) return;

    gpsToggleBtn.classList.remove('locating');
    gpsBtnText.textContent = 'GPS Active';

    const { latitude, longitude, accuracy, heading } = pos.coords;
    const dist = haversineDistance(
      latitude,
      longitude,
      GPS_CALIBRATION.centerLat,
      GPS_CALIBRATION.centerLon
    );

    const insideCampus = dist <= GPS_CALIBRATION.campusRadiusMeters;

    if (heading !== null && !isNaN(heading)) {
      currentHeading = heading;
    }

    if (insideCampus) {
      const pt = gpsToCanvas(latitude, longitude);
      updateMarker(pt.x, pt.y, accuracy || 5, currentHeading);

      setGpsStatus('active', {
        title: `Locked inside Campus (±${Math.round(accuracy || 5)}m)`,
        coords: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
        accuracy: `±${Math.round(accuracy || 5)}m accuracy`
      });
    } else {
      // Outside Amrita Campus (e.g. testing remotely)
      // Anchor to main entrance with clear notification
      updateMarker(GPS_CALIBRATION.defaultX, GPS_CALIBRATION.defaultY, 15, currentHeading);

      const distKm = (dist / 1000).toFixed(1);
      setGpsStatus('warning', {
        title: `Outside Campus (${distKm} km away)`,
        coords: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
        accuracy: 'Showing Main Reception Entrance'
      });
    }
  }

  function handleGpsError(err) {
    if (!isGpsActive || isSimulating) return;

    gpsToggleBtn.classList.remove('locating');
    let message = 'Unable to acquire GPS fix.';

    if (err.code === 1) {
      message = 'Location access denied. Please allow permissions in browser.';
      gpsBtnText.textContent = 'GPS Denied';
      setGpsStatus('error', { title: message });
    } else if (err.code === 2) {
      message = 'Position unavailable. Check device GPS signal.';
      setGpsStatus('warning', { title: message });
    } else if (err.code === 3) {
      message = 'Location request timed out. Retrying...';
      setGpsStatus('locating', { title: message });
    } else {
      setGpsStatus('error', { title: message });
    }
  }

  function setGpsStatus(state, data = {}) {
    gpsStatusCard.style.display = 'flex';
    gpsStatusDot.className = `gps-status-dot ${state}`;

    if (state === 'locating') {
      gpsStatusText.textContent = data.title || 'Acquiring high-accuracy GPS fix...';
      gpsStatusMeta.style.display = 'none';
    } else if (state === 'active') {
      gpsStatusText.textContent = data.title || 'GPS Active';
      if (data.coords) {
        gpsStatusMeta.style.display = 'flex';
        gpsCoordsText.textContent = `Lat/Lon: ${data.coords}`;
        gpsAccuracyText.textContent = data.accuracy || '';
      }
    } else if (state === 'warning') {
      gpsStatusText.textContent = data.title || 'Notice: Outside campus boundary';
      if (data.coords) {
        gpsStatusMeta.style.display = 'flex';
        gpsCoordsText.textContent = `Real Coords: ${data.coords}`;
        gpsAccuracyText.textContent = data.accuracy || '';
      }
    } else if (state === 'error' || state === 'unsupported') {
      gpsStatusText.textContent = data.title || 'Geolocation is not supported by your browser.';
      gpsStatusMeta.style.display = 'none';
    } else if (state === 'simulating') {
      gpsStatusText.textContent = data.title || 'Campus Walk Simulation';
      if (data.coords) {
        gpsStatusMeta.style.display = 'flex';
        gpsCoordsText.textContent = data.coords;
        gpsAccuracyText.textContent = data.accuracy || '';
      }
    }
  }

  // --- Smooth Campus Walk Simulation ---
  // Realistic corridor route around ground floor pathways
  const SIM_WAYPOINTS = [
    { x: 380, y: 830, name: 'Admin Block A / Reception' },
    { x: 495, y: 735, name: 'West Concourse' },
    { x: 720, y: 710, name: 'West Courtyard Pathway' },
    { x: 938, y: 684, name: 'Central Concourse Junction' },
    { x: 958, y: 855, name: 'Central Courtyard Spine' },
    { x: 980, y: 1048, name: 'Manufacturing Lab Corridor' },
    { x: 808, y: 1082, name: 'Stationery & Courier Concourse' },
    { x: 606, y: 1100, name: 'Acharya Hall Lobby' },
    { x: 514, y: 906, name: 'West Hall Corridor' },
    { x: 380, y: 830, name: 'Admin Block A / Reception' }
  ];

  // Precompute segment lengths and headings
  const simSegments = [];
  let simTotalLength = 0;
  for (let i = 0; i < SIM_WAYPOINTS.length - 1; i++) {
    const p1 = SIM_WAYPOINTS[i];
    const p2 = SIM_WAYPOINTS[i + 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    // Heading in standard compass degrees (0 = North/-Y, 90 = East/+X)
    const heading = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
    simSegments.push({
      p1,
      p2,
      len,
      heading,
      startDist: simTotalLength,
      endDist: simTotalLength + len
    });
    simTotalLength += len;
  }

  let simStartTime = null;
  const SIM_SPEED_PX_PER_SEC = 65; // ~1.4 m/s walking speed

  function startSimulation() {
    isSimulating = true;
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
    }

    isGpsActive = true;
    gpsToggleBtn.classList.add('active');
    gpsToggleBtn.classList.remove('locating');
    gpsBtnText.textContent = 'Simulating';
    gpsSimBtn.classList.add('active');
    gpsSimBtnText.textContent = 'Pause Walk';

    simStartTime = performance.now();

    function step(timestamp) {
      if (!isSimulating) return;

      const elapsedSec = (timestamp - simStartTime) / 1000;
      const traveled = (elapsedSec * SIM_SPEED_PX_PER_SEC) % simTotalLength;

      // Find current segment
      let curSeg = simSegments[0];
      for (const seg of simSegments) {
        if (traveled >= seg.startDist && traveled <= seg.endDist) {
          curSeg = seg;
          break;
        }
      }

      const segProgress = (traveled - curSeg.startDist) / (curSeg.len || 1);
      const currX = curSeg.p1.x + (curSeg.p2.x - curSeg.p1.x) * segProgress;
      const currY = curSeg.p1.y + (curSeg.p2.y - curSeg.p1.y) * segProgress;

      // Simulated accuracy subtle breathing (±3m to ±5m)
      const simAccuracy = 3.5 + Math.sin(elapsedSec * 0.8) * 1.5;

      updateMarker(currX, currY, simAccuracy, curSeg.heading);

      setGpsStatus('simulating', {
        title: `Walking: Near ${curSeg.p2.name}`,
        coords: `Heading: ${Math.round(curSeg.heading)}° • Speed: 1.4 m/s`,
        accuracy: `Simulated Accuracy: ±${simAccuracy.toFixed(1)}m`
      });

      simAnimId = requestAnimationFrame(step);
    }

    simAnimId = requestAnimationFrame(step);
  }

  function stopSimulation() {
    isSimulating = false;
    if (simAnimId !== null) {
      cancelAnimationFrame(simAnimId);
      simAnimId = null;
    }
    gpsSimBtn.classList.remove('active');
    gpsSimBtnText.textContent = 'Simulate Walk';
  }

  // --- Button & Interaction Listeners ---
  gpsToggleBtn.addEventListener('click', () => {
    if (isGpsActive) {
      stopGpsTracking();
    } else {
      startGpsTracking();
    }
  });

  gpsSimBtn.addEventListener('click', () => {
    if (isSimulating) {
      stopSimulation();
      if (isGpsActive) {
        gpsBtnText.textContent = 'GPS Active';
        gpsStatusDot.className = 'gps-status-dot active';
        gpsStatusText.textContent = 'Simulation paused';
      }
    } else {
      startSimulation();
    }
  });

  if (gpsCloseStatus) {
    gpsCloseStatus.addEventListener('click', () => {
      gpsStatusCard.style.display = 'none';
    });
  }

  // Allow double-clicking on the map when GPS is active to manually test repositioning
  if (selectionOverlay) {
    selectionOverlay.addEventListener('dblclick', (e) => {
      if (!isGpsActive) return;
      const rect = selectionOverlay.getBoundingClientRect();
      const clickX = ((e.clientX - rect.left) / rect.width) * 2112;
      const clickY = ((e.clientY - rect.top) / rect.height) * 1300;

      if (isSimulating) {
        stopSimulation();
      }

      updateMarker(clickX, clickY, 4, currentHeading);
      setGpsStatus('active', {
        title: 'Manual Pin Placement',
        coords: `Floorplan: (${Math.round(clickX)}, ${Math.round(clickY)})`,
        accuracy: 'Custom indoor test location'
      });
    });
  }
});