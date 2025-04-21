import { Room, Client } from "@colyseus/core";
import { ArenaState, Player } from "./schemas/ArenaState";

// Import constants, helpers, and controllers
import * as Constants from "./config/constants";
import { lerp, angleLerp, distSq } from "./utils/helpers"; // Keep helpers needed directly in room (if any)
import { updateAIState } from "./game/aiController";
import { updateHumanPlayerState } from "./game/playerController";
import {
    resetItemState,
    checkItemPickup,
    checkScoring,
    checkStealing,
    updateCarriedItemPosition
} from "./game/rules";
import { worldToGeo } from "./utils/coordinateUtils"; // <-- Import coordinate utils
import { getMapFeaturesAtPoint, responseHasRoad } from "./utils/mapApiUtils"; // <-- Import map API utils

// Define types for internal room state maps
type PlayerInput = { dx: number, dy: number };
type PlayerVelocity = { vx: number, vy: number };
// Define type for road status cache entries
type RoadStatus = { isOnRoad: boolean, lastQueryTime: number };

// Constants for road query
const ROAD_QUERY_INTERVAL_MS = 500;

// Define GAME_DURATION_SECONDS here
const GAME_DURATION_SECONDS = 5 * 60; // 5 minutes

export class ArenaRoom extends Room<ArenaState> {

  // --- Room State ---
  // Store latest input from clients
  private playerInputs = new Map<string, PlayerInput>();
  // Store server-calculated velocity
  private playerVelocities = new Map<string, PlayerVelocity>();
  // Store AI player session IDs
  private aiPlayers = new Set<string>();
  // Maps for persistent identity and team tracking
  private persistentIdToSessionId = new Map<string, string>();
  private persistentIdToTeam = new Map<string, "Red" | "Blue">();
  // Counter for AI IDs (keep state within the room instance)
  private aiCounter = 1;
  private playerRoadStatusCache = new Map<string, RoadStatus>(); // <-- Add road status cache

  // --- Lifecycle Methods ---

  onCreate (options: any) {
    console.log("[ArenaRoom] Room created with options:", options);
    this.setState(new ArenaState());
    this.state.redScore = 0;
    this.state.blueScore = 0;
    resetItemState(this.state.item); // Use helper to init item

    // Initialize timer using constant
    this.state.gameTimeRemaining = GAME_DURATION_SECONDS;
    console.log(`Game timer initialized to ${this.state.gameTimeRemaining} seconds.`);

    // Initialize road status cache (empty)
    this.playerRoadStatusCache = new Map<string, RoadStatus>();

    console.log(`Initialized item at (${this.state.item.x}, ${this.state.item.y})`);

    // Register message handlers
    this.registerMessageHandlers();

    // Set up the main game loop
    this.setSimulationInterval((deltaTime) => this.update(deltaTime / 1000), 1000 / 60);
  }

  onJoin (client: Client, options: any) {
    console.log(`[${client.sessionId}] Client joining... Options:`, options);

    const tabId = options?.persistentPlayerId;
    let assignedTeam = this.determinePlayerTeam(client.sessionId, tabId);

    // Create and setup human player
    const humanPlayer = this.createHumanPlayer(client.sessionId, assignedTeam);
    this.state.players.set(client.sessionId, humanPlayer);
    this.playerInputs.set(client.sessionId, { dx: 0, dy: 0 });
    this.playerVelocities.set(client.sessionId, { vx: 0, vy: 0 });

    console.log(`=> Player ${humanPlayer.name} (${humanPlayer.team}) added at (${humanPlayer.x.toFixed(1)}, ${humanPlayer.y.toFixed(1)}) meters.`);
  }

  onLeave (client: Client, consented: boolean) {
    console.log(`[${client.sessionId}] Client leaving... Consented: ${consented}`);

    const leavingPlayer = this.state.players.get(client.sessionId);

    // Handle item drop if player was carrying
    if (this.state.item.carrierId === client.sessionId) {
        if (leavingPlayer) {
            console.log(`[${client.sessionId}] Player carrying item left. Dropping at (${leavingPlayer.x.toFixed(1)}, ${leavingPlayer.y.toFixed(1)})`);
            this.state.item.status = 'dropped';
            this.state.item.x = leavingPlayer.x;
            this.state.item.y = leavingPlayer.y;
            this.state.item.carrierId = null;
        } else {
            console.warn(`[${client.sessionId}] Carrier left but player state not found? Resetting item.`);
            resetItemState(this.state.item);
        }
    }

    // Clean up persistent ID mapping
    this.cleanupPersistentId(client.sessionId);

    // Remove player state
    this.removePlayerState(client.sessionId);

    // Remove player from road cache on leave
    this.playerRoadStatusCache.delete(client.sessionId);
    console.log(`[${client.sessionId}] Removed from road status cache.`);

    // Check if AI needs removal
    this.checkAndRemoveAI();
  }

