/**
 * AmritaNav - Core Navigation & Pathfinding Engine
 * Ground Floor - Amrita Vishwa Vidyapeetham
 */

class AmritaRouter {
  constructor(data) {
    this.data = data || window.AMRITA_DATA;
    this.nodes = this.data.nodes;
    this.edges = this.data.edges;
    this.rooms = this.data.rooms;
    this.specialPOIs = this.data.specialPOIs || [];
    this.pathways = this.data.pathways || [];
    this.scale = this.data.campusInfo.scaleMetersPerPixel || 0.15;
    this.walkingSpeed = this.data.campusInfo.avgWalkingSpeedMps || 1.25;

    this.roomsMap = new Map();
    this.rooms.forEach(r => this.roomsMap.set(r.id, r));
    this.specialPOIs.forEach(poi => this.roomsMap.set(poi.id, poi));

    this.adj = new Map();
    this.buildGraph();
  }

  buildGraph() {
    this.adj.clear();
    for (let i = 0; i < this.nodes.length; i++) {
      this.adj.set(i, new Map());
    }
    for (const edge of this.edges) {
      const u = edge.u;
      const v = edge.v;
      const dist = edge.dist;
      const corridor = edge.corridor;
      this.adj.get(u).set(v, { dist, corridor });
      this.adj.get(v).set(u, { dist, corridor });
    }
  }

  dist(p1, p2) {
    const dx = p1[0] - p2[0];
    const dy = p1[1] - p2[1];
    return Math.sqrt(dx * dx + dy * dy);
  }

  pointToSegmentDist(p, a, b) {
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const abl2 = abx * abx + aby * aby;
    if (abl2 < 1e-6) {
      return { dist: this.dist(p, a), proj: a, t: 0 };
    }
    let t = ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / abl2;
    t = Math.max(0, Math.min(1, t));
    const proj = [a[0] + t * abx, a[1] + t * aby];
    return { dist: this.dist(p, proj), proj, t };
  }

  findNearestCorridorPoint(x, y) {
    let bestDist = Infinity;
    let bestProj = [x, y];
    let bestEdge = null;

    for (const edge of this.edges) {
      const uPt = this.nodes[edge.u];
      const vPt = this.nodes[edge.v];
      const res = this.pointToSegmentDist([x, y], uPt, vPt);
      if (res.dist < bestDist) {
        bestDist = res.dist;
        bestProj = res.proj;
        bestEdge = edge;
      }
    }

    let nearestNode = 0;
    let minNodeDist = Infinity;
    for (let i = 0; i < this.nodes.length; i++) {
      const d = this.dist([x, y], this.nodes[i]);
      if (d < minNodeDist) {
        minNodeDist = d;
        nearestNode = i;
      }
    }

    return {
      proj: bestProj,
      dist: bestDist,
      edge: bestEdge,
      nearestNode
    };
  }

  dijkstra(startNode, endNode) {
    if (startNode === endNode) {
      return { distance: 0, path: [startNode] };
    }

    const dist = new Map();
    const prev = new Map();
    const pq = new MinPriorityQueue();

    for (let i = 0; i < this.nodes.length; i++) {
      dist.set(i, Infinity);
    }

    dist.set(startNode, 0);
    pq.enqueue(startNode, 0);

    while (!pq.isEmpty()) {
      const { element: u, priority: currentDist } = pq.dequeue();

      if (currentDist > dist.get(u)) continue;
      if (u === endNode) break;

      const neighbors = this.adj.get(u);
      if (!neighbors) continue;

      for (const [v, info] of neighbors.entries()) {
        const alt = currentDist + info.dist;
        if (alt < dist.get(v)) {
          dist.set(v, alt);
          prev.set(v, u);
          pq.enqueue(v, alt);
        }
      }
    }

    if (dist.get(endNode) === Infinity) {
      return { distance: Infinity, path: [] };
    }

    const path = [];
    let curr = endNode;
    while (curr !== undefined) {
      path.unshift(curr);
      curr = prev.get(curr);
    }

    return { distance: dist.get(endNode), path };
  }

