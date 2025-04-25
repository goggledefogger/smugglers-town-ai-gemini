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
    sessionIdRef: React.RefObject<string | null>;
    arenaStateRef: React.RefObject<ArenaState | null>;
    players: Map<string, Player>;
    items: FlagState[];
    itemsScoredCount: number;
    scores: { red: number; blue: number };
    gameTimeRemaining: number | undefined;
    isConnected: boolean;
    error: string | null;
    sendInput: (input: { dx: number; dy: number }) => void;
    addAiPlayer: (team: 'Red' | 'Blue') => void;
    client: Client | null;
    room: Room<ArenaState> | null;
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
    const sessionIdRef = useRef<string | null>(null);
    const isMounted = useRef(false);
    const colyseusClient = useRef<Client | null>(null);
    const roomRef = useRef<Room<ArenaState> | null>(null);
    const connectionAttempted = useRef(false);
    const arenaStateRef = useRef<ArenaState | null>(null);

    const connect = useCallback(async () => {
        console.log("---> [useColyseus connect ENTERED]");
        if (connectionAttempted.current) {
            console.log("---> [useColyseus connect] Already attempting connection, skipping.");
            return;
        }
        connectionAttempted.current = true;

        if (roomRef.current || !isMounted.current) {
            console.log("---> [useColyseus connect] Room exists or component unmounted, skipping.");
            connectionAttempted.current = false;
            return;
        }

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
            const joinOptions = { persistentPlayerId: tabId };
            const room = await colyseusClient.current.joinOrCreate<ArenaState>('arena', joinOptions);
            roomRef.current = room;
            sessionIdRef.current = room.sessionId;

            console.log(`[useColyseus] Joined room: ${room.id}, Session ID: ${sessionIdRef.current}, Tab ID: ${tabId}`);

            setInternalState(prevState => ({
                ...prevState,
                room: room,
                isConnected: true,
                error: null,
            }));

            room.onStateChange((newState: ArenaState) => {
                 if (!isMounted.current) return;
                 console.log('[useColyseus onStateChange] Received new state:', newState);
                 arenaStateRef.current = newState;
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

            console.log('[useColyseus Post-Join] Initial room state:', roomRef.current?.state);

            if (roomRef.current?.state) {
                const initialState = roomRef.current.state;
                arenaStateRef.current = initialState;
                const initialScoredCount = initialState.items.filter((item: FlagState) => item.status === 'scored').length;
                setInternalState(prevState => ({
                    ...prevState,
                    players: new Map(initialState.players.entries()),
                    items: Array.from(initialState.items.values()),
                    scores: { red: initialState.redScore, blue: initialState.blueScore },
                    gameTimeRemaining: initialState.gameTimeRemaining,
                    itemsScoredCount: initialScoredCount,
                    isConnected: prevState.isConnected,
                    error: prevState.error
                }));
                console.log('[useColyseus Post-Join] Manually set initial arenaStateRef and derived state.');
            }

            room.onMessage("water_reset", () => {
                 if (!isMounted.current) return;
                 console.log("[useColyseus] Received water_reset message!");
            });

            room.onMessage('debug_steal_check_positions', (_message) => {
            });

            room.onMessage('flag_scored', (message) => {
                console.log('[useColyseus] Received flag_scored:', message);
            });

            room.onLeave((code: number) => {
                console.log(`[useColyseus] Left room with code: ${code}`);
                roomRef.current = null;
                sessionIdRef.current = null;
                arenaStateRef.current = null;
                 if (!isMounted.current) return;
                 setInternalState({
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
                 arenaStateRef.current = null;
                 if (!isMounted.current) return;
                 setInternalState(prevState => ({
                     ...prevState,
                     isConnected: false,
                     error: `Room error ${code}: ${message || 'Unknown error'}`,
                     players: new Map(),
                     items: [],
                     scores: { red: 0, blue: 0 },
                     gameTimeRemaining: undefined,
                     itemsScoredCount: 0,
                 }));
             });

        } catch (e: any) {
            console.error("[useColyseus] Failed to join or create room:", e);
             arenaStateRef.current = null;
             if (!isMounted.current) return;
            setInternalState(prevState => ({
                ...prevState,
                isConnected: false,
                error: e.message || "Failed to connect",
                itemsScoredCount: 0,
                 players: new Map(),
                 items: [],
                 scores: { red: 0, blue: 0 },
                 gameTimeRemaining: undefined,
            }));
        } finally {
            console.log("---> [useColyseus connect EXITING]");
            connectionAttempted.current = false;
        }
    }, []);

    const leave = useCallback(() => {
        if (roomRef.current) {
            console.log("[useColyseus] Leaving room manually...");
            roomRef.current.leave();
        }
    }, []);

    const sendInput = useCallback((input: { dx: number, dy: number }) => {
        if (roomRef.current && internalState.isConnected) {
            roomRef.current.send("input", input);
        }
    }, [internalState.isConnected]);

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
        connectionAttempted.current = false;
        connect();

        return () => {
            isMounted.current = false;
            arenaStateRef.current = null;
            leave();
            colyseusClient.current = null;
            sessionIdRef.current = null;
        };
    }, [connect, leave]);

    return {
        sessionIdRef,
        arenaStateRef,
        players: internalState.players,
        items: internalState.items,
        itemsScoredCount: internalState.itemsScoredCount,
        scores: internalState.scores,
        gameTimeRemaining: internalState.gameTimeRemaining,
        isConnected: internalState.isConnected,
        error: internalState.error,
        sendInput,
        addAiPlayer,
        client: colyseusClient.current,
        room: roomRef.current
    };
}
