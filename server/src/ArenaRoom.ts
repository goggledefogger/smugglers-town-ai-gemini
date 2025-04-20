import { Room, Client } from "@colyseus/core";
import { ArenaState, Player, FlagState } from "./schemas/ArenaState";

// Constants for server-side physics (world units = meters)
const MAX_SPEED_WORLD = 200; // m/s (~720 kph / 450 mph)
const ACCEL_RATE_WORLD = 15; // Factor per second - Reduced for smooth lerp!
const TURN_SMOOTH_WORLD = 12; // Factor per second
const DRAG_FACTOR = 0.1; // Coefficient for linear drag (higher = more drag)

// Game Logic Constants
const PICKUP_RADIUS = 30; // Meters (Increased)
const PICKUP_RADIUS_SQ = PICKUP_RADIUS * PICKUP_RADIUS; // Use squared distance for efficiency
const PLAYER_COLLISION_RADIUS = 25; // Meters (for stealing)
const PLAYER_COLLISION_RADIUS_SQ = PLAYER_COLLISION_RADIUS * PLAYER_COLLISION_RADIUS;
const BASE_RADIUS = 40; // Meters (for scoring)
const BASE_RADIUS_SQ = BASE_RADIUS * BASE_RADIUS;
const SPAWN_RADIUS = 10; // Max distance from origin (0,0) for player spawn

// World Positions
const BASE_DISTANCE = 150; // Meters from origin along X axis
const Y_OFFSET = 5; // Small vertical offset from center line
const ITEM_START_POS = { x: 0, y: 0 }; // Place item at the origin
const RED_BASE_POS = { x: -BASE_DISTANCE, y: Y_OFFSET };
const BLUE_BASE_POS = { x: BASE_DISTANCE, y: -Y_OFFSET };

// Helper function (can be moved to shared location)
function lerp(start: number, end: number, factor: number): number {
  return start + factor * (end - start);
}

function angleLerp(startAngle: number, endAngle: number, factor: number): number {
  const delta = endAngle - startAngle;
  const shortestAngle = ((delta + Math.PI) % (2 * Math.PI)) - Math.PI;
  return startAngle + factor * shortestAngle;
}

