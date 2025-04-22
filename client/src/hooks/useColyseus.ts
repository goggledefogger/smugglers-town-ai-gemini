import { useState, useEffect, useRef, useCallback } from 'react';
import { Client, Room } from 'colyseus.js';
import { v4 as uuidv4 } from 'uuid';
import { ArenaState, Player, FlagState } from '../schemas/ArenaState'; // Adjust path as needed

const COLYSEUS_ENDPOINT = import.meta.env.VITE_COLYSEUS_ENDPOINT || 'ws://localhost:2567';
const SESSION_TAB_ID_KEY = 'smugglersTown_sessionTabId'; // REVERTED KEY - Using sessionStorage
// const PERSISTENT_PLAYER_ID_KEY = 'smugglersTown_persistentPlayerId'; // Removed localStorage key

interface ColyseusState {
    room: Room<ArenaState> | null;
    sessionId: string | null;
    players: Map<string, Player>;
    items: FlagState[]; // Changed from single item
    scores: { red: number; blue: number };
    gameTimeRemaining: number | undefined;
    isConnected: boolean;
    error: string | null;
    itemsScoredCount: number; // Add derived state
}

export function useColyseus() {
    const [state, setState] = useState<ColyseusState>({
        room: null,
        sessionId: null,
        players: new Map(),
        items: [],
        scores: { red: 0, blue: 0 },
        gameTimeRemaining: undefined,
        isConnected: false,
        error: null,
        itemsScoredCount: 0, // Initialize
    });
    const isMounted = useRef(false);
    const colyseusClient = useRef<Client | null>(null);
    const roomRef = useRef<Room<ArenaState> | null>(null); // Separate ref for stable room instance
    const connectionAttempted = useRef(false); // Flag to prevent multiple connection attempts

    const connect = useCallback(async () => {
        console.log("---> [useColyseus connect ENTERED]"); // Log entry
        // Prevent multiple concurrent calls
        if (connectionAttempted.current) {
            console.log("---> [useColyseus connect] Already attempting connection, skipping.");
            return;
        }
        connectionAttempted.current = true;

        if (roomRef.current || !isMounted.current) {
            console.log("---> [useColyseus connect] Room exists or component unmounted, skipping.");
            connectionAttempted.current = false; // Reset flag if skipping
            return;
        }

        // Get/Set Session Tab ID using sessionStorage (Reverted)
        let tabId = sessionStorage.getItem(SESSION_TAB_ID_KEY);
        if (!tabId) {
            tabId = uuidv4();
            sessionStorage.setItem(SESSION_TAB_ID_KEY, tabId);
            console.log(`[useColyseus] Generated NEW Session Tab ID: ${tabId}`);
        } else {
            console.log(`[useColyseus] Retrieved EXISTING Session Tab ID: ${tabId}`);
        }

        console.log(`Attempting to connect to Colyseus server at ${COLYSEUS_ENDPOINT}...`);
        colyseusClient.current = new Client(COLYSEUS_ENDPOINT);

        try {
            // Pass the tabId to the server as persistentPlayerId (Reverted)
            const joinOptions = { persistentPlayerId: tabId };
            const room = await colyseusClient.current.joinOrCreate<ArenaState>('arena', joinOptions);
            roomRef.current = room; // Store room instance in ref

            console.log(`[useColyseus] Joined room: ${room.id}, Received Session ID: ${room.sessionId}, Sent Tab ID: ${tabId}`); // Reverted log message

            setState(prevState => ({
                ...prevState,
                room: room, // Keep room object in state if needed elsewhere, but use ref for listeners
                sessionId: room.sessionId,
                isConnected: true,
                error: null,
            }));

            // --- State Change Listener ---
            room.onStateChange((newState: ArenaState) => {
                 if (!isMounted.current) return;
                // console.log("[useColyseus] State change received"); // DEBUG
                // Calculate scored items count
                const scoredCount = newState.items.filter(item => item.status === 'scored').length;

                setState(prevState => ({
                    ...prevState,
                    // Update players Map (create new map for react change detection)
                    players: new Map(newState.players.entries()),
                    // Update items array (clone for react change detection)
                    items: Array.from(newState.items.values()),
                    scores: { red: newState.redScore, blue: newState.blueScore },
                    gameTimeRemaining: newState.gameTimeRemaining,
                    itemsScoredCount: scoredCount, // Update derived state
                }));
            });

            // --- Message Listeners ---
            room.onMessage("water_reset", () => {
                 if (!isMounted.current) return;
                 console.log("[useColyseus] Received water_reset message!");
                 // TODO: Need a way to bubble this up or handle side effect (e.g., callback prop)
                 // For now, just logging it here.
            });

            room.onMessage('debug_steal_check_positions', (message) => {
                // console.log('[useColyseus] Received debug_steal_check_positions:', message);
                // Handle the specific message payload here if needed
            });

            room.onMessage('flag_scored', (message) => {
                console.log('[useColyseus] Received flag_scored:', message);
            });

            // --- Lifecycle Listeners ---
            room.onLeave((code: number) => {
                console.log(`[useColyseus] Left room with code: ${code}`);
                roomRef.current = null; // Clear room ref
                 if (!isMounted.current) return; // Check mount status before setting state
                 setState({ // Reset state fully on leave
                     room: null,
                     sessionId: null,
                     players: new Map(),
                     items: [],
                     scores: { red: 0, blue: 0 },
                     gameTimeRemaining: undefined,
                     isConnected: false,
                     error: `Left room (code: ${code})`,
                     itemsScoredCount: 0, // Reset derived state
                 });
            });

            room.onError((code: number, message?: string) => {
                console.error(`[useColyseus] Room error (code ${code}): ${message}`);
                 if (!isMounted.current) return;
                 setState(prevState => ({
                     ...prevState,
                     isConnected: false, // Assume disconnected on error
                     error: `Room error ${code}: ${message || 'Unknown error'}`,
                     itemsScoredCount: 0, // Reset derived state
                 }));
            });

        } catch (e: any) {
            console.error("[useColyseus] Failed to join or create room:", e);
             if (!isMounted.current) return;
            setState(prevState => ({
                ...prevState,
                isConnected: false,
                error: e.message || "Failed to connect",
                itemsScoredCount: 0, // Reset derived state
            }));
        } finally {
            console.log("---> [useColyseus connect EXITING]"); // Log exit
            // Reset flag only if connection failed? Or always?
            // Let's reset always for now to allow retries if needed,
            // but this might need adjustment if retries cause issues.
            connectionAttempted.current = false;
        }
    }, []); // No dependencies, relies on refs

    const leave = useCallback(() => {
        if (roomRef.current) {
            console.log("[useColyseus] Leaving room manually...");
            roomRef.current.leave(); // Colyseus handles cleanup and triggers onLeave
        }
        // Reset state immediately if desired, though onLeave will also do it
        // setState({ ...initial state... });
    }, []);

    const sendInput = useCallback((input: { dx: number, dy: number }) => {
        if (roomRef.current && state.isConnected) {
            roomRef.current.send("input", input);
        }
    }, [state.isConnected]); // Depend on isConnected

    const addAi = useCallback((team: 'Red' | 'Blue') => {
        if (roomRef.current && state.isConnected) {
             console.log(`[useColyseus] Sending request to add ${team} AI...`);
             roomRef.current.send("add_ai", { team });
        } else {
             console.warn("[useColyseus] Game room not connected, cannot add AI.");
        }
    }, [state.isConnected]); // Depend on isConnected

    useEffect(() => {
        isMounted.current = true;
        console.log("---> [useColyseus useEffect Mount] Attempting initial connect.");
        // Reset flag on mount, just in case
        connectionAttempted.current = false;
        connect(); // Attempt connection on mount

        return () => {
            isMounted.current = false;
            leave(); // Ensure leave is called on unmount
            colyseusClient.current = null; // Clean up client ref
        };
    }, [connect, leave]); // Include connect and leave in dependency array

    // Expose necessary state and actions
    return {
        sessionId: state.sessionId,
        players: state.players,
        items: state.items,
        itemsScoredCount: state.itemsScoredCount,
        scores: state.scores,
        gameTimeRemaining: state.gameTimeRemaining,
        isConnected: state.isConnected,
        error: state.error,
        sendInput,
        addAi,
        // Expose room directly? Maybe not, prefer specific actions.
        // room: roomRef.current // Could expose the ref if direct access is needed, but risky
    };
}
