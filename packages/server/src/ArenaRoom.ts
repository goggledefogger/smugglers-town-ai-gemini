import { Room, Client } from "@colyseus/core";
import { ArenaState, Player, FlagState } from "@smugglers-town/shared-schemas";

// Import constants, helpers, and controllers
import * as ServerConstants from "./config/constants";
import * as SharedConstants from "@smugglers-town/shared-utils";
import { NUM_ITEMS } from "@smugglers-town/shared-utils";
import { updateAIState, clearAIRuntime } from "./game/aiController";
import { updateHumanPlayerState } from "./game/playerController";
import {
    checkItemPickup,
    checkScoring,
    checkPlayerCollisionsAndStealing,
    updateCarriedItemPosition
} from "./game/rules";
import { MapData } from "./map/mapData";
import { RoadGraph } from "./map/roadGraph";

// Define types for internal room state maps
type PlayerInput = { dx: number, dy: number };
type PlayerVelocity = { vx: number, vy: number };

const GAME_DURATION_SECONDS = 5 * 60; // 5 minutes
const MAP_RADIUS_M = 1500; // play-area radius for map geometry fetch
const ORIGIN_CHANGE_COOLDOWN_MS = 30_000;

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
  // Local map geometry (roads/buildings/water). Null = degraded mode (no map physics).
  private mapData: MapData | null = null;
  // Road network graph for AI routing. Built from mapData when it loads.
  private roadGraph: RoadGraph | null = null;
  private lastOriginChangeTime = 0;

  // --- Lifecycle Methods ---

  onCreate (options: any) {
    console.log("[ArenaRoom] Room created with options:", options);
    this.setState(new ArenaState());

    // Initialize state from constants
    this.state.redScore = 0;
    this.state.blueScore = 0;
    this.state.gameTimeRemaining = GAME_DURATION_SECONDS;
    this.state.baseRadius = Math.sqrt(ServerConstants.BASE_RADIUS_SQ);

    // Set initial world origin (Times Square)
    this.state.worldOriginLat = SharedConstants.ORIGIN_LAT;
    this.state.worldOriginLng = SharedConstants.ORIGIN_LNG;

    this.resetRound(); // Initialize items

    // Register message handlers
    this.registerMessageHandlers();

    // Set up the main game loop
    this.setSimulationInterval((deltaTime) => this.update(deltaTime / 1000), 1000 / 60);

    this.loadMapData();
  }

  /**
   * Load map geometry for collision/road checks. Deliberately NOT awaited:
   * a cold Overpass fetch for a dense city can take >10s, and awaiting it in
   * onCreate blocks the first client's join past its matchmaking timeout.
   * The room starts in degraded mode (no map physics) and upgrades when the
   * data lands; cached areas load near-instantly on later boots.
   */
  private loadMapData(): void {
    MapData.load(this.state.worldOriginLng, this.state.worldOriginLat, MAP_RADIUS_M)
        .then(md => {
            this.mapData = md;
            this.roadGraph = RoadGraph.fromMapData(md);
            this.sanitizePlacements();
        })
        .catch(err => console.error("[ArenaRoom] Map data load failed; running without map physics:", err));
  }

  /**
   * Move bases, loose items, and players out of buildings/water. Runs when
   * map geometry lands (placements made in degraded mode may be inside
   * geometry that didn't exist yet).
   */
  private sanitizePlacements(): void {
    const md = this.mapData;
    if (!md) return;

    const red = md.findAccessibleNear(SharedConstants.RED_BASE_POS.x, SharedConstants.RED_BASE_POS.y);
    this.state.redBaseX = red.x;
    this.state.redBaseY = red.y;
    const blue = md.findAccessibleNear(SharedConstants.BLUE_BASE_POS.x, SharedConstants.BLUE_BASE_POS.y);
    this.state.blueBaseX = blue.x;
    this.state.blueBaseY = blue.y;

    this.state.items.forEach(item => {
        if ((item.status === 'available' || item.status === 'dropped') && isFinite(item.x) && isFinite(item.y)) {
            const p = md.findAccessibleNear(item.x, item.y);
            item.x = p.x;
            item.y = p.y;
        }
    });

    this.state.players.forEach(player => {
        const p = md.findAccessibleNear(player.x, player.y);
        player.x = p.x;
        player.y = p.y;
    });
  }

  /** Random accessible spawn position within `radius` of (cx, cy). */
  private accessibleSpawn(cx: number, cy: number, radius: number): { x: number; y: number } {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * radius;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    return this.mapData ? this.mapData.findAccessibleNear(x, y) : { x, y };
  }

  onJoin (client: Client, options: any) {
    const tabId = options?.persistentPlayerId;
    const assignedTeam = this.determinePlayerTeam(client.sessionId, tabId);

    // Create and setup human player
    const humanPlayer = this.createHumanPlayer(client.sessionId, assignedTeam);
    this.state.players.set(client.sessionId, humanPlayer);
    this.playerInputs.set(client.sessionId, { dx: 0, dy: 0 });
    this.playerVelocities.set(client.sessionId, { vx: 0, vy: 0 });

    console.log(`=> Player ${humanPlayer.name} (${humanPlayer.team}) joined at (${humanPlayer.x.toFixed(1)}, ${humanPlayer.y.toFixed(1)}) meters.`);
  }

  async onLeave (client: Client, consented: boolean) {
    console.log(`[${client.sessionId}] Client leaving. Consented: ${consented}`);

    const leavingPlayer = this.state.players.get(client.sessionId);

    // Handle item drop IF player state still exists
    if(leavingPlayer) {
        this.state.items.forEach(item => {
            if (item.carrierId === client.sessionId) {
                item.status = 'dropped';
                item.x = leavingPlayer.x;
                item.y = leavingPlayer.y;
                item.carrierId = null;
                console.log(`   Item ${item.id} dropped at (${item.x.toFixed(1)}, ${item.y.toFixed(1)})`);
            }
        });
    }

    this.checkAndRemoveAI();

    updateCarriedItemPosition(this.state); // Update positions potentially after item drop

    const performCleanup = () => {
        this.cleanupPersistentId(client.sessionId);
        this.removePlayerState(client.sessionId);
    };

    if (consented) {
        performCleanup();
    } else {
        // Give non-consented (dropped) clients a window to reconnect before cleanup.
        this.clock.setTimeout(() => {
            if (this.state.players.has(client.sessionId)) {
                 performCleanup();
            }
        }, 5000);
    }
  }

  onDispose() {
    console.log("[ArenaRoom] Room disposing...");
  }

  // --- Game Loop ---

  update(dt: number) {
    // --- Game Timer Update ---
    if (this.state.gameTimeRemaining > 0) {
      this.state.gameTimeRemaining -= dt;
      if (this.state.gameTimeRemaining <= 0) {
        this.state.gameTimeRemaining = 0;
        console.log("[ArenaRoom] Game timer reached zero!");
        // TODO: Implement end-of-game logic here (see SPEC.md 6b)
      }
    }

    if (dt > 0.1) {
        console.warn(`Large delta time detected: ${dt.toFixed(3)}s. Skipping frame.`);
        return;
    }

    const playerIds = Array.from(this.state.players.keys());
    const now = Date.now();

    // 1. Update Player States (AI and Human)
    playerIds.forEach(sessionId => {
        const player = this.state.players.get(sessionId);
        if (!player) return;

        let velocity = this.playerVelocities.get(sessionId);
        if (!velocity) {
            velocity = { vx: 0, vy: 0 };
            this.playerVelocities.set(sessionId, velocity);
        }

        // Road status at the actual position, every tick — local lookup, no throttle.
        player.isOnRoad = this.mapData?.isOnRoad(player.x, player.y) ?? false;

        if (this.aiPlayers.has(sessionId)) {
            updateAIState(player, sessionId, velocity, this.state, this.mapData, this.roadGraph, dt);
        } else {
            const input = this.playerInputs.get(sessionId) ?? { dx: 0, dy: 0 };
            updateHumanPlayerState(player, input, velocity, this.mapData, dt);
        }

        // Update schema velocity (after movement calculation)
        player.vx = velocity.vx;
        player.vy = velocity.vy;
    });

    // 2. Apply Game Rules (Pickup, Scoring, Collisions)
    checkItemPickup(this.state, playerIds);
    checkScoring(this.state, playerIds);
    checkPlayerCollisionsAndStealing(
        this.state,
        playerIds,
        this.playerVelocities,
        now,
        this.mapData
    );

    // 3. Round Reset Check
    const allScored = this.state.items.every(item => item.status === 'scored');
    if (allScored && this.state.items.length > 0) {
        console.log("[Update] All items scored! Resetting round.");
        this.resetRound();
    }

    // 4. Update carried item positions
    updateCarriedItemPosition(this.state);
  }

  // --- Message Handlers ---

  private registerMessageHandlers() {
    this.onMessage("input", (client, message: PlayerInput) => {
      this.playerInputs.set(client.sessionId, { dx: message.dx, dy: message.dy });
    });

    this.onMessage("add_ai", (client, message: { team: "Red" | "Blue" }) => {
      this.handleAddAIRequest(client, message.team);
    });

    // Handler for changing the game world origin
    this.onMessage("set_world_origin", (client, message: { lat: number; lng: number }) => {
        if (typeof message?.lat !== 'number' || typeof message?.lng !== 'number' ||
            !isFinite(message.lat) || !isFinite(message.lng) ||
            Math.abs(message.lat) > 85 || Math.abs(message.lng) > 180) {
            console.warn(`[${client.sessionId}] Received invalid data for set_world_origin:`, message);
            return;
        }

        // Guard: relocating the world mid-game affects everyone. Only allow when
        // alone in the room or during the first 10s of a round, and rate-limit.
        const now = Date.now();
        const roundJustStarted = this.state.gameTimeRemaining > GAME_DURATION_SECONDS - 10;
        if (this.clients.length > 1 && !roundJustStarted) {
            console.warn(`[${client.sessionId}] set_world_origin denied: game in progress with ${this.clients.length} clients.`);
            return;
        }
        if (now - this.lastOriginChangeTime < ORIGIN_CHANGE_COOLDOWN_MS) {
            console.warn(`[${client.sessionId}] set_world_origin denied: rate limited.`);
            return;
        }
        this.lastOriginChangeTime = now;

        console.log(`[${client.sessionId}] set_world_origin: Lat=${message.lat}, Lng=${message.lng}`);
        this.resetGame(message);
    });
  }

  private handleAddAIRequest(client: Client, team: "Red" | "Blue") {
    if (!team || (team !== "Red" && team !== "Blue")) {
      console.warn(`[${client.sessionId}] Received invalid team for add_ai:`, team);
      return;
    }

    // Room id in the key keeps module-scope AI runtime maps (plans, state
    // memory) collision-free across concurrent rooms.
    const aiSessionId = `ai_${this.roomId}_${this.aiCounter++}`;
    const aiPlayer = this.createAIPlayer(aiSessionId, team);

    this.state.players.set(aiSessionId, aiPlayer);
    this.playerInputs.set(aiSessionId, { dx: 0, dy: 0 });
    this.playerVelocities.set(aiSessionId, { vx: 0, vy: 0 });
    this.aiPlayers.add(aiSessionId);

    console.log(`=> AI Player ${aiPlayer.name} (${aiPlayer.team}) added by ${client.sessionId}.`);
  }

  // --- Helper Methods ---

  private determinePlayerTeam(sessionId: string, tabId: string | undefined): "Red" | "Blue" {
    if (!tabId) {
        console.warn(`[${sessionId}] Client joined without tabId! Assigning team based on balance.`);
        return this.assignTeamByBalance();
    }

    const existingSessionId = this.persistentIdToSessionId.get(tabId);

    if (existingSessionId) {
        // Found an existing session mapping for this tabId
        const isStillActive = this.clients.some(c => c.sessionId === existingSessionId);

        if (isStillActive) {
            // Active conflict (e.g. duplicated tab): keep the original team, defer map updates.
            console.warn(`[${sessionId}] TabId (${tabId}) is mapped to an active session ${existingSessionId}. Assigning original team to new session.`);
            const assignedTeam = this.persistentIdToTeam.get(tabId) ?? this.assignTeamByBalance();
            if (!this.persistentIdToTeam.has(tabId)) {
                this.persistentIdToTeam.set(tabId, assignedTeam);
            }
            return assignedTeam;
        }

        // Session disconnected; rejoin the remembered team.
        const assignedTeam = this.persistentIdToTeam.get(tabId)!;
        console.log(`[${sessionId}] Reconnecting TabId ${tabId} to team: ${assignedTeam}`);
        this.persistentIdToSessionId.set(tabId, sessionId);
        return assignedTeam;
    }

    if (this.persistentIdToTeam.has(tabId)) {
        // Session mapping gone (leave cleanup or timeout), but team mapping remains.
        const assignedTeam = this.persistentIdToTeam.get(tabId)!;
        console.log(`[${sessionId}] Rejoining remembered team ${assignedTeam} for TabId ${tabId}.`);
        this.persistentIdToSessionId.set(tabId, sessionId);
        return assignedTeam;
    }

    // New TabId, assign by balance
    const assignedTeam = this.assignTeamByBalance();
    console.log(`[${sessionId}] New TabId ${tabId}. Assigned by balance: ${assignedTeam}`);
    this.persistentIdToTeam.set(tabId, assignedTeam);
    this.persistentIdToSessionId.set(tabId, sessionId);
    return assignedTeam;
  }

  private assignTeamByBalance(): "Red" | "Blue" {
    let redCount = 0, blueCount = 0;
    this.state.players.forEach(p => {
      if (p.team === 'Red') redCount++;
      else if (p.team === 'Blue') blueCount++;
    });
    return (redCount <= blueCount) ? 'Red' : 'Blue';
  }

  private createHumanPlayer(sessionId: string, team: "Red" | "Blue"): Player {
    const player = new Player();
    player.name = `Player ${sessionId.substring(0, 3)}`;
    const pos = this.accessibleSpawn(0, 0, ServerConstants.PLAYER_SPAWN_RADIUS);
    player.x = pos.x;
    player.y = pos.y;
    player.heading = 0;
    player.team = team;
    return player;
  }

  private createAIPlayer(sessionId: string, team: "Red" | "Blue"): Player {
    const player = new Player();
    player.name = `Bot ${this.aiCounter-1} (${team.substring(0,1)})`;
    const pos = this.accessibleSpawn(0, 0, ServerConstants.PLAYER_SPAWN_RADIUS);
    player.x = pos.x;
    player.y = pos.y;
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
        // Note: We intentionally *keep* the persistentIdToTeam mapping here,
        // so a refresh rejoins the same team.
    } else {
        console.warn(`[${sessionId}] Could not find TabId for leaving client.`);
    }
  }

  private removePlayerState(sessionId: string): void {
    const player = this.state.players.get(sessionId);
    const deleted = this.state.players.delete(sessionId);
    if (deleted) {
        console.log(`=> Removing player state: ${player?.name} (${sessionId})`);
        this.playerInputs.delete(sessionId);
        this.playerVelocities.delete(sessionId);
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
             // Check if AI was carrying item
             this.state.items.forEach(item => {
                 if (item.carrierId === aiSessionId) {
                     item.status = 'dropped';
                     item.x = aiPlayer?.x ?? 0;
                     item.y = aiPlayer?.y ?? 0;
                     item.carrierId = null;
                 }
             });
             this.removePlayerState(aiSessionId);
             this.aiPlayers.delete(aiSessionId);
             clearAIRuntime(aiSessionId);
        });
    }
  }

  // --- Round Management Helpers ---

  private spawnNewItem(itemId: string): FlagState {
      const newItem = new FlagState();
      newItem.id = itemId;
      newItem.status = 'available';
      // Random position within spawn radius, nudged out of buildings/water.
      const pos = this.accessibleSpawn(0, 0, ServerConstants.ITEM_SPAWN_RADIUS);
      newItem.x = pos.x;
      newItem.y = pos.y;
      newItem.carrierId = null;
      newItem.lastStealTimestamp = 0;
      return newItem;
  }

  private resetRound(): void {
    console.log("Executing resetRound...");
    this.state.items.clear();
    for (let i = 0; i < NUM_ITEMS; i++) {
        this.state.items.push(this.spawnNewItem(`item-${i}`));
    }
  }

  private resetGame(newOrigin: { lat: number; lng: number }): void {
    console.log(`[ArenaRoom] Executing resetGame to origin: Lat=${newOrigin.lat}, Lng=${newOrigin.lng}`);

    // 1. Update World Origin in State
    this.state.worldOriginLat = newOrigin.lat;
    this.state.worldOriginLng = newOrigin.lng;

    // Old geometry is relative to the old origin — drop it and reload.
    // Game runs in degraded mode (no map physics) until the new data lands;
    // loadMapData re-sanitizes placements once it does.
    this.mapData = null;
    this.roadGraph = null;
    this.state.redBaseX = SharedConstants.RED_BASE_POS.x;
    this.state.redBaseY = SharedConstants.RED_BASE_POS.y;
    this.state.blueBaseX = SharedConstants.BLUE_BASE_POS.x;
    this.state.blueBaseY = SharedConstants.BLUE_BASE_POS.y;
    this.loadMapData();

    // 2. Reset Scores and Timer
    this.state.redScore = 0;
    this.state.blueScore = 0;
    this.state.gameTimeRemaining = GAME_DURATION_SECONDS;

    // 3. Reset Player Positions and States
    this.state.players.forEach((player, sessionId) => {
        const basePos = player.team === 'Red'
            ? { x: this.state.redBaseX, y: this.state.redBaseY }
            : { x: this.state.blueBaseX, y: this.state.blueBaseY };
        const pos = this.accessibleSpawn(basePos.x, basePos.y, ServerConstants.PLAYER_SPAWN_RADIUS);
        player.x = pos.x;
        player.y = pos.y;
        player.vx = 0;
        player.vy = 0;
        player.heading = 0;
        player.isOnRoad = false;
        // Clear carried item status (important if reset happens mid-carry)
        this.state.items.forEach(item => {
            if (item.carrierId === sessionId) {
                item.carrierId = null;
                item.status = 'available';
            }
        });
        this.playerVelocities.set(sessionId, { vx: 0, vy: 0 });
    });

    // 4. Clear and Respawn Items
    this.resetRound();

    console.log("[ArenaRoom] resetGame completed.");
  }
}
