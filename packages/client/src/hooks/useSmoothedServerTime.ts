import { useState, useEffect, useRef } from 'react';

/**
 * Hook to provide a smoothed, client-side countdown based on server time updates.
 * @param serverTime The authoritative time remaining received from the server (e.g., gameTimeRemaining).
 * @param smoothingIntervalMs The interval (in ms) at which to update the client-side display. Default 100ms.
 * @returns The smoothed time remaining value (in seconds) for display.
 */
export function useSmoothedServerTime(
    serverTime: number | undefined,
    smoothingIntervalMs: number = 100
): number | undefined {
    const [displayTime, setDisplayTime] = useState<number | undefined>(serverTime);
    const lastServerTimeRef = useRef<number | undefined>(serverTime);
    const lastServerTimeReceivedAtRef = useRef<number | undefined>(undefined);

    // Effect 1: Update refs and reset display time when server time changes
    useEffect(() => {
        // Only update if the server time is valid and different from the last known server time
        if (serverTime !== undefined && serverTime !== lastServerTimeRef.current) {
            // console.log(`[TimerSmooth] Received new server time: ${serverTime}`); // Debug log
            lastServerTimeRef.current = serverTime;
            lastServerTimeReceivedAtRef.current = performance.now();
            setDisplayTime(serverTime); // Reset display immediately to sync
        } else if (serverTime === undefined) {
             // Handle case where server time becomes undefined (e.g., disconnect)
             lastServerTimeRef.current = undefined;
             lastServerTimeReceivedAtRef.current = undefined;
             setDisplayTime(undefined);
        }
    }, [serverTime]);

    // Effect 2: Run the client-side countdown interval
    useEffect(() => {
        if (lastServerTimeRef.current === undefined || lastServerTimeReceivedAtRef.current === undefined) {
            // Don't run interval if we don't have a valid server time baseline
            return;
        }

        const intervalId = setInterval(() => {
            const lastServerTime = lastServerTimeRef.current;
            const lastReceivedAt = lastServerTimeReceivedAtRef.current;

            // Double check refs haven't become undefined somehow
            if (lastServerTime === undefined || lastReceivedAt === undefined) {
                setDisplayTime(undefined); // Ensure display reflects undefined state
                return;
            }

            const clientElapsedSeconds = (performance.now() - lastReceivedAt) / 1000;
            const estimatedTime = lastServerTime - clientElapsedSeconds;
            const displayValue = Math.max(0, estimatedTime); // Clamp at 0

            // Update display state only if it visually changes (optional optimization)
            // setDisplayTime(prev => (prev !== undefined && Math.floor(prev) === Math.floor(displayValue)) ? prev : displayValue);
            setDisplayTime(displayValue); // Update display state directly

            // If timer hits zero locally, we could potentially clear the interval
            // but it might restart if a slightly > 0 server update arrives later.
            // It's safer to let Effect 1 handle stopping/resetting based on serverTime.

        }, smoothingIntervalMs);

        // Cleanup function to clear the interval
        return () => clearInterval(intervalId);

    }, [smoothingIntervalMs, serverTime]); // Re-run if interval changes or serverTime forces a reset via Effect 1

    return displayTime;
} 