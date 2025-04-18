import { Room, Client } from "@colyseus/core";
import { ArenaState, Player } from "./schemas/ArenaState";

// Define the state structure later using @colyseus/schema
// For now, this room has no synchronized state.
export class ArenaRoom extends Room<ArenaState> {

  // Called when the room is created
  onCreate (options: any) {
    console.log("[ArenaRoom] Room created with options:", options);

    // Set the initial state
    this.setState(new ArenaState());

    // TODO: Initialize game state (map seed, bases, initial pickups)
    // TODO: Set up the main game loop (setSimulationInterval is often preferred for physics)
    this.setSimulationInterval((deltaTime) => this.update(deltaTime));
  }

  // Called when a client joins the room
  onJoin (client: Client, options: any) {
    console.log(`[ArenaRoom] Client joined: ${client.sessionId}`, options);

    // Create a new Player instance and assign initial properties
    const player = new Player();
    player.name = options.playerName || `Guest_${client.sessionId.substring(0, 4)}`;
    // Spawn player at a random-ish location for now (or fixed point)
    // Note: We'll need a proper world coordinate system later
    player.x = Math.random() * 100 - 50;
    player.y = Math.random() * 100 - 50;
    player.heading = 0;
    player.team = (this.clients.length % 2 === 0) ? 'blue' : 'red'; // Simple team assignment

    // Add the player to the state, keyed by client.sessionId
    this.state.players.set(client.sessionId, player);

    console.log(`=> Player ${player.name} (${player.team}) added at (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`);
  }

  // Called when a client leaves the room
  onLeave (client: Client, consented: boolean) {
    console.log(`[ArenaRoom] Client left: ${client.sessionId}`, consented ? "(consented)" : "(unexpected)");
    // Remove the player state when they leave
    if (this.state.players.has(client.sessionId)) {
        const player = this.state.players.get(client.sessionId);
        console.log(`=> Player ${player?.name} removed.`);
        this.state.players.delete(client.sessionId);
    } else {
        console.log(`=> Player state for ${client.sessionId} not found.`);
    }
  }

  // Game loop update function (called by setSimulationInterval)
  update(deltaTime: number) {
    // TODO: Process inputs from clients
    // TODO: Run server-authoritative physics simulation
    // TODO: Update player positions, check collisions, scoring, etc.
    // The state changes made here will be automatically synced to clients.
  }

  // Called when the room is about to be destroyed
  onDispose() {
    console.log("[ArenaRoom] Room disposing...");
    // Cleanup if needed
  }

}
