/// <reference types="vite/client" />

import { useState, useEffect, useRef, useCallback } from 'react';
import { Client, Room } from 'colyseus.js';
import { v4 as uuidv4 } from 'uuid';
import { ArenaState, Player, FlagState } from '@smugglers-town/shared-schemas';

const COLYSEUS_ENDPOINT = import.meta.env.VITE_COLYSEUS_ENDPOINT?.toString() || 'ws://localhost:2567';
const SESSION_TAB_ID_KEY = 'smugglersTown_sessionTabId'; // REVERTED KEY - Using sessionStorage

// Define the shape of the state managed internally by the hook
interface ColyseusHookInternalState {
    room: Room<ArenaState> | null;
    players: Map<string, Player>;
    items: FlagState[];
    scores: { red: number; blue: number };
    gameTimeRemaining: number | undefined;
    isConnected: boolean;
    error: string | null;
    itemsScoredCount: number;
}

// Define the shape of the object returned by the hook
export interface UseColyseusReturn {
    sessionIdRef: React.RefObject<string | null>; // Expose the RefObject
    players: Map<string, Player>;
    items: FlagState[];
    itemsScoredCount: number;
    scores: { red: number; blue: number };
    gameTimeRemaining: number | undefined;
    isConnected: boolean;
    error: string | null;
    sendInput: (input: { dx: number; dy: number }) => void;
    addAiPlayer: (team: 'Red' | 'Blue') => void; // Renamed for clarity
    client: Client | null; // Expose client if needed for advanced use
    room: Room<ArenaState> | null; // Expose room ref if needed
}

export function useColyseus(): UseColyseusReturn {
    const [internalState, setInternalState] = useState<ColyseusHookInternalState>({
        room: null,
        players: new Map(),
        items: [],
        scores: { red: 0, blue: 0 },
        gameTimeRemaining: undefined,
        isConnected: false,
        error: null,
        itemsScoredCount: 0,
    });
    const sessionIdRef = useRef<string | null>(null); // Ref to store the session ID string
    const isMounted = useRef(false);
    const colyseusClient = useRef<Client | null>(null);
    const roomRef = useRef<Room<ArenaState> | null>(null);
    const connectionAttempted = useRef(false);

    const connect = useCallback(async () => {
        console.log("---> [useColyseus connect ENTERED]");
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

        // Get/Set Session Tab ID using sessionStorage
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
            // Pass the tabId to the server as persistentPlayerId
            const joinOptions = { persistentPlayerId: tabId };
            const room = await colyseusClient.current.joinOrCreate<ArenaState>('arena', joinOptions);
            roomRef.current = room;
            sessionIdRef.current = room.sessionId; // <-- Store session ID in the ref

            console.log(`[useColyseus] Joined room: ${room.id}, Session ID: ${sessionIdRef.current}, Tab ID: ${tabId}`);

            setInternalState(prevState => ({
                ...prevState,
                room: room,
                isConnected: true,
                error: null,
            }));

            // --- State Change Listener ---
            room.onStateChange((newState: ArenaState) => {
                 if (!isMounted.current) return;
                const scoredCount = newState.items.filter((item: FlagState) => item.status === 'scored').length;
                setInternalState(prevState => ({
                    ...prevState,
                    players: new Map(newState.players.entries()),
                    items: Array.from(newState.items.values()),
                    scores: { red: newState.redScore, blue: newState.blueScore },
                    gameTimeRemaining: newState.gameTimeRemaining,
                    itemsScoredCount: scoredCount,
                }));
            });

            // --- Message Listeners ---
            room.onMessage("water_reset", () => {
                 if (!isMounted.current) return;
                 console.log("[useColyseus] Received water_reset message!");
                 // TODO: Need a way to bubble this up or handle side effect (e.g., callback prop)
                 // For now, just logging it here.
            });

            room.onMessage('debug_steal_check_positions', (_message) => {
                // TODO: Implement visualization for debugging steal checks
                // console.log("Debug Steal Check Positions:", message);
            });

            room.onMessage('flag_scored', (message) => {
                console.log('[useColyseus] Received flag_scored:', message);
            });

            // --- Lifecycle Listeners ---
            room.onLeave((code: number) => {
                console.log(`[useColyseus] Left room with code: ${code}`);
                roomRef.current = null;
                sessionIdRef.current = null; // <-- Clear session ID ref on leave
                 if (!isMounted.current) return;
                 setInternalState({ // Reset state fully on leave
                     room: null,
                     players: new Map(),
                     items: [],
                     scores: { red: 0, blue: 0 },
                     gameTimeRemaining: undefined,
                     isConnected: false,
                     error: `Left room (code: ${code})`,
                     itemsScoredCount: 0,
                 });
            });

            room.onError((code: number, message?: string) => {
                 console.error(`[useColyseus] Room error (code ${code}): ${message}`);
                 if (!isMounted.current) return;
                  // Don't clear sessionIdRef here, might still be valid for reconnect attempts?
                  // Only clear on explicit leave or unmount.
                 setInternalState(prevState => ({
                     ...prevState,
                     isConnected: false,
                     error: `Room error ${code}: ${message || 'Unknown error'}`,
                     itemsScoredCount: 0,
                 }));
             });

        } catch (e: any) {
            console.error("[useColyseus] Failed to join or create room:", e);
             if (!isMounted.current) return;
            // Don't clear sessionIdRef here on initial connection failure
            setInternalState(prevState => ({
                ...prevState,
                isConnected: false,
                error: e.message || "Failed to connect",
                itemsScoredCount: 0,
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
        if (roomRef.current && internalState.isConnected) {
            roomRef.current.send("input", input);
        }
    }, [internalState.isConnected]);

    // Renamed function for clarity
    const addAiPlayer = useCallback((team: 'Red' | 'Blue') => {
        if (roomRef.current && internalState.isConnected) {
             console.log(`[useColyseus] Sending request to add ${team} AI...`);
             roomRef.current.send("add_ai", { team });
        } else {
             console.warn("[useColyseus] Game room not connected, cannot add AI.");
        }
    }, [internalState.isConnected]);

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
            sessionIdRef.current = null; // <-- Clear ref on unmount
        };
    }, [connect, leave]); // Include connect and leave in dependency array

    // Expose necessary state and actions according to UseColyseusReturn interface
    return {
        sessionIdRef, // Return the RefObject
        players: internalState.players,
        items: internalState.items,
        itemsScoredCount: internalState.itemsScoredCount,
        scores: internalState.scores,
        gameTimeRemaining: internalState.gameTimeRemaining,
        isConnected: internalState.isConnected,
        error: internalState.error,
        sendInput,
        addAiPlayer, // Use renamed function
        client: colyseusClient.current, // Expose client ref's current value
        room: roomRef.current // Expose room ref's current value
    };
}
