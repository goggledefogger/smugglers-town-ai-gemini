import { Room, Client } from "@colyseus/core";
import { ArenaState } from "@smugglers-town/shared-schemas";
export declare class ArenaRoom extends Room<ArenaState> {
    private playerInputs;
    private playerVelocities;
    private aiPlayers;
    private persistentIdToSessionId;
    private persistentIdToTeam;
    private aiCounter;
    private playerRoadStatusCache;
    private periodicLogTimer;
    onCreate(options: any): void;
    onJoin(client: Client, options: any): void;
    onLeave(client: Client, consented: boolean): Promise<void>;
    onDispose(): void;
    update(dt: number): void;
    private registerMessageHandlers;
    private handleAddAIRequest;
    private determinePlayerTeam;
    private assignTeamByBalance;
    private createHumanPlayer;
    private createAIPlayer;
    private cleanupPersistentId;
    private removePlayerState;
    private checkAndRemoveAI;
    private spawnNewItem;
    private resetRound;
}
//# sourceMappingURL=ArenaRoom.d.ts.map