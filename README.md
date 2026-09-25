# 🧭 AmritaNav — Campus Indoor Wayfinding & Live Navigation System

**AmritaNav** is an interactive campus indoor navigation web application built for the **Ground Floor Academic Block (Engineering Complex)** of **Amrita Vishwa Vidyapeetham**.

Built directly from the vector floor plan `Amrita_Campus_Floorplan_Vector (3).svg`, AmritaNav provides real-world scale corridor pathfinding, turn-by-turn indoor wayfinding, and real-time **Live Location tracking** (with support for Device GPS, simulated live walking, and tap-to-place positioning).

---

## 🌟 Key Features

### 1. 🗺️ Scaled Vector Floor Plan (Ground Floor)
- Rendered with real-world architectural dimensions from the uploaded vector floor plan (`2112 × 1300` scale).
- **Interactive Rooms & Facilities**:
  - Over 56 distinct rooms, labs, auditoriums, departments, and amenities.
  - Color-coded categories:
    - 🔬 **Labs & Research** (*Ice Blue / Cyan*): Metallurgy, Fluid Mechanics, CAE Cell, Machine Dynamics, CNC Robotics, Wind Tunnel, Nanotechnology, ACWNA.
    - 🏛️ **Halls & Auditoriums** (*Rose / Pink*): Acharya Hall, Amritheswari Hall, Special Programs Hall, CIR Seminar Room.
    - 🏢 **Administration** (*Amber / Gold*): Administration Block A / Reception, Principal, Director & Associate Dean, Admission Office, GAD-PR.
    - 🌿 **Courtyards & Open Spaces** (*Garden Green*): West Courtyard, Central Courtyard, East Courtyard, Far-East Courtyard.
    - 🚻 **Restrooms & Health** (*Sky / Mint*): Ladies Washrooms, Men Washrooms, Ladies Infirmary, Guest Lounge.
    - 🪜 **Vertical Transit** (*Slate Cool Gray*): Staircases connecting Ground Floor to Level 1 & Level 2.
- **Hover & Click Inspection**: Hover any room for an instant identification tooltip; click to view the Room Details Card with descriptions, room codes, and one-click navigation actions.

---

### 2. 📍 Multi-Mode Live Location System
- **Real Device GPS Geolocation**:
  - Uses `navigator.geolocation.watchPosition` with `enableHighAccuracy: true`.
  - Calibrated to the Amrita Ettimadai / Coimbatore campus bounding coordinates (`10.9038° N, 76.9003° E`).
  - Real-time GPS accuracy halo ring and compass heading cone.
  - Automatic detection if the device is outside campus bounds (with polite fallback to Reception / Campus Walk Mode).
- **Interactive Live Walking Simulation ("Simulate Walk")**:
  - Test live navigation from anywhere without walking outdoors!
  - Watch your pulsing blue dot beacon smoothly walk along the corridor network at realistic walking speeds (`1x = 1.3 m/s`, `2x = 2.6 m/s`, `4x = 5.2 m/s`).
  - Real-time progress bar, remaining distance countdown, and ETA estimation.
- **Tap-to-Place Manual Positioning**:
  - Tap any room or double-click anywhere on the map to set your live location pin.
- **Dynamic Auto-Rerouting**:
  - If you deviate more than 20 meters from your active route, AmritaNav automatically re-calculates the optimal corridor path from your new position!
- **Auto "Follow Me" Camera**:
  - Automatically pans and centers the map on your moving live location beacon.

---

### 3. 🧭 Turn-by-Turn Wayfinding Engine
- **Shortest Path Graph (Dijkstra / A\*)**:
  - 122 connected nodes and 157 corridor edges mathematically verified with 100% reachability across all 56 rooms and entrances.
- **Human-Readable Turn Directions**:
  - Merges consecutive corridor segments into clean, natural directions:
    - *"Start from Administration Block (A) / Reception"*
    - *"Head along Main Entrance — Reception Passage for 25 meters"*
    - *"Turn right onto West Hall and Reception Corridor"*
    - *"Turn left onto Acharya Hall to South Wing"*
    - *"Arrive at Acharya Hall (ACH-110)"*
- **Passing Landmarks**: Notifies you of nearby rooms and landmarks you pass along the way.
- **Audio Voice Guidance**: Built-in speech synthesis (`SpeechSynthesisUtterance`) that speaks out turns as you approach them.

---

### 4. 🔍 Instant Search & Quick Amenities
- Search rooms by name (e.g. *"Acharya"*, *"CIR"*, *"Dean"*, *"Math"*, *"Wind Tunnel"*) or room codes (*"ACH-110"*, *"ACN"*, *"ADM"*, *"WC"*).
- **Find Nearest Shortcuts**:
  - 🚺 Nearest Ladies Restroom
  - 🚹 Nearest Men Restroom
  - 🪜 Nearest Staircase to upper floors
  - 🚪 Nearest Main Campus Exit (West Gate)

---

## 🚀 How to Run

AmritaNav is completely self-contained with **zero external dependencies**.

### Option A: Local Development Server (Recommended)
Run the built-in HTTP server:
```bash
python3 -m http.server 3000
```
Open **[http://localhost:3000](http://localhost:3000)** in any modern web browser (Chrome, Safari, Firefox, Edge).

### Option B: Standalone File
You can also directly open `index.html` in your web browser.

---

## 📁 Project Architecture

```
amritanavigation final/
├── index.html                           # Main web application & responsive layout
├── styles.css                           # Modern Amrita-branded CSS & animations
├── campus-data.js                       # 56 rooms metadata & 122-node corridor graph
├── navigation.js                        # Dijkstra routing engine & turn instruction generator
├── live-location.js                     # Device GPS, walking simulation & voice engine
├── app.js                               # Map pan/zoom, interactive layers & UI controller
├── amrita-floorplan-cleaned.svg         # Cleaned standalone vector floor plan
└── Amrita_Campus_Floorplan_Vector (3).svg # Original uploaded vector floor plan
```

---

## ⌨️ Keyboard Shortcuts
- `+` / `=`: Zoom In
- `-` / `_`: Zoom Out
- `0` or `F`: Fit map to screen
- `Escape`: Close modals and deselect rooms
- `/`: Focus search input