  resolveTarget(target) {
    if (typeof target === 'string') {
      const room = this.roomsMap.get(target);
      if (room) {
        return {
          id: room.id,
          name: room.name,
          code: room.code,
          x: room.cx,
          y: room.cy,
          entryX: room.entryX,
          entryY: room.entryY,
          node: room.node,
          isRoom: true,
          category: room.category
        };
      }
    } else if (target && typeof target === 'object') {
      if (target.id && this.roomsMap.has(target.id)) {
        return this.resolveTarget(target.id);
      }
      const x = target.x !== undefined ? target.x : target.cx;
      const y = target.y !== undefined ? target.y : target.cy;
      const nearest = this.findNearestCorridorPoint(x, y);
      return {
        id: target.id || 'custom_point',
        name: target.name || 'Current Location',
        code: target.code || 'LOC',
        x,
        y,
        entryX: nearest.proj[0],
        entryY: nearest.proj[1],
        node: nearest.nearestNode,
        isRoom: false,
        category: 'Custom Location'
      };
    }
    return null;
  }

  findRoute(originTarget, destTarget) {
    const origin = this.resolveTarget(originTarget);
    const dest = this.resolveTarget(destTarget);

    if (!origin || !dest) {
      return { success: false, error: 'Invalid origin or destination point' };
    }

    if (origin.id === dest.id) {
      return {
        success: true,
        points: [[origin.x, origin.y]],
        instructions: [{
          icon: 'destination',
          text: `You are already at ${dest.name}`,
          subtext: 'Destination reached',
          distanceM: 0
        }],
        totalDistanceMeters: 0,
        estimatedTimeMinutes: '< 1 min',
        stepCount: 0,
        calories: 0,
        origin,
        dest
      };
    }

    let startNode = origin.node;
    let endNode = dest.node;

    const { distance: corridorDist, path: nodePath } = this.dijkstra(startNode, endNode);

    if (corridorDist === Infinity || nodePath.length === 0) {
      return { success: false, error: 'No reachable corridor route found between locations' };
    }

    // Build raw point polyline
    const fullPoints = [];
    fullPoints.push([origin.x, origin.y]);

    if (origin.isRoom && (origin.x !== origin.entryX || origin.y !== origin.entryY)) {
      fullPoints.push([origin.entryX, origin.entryY]);
    }

    for (const nodeIdx of nodePath) {
      const pt = this.nodes[nodeIdx];
      const last = fullPoints[fullPoints.length - 1];
      if (this.dist(last, pt) > 1.0) {
        fullPoints.push(pt);
      }
    }

    if (dest.isRoom && (dest.x !== dest.entryX || dest.y !== dest.entryY)) {
      fullPoints.push([dest.entryX, dest.entryY]);
    }
    fullPoints.push([dest.x, dest.y]);

    // Calculate total geometric distance
    let totalDistPx = 0;
    for (let i = 0; i < fullPoints.length - 1; i++) {
      totalDistPx += this.dist(fullPoints[i], fullPoints[i + 1]);
    }

    const totalDistanceMeters = Math.round(totalDistPx * this.scale);
    const timeSec = Math.round(totalDistanceMeters / this.walkingSpeed);
    const minutes = Math.floor(timeSec / 60);
    const seconds = timeSec % 60;
    const timeFormatted = minutes > 0 ? `${minutes} min ${seconds > 0 ? seconds + 's' : ''}` : `${seconds} sec`;
    const stepCount = Math.round(totalDistanceMeters / 0.75);
    const calories = Math.round(stepCount * 0.04);

    // Generate turn-by-turn guidance
    const instructions = this.generateTurnByTurn(fullPoints, nodePath, origin, dest);

    return {
      success: true,
      points: fullPoints,
      nodePath,
      instructions,
      totalDistancePx: totalDistPx,
      totalDistanceMeters,
      estimatedTimeMinutes: timeFormatted,
      estimatedSeconds: timeSec,
      stepCount,
      calories,
      origin,
      dest
    };
  }

