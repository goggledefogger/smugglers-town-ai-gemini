import { Room, Client } from "@colyseus/core";
import { ArenaState, Player } from "./schemas/ArenaState";

// Constants for server-side physics (world units = meters)
const MAX_SPEED_WORLD = 200; // m/s (~720 kph / 450 mph)
const ACCEL_RATE_WORLD = 15; // Factor per second - Reduced for smooth lerp!
const TURN_SMOOTH_WORLD = 12; // Factor per second

// Helper function (can be moved to shared location)
function lerp(start: number, end: number, factor: number): number {
  return start + factor * (end - start);
}

function angleLerp(startAngle: number, endAngle: number, factor: number): number {
  const delta = endAngle - startAngle;
  const shortestAngle = ((delta + Math.PI) % (2 * Math.PI)) - Math.PI;
  return startAngle + factor * shortestAngle;
}

export class ArenaRoom extends Room<ArenaState> {

  // Store latest input from clients
  private playerInputs = new Map<string, { dx: number, dy: number }>();
  // Store server-calculated velocity (not directly in synced state for now)
  private playerVelocities = new Map<string, { vx: number, vy: number }>();

  // Called when the room is created
  onCreate (options: any) {
    console.log("[ArenaRoom] Room created with options:", options);

    // Set the initial state
    this.setState(new ArenaState());

    // --- Message Handler for Input ---
    this.onMessage("input", (client, message: { dx: number, dy: number }) => {
      // Store the latest input direction for this client
      this.playerInputs.set(client.sessionId, { dx: message.dx, dy: message.dy });
      // We could add validation here
    });
    // ----------------------------------

    // Set up the main game loop (target 60Hz)
    this.setSimulationInterval((deltaTime) => this.update(deltaTime / 1000), 1000 / 60); // ~16.6ms interval
  }

  // Called when a client joins the room
  onJoin (client: Client, options: any) {
    console.log(`[ArenaRoom] Client joined: ${client.sessionId}`, options);

    const player = new Player();
    player.name = options.playerName || `Guest_${client.sessionId.substring(0, 4)}`;
    // Initialize position in meters around origin (0,0)
    const spawnRadiusMeters = 10;
    player.x = (Math.random() * 2 - 1) * spawnRadiusMeters;
    player.y = (Math.random() * 2 - 1) * spawnRadiusMeters;
    player.heading = 0; // Pointing East initially
    player.team = (this.state.players.size % 2 === 0) ? 'blue' : 'red';

    this.state.players.set(client.sessionId, player);
    this.playerInputs.set(client.sessionId, { dx: 0, dy: 0 });
    this.playerVelocities.set(client.sessionId, { vx: 0, vy: 0 }); // Velocity in m/s

    console.log(`=> Player ${player.name} (${player.team}) added at (${player.x.toFixed(1)}, ${player.y.toFixed(1)}) meters`);
  }

  // Called when a client leaves the room
  onLeave (client: Client, consented: boolean) {
    console.log(`[ArenaRoom] Client left: ${client.sessionId}`, consented ? "(consented)" : "(unexpected)");
    const player = this.state.players.get(client.sessionId);
    if (player) {
        console.log(`=> Player ${player.name} removed.`);
        this.state.players.delete(client.sessionId);
        this.playerInputs.delete(client.sessionId); // Clean up input map
        this.playerVelocities.delete(client.sessionId); // Clean up velocity map
    } else {
        console.log(`=> Player state for ${client.sessionId} not found.`);
    }
  }

  // Game loop update function (server-authoritative)
  update(dt: number) {
    if (dt > 0.1) {
        console.warn(`Large delta time detected: ${dt.toFixed(3)}s. Skipping frame.`);
        return; // Skip update if delta time is too large (e.g., server hiccup)
    }

    this.state.players.forEach((player, sessionId) => {
      const input = this.playerInputs.get(sessionId) || { dx: 0, dy: 0 };
      const velocity = this.playerVelocities.get(sessionId) || { vx: 0, vy: 0 };

      // Client input: dx = screen right (+1) / left (-1)
      //               dy = screen DOWN (+1) / UP (-1)
      // World axes: vx = East (+)
      //             vy = North (+)
      const inputDirX = input.dx;
      const inputDirY = input.dy;

      let magnitude = Math.sqrt(inputDirX * inputDirX + inputDirY * inputDirY);
      let targetWorldDirX = 0;
      let targetWorldDirY = 0;
      if (magnitude > 0) {
        // Normalize input vector
        targetWorldDirX = inputDirX / magnitude;
        // Invert Y axis: Client Down (+dy) should be World South (-vy)
        //                Client Up   (-dy) should be World North (+vy)
        targetWorldDirY = -inputDirY / magnitude;
      }

      // --- Movement Logic (Meters) ---
      const targetVelX = targetWorldDirX * MAX_SPEED_WORLD;
      const targetVelY = targetWorldDirY * MAX_SPEED_WORLD;
      const accelFactor = Math.min(ACCEL_RATE_WORLD * dt, 1.0);

      velocity.vx = lerp(velocity.vx, targetVelX, accelFactor);
      velocity.vy = lerp(velocity.vy, targetVelY, accelFactor);

      // --- Update Position State (Meters) ---
      if (isFinite(velocity.vx) && isFinite(velocity.vy)) {
        player.x += velocity.vx * dt;
        player.y += velocity.vy * dt;
      } else {
        console.warn(`[${sessionId}] Invalid velocity (vx:${velocity.vx}, vy:${velocity.vy}), skipping position update.`);
        velocity.vx = 0; // Reset velocity if invalid
        velocity.vy = 0;
      }

      // --- Rotation Logic (Radians relative to East) ---
      let targetHeading = player.heading;
      // Only update target heading if actively moving
      if (targetWorldDirX !== 0 || targetWorldDirY !== 0) {
        targetHeading = Math.atan2(targetWorldDirY, targetWorldDirX);
      }

      if (isFinite(targetHeading)) {
          const turnFactor = Math.min(TURN_SMOOTH_WORLD * dt, 1.0);
          player.heading = angleLerp(player.heading, targetHeading, turnFactor);
      } else {
          console.warn(`[${sessionId}] Invalid targetHeading (${targetHeading}) for player ${sessionId}, skipping rotation update.`);
      }

      // Store updated velocity back
      this.playerVelocities.set(sessionId, velocity);
    });
  }

  // Called when the room is about to be destroyed
  onDispose() {
    console.log("[ArenaRoom] Room disposing...");
    // Cleanup if needed
  }

}
