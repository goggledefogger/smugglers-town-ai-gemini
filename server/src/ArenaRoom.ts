import { Room, Client } from "@colyseus/core";
import { ArenaState, Player, FlagState } from "./schemas/ArenaState";

// Constants for server-side physics (world units = meters)
const MAX_SPEED_WORLD = 200; // m/s (~720 kph / 450 mph)
const ACCEL_RATE_WORLD = 15; // Factor per second - Reduced for smooth lerp!
const TURN_SMOOTH_WORLD = 12; // Factor per second
const DRAG_FACTOR = 0.1; // Coefficient for linear drag (higher = more drag)

// AI Movement Modifiers
const AI_SPEED_MULTIPLIER = 0.9; // AI max speed is 90% of human
const AI_ACCEL_MULTIPLIER = 0.85; // AI acceleration is 85% of human

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
const STEAL_COOLDOWN_MS = 1500; // Cooldown in milliseconds after a steal (Increased from 500)
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
  // Store AI player session IDs
  private aiPlayers = new Set<string>();

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
    const isFirstPlayer = this.state.players.size === 0;

    // --- Persistent ID (Tab ID) and Team Assignment for HUMAN player ---
    const tabId = options?.persistentPlayerId;
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

    // Create HUMAN Player instance
    const humanPlayer = new Player();
    humanPlayer.name = `Player ${client.sessionId.substring(0, 3)}`;
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * SPAWN_RADIUS;
    humanPlayer.x = Math.cos(angle) * radius;
    humanPlayer.y = Math.sin(angle) * radius;
    humanPlayer.heading = 0;
    humanPlayer.team = assignedTeam; // Use the determined team for the human
    console.log(`[${client.sessionId}] Final assigned team for HUMAN player object: ${assignedTeam}`);
    this.state.players.set(client.sessionId, humanPlayer);
    this.playerInputs.set(client.sessionId, { dx: 0, dy: 0 });
    this.playerVelocities.set(client.sessionId, { vx: 0, vy: 0 });
    console.log(`=> Player ${humanPlayer.name} (${humanPlayer.team}) added at (${humanPlayer.x.toFixed(1)}, ${humanPlayer.y.toFixed(1)}) meters. SessionId: ${client.sessionId}.`);

    // --- Spawn AI Opponent if this is the first player ---
    if (isFirstPlayer) {
        console.log("First human player joined, spawning AI opponent...");
        const aiSessionId = "ai_1"; // Simple ID for now
        const aiTeam = assignedTeam === "Red" ? "Blue" : "Red"; // Assign opposite team
        const aiPlayer = new Player();
        aiPlayer.name = "Bot (Easy)";
        const aiAngle = Math.random() * Math.PI * 2;
        const aiRadius = Math.random() * SPAWN_RADIUS;
        aiPlayer.x = Math.cos(aiAngle) * aiRadius;
        aiPlayer.y = Math.sin(aiAngle) * aiRadius;
        aiPlayer.heading = 0;
        aiPlayer.team = aiTeam;

        this.state.players.set(aiSessionId, aiPlayer);
        this.playerInputs.set(aiSessionId, { dx: 0, dy: 0 }); // Initialize AI input
        this.playerVelocities.set(aiSessionId, { vx: 0, vy: 0 }); // Initialize AI velocity
        this.aiPlayers.add(aiSessionId); // Track this as an AI player
        console.log(`=> AI Player ${aiPlayer.name} (${aiPlayer.team}) added at (${aiPlayer.x.toFixed(1)}, ${aiPlayer.y.toFixed(1)}) meters. SessionId: ${aiSessionId}.`);
    }
    // ----------------------------------------------------
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

    // Remove human player state
    if (leavingPlayer) {
        console.log(`=> Player ${leavingPlayer.name} (${leavingPlayer.team}) removed state.`);
        this.state.players.delete(client.sessionId);
        this.playerInputs.delete(client.sessionId);
        this.playerVelocities.delete(client.sessionId);
    } else {
        console.warn(`=> Player state for ${client.sessionId} already removed?`);
    }

    // --- Check if last HUMAN player left, if so, remove AI ---
    // Count remaining human players
    let humanPlayerCount = 0;
    this.state.players.forEach((player, sessionId) => {
        if (!this.aiPlayers.has(sessionId)) { // Check if it's NOT an AI
            humanPlayerCount++;
        }
    });

    if (humanPlayerCount === 0 && this.aiPlayers.size > 0) {
        console.log("Last human player left. Removing AI players...");
        this.aiPlayers.forEach(aiSessionId => {
             const aiPlayer = this.state.players.get(aiSessionId);
             if (aiPlayer) {
                console.log(`=> Removing AI ${aiPlayer.name} (${aiSessionId})`);
                // Check if AI was carrying item
                if (this.state.item.carrierId === aiSessionId) {
                    console.log(`AI ${aiSessionId} was carrying item. Resetting item.`);
                    this.resetItem();
                }
                // Remove AI state
                this.state.players.delete(aiSessionId);
                this.playerInputs.delete(aiSessionId);
                this.playerVelocities.delete(aiSessionId);
             }
        });
        this.aiPlayers.clear(); // Clear the AI tracking set
    }
    // ---------------------------------------------------------
  }

  // Helper to reset the item to its base
  resetItem() {
      console.log(`Resetting Item to base.`);
      this.state.item.status = 'atBase';
      this.state.item.x = ITEM_START_POS.x;
      this.state.item.y = ITEM_START_POS.y;
      this.state.item.carrierId = null;
      this.state.item.lastStealTimestamp = 0; // Reset cooldown timer
  }

  // Game loop update function (server-authoritative)
  update(dt: number) {
    if (dt > 0.1) {
        console.warn(`Large delta time detected: ${dt.toFixed(3)}s. Skipping frame.`);
        return; // Skip update if delta time is too large (e.g., server hiccup)
    }

    const playerIds = Array.from(this.state.players.keys());

    // --- Basic AI Input Simulation ---
    this.aiPlayers.forEach(aiSessionId => {
        const aiPlayer = this.state.players.get(aiSessionId);
        let velocity = this.playerVelocities.get(aiSessionId); // Get AI's current velocity

        if (!aiPlayer || !velocity) { // Ensure player and velocity map entry exist
            console.warn(`AI player or velocity not found for ${aiSessionId} during update.`);
            // If velocity missing, initialize it
            if (aiPlayer && !velocity) {
                velocity = { vx: 0, vy: 0 };
                this.playerVelocities.set(aiSessionId, velocity);
            } else {
                 return; // Skip if player state is inconsistent
            }
        }

        let targetX = 0;
        let targetY = 0;
        let targetFound = false;

        // Decide target based on whether AI carries the item
        if (this.state.item.carrierId === aiSessionId) {
            // AI has the item, target its own base
            targetX = aiPlayer.team === "Red" ? RED_BASE_POS.x : BLUE_BASE_POS.x;
            targetY = aiPlayer.team === "Red" ? RED_BASE_POS.y : BLUE_BASE_POS.y;
            targetFound = true;
        } else if (this.state.item.carrierId === null || this.state.item.carrierId === undefined) {
            // Item is available, target the item
            targetX = this.state.item.x;
            targetY = this.state.item.y;
            targetFound = true;
        } else {
            // --- Item is carried by someone else: Target the opponent carrier ---
            const carrierId = this.state.item.carrierId;
            if (carrierId) { // Check if carrierId is actually set
                const carrier = this.state.players.get(carrierId);
                // Check if carrier exists AND is on the opposing team
                if (carrier && carrier.team !== aiPlayer.team) {
                    targetX = carrier.x;
                    targetY = carrier.y;
                    targetFound = true;
                    // console.log(`[${aiSessionId}] AI targeting opponent carrier ${carrierId} at (${targetX.toFixed(1)}, ${targetY.toFixed(1)})`); // Optional debug log
                } else {
                    // Carrier is on the same team or doesn't exist, AI should idle
                    targetFound = false;
                    // console.log(`[${aiSessionId}] AI idling (carrier ${carrierId} is friendly or missing)`); // Optional debug log
                }
            } else {
                 // Should not happen if status is 'carried', but handle defensively
                 targetFound = false;
                 console.warn(`[${aiSessionId}] Item status is 'carried' but carrierId is null/undefined?`);
            }
            // ---------------------------------------------------------------------
        }

        // Calculate desired velocity towards target
        let targetVelX = 0;
        let targetVelY = 0;
        let targetWorldDirX = 0; // For heading calculation
        let targetWorldDirY = 0; // For heading calculation

        if (targetFound) {
            const dirX = targetX - aiPlayer.x;
            const dirY = targetY - aiPlayer.y;
            const dist = Math.sqrt(dirX * dirX + dirY * dirY);

            if (dist > 0.1) { // Add a small threshold to prevent jittering at the target
                targetWorldDirX = dirX / dist; // Normalized direction
                targetWorldDirY = dirY / dist;
                // Apply AI speed modifier
                targetVelX = targetWorldDirX * MAX_SPEED_WORLD * AI_SPEED_MULTIPLIER;
                targetVelY = targetWorldDirY * MAX_SPEED_WORLD * AI_SPEED_MULTIPLIER;
            } // else: Target velocity remains 0 if close enough
        } // else: Target velocity remains 0 if no target (idle)

        // Apply Drag (Always apply drag first)
        const dragFactor = 1.0 - Math.min(DRAG_FACTOR * dt, 1.0);
        velocity.vx *= dragFactor;
        velocity.vy *= dragFactor;

        // Apply Acceleration towards target velocity (Lerp)
        // Apply AI acceleration modifier
        const aiAccelRate = ACCEL_RATE_WORLD * AI_ACCEL_MULTIPLIER;
        const accelFactor = Math.min(aiAccelRate * dt, 1.0);
        velocity.vx = lerp(velocity.vx, targetVelX, accelFactor);
        velocity.vy = lerp(velocity.vy, targetVelY, accelFactor);

        // --- Update AI Position ---
        if (isFinite(velocity.vx) && isFinite(velocity.vy)) {
            aiPlayer.x += velocity.vx * dt;
            aiPlayer.y += velocity.vy * dt;
        } else {
            console.warn(`[${aiSessionId}] Invalid AI velocity (vx:${velocity.vx}, vy:${velocity.vy}), skipping position update.`);
            velocity.vx = 0; velocity.vy = 0;
        }

        // --- Update AI Heading ---
        let targetHeading = aiPlayer.heading;
        // Use targetWorldDir calculated earlier for heading if moving
        if (targetWorldDirX !== 0 || targetWorldDirY !== 0) {
            targetHeading = Math.atan2(targetWorldDirY, targetWorldDirX);
        } // else keep current heading if targetVel is 0

        if (isFinite(targetHeading)) {
            const turnFactor = Math.min(TURN_SMOOTH_WORLD * dt, 1.0);
            aiPlayer.heading = angleLerp(aiPlayer.heading, targetHeading, turnFactor);
        } else {
            console.warn(`[${aiSessionId}] Invalid targetHeading (${targetHeading}) for AI ${aiSessionId}, skipping rotation update.`);
        }

    });
    // -------------------------------

    // --- Update Player Movement and State ---
    // Filter out AI players before processing human inputs
    const humanPlayerIds = playerIds.filter(id => !this.aiPlayers.has(id));

    humanPlayerIds.forEach((sessionId, index) => { // Iterate only over human players now
        const player = this.state.players.get(sessionId)!; // Assume player exists
        // --- Movement Logic --- (Only for HUMAN players)
        const retrievedInput = this.playerInputs.get(sessionId); // Get HUMAN input
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
        const isCarryingItem = item.carrierId === sessionId;

        // 1. Item Pickup Check (Done per-player)
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

        // 2. Player-Player Collision (Stealing Check) // REMOVED FROM HERE
        /*
        if (isCarryingItem) {
             for (let j = index + 1; j < playerIds.length; j++) {
                 // ... old logic ...
             }
        }
        */

        // 3. Base Collision (Scoring Check) (Done per-player)
        if (isCarryingItem) { // Re-check based on carrierId *before* score check
             let targetBasePos = null;

             // Player scores by bringing the item to THEIR base
             if (player.team === 'Red') { targetBasePos = RED_BASE_POS; }
             else if (player.team === 'Blue') { targetBasePos = BLUE_BASE_POS; }

             if (targetBasePos) {
                  const dSq = distSq(player.x, player.y, targetBasePos.x, targetBasePos.y);

                  // --- DEBUG LOGGING FOR AI SCORING ---
                  if (this.aiPlayers.has(sessionId)) {
                      console.log(`[${sessionId} AI SCORE CHECK] Pos: (${player.x.toFixed(1)}, ${player.y.toFixed(1)}), TargetBase: (${targetBasePos.x.toFixed(1)}, ${targetBasePos.y.toFixed(1)}), DistSq: ${dSq.toFixed(1)}, RequiredSq: ${BASE_RADIUS_SQ.toFixed(1)}`);
                  }
                  // --- END DEBUG LOGGING ---

                  if (dSq <= BASE_RADIUS_SQ) {
                      console.log(`[${sessionId}] Player ${player.name} (${player.team}) SCORED with the item!`);
                      // Increment score
                      if (player.team === 'Red') this.state.redScore++;
                      else this.state.blueScore++;
                      console.log(`Scores: Red ${this.state.redScore} - Blue ${this.state.blueScore}`);
                      // Reset the item
                      this.resetItem();
                  }
             }
        }
        // --- End Collision Checks ---

    }); // End HUMAN player movement loop

    // --- Item Pickup Check (Check all players AFTER movement) ---
    const item = this.state.item; // Reference the single item
    if (item.status === 'atBase' || item.status === 'dropped') {
        playerIds.forEach(sessionId => {
            const player = this.state.players.get(sessionId)!;
            if (!player || item.carrierId) return; // Skip if player missing or item already carried

            const dSq = distSq(player.x, player.y, item.x, item.y);
            if (dSq <= PICKUP_RADIUS_SQ) {
                console.log(`[${sessionId}] Player ${player.name} picked up the item!`);
                item.status = "carried";
                item.carrierId = sessionId;
                item.x = NaN;
                item.y = NaN;
                // Since item is now carried, no other player can pick it up this tick
                // We can potentially break/return early from the forEach if performance is critical
                // but for simplicity, let it check all players just in case (though carrierId check prevents re-pickup)
            }
        });
    }
    // ------------------------------------------------------------

    // --- Scoring Check (Check all players AFTER movement and pickup) ---
    // const item = this.state.item; // Already defined above
    playerIds.forEach(sessionId => {
        const player = this.state.players.get(sessionId)!;
        if (item.carrierId === sessionId) {
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
                }
            }
        }
    }); // End scoring loop

    // --- Player-Player Collision / Stealing (Check all pairs AFTER scoring) ---
    const currentTime = this.clock.currentTime; // Get current server time

    // Check if item is carried AND cooldown has expired
    if (item.status === 'carried' && item.carrierId && currentTime >= item.lastStealTimestamp + STEAL_COOLDOWN_MS) {
        for (let i = 0; i < playerIds.length; i++) {
            // if (itemStolenThisTick) break; // Cooldown check replaces this

            for (let j = i + 1; j < playerIds.length; j++) {
                const playerA_Id = playerIds[i];
                const playerB_Id = playerIds[j];
                const playerA = this.state.players.get(playerA_Id)!;
                const playerB = this.state.players.get(playerB_Id)!;

                if (!playerA || !playerB || playerA.team === playerB.team) {
                    continue; // Skip if players don't exist or are on the same team
                }

                // Check distance
                const dSq = distSq(playerA.x, playerA.y, playerB.x, playerB.y);
                if (dSq <= PLAYER_COLLISION_RADIUS_SQ) {
                    // Collision between opponents!
                    if (item.carrierId === playerA_Id) {
                        // Player B steals from Player A
                        console.log(`[${playerB_Id}] Player ${playerB.name} (${playerB.team}) STOLE item from [${playerA_Id}] Player ${playerA.name} (${playerA.team})!`);
                        item.carrierId = playerB_Id;
                        item.lastStealTimestamp = currentTime; // Set timestamp
                        // itemStolenThisTick = true; // No longer needed
                        break; // Inner loop (check next i)
                    } else if (item.carrierId === playerB_Id) {
                        // Player A steals from Player B
                        console.log(`[${playerA_Id}] Player ${playerA.name} (${playerA.team}) STOLE item from [${playerB_Id}] Player ${playerB.name} (${playerB.team})!`);
                        item.carrierId = playerA_Id;
                        item.lastStealTimestamp = currentTime; // Set timestamp
                        // itemStolenThisTick = true; // No longer needed
                        break; // Inner loop (check next i)
                    }
                }
            }
            // Break outer loop if a steal occurred in the inner loop
            if (item.lastStealTimestamp === currentTime) {
                break;
            }
        }
    }
    // ------------------------------------------------------------------------

    // --- Update Carried Item Position ---
    // Use the potentially updated carrierId from stealing logic
    // const item = this.state.item; // Already defined above
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
