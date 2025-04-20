import { Room, Client } from "@colyseus/core";
import { ArenaState, Player } from "./schemas/ArenaState";

// Constants for server-side physics (world units = meters)
const MAX_SPEED_WORLD = 200; // m/s (~720 kph / 450 mph)
const ACCEL_RATE_WORLD = 15; // Factor per second - Reduced for smooth lerp!
const TURN_SMOOTH_WORLD = 12; // Factor per second
const DRAG_FACTOR = 0.1; // Coefficient for linear drag (higher = more drag)
const PICKUP_RADIUS = 30; // Meters (Increased)
const PICKUP_RADIUS_SQ = PICKUP_RADIUS * PICKUP_RADIUS; // Use squared distance for efficiency
const SPAWN_RADIUS = 10; // Max distance from origin (0,0) for player spawn

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

  // Maps for persistent identity and team tracking
  private persistentIdToSessionId = new Map<string, string>();
  private persistentIdToTeam = new Map<string, string>();

  // Called when the room is created
  onCreate (options: any) {
    console.log("[ArenaRoom] Room created with options:", options);

    // Set the initial state
    this.setState(new ArenaState());
    // Initialize scores explicitly (though default is 0)
    this.state.redScore = 0;
    this.state.blueScore = 0;

    // Initialize Flags
    const baseDistance = 150; // Meters from origin along X axis
    const yOffset = 5; // Small vertical offset from center line
    // Red Flag (belongs to Red team, starts at Red base on -X axis)
    this.state.redFlag.team = "Red";
    this.state.redFlag.status = "atBase";
    this.state.redFlag.x = -baseDistance;
    this.state.redFlag.y = yOffset;
    this.state.redFlag.carrierId = null;
    // Blue Flag (belongs to Blue team, starts at Blue base on +X axis)
    this.state.blueFlag.team = "Blue";
    this.state.blueFlag.status = "atBase";
    this.state.blueFlag.x = baseDistance;
    this.state.blueFlag.y = -yOffset; // Offset in opposite direction for symmetry
    this.state.blueFlag.carrierId = null;
    console.log(`Initialized flags: Red at (${this.state.redFlag.x}, ${this.state.redFlag.y}), Blue at (${this.state.blueFlag.x}, ${this.state.blueFlag.y})`);

    // --- Message Handler for Input ---
    this.onMessage("input", (client, message: { dx: number, dy: number }) => {
      // Log received input // COMMENT OUT
      // if (message.dx !== 0 || message.dy !== 0) {
      //   console.log(`[${client.sessionId}] Received Input: dx=${message.dx}, dy=${message.dy}`);
      // }
      this.playerInputs.set(client.sessionId, { dx: message.dx, dy: message.dy });
    });

    // Set up the main game loop (target 60Hz)
    this.setSimulationInterval((deltaTime) => this.update(deltaTime / 1000), 1000 / 60); // ~16.6ms interval
  }

  // Called when a client joins the room
  onJoin (client: Client, options: any) {
    console.log(`[${client.sessionId}] Client joining... Options:`, options);

    // --- Persistent ID (Tab ID) and Team Assignment ---
    const tabId = options?.persistentPlayerId; // Renamed variable locally for clarity
    let assignedTeam = "Red"; // Default team
    let isReturningPlayer = false;
    // Removed: let hadSessionConflict = false;

    if (!tabId) {
        console.warn(`[${client.sessionId}] Client joined without tabId! Assigning team based on balance.`);
        // Assign based on current balance if no persistent ID
        let redCount = 0, blueCount = 0;
        this.state.players.forEach(p => { p.team === 'Red' ? redCount++ : p.team === 'Blue' ? blueCount++ : null; });
        assignedTeam = (redCount <= blueCount) ? 'Red' : 'Blue';
        console.log(`[${client.sessionId}] No TabId. Assigning team based on balance (R:${redCount}, B:${blueCount}): ${assignedTeam}`);
    } else {
        // --- Check if this tabId has a team stored (handles refresh) ---
        if (this.persistentIdToTeam.has(tabId)) {
            assignedTeam = this.persistentIdToTeam.get(tabId)!;
            isReturningPlayer = true; // It's returning *for this tab session*
            console.log(`[${client.sessionId}] Returning tab session detected (TabId: ${tabId}). Rejoining team: ${assignedTeam}`);
        } else {
            // --- New tab session: Assign based on balance and store ---
            let redCount = 0, blueCount = 0;
            this.state.players.forEach(p => { p.team === 'Red' ? redCount++ : p.team === 'Blue' ? blueCount++ : null; });
            assignedTeam = (redCount <= blueCount) ? 'Red' : 'Blue';
            console.log(`[${client.sessionId}] New TabId. Assigning team based on balance (R:${redCount}, B:${blueCount}): ${assignedTeam}`);
            this.persistentIdToTeam.set(tabId, assignedTeam);
            console.log(`[${client.sessionId}] Stored team assignment (${assignedTeam}) for new TabId: ${tabId}`);
        }

        // --- Always update the active session mapping for this tabId ---
        this.persistentIdToSessionId.set(tabId, client.sessionId);
        console.log(`[${client.sessionId}] Updated active session map for TabId ${tabId} to SessionId ${client.sessionId}`);
    }
    // -----------------------------------------

    // Create Player instance
    const player = new Player();
    player.name = `Player ${client.sessionId.substring(0, 3)}`;
    // Spawn player randomly within SPAWN_RADIUS of origin
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * SPAWN_RADIUS;
    player.x = Math.cos(angle) * radius;
    player.y = Math.sin(angle) * radius;
    player.heading = 0;
    player.team = assignedTeam; // Use the determined team

    console.log(`[${client.sessionId}] Final assigned team for player object: ${assignedTeam}`);

    this.state.players.set(client.sessionId, player);
    this.playerInputs.set(client.sessionId, { dx: 0, dy: 0 });
    this.playerVelocities.set(client.sessionId, { vx: 0, vy: 0 });

    console.log(`=> Player ${player.name} (${player.team}) added at (${player.x.toFixed(1)}, ${player.y.toFixed(1)}) meters. SessionId: ${client.sessionId}.`);
  }

  // Called when a client leaves the room
  onLeave (client: Client, consented: boolean) {
    console.log(`[${client.sessionId}] Client leaving... Consented: ${consented}`);

    // --- Persistent ID (Tab ID) Cleanup ---
    let tabId: string | undefined = undefined;
    // Find tabId associated with this sessionId
    for (const [pid, sid] of this.persistentIdToSessionId.entries()) {
        if (sid === client.sessionId) {
            tabId = pid;
            break;
        }
    }

    if (tabId) {
        this.persistentIdToSessionId.delete(tabId);
        // Note: We KEEP the entry in persistentIdToTeam to handle refreshes.
        // It becomes orphaned only when the tab session actually ends (tab closed).
        console.log(`[${client.sessionId}] Removed sessionId mapping for TabId: ${tabId}. Team assignment (${this.persistentIdToTeam.get(tabId)}) is kept for potential refresh.`);
    } else {
        console.warn(`[${client.sessionId}] Could not find TabId for leaving client.`);
    }
    // ---------------------------

    const player = this.state.players.get(client.sessionId);
    if (player) {
        console.log(`=> Player ${player.name} (${player.team}) removed state.`);
        this.state.players.delete(client.sessionId);
        this.playerInputs.delete(client.sessionId);
        this.playerVelocities.delete(client.sessionId);
    } else {
        console.warn(`=> Player state for ${client.sessionId} already removed?`);
    }
  }

  // Game loop update function (server-authoritative)
  update(dt: number) {
    if (dt > 0.1) {
        console.warn(`Large delta time detected: ${dt.toFixed(3)}s. Skipping frame.`);
        return; // Skip update if delta time is too large (e.g., server hiccup)
    }

    this.state.players.forEach((player, sessionId) => {
      // Explicitly get input and log retrieval
      const retrievedInput = this.playerInputs.get(sessionId);
      // --- Log Raw Retrieved Input --- // COMMENT OUT
      // console.log(`[${sessionId}] Update Loop - Raw retrieved input: ${JSON.stringify(retrievedInput)}`);
      // -------------------------------
      const input = retrievedInput || { dx: 0, dy: 0 };
      // --- Log Final Input Used --- // COMMENT OUT
      // if (input.dx !== 0 || input.dy !== 0) {
      //     console.log(`[${sessionId}] Update Loop - Final input used: dx=${input.dx}, dy=${input.dy}`);
      // }
      // --------------------------

      // --- Get or Initialize Velocity Object ---
      let velocity = this.playerVelocities.get(sessionId);
      if (!velocity) {
          velocity = { vx: 0, vy: 0 };
          this.playerVelocities.set(sessionId, velocity);
      }
      // ----------------------------------------

      // --- Log Retrieved Input (already exists) --- // COMMENTED OUT
      // if (input.dx !== 0 || input.dy !== 0) {
      //     console.log(`[${sessionId}] Update Loop - Final input used: dx=${input.dx}, dy=${input.dy}`);
      // }
      // -------------------------

      // Client input: dx = screen right (+1) / left (-1)
      //               dy = screen DOWN (+1) / UP (-1)
      // World axes: vx = East (+)
      //             vy = North (+)
      const inputDirX = input.dx;
      const inputDirY = input.dy;

      // --- Log Input used for Magnitude ---
      // console.log(`[${sessionId}] Update Loop - Input values for magnitude calc: inputDirX=${inputDirX}, inputDirY=${inputDirY}`); // COMMENTED OUT
      // ----------------------------------

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
      // --- Log Target Direction --- // COMMENTED OUT
      // console.log(`[${sessionId}] Calculated Target Direction: X=${targetWorldDirX.toFixed(2)}, Y=${targetWorldDirY.toFixed(2)} (from input: dx=${input.dx}, dy=${input.dy})`);
      // --------------------------

      // --- Movement Logic (Meters) ---
      // Apply drag first (proportional to current velocity)
      const dragFactor = 1.0 - Math.min(DRAG_FACTOR * dt, 1.0); // Ensure drag doesn't reverse velocity
      // Directly modify the velocity object from the map
      velocity.vx *= dragFactor;
      velocity.vy *= dragFactor;

      // Calculate target velocity based on input
      const targetVelX = targetWorldDirX * MAX_SPEED_WORLD;
      const targetVelY = targetWorldDirY * MAX_SPEED_WORLD;
      // --- Log Target Velocity --- // COMMENTED OUT
      // console.log(`[${sessionId}] Calculated Target Velocity: X=${targetVelX.toFixed(1)}, Y=${targetVelY.toFixed(1)}`);
      // --------------------------
      const accelFactor = Math.min(ACCEL_RATE_WORLD * dt, 1.0);

      // Apply acceleration using lerp, directly modifying the velocity object
      velocity.vx = lerp(velocity.vx, targetVelX, accelFactor);
      velocity.vy = lerp(velocity.vy, targetVelY, accelFactor);

      // --- Log Velocities --- // COMMENT OUT
      // console.log(`[${sessionId}] Updated Velocity: vx=${velocity.vx.toFixed(1)}, vy=${velocity.vy.toFixed(1)}`);
      // --------------------

      // --- Update Position State (Meters) ---
      if (isFinite(velocity.vx) && isFinite(velocity.vy)) {
        player.x += velocity.vx * dt;
        player.y += velocity.vy * dt;
        // --- Log Position Update --- // COMMENT OUT
        // console.log(`[${sessionId}] New Position: x=${player.x.toFixed(1)}, y=${player.y.toFixed(1)}`);
        // -------------------------
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

      // --- Flag Pickup Collision Check --- // RE-ENABLE LOGGING // Log only on actual pickup
      const isCarryingFlag = this.state.redFlag.carrierId === sessionId || this.state.blueFlag.carrierId === sessionId;
      // console.log(`[${sessionId}] Update: Player Pos (${player.x.toFixed(1)}, ${player.y.toFixed(1)}), Carrying: ${isCarryingFlag}`);

      if (!isCarryingFlag) {
        // Iterate through both flags to check for pickup
        const flagsToCheck = [this.state.redFlag, this.state.blueFlag];
        for (const flag of flagsToCheck) {
             // Check if this flag is available for pickup
            // console.log(`[${sessionId}] Checking Flag: ${flag.team}, Status: ${flag.status}, Pos: (${flag.x?.toFixed(1)}, ${flag.y?.toFixed(1)})`);
            if (flag && (flag.status === 'atBase' || flag.status === 'dropped')) {
                // Check distance
                const dx = flag.x - player.x;
                const dy = flag.y - player.y;
                const distSq = dx * dx + dy * dy;
                const isInRange = distSq <= PICKUP_RADIUS_SQ;

                // --- DETAILED LOGGING --- // COMMENT OUT
/*
                console.log(`[${sessionId}] Pickup Check vs ${flag.team} Flag:
  Player Pos: (${player.x.toFixed(1)}, ${player.y.toFixed(1)})
  Flag Status: ${flag.status}
  Flag Pos: (${flag.x.toFixed(1)}, ${flag.y.toFixed(1)})
  DistanceSq: ${distSq.toFixed(1)} (RadiusSq: ${PICKUP_RADIUS_SQ})
  In Range: ${isInRange}`);
*/
                // --- END LOGGING ---

                if (isInRange) {
                    console.log(`[${sessionId}] Player ${player.name} COLLIDED with and picked up ${flag.team} flag!`); // KEEP THIS LOG
                    flag.status = "carried";
                    flag.carrierId = sessionId;
                    flag.x = NaN; // Position irrelevant while carried
                    flag.y = NaN;
                    // Optionally set player.hasFlag = flag.team here if added to Player schema
                    break; // Exit flag check loop after successful pickup
                }
            }
        }
      }
      // --- End Flag Pickup Check --- //

    }); // End player loop

    // --- Update Carried Flag Positions ---
    const flagsToUpdate = [this.state.redFlag, this.state.blueFlag];
    for (const flag of flagsToUpdate) {
        if (flag.status === 'carried' && flag.carrierId) {
            const carrier = this.state.players.get(flag.carrierId);
            if (carrier) {
                // Update flag position to match carrier
                flag.x = carrier.x;
                flag.y = carrier.y;
            } else {
                // Carrier disconnected or doesn't exist? Drop the flag.
                console.warn(`Carrier ${flag.carrierId} not found for flag ${flag.team}. Dropping flag.`);
                flag.status = 'dropped';
                // Keep flag.x/y as they were (last known position)
                flag.carrierId = null;
            }
        }
    }
    // -----------------------------------

  } // End update function

  // Called when the room is about to be destroyed
  onDispose() {
    console.log("[ArenaRoom] Room disposing...");
    // Cleanup if needed
  }

}