  generateTurnByTurn(points, nodePath, origin, dest) {
    const instructions = [];

    // Step 0: Departure
    instructions.push({
      stepIndex: 0,
      icon: 'start',
      text: `Start from ${origin.name}`,
      subtext: origin.isRoom ? 'Exit the room into the corridor' : 'Begin navigation',
      distanceM: Math.round(this.dist(points[0], points[1]) * this.scale),
      coord: points[0]
    });

    if (points.length <= 2) {
      instructions.push({
        stepIndex: 1,
        icon: 'destination',
        text: `Arrive at ${dest.name}`,
        subtext: 'Your destination is right ahead',
        distanceM: 0,
        coord: points[points.length - 1]
      });
      return instructions;
    }

    // Identify corridor segments along nodes
    const segments = [];
    for (let i = 0; i < nodePath.length - 1; i++) {
      const u = nodePath[i];
      const v = nodePath[i + 1];
      const edgeInfo = this.adj.get(u)?.get(v) || { corridor: 'Campus Corridor' };
      const p1 = this.nodes[u];
      const p2 = this.nodes[v];
      const d = this.dist(p1, p2);
      segments.push({
        u,
        v,
        corridor: edgeInfo.corridor,
        p1,
        p2,
        distPx: d,
        distM: Math.round(d * this.scale)
      });
    }

    // Merge consecutive segments along the same named corridor or straight angle
    const merged = [];
    let current = null;

    for (const seg of segments) {
      if (!current) {
        current = {
          corridor: seg.corridor,
          p1: seg.p1,
          p2: seg.p2,
          distM: seg.distM,
          distPx: seg.distPx,
          waypoints: [seg.p1, seg.p2]
        };
      } else {
        const isSameCorridor = current.corridor === seg.corridor && !current.corridor.includes('Junction');
        const v1 = [current.p2[0] - current.p1[0], current.p2[1] - current.p1[1]];
        const v2 = [seg.p2[0] - seg.p1[0], seg.p2[1] - seg.p1[1]];
        const angleDiff = this.calculateAngleBetween(v1, v2);

        if (isSameCorridor || Math.abs(angleDiff) < 22) {
          current.p2 = seg.p2;
          current.distM += seg.distM;
          current.distPx += seg.distPx;
          current.waypoints.push(seg.p2);
          if (current.corridor.includes('Junction') && !seg.corridor.includes('Junction')) {
            current.corridor = seg.corridor;
          }
        } else {
          merged.push(current);
          current = {
            corridor: seg.corridor,
            p1: seg.p1,
            p2: seg.p2,
            distM: seg.distM,
            distPx: seg.distPx,
            waypoints: [seg.p1, seg.p2]
          };
        }
      }
    }
    if (current) merged.push(current);

    // Build instruction text based on turn angles
    for (let i = 0; i < merged.length; i++) {
      const seg = merged[i];
      let icon = 'straight';
      let turnText = `Continue on ${seg.corridor}`;

      if (i === 0) {
        turnText = `Head along ${seg.corridor}`;
        icon = 'straight';
      } else {
        const prevSeg = merged[i - 1];
        const vPrev = [prevSeg.p2[0] - prevSeg.p1[0], prevSeg.p2[1] - prevSeg.p1[1]];
        const vCurr = [seg.p2[0] - seg.p1[0], seg.p2[1] - seg.p1[1]];
        const angle = this.calculateAngleBetween(vPrev, vCurr);

        if (angle > 120) {
          icon = 'turn-right';
          turnText = `Sharp right onto ${seg.corridor}`;
        } else if (angle > 35) {
          icon = 'turn-right';
          turnText = `Turn right onto ${seg.corridor}`;
        } else if (angle > 15) {
          icon = 'slight-right';
          turnText = `Slight right onto ${seg.corridor}`;
        } else if (angle < -120) {
          icon = 'turn-left';
          turnText = `Sharp left onto ${seg.corridor}`;
        } else if (angle < -35) {
          icon = 'turn-left';
          turnText = `Turn left onto ${seg.corridor}`;
        } else if (angle < -15) {
          icon = 'slight-left';
          turnText = `Slight left onto ${seg.corridor}`;
        } else {
          icon = 'straight';
          turnText = `Continue straight on ${seg.corridor}`;
        }
      }

      // Find nearby landmarks
      const landmark = this.findLandmarkNear(seg.p1, [origin.id, dest.id]);
      const subtext = landmark ? `Pass near ${landmark.name}` : `Walk for ${Math.max(5, seg.distM)} meters`;

      instructions.push({
        stepIndex: instructions.length,
        icon,
        text: turnText,
        subtext,
        distanceM: Math.max(5, seg.distM),
        coord: seg.p1
      });
    }

    // Final Arrival Step
    instructions.push({
      stepIndex: instructions.length,
      icon: 'destination',
      text: `Arrive at ${dest.name}`,
      subtext: dest.isRoom ? `Room Code: ${dest.code}` : 'You have arrived',
      distanceM: 0,
      coord: points[points.length - 1]
    });

    return instructions;
  }

