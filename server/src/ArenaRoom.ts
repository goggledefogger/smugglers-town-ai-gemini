import { Room, Client } from "@colyseus/core";

// Define the state structure later using @colyseus/schema
// For now, this room has no synchronized state.
export class ArenaRoom extends Room {

  // Called when the room is created
  onCreate (options: any) {
    console.log("[ArenaRoom] Room created with options:", options);

    // TODO: Initialize game state (map seed, bases, initial pickups)
    // TODO: Set up the main game loop using this.clock.setInterval or setSimulationInterval
  }

  // Called when a client joins the room
  onJoin (client: Client, options: any) {
    console.log(`[ArenaRoom] Client joined: ${client.sessionId}`, options);
    // TODO: Create player state, associate with client
    // TODO: Send initial game state to the joining client
  }

  // Called when a client leaves the room
  onLeave (client: Client, consented: boolean) {
    console.log(`[ArenaRoom] Client left: ${client.sessionId}`, consented ? "(consented)" : "(unexpected)");
    // TODO: Remove player state
  }

  // Called when the room is about to be destroyed
  onDispose() {
    console.log("[ArenaRoom] Room disposing...");
    // TODO: Clean up intervals, save final state if needed
  }

}
