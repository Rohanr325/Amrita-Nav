/**
 * AmritaNav - Master Application Controller
 * Handles Map Pan/Zoom, UI Interactions, Routing Visualization, and Live Tracking
 */

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Core Systems
  const data = window.AMRITA_DATA;
  if (!data) {
    console.error('Campus data AMRITA_DATA not loaded!');
    return;
  }

  const router = new AmritaRouter(data);
  const tracker = new AmritaLiveTracker(router, data);

  // Cache DOM Elements
  const mapViewport = document.getElementById('map-viewport');
  const mapSvgContainer = document.getElementById('map-svg-container');
  const svgElem = document.getElementById('campus-svg');
  
  // Layer Groups inside SVG
  const routeLayer = document.getElementById('layer-active-route');
  const waypointsLayer = document.getElementById('layer-route-waypoints');
  const pinsLayer = document.getElementById('layer-pins');
  const liveLocationLayer = document.getElementById('layer-live-location');
  const pathwaysGroup = document.getElementById('pathways');
  const labelsGroup = document.getElementById('labels');

  // UI Panels
  const startSelect = document.getElementById('start-select');
  const destSelect = document.getElementById('dest-select');
  const swapBtn = document.getElementById('swap-route-btn');
  const findRouteBtn = document.getElementById('find-route-btn');
  const simulateBtn = document.getElementById('simulate-route-btn');
  const clearRouteBtn = document.getElementById('clear-route-btn');
  const routeSummaryCard = document.getElementById('route-summary-card');
  const turnStepsList = document.getElementById('turn-steps-list');
  const roomDirectoryList = document.getElementById('room-directory-list');
  const searchInput = document.getElementById('search-input');
  const clearSearchBtn = document.getElementById('clear-search-btn');
  const categoryPills = document.querySelectorAll('.cat-pill');
  const livePill = document.getElementById('live-pill');
  const livePillText = document.getElementById('live-pill-text');

  // HUD Elements
  const navHud = document.getElementById('live-nav-hud');
  const hudTurnIcon = document.getElementById('hud-turn-icon');
  const hudTurnText = document.getElementById('hud-turn-text');
  const hudTurnSub = document.getElementById('hud-turn-sub');
  const hudMetricRem = document.getElementById('hud-metric-rem');
  const hudMetricEta = document.getElementById('hud-metric-eta');
  const hudProgressBar = document.getElementById('hud-progress-fill');
  const hudPauseBtn = document.getElementById('hud-pause-btn');
  const hudSpeedBtn = document.getElementById('hud-speed-btn');
  const hudStopBtn = document.getElementById('hud-stop-btn');

  // Floating Details Card & Tooltip
  const roomDetailsCard = document.getElementById('room-details-card');
  const cardRoomName = document.getElementById('card-room-name');
  const cardRoomCode = document.getElementById('card-room-code');
  const cardRoomCat = document.getElementById('card-room-cat');
  const cardRoomDesc = document.getElementById('card-room-desc');
  const cardNavigateBtn = document.getElementById('card-navigate-btn');
  const cardStartBtn = document.getElementById('card-start-btn');
  const cardSetLocBtn = document.getElementById('card-set-loc-btn');
  const closeCardBtn = document.getElementById('close-card-btn');
  const hoverTooltip = document.getElementById('hover-tooltip');

  // Modals & Action Buttons
  const gpsModal = document.getElementById('gps-modal');
  const closeGpsModal = document.getElementById('close-gps-modal');
  const floorModal = document.getElementById('floor-modal');
  const closeFloorModal = document.getElementById('close-floor-modal');
  const openFloorBtn = document.getElementById('open-floor-btn');
  const voiceToggleBtn = document.getElementById('voice-toggle-btn');
  const followToggleBtn = document.getElementById('follow-toggle-btn');

  // Map Controls
  const zoomInBtn = document.getElementById('zoom-in-btn');
  const zoomOutBtn = document.getElementById('zoom-out-btn');
  const fitScreenBtn = document.getElementById('fit-screen-btn');
  const recenterUserBtn = document.getElementById('recenter-user-btn');
  const toggleCorridorsBtn = document.getElementById('toggle-corridors-btn');
  const toggleLabelsBtn = document.getElementById('toggle-labels-btn');

  // State
  let selectedRoomId = null;
  let activeRouteData = null;
  let currentCategory = 'all';

  // --- Pan & Zoom Matrix Engine ---
  const viewState = {
    scale: 0.75,
    translateX: 0,
    translateY: 0,
    isDragging: false,
    startX: 0,
    startY: 0,
    startTx: 0,
    startTy: 0,
    minScale: 0.15,
    maxScale: 4.5,
    lastPinchDist: 0
  };

  function updateTransform() {
    mapSvgContainer.style.transform = `matrix(${viewState.scale}, 0, 0, ${viewState.scale}, ${viewState.translateX}, ${viewState.translateY})`;
  }

  function fitToScreen(animate = true) {
    const rect = mapViewport.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    // Floor plan active bounding box:
    // Leftmost West Entrance (x: 37), Rightmost Wing (x: 1974)
    // Topmost Labs & Amenities (y: 80), Bottommost Wing (y: 1213)
    const contentBounds = {
      minX: 35,
      maxX: 1980,
      minY: 75,
      maxY: 1220
    };
    const contentW = contentBounds.maxX - contentBounds.minX; // ~1945
    const contentH = contentBounds.maxY - contentBounds.minY; // ~1145
    const midX = (contentBounds.minX + contentBounds.maxX) / 2; // ~1007.5
    const midY = (contentBounds.minY + contentBounds.maxY) / 2; // ~647.5

    const isMobile = window.innerWidth <= 768;
    const padX = isMobile ? 16 : 40;
    const padY = isMobile ? 24 : 40;

    const availableW = Math.max(100, rect.width - padX * 2);
    const availableH = Math.max(100, rect.height - padY * 2);

    const scaleX = availableW / contentW;
    const scaleY = availableH / contentH;
    const targetScale = Math.min(scaleX, scaleY);

    // Keep minScale flexible so user can zoom out smoothly even on small displays
    viewState.minScale = Math.min(0.15, targetScale * 0.75);

    const targetTx = rect.width / 2 - midX * targetScale;
    const targetTy = rect.height / 2 - midY * targetScale;

    if (animate) {
      animateTransform(targetTx, targetTy, targetScale, 400);
    } else {
      viewState.scale = targetScale;
      viewState.translateX = targetTx;
      viewState.translateY = targetTy;
      updateTransform();
    }
  }

  function panTo(x, y, targetZoom = null, duration = 400) {
    const rect = mapViewport.getBoundingClientRect();
    const zoom = targetZoom !== null ? targetZoom : viewState.scale;
    const targetTx = rect.width / 2 - x * zoom;
    const targetTy = rect.height / 2 - y * zoom;
    animateTransform(targetTx, targetTy, zoom, duration);
  }

  function animateTransform(targetTx, targetTy, targetScale, duration = 300) {
    const startTx = viewState.translateX;
    const startTy = viewState.translateY;
    const startScale = viewState.scale;
    const startTime = performance.now();

    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Ease out cubic
      const ease = 1 - Math.pow(1 - progress, 3);

      viewState.translateX = startTx + (targetTx - startTx) * ease;
      viewState.translateY = startTy + (targetTy - startTy) * ease;
      viewState.scale = startScale + (targetScale - startScale) * ease;
      updateTransform();

      if (progress < 1) {
        requestAnimationFrame(step);
      }
    }
    requestAnimationFrame(step);
  }

  function zoomAt(factor, clientX, clientY) {
    const rect = mapViewport.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;

    const newScale = Math.max(viewState.minScale, Math.min(viewState.maxScale, viewState.scale * factor));
    if (newScale === viewState.scale) return;

    viewState.translateX = mouseX - (mouseX - viewState.translateX) * (newScale / viewState.scale);
    viewState.translateY = mouseY - (mouseY - viewState.translateY) * (newScale / viewState.scale);
    viewState.scale = newScale;
    updateTransform();
  }

  // Mouse & Touch Pan-Zoom Event Handlers
  mapViewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    // Continuous exponential scaling for Mac trackpads and mouse wheels
    const zoomFactor = Math.exp(-e.deltaY * 0.002);
    const clampedFactor = Math.max(0.75, Math.min(1.35, zoomFactor));
    zoomAt(clampedFactor, e.clientX, e.clientY);
  }, { passive: false });

  mapViewport.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.map-controls-dock') || e.target.closest('.live-nav-hud-banner')) return;
    viewState.isDragging = true;
    viewState.startX = e.clientX;
    viewState.startY = e.clientY;
    viewState.startTx = viewState.translateX;
    viewState.startTy = viewState.translateY;
    mapViewport.setPointerCapture(e.pointerId);
  });

  mapViewport.addEventListener('pointermove', (e) => {
    if (viewState.isDragging) {
      const dx = e.clientX - viewState.startX;
      const dy = e.clientY - viewState.startY;
      viewState.translateX = viewState.startTx + dx;
      viewState.translateY = viewState.startTy + dy;
      updateTransform();
    }
  });

  function stopDrag(e) {
    if (viewState.isDragging) {
      viewState.isDragging = false;
      try {
        mapViewport.releasePointerCapture(e.pointerId);
      } catch (err) {}
    }
  }
  mapViewport.addEventListener('pointerup', stopDrag);
  mapViewport.addEventListener('pointercancel', stopDrag);

  // Touch Pinch-to-Zoom
  mapViewport.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      viewState.isDragging = false;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      viewState.lastPinchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    }
  }, { passive: true });

  mapViewport.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      if (viewState.lastPinchDist > 0) {
        const factor = dist / viewState.lastPinchDist;
        const midX = (t1.clientX + t2.clientX) / 2;
        const midY = (t1.clientY + t2.clientY) / 2;
        zoomAt(factor, midX, midY);
      }
      viewState.lastPinchDist = dist;
    }
  }, { passive: true });

  mapViewport.addEventListener('touchend', () => {
    viewState.lastPinchDist = 0;
  });

  // --- Populate Dropdowns & Directory ---
  function populateSelects() {
    startSelect.innerHTML = '';
    destSelect.innerHTML = '';

    // Start options
    const liveOpt = document.createElement('option');
    liveOpt.value = 'live_location';
    liveOpt.textContent = '📍 My Live Location';
    startSelect.appendChild(liveOpt);

    // Group rooms by category
    const categories = ['All', 'Labs & Research', 'Halls & Seminar', 'Administration', 'Amenities', 'Academic Departments', 'Stairs', 'Courtyards'];
    const groupsStart = {};
    const groupsDest = {};

    categories.forEach(cat => {
      groupsStart[cat] = document.createElement('optgroup');
      groupsStart[cat].label = cat;
      groupsDest[cat] = document.createElement('optgroup');
      groupsDest[cat].label = cat;
    });

    // Special POIs
    data.specialPOIs.forEach(poi => {
      const opt1 = new Option(poi.name, poi.id);
      const opt2 = new Option(poi.name, poi.id);
      startSelect.appendChild(opt1);
      destSelect.appendChild(opt2);
    });

    data.rooms.forEach(r => {
      const cat = groupsStart[r.category] ? r.category : 'All';
      const label = `${r.name} (${r.code})`;
      groupsStart[cat].appendChild(new Option(label, r.id));
      groupsDest[cat].appendChild(new Option(label, r.id));
    });

    Object.values(groupsStart).forEach(g => { if (g.children.length > 0) startSelect.appendChild(g); });
    Object.values(groupsDest).forEach(g => { if (g.children.length > 0) destSelect.appendChild(g); });

    // Defaults
    startSelect.value = 'live_location';
    destSelect.value = 'room_acharya_hall'; // Default popular destination
  }

  function renderRoomDirectory(rooms) {
    roomDirectoryList.innerHTML = '';
    if (rooms.length === 0) {
      roomDirectoryList.innerHTML = `<div style="text-align:center; padding:20px; color:#94a3b8;">No locations found matching your search.</div>`;
      return;
    }

    rooms.forEach(r => {
      const item = document.createElement('div');
      item.className = 'room-item-card';
      if (r.id === selectedRoomId) item.classList.add('highlighted');

      item.innerHTML = `
        <div class="room-info-left">
          <div class="room-title">${r.name}</div>
          <div class="room-meta">
            <span class="room-code-tag">${r.code}</span>
            <span class="room-category-tag">${r.category}</span>
          </div>
        </div>
        <button class="room-card-action" data-room-id="${r.id}">Directions</button>
      `;

      item.addEventListener('click', (e) => {
        if (!e.target.classList.contains('room-card-action')) {
          selectRoom(r.id, true);
        }
      });

      const dirBtn = item.querySelector('.room-card-action');
      dirBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setDestinationAndRoute(r.id);
      });

      roomDirectoryList.appendChild(item);
    });
  }

  // --- Room Selection & Details Card ---
  function selectRoom(roomId, panCamera = false) {
    const room = data.rooms.find(r => r.id === roomId);
    if (!room) return;

    selectedRoomId = roomId;

    // Highlight room in SVG
    document.querySelectorAll('.room-wall').forEach(el => el.classList.remove('selected'));
    const svgRoom = document.getElementById(roomId);
    if (svgRoom) {
      svgRoom.classList.add('selected');
    }

    // Populate and show card
    cardRoomName.textContent = room.name;
    cardRoomCode.textContent = room.code;
    cardRoomCat.textContent = room.category;
    cardRoomDesc.textContent = room.description;

    roomDetailsCard.style.display = 'flex';

    if (panCamera) {
      panTo(room.cx, room.cy, Math.max(viewState.scale, 1.15));
    }
  }

  function hideRoomDetails() {
    roomDetailsCard.style.display = 'none';
    selectedRoomId = null;
    document.querySelectorAll('.room-wall').forEach(el => el.classList.remove('selected'));
  }

  function setDestinationAndRoute(roomId) {
    destSelect.value = roomId;
    calculateAndShowRoute();
    selectTab('directions');
  }

  // --- SVG Interactive Layer Listeners ---
  function initSvgInteractions() {
    data.rooms.forEach(room => {
      const el = document.getElementById(room.id);
      if (!el) return;

      el.addEventListener('pointerenter', (e) => {
        hoverTooltip.style.display = 'block';
        hoverTooltip.innerHTML = `${room.name} <span class="tip-code">${room.code}</span>`;
        updateTooltipPos(e);
      });

      el.addEventListener('pointermove', updateTooltipPos);

      el.addEventListener('pointerleave', () => {
        hoverTooltip.style.display = 'none';
      });

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        selectRoom(room.id, true);
      });
    });

    // Map Click to dismiss or set manual location
    svgElem.addEventListener('click', (e) => {
      if (e.target.classList.contains('room-wall')) return;
      hideRoomDetails();
    });

    // Double click / long press to set live location
    svgElem.addEventListener('dblclick', (e) => {
      const pt = getSvgCoordinates(e);
      tracker.setPosition(pt.x, pt.y, null, 4, 'manual');
      showToast(`📍 Live Location placed at (${Math.round(pt.x)}, ${Math.round(pt.y)})`);
    });
  }

  function updateTooltipPos(e) {
    const rect = mapViewport.getBoundingClientRect();
    hoverTooltip.style.left = `${e.clientX - rect.left}px`;
    hoverTooltip.style.top = `${e.clientY - rect.top}px`;
  }

  function getSvgCoordinates(e) {
    const pt = svgElem.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgPoint = pt.matrixTransform(svgElem.getScreenCTM().inverse());
    return { x: svgPoint.x, y: svgPoint.y };
  }

  // --- Live Location Rendering ---
  function renderLiveMarker(pos) {
    liveLocationLayer.innerHTML = '';

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.id = 'live-user-marker';
    g.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);

    // Accuracy Circle
    const accuracyRadius = Math.max(12, pos.accuracy / (data.campusInfo.scaleMetersPerPixel || 0.15));
    const accuracyCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    accuracyCircle.setAttribute('r', accuracyRadius);
    accuracyCircle.setAttribute('fill', 'rgba(37, 99, 235, 0.1)');
    accuracyCircle.setAttribute('stroke', 'rgba(37, 99, 235, 0.25)');
    accuracyCircle.setAttribute('stroke-width', '1');
    g.appendChild(accuracyCircle);

    // Pulse Halo
    const halo = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    halo.setAttribute('class', 'live-pulse-ring');
    g.appendChild(halo);

    // Heading cone / arrow
    if (pos.heading !== null && pos.heading !== undefined) {
      const headingG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      headingG.setAttribute('transform', `rotate(${pos.heading})`);

      const cone = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      cone.setAttribute('d', 'M 0 -22 L 8 -10 L -8 -10 Z');
      cone.setAttribute('class', 'live-beacon-heading-cone');
      headingG.appendChild(cone);
      g.appendChild(headingG);
    }

    // Core Blue Beacon
    const core = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    core.setAttribute('r', '8');
    core.setAttribute('class', 'live-beacon-core');
    g.appendChild(core);

    liveLocationLayer.appendChild(g);

    // Follow camera if enabled and actively navigating
    if (tracker.state.followCamera && tracker.state.isNavigating) {
      panTo(pos.x, pos.y, null, 100);
    }
  }

  // --- Route Calculation & Rendering ---
  function calculateAndShowRoute() {
    let startVal = startSelect.value;
    let originTarget;

    if (startVal === 'live_location') {
      originTarget = {
        x: tracker.state.x,
        y: tracker.state.y,
        name: 'My Live Location',
        code: 'LIVE'
      };
    } else {
      originTarget = startVal;
    }

    const destTarget = destSelect.value;

    const route = router.findRoute(originTarget, destTarget);
    if (!route.success) {
      showToast(`⚠️ ${route.error}`);
      return;
    }

    activeRouteData = route;
    renderRoute(route);
    renderTurnSteps(route);
    showRouteSummary(route);

    // Fit route in view
    zoomToRoute(route.points);
  }

  function renderRoute(route) {
    routeLayer.innerHTML = '';
    waypointsLayer.innerHTML = '';
    pinsLayer.innerHTML = '';

    if (!route || !route.points || route.points.length < 2) return;

    const pointsStr = route.points.map(p => `${p[0]},${p[1]}`).join(' ');

    // Glow line
    const glowLine = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    glowLine.setAttribute('points', pointsStr);
    glowLine.setAttribute('class', 'route-glow-polyline');
    routeLayer.appendChild(glowLine);

    // Core animated line
    const coreLine = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    coreLine.setAttribute('points', pointsStr);
    coreLine.setAttribute('class', 'route-core-polyline');
    routeLayer.appendChild(coreLine);

    // Start Pin (if not live location)
    if (startSelect.value !== 'live_location') {
      const startPin = createPin(route.points[0][0], route.points[0][1], '#10b981', 'A');
      pinsLayer.appendChild(startPin);
    }

    // Destination Pin
    const endPt = route.points[route.points.length - 1];
    const destPin = createPin(endPt[0], endPt[1], '#e11d48', 'B');
    pinsLayer.appendChild(destPin);

    // Turn waypoints dots
    for (let i = 1; i < route.points.length - 1; i++) {
      const pt = route.points[i];
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', pt[0]);
      dot.setAttribute('cy', pt[1]);
      dot.setAttribute('r', '4');
      dot.setAttribute('fill', '#ffffff');
      dot.setAttribute('stroke', '#e11d48');
      dot.setAttribute('stroke-width', '2');
      waypointsLayer.appendChild(dot);
    }
  }

  function createPin(x, y, color, label) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(${x}, ${y})`);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M 0 0 C -10 -14 -14 -22 -14 -30 A 14 14 0 0 1 14 -30 C 14 -22 10 -14 0 0 Z');
    path.setAttribute('fill', color);
    path.setAttribute('stroke', '#ffffff');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))');
    g.appendChild(path);

    const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    txt.setAttribute('x', '0');
    txt.setAttribute('y', '-26');
    txt.setAttribute('text-anchor', 'middle');
    txt.setAttribute('dominant-baseline', 'central');
    txt.setAttribute('fill', '#ffffff');
    txt.setAttribute('font-size', '10');
    txt.setAttribute('font-weight', '800');
    txt.textContent = label;
    g.appendChild(txt);

    return g;
  }

  function zoomToRoute(points) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of points) {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }

    const padding = 120;
    const w = maxX - minX + padding * 2;
    const h = maxY - minY + padding * 2;
    const rect = mapViewport.getBoundingClientRect();

    const scaleX = rect.width / w;
    const scaleY = rect.height / h;
    const targetScale = Math.max(viewState.minScale, Math.min(1.4, Math.min(scaleX, scaleY)));

    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    panTo(midX, midY, targetScale, 500);
  }

  function renderTurnSteps(route) {
    turnStepsList.innerHTML = '';
    route.instructions.forEach((step, idx) => {
      const card = document.createElement('div');
      card.className = 'step-card';
      if (idx === 0) card.classList.add('active-step');

      const iconSymbol = getStepIcon(step.icon);

      card.innerHTML = `
        <div class="step-icon-wrap">${iconSymbol}</div>
        <div class="step-details">
          <div class="step-main-text">${step.text}</div>
          <div class="step-sub-text">${step.subtext}</div>
          ${step.distanceM > 0 ? `<div class="step-distance">${step.distanceM} m</div>` : ''}
        </div>
      `;

      card.addEventListener('click', () => {
        if (step.coord) {
          panTo(step.coord[0], step.coord[1], Math.max(viewState.scale, 1.2));
        }
      });

      turnStepsList.appendChild(card);
    });
  }

  function getStepIcon(iconType) {
    switch (iconType) {
      case 'start': return '🚀';
      case 'destination': return '🏁';
      case 'turn-right': return '↱';
      case 'turn-left': return '↰';
      case 'slight-right': return '↗';
      case 'slight-left': return '↖';
      default: return '↑';
    }
  }

  function showRouteSummary(route) {
    routeSummaryCard.style.display = 'flex';
    document.getElementById('metric-dist').textContent = `${route.totalDistanceMeters} m`;
    document.getElementById('metric-time').textContent = route.estimatedTimeMinutes;
    document.getElementById('metric-steps').textContent = `${route.stepCount}`;
  }

  function clearActiveRoute() {
    activeRouteData = null;
    routeLayer.innerHTML = '';
    waypointsLayer.innerHTML = '';
    pinsLayer.innerHTML = '';
    turnStepsList.innerHTML = '';
    routeSummaryCard.style.display = 'none';
    navHud.style.display = 'none';
    tracker.stopSimulation();
  }

  // --- Live Walking Simulation & HUD ---
  function startSimulation() {
    if (!activeRouteData) {
      calculateAndShowRoute();
    }
    if (!activeRouteData) return;

    tracker.startSimulation(activeRouteData, 1.0);
    navHud.style.display = 'flex';
    hudPauseBtn.textContent = '⏸ Pause';
  }

  // Tracker Event Listeners
  tracker.on('positionChange', (pos) => {
    renderLiveMarker(pos);
  });

  tracker.on('stepChange', ({ step, stepIndex }) => {
    // Update Turn Step List selection
    const cards = turnStepsList.querySelectorAll('.step-card');
    cards.forEach((c, idx) => {
      c.classList.toggle('active-step', idx === stepIndex);
    });

    // Update HUD
    hudTurnIcon.textContent = getStepIcon(step.icon);
    hudTurnText.textContent = step.text;
    hudTurnSub.textContent = step.subtext;
  });

  tracker.on('navigationProgress', ({ progress, remainingMeters }) => {
    hudProgressBar.style.width = `${Math.min(100, Math.round(progress * 100))}%`;
    hudMetricRem.textContent = `${remainingMeters} m`;
    const sec = Math.round(remainingMeters / 1.25);
    hudMetricEta.textContent = sec > 60 ? `${Math.floor(sec / 60)}m ${sec % 60}s` : `${sec}s`;
  });

  tracker.on('navigationComplete', ({ dest }) => {
    showToast(`🎉 Arrived at ${dest?.name || 'Destination'}!`);
    hudTurnText.textContent = `Arrived at ${dest?.name || 'Destination'}`;
    hudTurnSub.textContent = 'Navigation Complete';
    hudProgressBar.style.width = '100%';
    setTimeout(() => {
      navHud.style.display = 'none';
    }, 4000);
  });

  tracker.on('reroute', ({ newRoute }) => {
    activeRouteData = newRoute;
    renderRoute(newRoute);
    renderTurnSteps(newRoute);
    showRouteSummary(newRoute);
    showToast('🔄 Rerouting along optimal corridor...');
  });

  tracker.on('gpsStatusChange', (info) => {
    updateLivePillStatus(info);
  });

  function updateLivePillStatus(info) {
    livePill.classList.remove('active-gps', 'simulating');
    if (info.status === 'active') {
      livePill.classList.add('active-gps');
      livePillText.textContent = 'Live GPS: Active';
    } else if (tracker.state.mode === 'simulation') {
      livePill.classList.add('simulating');
      livePillText.textContent = 'Simulated Walk';
    } else if (info.status === 'out_of_bounds') {
      livePillText.textContent = 'Campus Reception';
      showToast('📍 GPS detected outside Ettimadai Campus. Defaulted to Reception.');
    } else {
      livePillText.textContent = 'Live Location';
    }
  }

  // --- UI Event Bindings ---
  findRouteBtn.addEventListener('click', calculateAndShowRoute);
  simulateBtn.addEventListener('click', startSimulation);
  clearRouteBtn.addEventListener('click', clearActiveRoute);

  swapBtn.addEventListener('click', () => {
    const temp = startSelect.value;
    startSelect.value = destSelect.value;
    destSelect.value = temp;
    if (activeRouteData) calculateAndShowRoute();
  });

  // HUD controls
  hudPauseBtn.addEventListener('click', () => {
    tracker.togglePause();
    hudPauseBtn.textContent = tracker.state.isPaused ? '▶ Resume' : '⏸ Pause';
  });

  hudSpeedBtn.addEventListener('click', () => {
    let newSpeed = 1.0;
    if (tracker.state.speedMultiplier === 1.0) newSpeed = 2.0;
    else if (tracker.state.speedMultiplier === 2.0) newSpeed = 4.0;
    else newSpeed = 1.0;
    tracker.setSpeed(newSpeed);
    hudSpeedBtn.textContent = `${newSpeed}x`;
    showToast(`Simulation speed: ${newSpeed}x`);
  });

  hudStopBtn.addEventListener('click', () => {
    tracker.stopSimulation();
    navHud.style.display = 'none';
  });

  // Room Details Card actions
  closeCardBtn.addEventListener('click', hideRoomDetails);

  cardNavigateBtn.addEventListener('click', () => {
    if (selectedRoomId) {
      setDestinationAndRoute(selectedRoomId);
      hideRoomDetails();
    }
  });

  cardStartBtn.addEventListener('click', () => {
    if (selectedRoomId) {
      startSelect.value = selectedRoomId;
      selectTab('directions');
      hideRoomDetails();
      if (destSelect.value) calculateAndShowRoute();
    }
  });

  cardSetLocBtn.addEventListener('click', () => {
    const room = data.rooms.find(r => r.id === selectedRoomId);
    if (room) {
      tracker.setPosition(room.cx, room.cy, null, 3, 'manual');
      showToast(`📍 Live Location set to ${room.name}`);
      hideRoomDetails();
    }
  });

  // Search input filtering
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();
    clearSearchBtn.style.display = query ? 'block' : 'none';

    let filtered = data.rooms;
    if (currentCategory !== 'all') {
      filtered = filtered.filter(r => r.category.toLowerCase().includes(currentCategory));
    }
    if (query) {
      filtered = filtered.filter(r =>
        r.name.toLowerCase().includes(query) ||
        r.code.toLowerCase().includes(query) ||
        r.category.toLowerCase().includes(query)
      );
    }
    renderRoomDirectory(filtered);
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.style.display = 'none';
    filterByCategory(currentCategory);
  });

  // Category filter buttons
  categoryPills.forEach(pill => {
    pill.addEventListener('click', () => {
      categoryPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const cat = pill.dataset.category;
      filterByCategory(cat);
    });
  });

  function filterByCategory(cat) {
    currentCategory = cat;
    let filtered = data.rooms;
    if (cat !== 'all') {
      filtered = filtered.filter(r => r.category.toLowerCase().includes(cat.toLowerCase()));
    }
    renderRoomDirectory(filtered);

    // Highlight matching rooms on SVG
    document.querySelectorAll('.room-wall').forEach(el => el.classList.remove('highlight-cat'));
    if (cat !== 'all') {
      filtered.forEach(r => {
        const svgEl = document.getElementById(r.id);
        if (svgEl) svgEl.classList.add('highlight-cat');
      });
    }
  }

  // Quick Amenity Shortcuts
  document.querySelectorAll('.shortcut-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const type = chip.dataset.type;
      const res = router.findNearestAmenity(type, { x: tracker.state.x, y: tracker.state.y });
      if (res && res.room) {
        setDestinationAndRoute(res.room.id);
        showToast(`🧭 Nearest ${res.room.name} located (${res.route.totalDistanceMeters}m away)`);
      } else {
        showToast('No nearby amenity found.');
      }
    });
  });

  // Map Dock Controls
  zoomInBtn.addEventListener('click', () => {
    const rect = mapViewport.getBoundingClientRect();
    zoomAt(1.3, rect.width / 2, rect.height / 2);
  });

  zoomOutBtn.addEventListener('click', () => {
    const rect = mapViewport.getBoundingClientRect();
    zoomAt(0.75, rect.width / 2, rect.height / 2);
  });

  fitScreenBtn.addEventListener('click', () => fitToScreen(true));

  recenterUserBtn.addEventListener('click', () => {
    panTo(tracker.state.x, tracker.state.y, Math.max(viewState.scale, 1.2), 400);
    showToast('📍 Centered on your Live Location');
  });

  let corridorsVisible = true;
  toggleCorridorsBtn.addEventListener('click', () => {
    corridorsVisible = !corridorsVisible;
    pathwaysGroup.style.display = corridorsVisible ? 'block' : 'none';
    toggleCorridorsBtn.classList.toggle('active', corridorsVisible);
    showToast(corridorsVisible ? 'Corridors visible' : 'Corridors hidden');
  });

  let labelsVisible = true;
  toggleLabelsBtn.addEventListener('click', () => {
    labelsVisible = !labelsVisible;
    labelsGroup.style.display = labelsVisible ? 'block' : 'none';
    toggleLabelsBtn.classList.toggle('active', labelsVisible);
    showToast(labelsVisible ? 'Room labels visible' : 'Room labels hidden');
  });

  followToggleBtn.addEventListener('click', () => {
    tracker.state.followCamera = !tracker.state.followCamera;
    followToggleBtn.classList.toggle('active', tracker.state.followCamera);
    showToast(`Camera Follow: ${tracker.state.followCamera ? 'ON' : 'OFF'}`);
  });

  voiceToggleBtn.addEventListener('click', () => {
    const enabled = tracker.toggleVoice();
    voiceToggleBtn.classList.toggle('active', enabled);
    voiceToggleBtn.textContent = enabled ? '🔊' : '🔇';
    showToast(`Voice Guidance: ${enabled ? 'Enabled' : 'Muted'}`);
  });

  // Sidebar Tabs
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      selectTab(btn.dataset.tab);
    });
  });

  function selectTab(tabName) {
    tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
    document.querySelectorAll('.tab-pane').forEach(p => {
      p.classList.toggle('active', p.id === `tab-${tabName}`);
    });
  }

  // Modals
  livePill.addEventListener('click', () => {
    gpsModal.classList.add('active');
    updateGpsModalData();
  });
  closeGpsModal.addEventListener('click', () => gpsModal.classList.remove('active'));

  openFloorBtn.addEventListener('click', () => floorModal.classList.add('active'));
  closeFloorModal.addEventListener('click', () => floorModal.classList.remove('active'));

  document.querySelectorAll('.floor-option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('disabled')) {
        showToast('⚠️ Upper floors coming soon!');
        return;
      }
      document.querySelectorAll('.floor-option-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      floorModal.classList.remove('active');
    });
  });

  document.getElementById('gps-start-btn')?.addEventListener('click', () => {
    tracker.startGpsTracking();
    gpsModal.classList.remove('active');
    showToast('📡 Requesting device GPS access...');
  });

  document.getElementById('gps-sim-btn')?.addEventListener('click', () => {
    tracker.setPosition(296, 842, 90, 4, 'simulation');
    gpsModal.classList.remove('active');
    showToast('🚶 Campus Simulation Mode Active');
  });

  function updateGpsModalData() {
    document.getElementById('gps-modal-status').textContent = tracker.state.gpsStatus.toUpperCase();
    document.getElementById('gps-modal-coords').textContent = `(${Math.round(tracker.state.x)}, ${Math.round(tracker.state.y)})`;
    document.getElementById('gps-modal-accuracy').textContent = `±${tracker.state.accuracyMeters} m`;
    document.getElementById('gps-modal-heading').textContent = `${tracker.state.heading}°`;
  }

  // Toast System
  function showToast(msg) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3200);
  }

  // Mobile drawer handle toggle
  const mobileHandle = document.getElementById('mobile-drawer-handle');
  const navSidebar = document.getElementById('nav-sidebar');
  if (mobileHandle && navSidebar) {
    mobileHandle.addEventListener('click', () => {
      if (navSidebar.classList.contains('expanded')) {
        navSidebar.classList.remove('expanded');
        navSidebar.classList.add('collapsed');
      } else if (navSidebar.classList.contains('collapsed')) {
        navSidebar.classList.remove('collapsed');
      } else {
        navSidebar.classList.add('expanded');
      }
    });
  }

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === '+' || e.key === '=') {
      const rect = mapViewport.getBoundingClientRect();
      zoomAt(1.3, rect.width / 2, rect.height / 2);
    } else if (e.key === '-' || e.key === '_') {
      const rect = mapViewport.getBoundingClientRect();
      zoomAt(0.75, rect.width / 2, rect.height / 2);
    } else if (e.key === '0' || e.key.toLowerCase() === 'f') {
      fitToScreen(true);
    } else if (e.key === 'Escape') {
      hideRoomDetails();
      gpsModal.classList.remove('active');
      floorModal.classList.remove('active');
    } else if (e.key === '/') {
      e.preventDefault();
      selectTab('explore');
      searchInput.focus();
    }
  });

  // Responsive Window Resize Handler
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!tracker.state.isNavigating) {
        fitToScreen(false);
      }
    }, 120);
  });

  // --- Initial Boot Sequence ---
  populateSelects();
  renderRoomDirectory(data.rooms);
  initSvgInteractions();
  
  // Render initial live location marker
  renderLiveMarker(tracker.state);

  // Fit to screen cleanly after initial layout rendering
  requestAnimationFrame(() => {
    fitToScreen(false);
  });

  showToast('🗺️ Welcome to AmritaNav! Tap any room or pick a destination to begin.');
});