  calculateAngleBetween(v1, v2) {
    const dot = v1[0] * v2[0] + v1[1] * v2[1];
    const det = v1[0] * v2[1] - v1[1] * v2[0];
    const angleRad = Math.atan2(det, dot);
    return (angleRad * 180) / Math.PI;
  }

  findLandmarkNear(pt, excludeIds = []) {
    let closest = null;
    let minDist = 75; // within ~11 meters
    for (const room of this.rooms) {
      if (excludeIds.includes(room.id)) continue;
      if (room.category === 'Stairs' || room.category === 'Courtyards') continue;
      const d = this.dist(pt, [room.cx, room.cy]);
      if (d < minDist) {
        minDist = d;
        closest = room;
      }
    }
    return closest;
  }

  findNearestAmenity(category, originCoord) {
    const origin = this.resolveTarget(originCoord);
    if (!origin) return null;

    let targetRooms = [];
    if (category === 'restroom_any') {
      targetRooms = this.rooms.filter(r => r.category === 'Amenities' && (r.code === 'WC' || r.name.toLowerCase().includes('washroom')));
    } else if (category === 'restroom_ladies') {
      targetRooms = this.rooms.filter(r => r.name.toLowerCase().includes('ladies washroom'));
    } else if (category === 'restroom_men') {
      targetRooms = this.rooms.filter(r => r.name.toLowerCase().includes('men washroom'));
    } else if (category === 'staircase') {
      targetRooms = this.rooms.filter(r => r.category === 'Stairs');
    } else if (category === 'exit') {
      targetRooms = this.specialPOIs.filter(p => p.id === 'poi_main_west_entrance');
    }

    if (targetRooms.length === 0) return null;

    let bestRoom = null;
    let shortestDist = Infinity;
    let bestRoute = null;

    for (const room of targetRooms) {
      const route = this.findRoute(origin, room);
      if (route.success && route.totalDistanceMeters < shortestDist) {
        shortestDist = route.totalDistanceMeters;
        bestRoom = room;
        bestRoute = route;
      }
    }

    return { room: bestRoom, route: bestRoute };
  }
}

// Lightweight MinPriorityQueue for Dijkstra
class MinPriorityQueue {
  constructor() {
    this.elements = [];
  }
  enqueue(element, priority) {
    this.elements.push({ element, priority });
    this.elements.sort((a, b) => a.priority - b.priority);
  }
  dequeue() {
    return this.elements.shift();
  }
  isEmpty() {
    return this.elements.length === 0;
  }
}

window.AmritaRouter = AmritaRouter;
