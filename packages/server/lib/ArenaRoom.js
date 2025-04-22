"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArenaRoom = void 0;
const core_1 = require("@colyseus/core");
const shared_schemas_1 = require("@smugglers-town/shared-schemas");
// Import constants, helpers, and controllers
const Constants = __importStar(require("./config/constants"));
const aiController_1 = require("./game/aiController");
const playerController_1 = require("./game/playerController");
const rules_1 = require("./game/rules");
const coordinateUtils_1 = require("./utils/coordinateUtils"); // <-- Import coordinate utils
const mapApiUtils_1 = require("./utils/mapApiUtils"); // <-- Import map API utils
// Constants for road query
const ROAD_QUERY_INTERVAL_MS = 500;
// Define GAME_DURATION_SECONDS here
const GAME_DURATION_SECONDS = 5 * 60; // 5 minutes
class ArenaRoom extends core_1.Room {
    constructor() {
        super(...arguments);
        // --- Room State ---
        // Store latest input from clients
        this.playerInputs = new Map();
        // Store server-calculated velocity
        this.playerVelocities = new Map();
        // Store AI player session IDs
        this.aiPlayers = new Set();
        // Maps for persistent identity and team tracking
        this.persistentIdToSessionId = new Map();
        this.persistentIdToTeam = new Map();
        // Counter for AI IDs (keep state within the room instance)
        this.aiCounter = 1;
        this.playerRoadStatusCache = new Map(); // <-- Add road status cache
        this.periodicLogTimer = 0; // <-- Timer for periodic logging
    }
    // --- Lifecycle Methods ---
    onCreate(options) {
        console.log("[ArenaRoom] Room created with options:", options);
        this.setState(new shared_schemas_1.ArenaState());
        this.state.redScore = 0;
        this.state.blueScore = 0;
        this.state.gameTimeRemaining = GAME_DURATION_SECONDS;
        this.playerRoadStatusCache = new Map();
        this.resetRound(); // Initialize items
        console.log(`Game timer initialized to ${this.state.gameTimeRemaining} seconds.`);
        // Register message handlers
        this.registerMessageHandlers();
        // Set up the main game loop
        this.setSimulationInterval((deltaTime) => this.update(deltaTime / 1000), 1000 / 60);
    }
    onJoin(client, options) {
        console.log(`[${client.sessionId}] Client joining... Options:`, options);
        const tabId = options?.persistentPlayerId;
        console.log(`[${client.sessionId}] Calling determinePlayerTeam with tabId: ${tabId}`);
        let assignedTeam = this.determinePlayerTeam(client.sessionId, tabId);
        console.log(`[${client.sessionId}] determinePlayerTeam returned: ${assignedTeam}. Proceeding to create player.`);
        // Create and setup human player
        const humanPlayer = this.createHumanPlayer(client.sessionId, assignedTeam);
        this.state.players.set(client.sessionId, humanPlayer);
        this.playerInputs.set(client.sessionId, { dx: 0, dy: 0 });
        this.playerVelocities.set(client.sessionId, { vx: 0, vy: 0 });
        console.log(`=> Player ${humanPlayer.name} (${humanPlayer.team}) added at (${humanPlayer.x.toFixed(1)}, ${humanPlayer.y.toFixed(1)}) meters.`);
    }
    async onLeave(client, consented) {
        console.log(`[${client.sessionId}] Client leaving... Consented: ${consented} (Type: ${typeof consented})`);
        const leavingPlayer = this.state.players.get(client.sessionId);
        let leavingTabId = undefined;
        for (const [pid, sid] of this.persistentIdToSessionId.entries()) {
            if (sid === client.sessionId) {
                leavingTabId = pid;
                break;
            }
        }
        console.log(`[${client.sessionId}] Preparing to clean up persistence. Found associated TabId: ${leavingTabId ?? 'None'}. Current team mapping for this TabId: ${leavingTabId ? this.persistentIdToTeam.get(leavingTabId) : 'N/A'}`);
        // ---> Log current players before leave logic
        console.log(`---> [onLeave Pre-Reconnection Check] Players in state: ${JSON.stringify(Array.from(this.state.players.keys()))}`);
        // --->
        // Handle item drop IF player state still exists
        if (leavingPlayer) {
            this.state.items.forEach(item => {
                if (item.carrierId === client.sessionId) {
                    console.log(`[${client.sessionId}] Player carrying item ${item.id} left.`);
                    item.status = 'dropped';
                    item.x = leavingPlayer.x;
                    item.y = leavingPlayer.y;
                    item.carrierId = null;
                    console.log(`   Item ${item.id} dropped at (${item.x.toFixed(1)}, ${item.y.toFixed(1)})`);
                }
            });
        }
        // Check if AI needs removal (This should still happen)
        this.checkAndRemoveAI();
        (0, rules_1.updateCarriedItemPosition)(this.state); // Update positions potentially after item drop
        // --- Manual Cleanup Logic ---
        const performCleanup = () => {
            console.log(`---> Performing cleanup for ${client.sessionId}`);
            this.cleanupPersistentId(client.sessionId);
            this.removePlayerState(client.sessionId);
            this.playerRoadStatusCache.delete(client.sessionId);
            // Potentially trigger AI check again after cleanup?
            // this.checkAndRemoveAI();
        };
        if (consented) {
            console.log(`[${client.sessionId}] Consented leave. Performing immediate cleanup.`);
            performCleanup();
        }
        else {
            console.log(`[${client.sessionId}] Non-consented leave. Scheduling cleanup in 5 seconds.`);
            this.clock.setTimeout(() => {
                // Check if player still exists (might have reconnected or been cleaned up otherwise)
                if (this.state.players.has(client.sessionId)) {
                    console.log(`---> 5-second timer expired for ${client.sessionId}. Player still exists. Performing cleanup.`);
                    performCleanup();
                }
                else {
                    console.log(`---> 5-second timer expired for ${client.sessionId}. Player already gone. Skipping cleanup.`);
                }
            }, 5000); // 5 seconds
        }
        // -------------------------
    }
    onDispose() {
        console.log("[ArenaRoom] Room disposing...");
        // Potential future cleanup
    }
    // --- Game Loop ---
    update(dt) {
        // --- Periodic Logging ---
        this.periodicLogTimer += dt;
        if (this.periodicLogTimer >= 10) { // Log approx every 10 seconds
            this.periodicLogTimer = 0; // Reset timer
            const playerSessionIds = Array.from(this.state.players.keys());
        }
        // -----------------------
        if (dt > 0.1) {
            console.warn(`Large delta time detected: ${dt.toFixed(3)}s. Skipping frame.`);
            return;
        }
        const playerIds = Array.from(this.state.players.keys());
        const now = Date.now();
        // --- Perform Road Status Checks (Throttled) ---
        playerIds.forEach(sessionId => {
            const player = this.state.players.get(sessionId);
            if (!player)
                return; // Skip if player left mid-tick
            const cachedStatus = this.playerRoadStatusCache.get(sessionId) || { isOnRoad: false, lastQueryTime: 0 };
            const timeSinceLastQuery = now - cachedStatus.lastQueryTime;
            if (timeSinceLastQuery > ROAD_QUERY_INTERVAL_MS) {
                // Mark cache immediately to prevent concurrent queries
                this.playerRoadStatusCache.set(sessionId, { ...cachedStatus, lastQueryTime: now });
                try {
                    const [lon, lat] = (0, coordinateUtils_1.worldToGeo)(player.x, player.y);
                    // console.log(`[${player.name}] Triggering road query at ${lat}, ${lon}`); // Debug
                    (0, mapApiUtils_1.getMapFeaturesAtPoint)(lon, lat)
                        .then(apiResponse => {
                        if (apiResponse) {
                            const foundRoad = (0, mapApiUtils_1.responseHasRoad)(apiResponse);
                            // Update cache with the actual result
                            this.playerRoadStatusCache.set(sessionId, { isOnRoad: foundRoad, lastQueryTime: now });
                        } // No else needed, retain old status on API error
                    })
                        .catch(err => {
                        console.error(`[${player.name}] Error during background road query:`, err);
                    });
                }
                catch (convErr) {
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
            (0, aiController_1.updateAIState)(aiPlayer, aiSessionId, velocity, this.state, isOnRoad, dt);
        });
        // 2. Update Human Players
        playerIds.forEach(sessionId => {
            if (this.aiPlayers.has(sessionId))
                return; // Skip AI
            const player = this.state.players.get(sessionId);
            const input = this.playerInputs.get(sessionId);
            let velocity = this.playerVelocities.get(sessionId);
            if (!player || !input)
                return; // Skip if state inconsistent
            if (!velocity) { // Ensure velocity map entry exists
                velocity = { vx: 0, vy: 0 };
                this.playerVelocities.set(sessionId, velocity);
            }
            // Get current road status from cache
            const isOnRoad = this.playerRoadStatusCache.get(sessionId)?.isOnRoad ?? false;
            // Pass isOnRoad status to updateHumanPlayerState
            (0, playerController_1.updateHumanPlayerState)(player, input, velocity, isOnRoad, dt);
        });
        // 3. Apply Game Rules (after all players have moved)
        (0, rules_1.checkItemPickup)(this.state, playerIds);
        (0, rules_1.checkScoring)(this.state, playerIds); // Check scoring before stealing
        // --- Add Round Reset Check HERE ---
        const allScored = this.state.items.every(item => item.status === 'scored');
        if (allScored && this.state.items.length > 0) { // Ensure items exist before checking
            console.log("[Update] All items scored! Resetting round."); // Added log
            this.resetRound();
        }
        // ---------------------------------
        // Check stealing and get potential debug data
        const stealDebugData = (0, rules_1.checkStealing)(this.state, playerIds, this.clock.currentTime);
        if (stealDebugData) {
            // Broadcast the positions used in the check to all clients for visualization
            this.broadcast("debug_steal_check_positions", stealDebugData, { afterNextPatch: true });
        }
        (0, rules_1.updateCarriedItemPosition)(this.state);
    }
    // --- Message Handlers ---
    registerMessageHandlers() {
        this.onMessage("input", (client, message) => {
            this.playerInputs.set(client.sessionId, { dx: message.dx, dy: message.dy });
        });
        this.onMessage("add_ai", (client, message) => {
            this.handleAddAIRequest(client, message.team);
        });
    }
    handleAddAIRequest(client, team) {
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
    determinePlayerTeam(sessionId, tabId) {
        console.log(`---> [determinePlayerTeam Input] sessionId: ${sessionId}, tabId: ${tabId}`);
        if (!tabId) {
            console.warn(`[${sessionId}] Client joined without tabId! Assigning team based on balance.`);
            const team = this.assignTeamByBalance();
            console.log(`---> [determinePlayerTeam Decision] No tabId. Assigned by balance: ${team}`);
            return team;
        }
        else {
            const existingSessionId = this.persistentIdToSessionId.get(tabId);
            console.log(`---> [determinePlayerTeam Check 1] Check persistentIdToSessionId for tabId (${tabId}). Result: ${existingSessionId ?? 'Not found'}`);
            if (existingSessionId) {
                // Found an existing session mapping for this tabId
                const isStillActive = this.clients.some(c => c.sessionId === existingSessionId);
                console.log(`---> [determinePlayerTeam Check 2] Is existing session ${existingSessionId} still active? ${isStillActive}`);
                if (isStillActive) {
                    // *** REVISED LOGIC V2 for active conflict ***
                    console.warn(`[${sessionId}] TabId (${tabId}) is mapped to an active session ${existingSessionId}. Prioritizing new session ${sessionId} for team assignment, but deferring map updates.`);
                    // Retrieve the ORIGINAL team associated with this tabId
                    const assignedTeam = this.persistentIdToTeam.get(tabId) ?? this.assignTeamByBalance(); // Fallback if team somehow missing
                    if (!this.persistentIdToTeam.has(tabId)) {
                        console.warn(`[${sessionId}] Team mapping missing for apparently active TabId ${tabId}! Assigning by balance.`);
                        this.persistentIdToTeam.set(tabId, assignedTeam); // Store fallback team mapping
                    }
                    console.log(`---> [determinePlayerTeam Decision] Active conflict detected. Assigning original/fallback team: ${assignedTeam} to new session ${sessionId}. Map update deferred.`);
                    return assignedTeam;
                }
                else {
                    // Not active: Session disconnected, state might be held by allowReconnection (or timed out)
                    const assignedTeam = this.persistentIdToTeam.get(tabId); // Should exist if session map existed
                    console.log(`[${sessionId}] Found disconnected session mapping for TabId ${tabId}. Rejoining team: ${assignedTeam}`);
                    this.persistentIdToSessionId.set(tabId, sessionId); // Update mapping to the new session
                    console.log(`---> [determinePlayerTeam Decision] Reconnecting to existing team ${assignedTeam} for tabId (${tabId}). Updated persistentIdToSessionId.`);
                    return assignedTeam;
                }
            }
            // --- No existing session mapping found ---
            else if (this.persistentIdToTeam.has(tabId)) {
                // Session mapping gone (leave cleanup or timeout), but team mapping remains.
                const assignedTeam = this.persistentIdToTeam.get(tabId);
                console.log(`[${sessionId}] Session mapping missing, but found team mapping for TabId ${tabId}. Rejoining team: ${assignedTeam}`);
                this.persistentIdToSessionId.set(tabId, sessionId); // Establish new session mapping
                console.log(`---> [determinePlayerTeam Decision] Rejoining remembered team ${assignedTeam} for tabId (${tabId}). Created persistentIdToSessionId.`);
                return assignedTeam;
            }
            else {
                // New TabId, assign by balance
                const assignedTeam = this.assignTeamByBalance();
                console.log(`[${sessionId}] New TabId. Assigning team based on balance: ${assignedTeam}`);
                this.persistentIdToTeam.set(tabId, assignedTeam);
                this.persistentIdToSessionId.set(tabId, sessionId); // Set mapping
                console.log(`[${sessionId}] Stored team assignment (${assignedTeam}) for new TabId: ${tabId}`);
                console.log(`---> [determinePlayerTeam Decision] New tabId (${tabId}). Assigned by balance: ${assignedTeam}. Stored mappings.`);
                return assignedTeam;
            }
        }
    }
    assignTeamByBalance() {
        let redCount = 0, blueCount = 0;
        this.state.players.forEach(p => {
            // Count all players currently in the state for balancing
            // No need to check for AI here for simple balancing
            if (p.team === 'Red')
                redCount++;
            else if (p.team === 'Blue')
                blueCount++;
        });
        const team = (redCount <= blueCount) ? 'Red' : 'Blue';
        console.log(`Team balance check (R:${redCount}, B:${blueCount}) -> Assigning: ${team}`);
        return team;
    }
    createHumanPlayer(sessionId, team) {
        const player = new shared_schemas_1.Player();
        player.name = `Player ${sessionId.substring(0, 3)}`;
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * Constants.PLAYER_SPAWN_RADIUS;
        player.x = Math.cos(angle) * radius;
        player.y = Math.sin(angle) * radius;
        player.heading = 0;
        player.team = team;
        return player;
    }
    createAIPlayer(sessionId, team) {
        const player = new shared_schemas_1.Player();
        player.name = `Bot ${this.aiCounter - 1} (${team.substring(0, 1)})`;
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * Constants.PLAYER_SPAWN_RADIUS;
        player.x = Math.cos(angle) * radius;
        player.y = Math.sin(angle) * radius;
        player.heading = 0;
        player.team = team;
        return player;
    }
    cleanupPersistentId(sessionId) {
        console.log(`---> [cleanupPersistentId Input] sessionId: ${sessionId}`);
        let tabId = undefined;
        for (const [pid, sid] of this.persistentIdToSessionId.entries()) {
            if (sid === sessionId) {
                tabId = pid;
                console.log(`---> [cleanupPersistentId Check] Found matching tabId: ${tabId} for sessionId: ${sessionId}`);
                break;
            }
        }
        if (tabId) {
            this.persistentIdToSessionId.delete(tabId);
            // Note: We intentionally *keep* the persistentIdToTeam mapping here!
            console.log(`[${sessionId}] Removed sessionId mapping for TabId: ${tabId}. Team assignment (${this.persistentIdToTeam.get(tabId)}) kept.`);
            console.log(`---> [cleanupPersistentId Action] Deleted tabId (${tabId}) from persistentIdToSessionId map.`);
        }
        else {
            console.warn(`[${sessionId}] Could not find TabId for leaving client.`);
            console.log(`---> [cleanupPersistentId Action] No tabId found for sessionId ${sessionId}. No action taken.`);
        }
    }
    removePlayerState(sessionId) {
        console.log(`---> [removePlayerState Entered] Attempting to remove state for sessionId: ${sessionId}`);
        const player = this.state.players.get(sessionId);
        const deleted = this.state.players.delete(sessionId); // Store result of delete
        if (deleted) {
            console.log(`=> Removing player state: ${player?.name} (${sessionId})`); // Use optional chaining as player might be gone
            this.playerInputs.delete(sessionId);
            this.playerVelocities.delete(sessionId);
        }
        else {
            console.warn(`---> [removePlayerState] Player state for ${sessionId} not found or already removed? Delete operation returned ${deleted}.`);
        }
    }
    checkAndRemoveAI() {
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
                this.state.items.forEach(item => {
                    if (item.carrierId === aiSessionId) {
                        console.log(`   AI ${aiSessionId} was carrying item ${item.id}. Dropping item.`);
                        item.status = 'dropped';
                        item.x = aiPlayer?.x ?? 0;
                        item.y = aiPlayer?.y ?? 0;
                        item.carrierId = null;
                    }
                });
                // Remove AI state
                this.removePlayerState(aiSessionId); // Reuse player removal logic
                this.aiPlayers.delete(aiSessionId); // Remove from AI tracking set
            });
            // Reset AI counter? Maybe not needed if IDs are unique enough
        }
    }
    // --- Round Management Helpers ---
    spawnNewItem(itemId) {
        const newItem = new shared_schemas_1.FlagState();
        newItem.id = itemId;
        newItem.status = 'available';
        // Random position within spawn radius
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * Constants.ITEM_SPAWN_RADIUS;
        newItem.x = Math.cos(angle) * radius;
        newItem.y = Math.sin(angle) * radius;
        newItem.carrierId = null;
        newItem.lastStealTimestamp = 0;
        console.log(`   Spawning item ${itemId} at (${newItem.x.toFixed(1)}, ${newItem.y.toFixed(1)})`);
        return newItem;
    }
    resetRound() {
        console.log("Executing resetRound...");
        // Clear existing items from state AND refs
        this.state.items.clear();
        console.log(` -> Cleared existing items. Count: ${this.state.items.length}`);
        // Spawn new items
        for (let i = 0; i < Constants.NUM_ITEMS; i++) {
            const newItemId = `item-${i}`;
            const newItem = this.spawnNewItem(newItemId);
            this.state.items.push(newItem);
        }
    }
}
exports.ArenaRoom = ArenaRoom;
//# sourceMappingURL=ArenaRoom.js.map