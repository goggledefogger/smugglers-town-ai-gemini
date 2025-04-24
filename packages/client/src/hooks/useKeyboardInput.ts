import { useState, useEffect, useCallback, useRef } from 'react';

export interface KeyboardInputVector {
    dx: number;
    dy: number;
}

// Maintain the mapping of keys to directions
const keyMap: { [key: string]: { dx: number; dy: number } } = {
    ArrowUp: { dx: 0, dy: -1 },
    KeyW: { dx: 0, dy: -1 },
    ArrowDown: { dx: 0, dy: 1 },
    KeyS: { dx: 0, dy: 1 },
    ArrowLeft: { dx: -1, dy: 0 },
    KeyA: { dx: -1, dy: 0 },
    ArrowRight: { dx: 1, dy: 0 },
    KeyD: { dx: 1, dy: 0 },
};

export function useKeyboardInput() {
    // Use a ref to track pressed keys to handle multiple keys simultaneously
    const pressedKeysRef = useRef<Set<string>>(new Set());
    const inputVectorRef = useRef<KeyboardInputVector>({ dx: 0, dy: 0 });

    const calculateInputVector = useCallback(() => {
        let dx = 0;
        let dy = 0;

        pressedKeysRef.current.forEach(key => {
            if (keyMap[key]) {
                dx += keyMap[key].dx;
                dy += keyMap[key].dy;
            }
        });

        // Normalize the vector if moving diagonally
        const magnitude = Math.sqrt(dx * dx + dy * dy);
        if (magnitude > 0) {
            dx /= magnitude;
            dy /= magnitude;
        }

        inputVectorRef.current = { dx, dy };
    }, []); // No dependencies needed as it relies on the ref

    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        if (keyMap[event.code] && !pressedKeysRef.current.has(event.code)) {
            pressedKeysRef.current.add(event.code);
            calculateInputVector();
        }
    }, [calculateInputVector]);

    const handleKeyUp = useCallback((event: KeyboardEvent) => {
        if (pressedKeysRef.current.has(event.code)) {
            pressedKeysRef.current.delete(event.code);
            calculateInputVector();
        }
    }, [calculateInputVector]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        // Initial calculation in case keys are held down when component mounts (less likely but safe)
        calculateInputVector();

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            // Reset vector on cleanup
            inputVectorRef.current = { dx: 0, dy: 0 };
            pressedKeysRef.current.clear();
        };
    }, [handleKeyDown, handleKeyUp, calculateInputVector]);

    // Function to get the latest calculated input vector
    const getKeyboardInput = useCallback((): KeyboardInputVector => {
        // Ensure the vector is up-to-date (covers edge cases, though calculateInputVector should handle most)
        calculateInputVector();
        return inputVectorRef.current;
    }, [calculateInputVector]);


    // Return a function to get the current input, rather than the state itself
    return { getKeyboardInput };
}