  onDispose() {
    console.log("[ArenaRoom] Room disposing...");
    // Potential future cleanup
  }

  // --- Game Loop ---

  update(dt: number) {
    if (dt > 0.1) {
        console.warn(`Large delta time detected: ${dt.toFixed(3)}s. Skipping frame.`);
        return;
    }

    const playerIds = Array.from(this.state.players.keys());
    const now = Date.now();

    // --- Perform Road Status Checks (Throttled) ---
    playerIds.forEach(sessionId => {
        const player = this.state.players.get(sessionId);
        if (!player) return; // Skip if player left mid-tick

        const cachedStatus = this.playerRoadStatusCache.get(sessionId) || { isOnRoad: false, lastQueryTime: 0 };
        const timeSinceLastQuery = now - cachedStatus.lastQueryTime;

        if (timeSinceLastQuery > ROAD_QUERY_INTERVAL_MS) {
            // Mark cache immediately to prevent concurrent queries
            this.playerRoadStatusCache.set(sessionId, { ...cachedStatus, lastQueryTime: now });

            try {
                const [lon, lat] = worldToGeo(player.x, player.y);
                // console.log(`[${player.name}] Triggering road query at ${lat}, ${lon}`); // Debug
                getMapFeaturesAtPoint(lon, lat)
                    .then(apiResponse => {
                        if (apiResponse) {
                            const foundRoad = responseHasRoad(apiResponse);
                            // Update cache with the actual result
                            this.playerRoadStatusCache.set(sessionId, { isOnRoad: foundRoad, lastQueryTime: now });
                        } // No else needed, retain old status on API error
                    })
                    .catch(err => {
                        console.error(`[${player.name}] Error during background road query:`, err);
                    });
            } catch (convErr) {
                console.error(`[${player.name}] Error converting worldToGeo for road query:`, convErr);
                // Reset query time in cache so it retries sooner after conversion error
                this.playerRoadStatusCache.set(sessionId, { ...cachedStatus, lastQueryTime: 0 });
            }
        }
    });
    // --- End Road Status Checks ---

    // 1. Update AI Players
    this.aiPlayers.forEach(aiSessionId => {
        const aiPlayer = this.state.players.get(aiSessionId);
        let velocity = this.playerVelocities.get(aiSessionId);
        if (!aiPlayer) {
            console.warn(`[Update] AI Player ${aiSessionId} not found in state during update.`);
            this.aiPlayers.delete(aiSessionId); // Clean up bookkeeping
            this.playerVelocities.delete(aiSessionId); // Clean up velocity map
            return;
        }
        if (!velocity) { // Ensure velocity map entry exists
            velocity = { vx: 0, vy: 0 };
            this.playerVelocities.set(aiSessionId, velocity);
        }
        // Get current road status from cache
        const isOnRoad = this.playerRoadStatusCache.get(aiSessionId)?.isOnRoad ?? false;
        // Pass sessionId and isOnRoad status to updateAIState
        updateAIState(aiPlayer, aiSessionId, velocity, this.state, isOnRoad, dt);
    });

    // 2. Update Human Players
    playerIds.forEach(sessionId => {
        if (this.aiPlayers.has(sessionId)) return; // Skip AI

        const player = this.state.players.get(sessionId);
        const input = this.playerInputs.get(sessionId);
        let velocity = this.playerVelocities.get(sessionId);

        if (!player || !input) return; // Skip if state inconsistent
        if (!velocity) { // Ensure velocity map entry exists
            velocity = { vx: 0, vy: 0 };
            this.playerVelocities.set(sessionId, velocity);
        }
        // Get current road status from cache
        const isOnRoad = this.playerRoadStatusCache.get(sessionId)?.isOnRoad ?? false;
        // Pass isOnRoad status to updateHumanPlayerState
        updateHumanPlayerState(player, input, velocity, isOnRoad, dt);

        // --- Update Game Timer ---
        if (this.state.gameTimeRemaining > 0) {
            this.state.gameTimeRemaining -= dt;
            if (this.state.gameTimeRemaining <= 0) {
                this.state.gameTimeRemaining = 0;
                console.log("GAME OVER! Timer reached zero.");
                // TODO: Implement game over logic (e.g., lock room, determine winner)
                // this.lock(); // Example: Prevent further joins/actions
            }
        }
        // -----------------------
    });

    // 3. Apply Game Rules (after all players have moved)
    checkItemPickup(this.state, playerIds);
    checkScoring(this.state, playerIds); // Check scoring before stealing

    // Check stealing and get potential debug data
    const stealDebugData = checkStealing(this.state, playerIds, this.clock.currentTime);
    if (stealDebugData) {
        // Broadcast the positions used in the check to all clients for visualization
        this.broadcast("debug_steal_check_positions", stealDebugData, { afterNextPatch: true });
    }

    updateCarriedItemPosition(this.state);

    // 4. Send Reset Notifications and Clear Flags
    playerIds.forEach(sessionId => {
        if (this.aiPlayers.has(sessionId)) return; // Skip AI

        const player = this.state.players.get(sessionId);
        if (player && player.justReset) {
            const client = this.clients.find(c => c.sessionId === sessionId);
            if (client) {
                client.send("water_reset");
                console.log(`Sent water_reset notification to ${player.name} (${sessionId})`);
            }
            player.justReset = false; // Reset the flag in the state
        }
    });
  }

