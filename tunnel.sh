#!/bin/bash
while true; do
  echo "[$(date)] Starting localtunnel..."
  npx --yes localtunnel --port 8080 --subdomain amrita-nav-floorplan
  echo "[$(date)] Tunnel disconnected, restarting in 3 seconds..."
  sleep 3
done