// Helper to check distance squared
function distSq(x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return dx * dx + dy * dy;
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
    this.state.redScore = 0;
    this.state.blueScore = 0;

    // Initialize Single Generic Item
    this.state.item.status = "atBase"; // Use "atBase" to mean available at spawn
    this.state.item.x = ITEM_START_POS.x;
    this.state.item.y = ITEM_START_POS.y;
    this.state.item.carrierId = null;
    console.log(`Initialized item at (${this.state.item.x}, ${this.state.item.y})`);

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

    const leavingPlayer = this.state.players.get(client.sessionId);

    // --- Check if leaving player was carrying the item ---
    if (this.state.item.carrierId === client.sessionId) {
        if (leavingPlayer) {
            console.log(`[${client.sessionId}] Player was carrying the item. Dropping at (${leavingPlayer.x.toFixed(1)}, ${leavingPlayer.y.toFixed(1)})`);
            this.state.item.status = 'dropped';
            this.state.item.x = leavingPlayer.x; // Drop at last known position
            this.state.item.y = leavingPlayer.y;
            this.state.item.carrierId = null;
        } else {
            console.warn(`[${client.sessionId}] Carrier left but player state not found? Resetting item.`);
            this.resetItem();
        }
    }
    // ----------------------------------------------------

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

    // Remove player state
    if (leavingPlayer) {
        console.log(`=> Player ${leavingPlayer.name} (${leavingPlayer.team}) removed state.`);
        this.state.players.delete(client.sessionId);
        this.playerInputs.delete(client.sessionId);
        this.playerVelocities.delete(client.sessionId);
    } else {
        console.warn(`=> Player state for ${client.sessionId} already removed?`);
    }
  }

  // Helper to reset the item to its base
  resetItem() {
      console.log(`Resetting Item to base.`);
      this.state.item.status = 'atBase';
      this.state.item.x = ITEM_START_POS.x;
      this.state.item.y = ITEM_START_POS.y;
      this.state.item.carrierId = null;
  }

  // Game loop update function (server-authoritative)
  update(dt: number) {
    if (dt > 0.1) {
        console.warn(`Large delta time detected: ${dt.toFixed(3)}s. Skipping frame.`);
        return; // Skip update if delta time is too large (e.g., server hiccup)
    }

    const playerIds = Array.from(this.state.players.keys());

    // --- Update Player Movement and State ---
    playerIds.forEach((sessionId, index) => {
        const player = this.state.players.get(sessionId)!; // Assume player exists
        // --- Movement Logic --- (copied from previous, should be fine)
        const retrievedInput = this.playerInputs.get(sessionId);
        const input = retrievedInput || { dx: 0, dy: 0 };
        let velocity = this.playerVelocities.get(sessionId);
        if (!velocity) {
            velocity = { vx: 0, vy: 0 };
            this.playerVelocities.set(sessionId, velocity);
        }
        const inputDirX = input.dx;
        const inputDirY = input.dy;
        let magnitude = Math.sqrt(inputDirX * inputDirX + inputDirY * inputDirY);
        let targetWorldDirX = 0;
        let targetWorldDirY = 0;
        if (magnitude > 0) {
            targetWorldDirX = inputDirX / magnitude;
            targetWorldDirY = -inputDirY / magnitude;
        }
        const dragFactor = 1.0 - Math.min(DRAG_FACTOR * dt, 1.0);
        velocity.vx *= dragFactor;
        velocity.vy *= dragFactor;
        const targetVelX = targetWorldDirX * MAX_SPEED_WORLD;
        const targetVelY = targetWorldDirY * MAX_SPEED_WORLD;
        const accelFactor = Math.min(ACCEL_RATE_WORLD * dt, 1.0);
        velocity.vx = lerp(velocity.vx, targetVelX, accelFactor);
        velocity.vy = lerp(velocity.vy, targetVelY, accelFactor);
        if (isFinite(velocity.vx) && isFinite(velocity.vy)) {
            player.x += velocity.vx * dt;
            player.y += velocity.vy * dt;
        } else {
            console.warn(`[${sessionId}] Invalid velocity (vx:${velocity.vx}, vy:${velocity.vy}), skipping position update.`);
            velocity.vx = 0; velocity.vy = 0;
        }
        let targetHeading = player.heading;
        if (targetWorldDirX !== 0 || targetWorldDirY !== 0) {
            targetHeading = Math.atan2(targetWorldDirY, targetWorldDirX);
        }
        if (isFinite(targetHeading)) {
            const turnFactor = Math.min(TURN_SMOOTH_WORLD * dt, 1.0);
            player.heading = angleLerp(player.heading, targetHeading, turnFactor);
        } else {
            console.warn(`[${sessionId}] Invalid targetHeading (${targetHeading}) for player ${sessionId}, skipping rotation update.`);
        }
        // --- End Movement Logic ---

        // --- Collision Checks for this player ---
        const item = this.state.item; // Reference the single item
        let isCarryingItem = item.carrierId === sessionId;

        // 1. Item Pickup Check
        if (!isCarryingItem && (item.status === 'atBase' || item.status === 'dropped')) {
            const dSq = distSq(player.x, player.y, item.x, item.y);
            if (dSq <= PICKUP_RADIUS_SQ) {
                console.log(`[${sessionId}] Player ${player.name} picked up the item!`);
                item.status = "carried";
                item.carrierId = sessionId;
                item.x = NaN;
                item.y = NaN;
                // No break needed as there's only one item
            }
        }

        // 2. Player-Player Collision (Stealing Check)
        if (isCarryingItem) {
             for (let j = index + 1; j < playerIds.length; j++) {
                 const otherPlayerId = playerIds[j];
                 const otherPlayer = this.state.players.get(otherPlayerId)!;

                 // Check if they are opponents and colliding
                 if (player.team !== otherPlayer.team) {
                     const dSq = distSq(player.x, player.y, otherPlayer.x, otherPlayer.y);
                     if (dSq <= PLAYER_COLLISION_RADIUS_SQ) {
                         console.log(`[${otherPlayerId}] Player ${otherPlayer.name} (${otherPlayer.team}) STOLE item from [${sessionId}] Player ${player.name} (${player.team})!`);
                         item.carrierId = otherPlayerId; // Transfer item carrier
                         isCarryingItem = false; // Current player is no longer carrying
                         break; // Steal happened, move to next player's collision checks
                     }
                 }
             }
        }

        // 3. Base Collision (Scoring Check)
        if (isCarryingItem) {
            let targetBasePos = null;

            // Player scores by bringing the item to THEIR base
            if (player.team === 'Red') { targetBasePos = RED_BASE_POS; }
            else if (player.team === 'Blue') { targetBasePos = BLUE_BASE_POS; }

            if (targetBasePos) {
                 const dSq = distSq(player.x, player.y, targetBasePos.x, targetBasePos.y);
                 if (dSq <= BASE_RADIUS_SQ) {
                     console.log(`[${sessionId}] Player ${player.name} (${player.team}) SCORED with the item!`);
                     // Increment score
                     if (player.team === 'Red') this.state.redScore++;
                     else this.state.blueScore++;
                     console.log(`Scores: Red ${this.state.redScore} - Blue ${this.state.blueScore}`);
                     // Reset the item
                     this.resetItem();
                     isCarryingItem = false; // Player no longer carrying
                 }
            }
        }
        // --- End Collision Checks ---

    }); // End player loop

    // --- Update Carried Item Position ---
    const item = this.state.item;
    if (item.status === 'carried' && item.carrierId) {
        const carrier = this.state.players.get(item.carrierId);
        if (carrier) {
            item.x = carrier.x;
            item.y = carrier.y;
        } else {
            // Carrier disconnected - reset item as fallback
            console.warn(`Carrier ${item.carrierId} not found during item position update. Resetting item.`);
            this.resetItem();
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