  // --- Message Handlers ---

  private registerMessageHandlers() {
    this.onMessage("input", (client, message: PlayerInput) => {
      this.playerInputs.set(client.sessionId, { dx: message.dx, dy: message.dy });
    });

    this.onMessage("add_ai", (client, message: { team: "Red" | "Blue" }) => {
      this.handleAddAIRequest(client, message.team);
    });
  }

  private handleAddAIRequest(client: Client, team: "Red" | "Blue") {
    if (!team || (team !== "Red" && team !== "Blue")) {
      console.warn(`[${client.sessionId}] Received invalid team for add_ai:`, team);
      return;
    }
    console.log(`[${client.sessionId}] Requesting to add AI to team: ${team}`);

    const aiSessionId = `ai_${this.aiCounter++}`;
    const aiPlayer = this.createAIPlayer(aiSessionId, team);

    this.state.players.set(aiSessionId, aiPlayer);
    this.playerInputs.set(aiSessionId, { dx: 0, dy: 0 }); // Init input state
    this.playerVelocities.set(aiSessionId, { vx: 0, vy: 0 }); // Init velocity state
    this.aiPlayers.add(aiSessionId); // Track AI

    console.log(`=> AI Player ${aiPlayer.name} (${aiPlayer.team}) added by ${client.sessionId}. SessionId: ${aiSessionId}.`);
  }

  // --- Helper Methods ---

  private determinePlayerTeam(sessionId: string, tabId: string | undefined): "Red" | "Blue" {
    if (!tabId) {
        console.warn(`[${sessionId}] Client joined without tabId! Assigning team based on balance.`);
        return this.assignTeamByBalance();
    } else {
        // Check if this TabId is already associated with an *active* session
        const existingSessionId = this.persistentIdToSessionId.get(tabId);
        if (existingSessionId && this.clients.some(c => c.sessionId === existingSessionId)) {
             console.warn(`[${sessionId}] TabId (${tabId}) is already active with session ${existingSessionId}. Treating as new connection, assigning team by balance.`);
             // If active, something is wrong (duplicate tab?), force re-balance
             const assignedTeam = this.assignTeamByBalance();
             // Update maps for the *new* session
             this.persistentIdToTeam.set(tabId, assignedTeam); // Overwrite/update team for this tabId
             this.persistentIdToSessionId.set(tabId, sessionId); // Assign new session to this tabId
             console.log(`[${sessionId}] Overwrote/Stored team assignment (${assignedTeam}) for conflicting TabId: ${tabId}`);
             return assignedTeam;
        }
        // Original logic: Check if we remember the team for this TabId from a previous session
        else if (this.persistentIdToTeam.has(tabId)) {
            const assignedTeam = this.persistentIdToTeam.get(tabId)!;
            console.log(`[${sessionId}] Returning tab session detected (TabId: ${tabId}). Rejoining team: ${assignedTeam}`);
            this.persistentIdToSessionId.set(tabId, sessionId); // Update mapping (this TabId is now associated with this session)
            return assignedTeam;
        } else {
            // New TabId, assign by balance
            const assignedTeam = this.assignTeamByBalance();
            console.log(`[${sessionId}] New TabId. Assigning team based on balance: ${assignedTeam}`);
            this.persistentIdToTeam.set(tabId, assignedTeam);
            this.persistentIdToSessionId.set(tabId, sessionId); // Set mapping
            console.log(`[${sessionId}] Stored team assignment (${assignedTeam}) for new TabId: ${tabId}`);
            return assignedTeam;
        }
    }
  }

