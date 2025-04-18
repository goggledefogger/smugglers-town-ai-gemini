import React, { useRef, useEffect, useState, useCallback } from 'react';
import maplibregl, { Map, LngLat } from 'maplibre-gl';
import * as PIXI from 'pixi.js';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Client, Room } from 'colyseus.js'; // Import Colyseus client
import HUD from '../components/HUD'; // Import the HUD component

// Map and Style
// Read style URL from environment variable
const MAP_STYLE_URL = import.meta.env.VITE_MAPLIBRE_STYLE_URL;
if (!MAP_STYLE_URL) {
    console.error("ERROR: VITE_MAPLIBRE_STYLE_URL environment variable is not set!");
    // Potentially fall back to a default or throw an error
}
const INITIAL_CENTER: [number, number] = [-73.985, 40.758]; // Times Square, NYC (Lng, Lat)
const INITIAL_ZOOM = 17; // Zoom closer

// Game Constants - Focus on Pixel Speed for now
// const MAX_SPEED_MPS = 14; // Target real-world speed (for later)
// const PIXELS_PER_METER = 8; // Removing this direct link for now
const MAX_SPEED_PIXELS = 250; // TUNABLE: Target pixels/second panning speed
const ACCEL_RATE = 10; // TUNABLE: How quickly we reach max speed (higher = faster)
const TURN_SMOOTH = 12;

// Colyseus Endpoint
const COLYSEUS_ENDPOINT = process.env.NODE_ENV === 'production'
    ? 'wss://your-production-colyseus-url' // TODO: Replace with your deployed server URL
    : 'ws://localhost:2567'; // Local development server

// --- Helper Functions ---
function lerp(start: number, end: number, factor: number): number {
  return start + factor * (end - start);
}

function angleLerp(startAngle: number, endAngle: number, factor: number): number {
  const delta = endAngle - startAngle;
  const shortestAngle = ((delta + Math.PI) % (2 * Math.PI)) - Math.PI;
  return startAngle + factor * shortestAngle;
}
// -----------------------

interface GameCanvasProps {}

interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

// Type the Room state (optional but recommended)
// type ArenaRoomState = ArenaState;

const GameCanvas: React.FC<GameCanvasProps> = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const pixiContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<Map | null>(null);
  const pixiApp = useRef<PIXI.Application | null>(null);

  const isMounted = useRef(false);
  const pixiInitComplete = useRef(false); // Track Pixi init success

  // Game State Refs
  const inputState = useRef<InputState>({ up: false, down: false, left: false, right: false });
  const carSprite = useRef<PIXI.Graphics | null>(null);
  const velocity = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const currentHeading = useRef<number>(0); // Radians
  // Mock world position - might not be needed if we just pan the map
  // const worldPosition = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Colyseus Refs
  const colyseusClient = useRef<Client | null>(null);
  const gameRoom = useRef<Room | null>(null); // Use specific type ArenaRoom<ArenaRoomState> later

  const gameLoop = useCallback((ticker: PIXI.Ticker) => {
    if (!pixiApp.current || !mapInstance.current || !carSprite.current) {
        // console.warn("GameLoop: Refs not ready"); // Optional: uncomment if needed
        return;
    }

    const dt = ticker.deltaMS / 1000;

    // --- Input Calculation ---
    const input = inputState.current;
    const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);

    let magnitude = Math.sqrt(dx * dx + dy * dy);
    let dirX = 0;
    let dirY = 0;
    if (magnitude > 0) {
      dirX = dx / magnitude;
      dirY = dy / magnitude;
    }

    // --- Movement Logic ---
    const targetVelX = dirX * MAX_SPEED_PIXELS;
    const targetVelY = dirY * MAX_SPEED_PIXELS;
    const accelFactor = Math.min(ACCEL_RATE * dt, 1.0);

    const oldVelX = velocity.current.x;
    const oldVelY = velocity.current.y;
    velocity.current.x = lerp(oldVelX, targetVelX, accelFactor);
    velocity.current.y = lerp(oldVelY, targetVelY, accelFactor);

    const deltaX = velocity.current.x * dt;
    const deltaY = velocity.current.y * dt;

    // --- DEBUG LOGGING --- (Commented out)
    /*
    if (dx !== 0 || dy !== 0 || Math.abs(deltaX) > 0.01 || Math.abs(deltaY) > 0.01) {
      console.log(
        `Input:(${dx},${dy}) ` +
        `Vel:(${velocity.current.x.toFixed(2)}, ${velocity.current.y.toFixed(2)}) ` +
        `Delta:(${deltaX.toFixed(3)}, ${deltaY.toFixed(3)}) ` +
        `Heading: ${currentHeading.current.toFixed(2)}`
      );
    }
    */
    // -------------------

    // --- Map Panning ---
    if (Math.abs(deltaX) > 0.01 || Math.abs(deltaY) > 0.01) {
      mapInstance.current.panBy([deltaX, deltaY], { duration: 0, animate: false });
    }

    // --- Car Rotation ---
    let targetHeading = currentHeading.current; // Keep current heading if no input
    if (dirX !== 0 || dirY !== 0) {
      // Calculate angle relative to positive X axis
      const angle = Math.atan2(dirY, dirX);
      // Add offset because our sprite's "forward" is initially pointing up (-PI/2)
      // instead of right (0)
      targetHeading = angle;
    }
    const turnFactor = Math.min(TURN_SMOOTH * dt, 1.0);
    // Lerp towards the target angle
    currentHeading.current = angleLerp(currentHeading.current, targetHeading, turnFactor);

    // Apply the final rotation to the sprite
    // Adding PI/2 offset directly here to correct visual orientation
    carSprite.current.rotation = currentHeading.current + (Math.PI / 2);

  }, []); // End of gameLoop

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    switch (event.key) {
      case 'w': case 'ArrowUp': inputState.current.up = true; break;
      case 's': case 'ArrowDown': inputState.current.down = true; break;
      case 'a': case 'ArrowLeft': inputState.current.left = true; break;
      case 'd': case 'ArrowRight': inputState.current.right = true; break;
    }
  }, []);

  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    switch (event.key) {
      case 'w': case 'ArrowUp': inputState.current.up = false; break;
      case 's': case 'ArrowDown': inputState.current.down = false; break;
      case 'a': case 'ArrowLeft': inputState.current.left = false; break;
      case 'd': case 'ArrowRight': inputState.current.right = false; break;
    }
  }, []);

  // Colyseus Connection Logic
  const connectToServer = useCallback(async () => {
    if (gameRoom.current || !isMounted.current) {
        console.log("Already connected or component unmounted, skipping connection.");
        return;
    }
    console.log(`Attempting to connect to Colyseus server at ${COLYSEUS_ENDPOINT}...`);
    colyseusClient.current = new Client(COLYSEUS_ENDPOINT);

    try {
        console.log("Joining 'arena' room...");
        // TODO: Pass options like player name, auth token later
        const room = await colyseusClient.current.joinOrCreate<any>('arena', {/* options */});
        gameRoom.current = room;
        console.log(`Joined room '${room.name}' successfully! SessionId: ${room.sessionId}`);

        // --- Room Event Listeners ---
        room.onStateChange((state: any) => {
            // This is where we'll receive synchronized state from the server
            console.log("Received state update:", state);
            // TODO: Update local game based on server state (e.g., other player positions)
        });

        room.onLeave((code: any) => {
            console.log(`Left room '${room.name}' (code: ${code})`);
            gameRoom.current = null;
        });

        room.onError((code: any, message: any) => {
            console.error(`Room '${room.name}' error (code ${code}):`, message);
            // Handle error appropriately (e.g., show message to user)
        });

        // Example: Listen for custom message type from server (optional)
        // room.onMessage("some_event", (payload) => {
        //     console.log("Received custom message:", payload);
        // });
        // ---------------------------

    } catch (e) {
        console.error("Failed to join or create room:", e);
        // Handle connection error (e.g., show message, retry?)
    }
  }, []); // Dependencies: Potentially add auth token or user info later

  useEffect(() => {
    isMounted.current = true;
    pixiInitComplete.current = false; // Reset on effect run
    let map: Map | null = null;
    let app: PIXI.Application | null = null;
    let listenersAdded = false;
    let tickerAdded = false;

    if (mapInstance.current || pixiApp.current) {
      console.warn("Initialization already done or in progress. Skipping.");
      return;
    }
    if (!mapContainer.current || !pixiContainer.current) {
      console.error("DOM containers not ready. Skipping.");
      return;
    }

    const currentMapContainer = mapContainer.current;
    const currentPixiContainer = pixiContainer.current;

    console.log("Starting initialization...");

    // 1. Initialize MapLibre
    try {
      map = new Map({
        container: currentMapContainer,
        style: MAP_STYLE_URL,
        center: INITIAL_CENTER,
        zoom: INITIAL_ZOOM,
        interactive: false,
      });
      mapInstance.current = map;
    } catch (error) {
      console.error("Error initializing MapLibre:", error);
      return; // Stop if map fails
    }

    // 2. Initialize Pixi App Ref
    app = new PIXI.Application();
    pixiApp.current = app;

    const setupPixi = async () => {
      if (!pixiApp.current || !currentPixiContainer) {
        console.error("Pixi App or Container ref became null before async init call.");
        return;
      }
      console.log("Calling Pixi App init...");
      try {
        await pixiApp.current.init({
          resizeTo: currentPixiContainer,
          backgroundAlpha: 0,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
        });
        // Check mount status immediately after await
        if (!isMounted.current || !pixiApp.current) {
            console.log("Component unmounted or Pixi App nulled during init. Aborting setup.");
            // If init succeeded but we unmounted, try to destroy gracefully
            if (pixiApp.current) {
                 pixiApp.current.destroy(true, { children: true, texture: true });
                 pixiApp.current = null;
            }
            return;
        }
        pixiInitComplete.current = true; // Mark init as successful
        console.log("Pixi App init successful.");

      } catch (error) {
          console.error("Error during Pixi App init call:", error);
          pixiInitComplete.current = false;
          // Attempt cleanup even if init fails partially
          if (pixiApp.current) {
            pixiApp.current.destroy(true, { children: true, texture: true });
            pixiApp.current = null;
          }
          return;
      }

      console.log("Appending Pixi canvas...");
      if (pixiApp.current && !currentPixiContainer.contains(pixiApp.current.canvas)) {
        currentPixiContainer.appendChild(pixiApp.current.canvas);
      }

      if (pixiApp.current && pixiInitComplete.current) { // Ensure init completed
        console.log("Setting up Pixi stage...");
        const carWidth = 20;
        const carHeight = 40;
        const carGfx = new PIXI.Graphics()
          .rect(0, 0, carWidth, carHeight)
          .fill({ color: 0xff0000 });
        carGfx.poly([ carWidth / 2, -5, carWidth, 10, 0, 10]).fill({ color: 0xffffff });
        carGfx.pivot.set(carWidth / 2, carHeight / 2);
        carGfx.x = pixiApp.current.screen.width / 2;
        carGfx.y = pixiApp.current.screen.height / 2;
        pixiApp.current.stage.addChild(carGfx);
        carSprite.current = carGfx;
        console.log("Car sprite added.");

        pixiApp.current.ticker.add(gameLoop);
        tickerAdded = true;
        console.log("Game loop added.");
      }
    };

    map.on('load', () => {
      if (!isMounted.current || !mapInstance.current) {
        console.log("Map loaded, but component unmounted or map nulled. Skipping Pixi setup.");
        return;
      }
      console.log('MapLibre map loaded.');
      setupPixi().then(() => {
        if (!isMounted.current || !pixiInitComplete.current) { // Check init flag too
          console.log("Pixi setup promise resolved, but component unmounted or Pixi init failed. Skipping listeners.");
          return;
        }
        console.log('PixiJS setup complete.');
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        listenersAdded = true;
        console.log("Input listeners added.");

        // Connect to Colyseus AFTER Pixi is ready
        if (isMounted.current) {
            connectToServer();
        }

      }).catch(error => {
        console.error("Error executing setupPixi promise:", error);
      });
    });

    map.on('error', (e) => console.error('MapLibre error:', e));

    // Cleanup function
    return () => {
      console.log(`Running cleanup (isMounted: ${isMounted.current}, pixiInitComplete: ${pixiInitComplete.current})...`);
      const wasMounted = isMounted.current; // Capture state before setting false
      isMounted.current = false;

      if (listenersAdded) {
        console.log("Removing input listeners...");
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
      }

      const currentPixiApp = pixiApp.current;
      if (currentPixiApp && pixiInitComplete.current) { // Check init flag before destroy
        console.log("Cleaning up Pixi...");
        if (tickerAdded) {
          currentPixiApp.ticker.remove(gameLoop);
        }
        console.log("Destroying Pixi app...");
        currentPixiApp.destroy(true, { children: true, texture: true });

      } else if (currentPixiApp) {
          console.log("Pixi app exists but init did not complete, skipping destroy.")
      }
      pixiApp.current = null; // Always null out ref

      const currentMap = mapInstance.current;
      if (currentMap) {
        console.log("Cleaning up MapLibre...");
        currentMap.remove();
        mapInstance.current = null;
      } else if (wasMounted) { // Only log if it was mounted but ref is null
          console.log("Map instance ref was already null during cleanup.");
      }

      // Leave Colyseus room if connected
      if (gameRoom.current) {
          console.log("Leaving Colyseus room...");
          gameRoom.current.leave();
          gameRoom.current = null;
      }
      colyseusClient.current = null;

      // Reset other refs
      carSprite.current = null;
      velocity.current = { x: 0, y: 0 };
      currentHeading.current = 0;
      inputState.current = { up: false, down: false, left: false, right: false };
      console.log("Cleanup finished.");
    };
  }, [connectToServer]); // Add connectToServer to dependencies

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      {/* MapLibre container */}
      <div ref={mapContainer} style={{ position: 'absolute', top: 0, bottom: 0, width: '100%', height: '100%' }} />
      {/* Pixi.js overlay container */}
      <div ref={pixiContainer} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        {/* Pixi canvas will be appended here */}
      </div>
      {/* Render the HUD component */}
      <HUD />
    </div>
  );
};

export default GameCanvas;