  private assignTeamByBalance(): "Red" | "Blue" {
    let redCount = 0, blueCount = 0;
    this.state.players.forEach(p => {
      // Count all players currently in the state for balancing
      // No need to check for AI here for simple balancing
      if (p.team === 'Red') redCount++;
      else if (p.team === 'Blue') blueCount++;
    });

    const team = (redCount <= blueCount) ? 'Red' : 'Blue';
    console.log(`Team balance check (R:${redCount}, B:${blueCount}) -> Assigning: ${team}`);
    return team;
  }

  private createHumanPlayer(sessionId: string, team: "Red" | "Blue"): Player {
    const player = new Player();
    player.name = `Player ${sessionId.substring(0, 3)}`;
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * Constants.SPAWN_RADIUS;
    player.x = Math.cos(angle) * radius;
    player.y = Math.sin(angle) * radius;
    player.heading = 0;
    player.team = team;
    return player;
  }

  private createAIPlayer(sessionId: string, team: "Red" | "Blue"): Player {
    const player = new Player();
    player.name = `Bot ${this.aiCounter-1} (${team.substring(0,1)})`;
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * Constants.SPAWN_RADIUS;
    player.x = Math.cos(angle) * radius;
    player.y = Math.sin(angle) * radius;
    player.heading = 0;
    player.team = team;
    return player;
  }

  private cleanupPersistentId(sessionId: string): void {
    let tabId: string | undefined = undefined;
    for (const [pid, sid] of this.persistentIdToSessionId.entries()) {
        if (sid === sessionId) {
            tabId = pid;
            break;
        }
    }
    if (tabId) {
        this.persistentIdToSessionId.delete(tabId);
        console.log(`[${sessionId}] Removed sessionId mapping for TabId: ${tabId}. Team assignment (${this.persistentIdToTeam.get(tabId)}) kept.`);
    } else {
        console.warn(`[${sessionId}] Could not find TabId for leaving client.`);
    }
  }

  private removePlayerState(sessionId: string): void {
    const player = this.state.players.get(sessionId);
    if (player) {
        console.log(`=> Removing player state: ${player.name} (${sessionId})`);
        this.state.players.delete(sessionId);
        this.playerInputs.delete(sessionId);
        this.playerVelocities.delete(sessionId);
    } else {
        console.warn(`=> Player state for ${sessionId} already removed?`);
    }
  }

  private checkAndRemoveAI(): void {
    // Count remaining human players
    let humanPlayerCount = 0;
    this.state.players.forEach((player, sessionId) => {
        if (!this.aiPlayers.has(sessionId)) {
            humanPlayerCount++;
        }
    });

    if (humanPlayerCount === 0 && this.aiPlayers.size > 0) {
        console.log("Last human player left. Removing AI players...");
        const aiToRemove = Array.from(this.aiPlayers);
        aiToRemove.forEach(aiSessionId => {
             const aiPlayer = this.state.players.get(aiSessionId);
             console.log(`=> Removing AI ${aiPlayer?.name || aiSessionId}`);
             // Check if AI was carrying item
             if (this.state.item.carrierId === aiSessionId) {
                 console.log(`AI ${aiSessionId} was carrying item. Resetting item.`);
                 resetItemState(this.state.item);
             }
             // Remove AI state
             this.removePlayerState(aiSessionId); // Reuse player removal logic
             this.aiPlayers.delete(aiSessionId); // Remove from AI tracking set
        });
        // Reset AI counter? Maybe not needed if IDs are unique enough
    }
  }
}



