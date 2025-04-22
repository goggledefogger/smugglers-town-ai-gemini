import { useState, useEffect, useRef, useCallback } from 'react';

interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export function useInputHandling() {
    const inputState = useRef<InputState>({ up: false, down: false, left: false, right: false });
    // We don't need to expose the raw input state as state variable,
    // only the calculated dx, dy for sending to the server.
    const [inputVector, setInputVector] = useState<{ dx: number, dy: number }>({ dx: 0, dy: 0 });

    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        let changed = false;
        switch (event.key) {
            case 'w': case 'ArrowUp': if (!inputState.current.up) { inputState.current.up = true; changed = true; } break;
            case 's': case 'ArrowDown': if (!inputState.current.down) { inputState.current.down = true; changed = true; } break;
            case 'a': case 'ArrowLeft': if (!inputState.current.left) { inputState.current.left = true; changed = true; } break;
            case 'd': case 'ArrowRight': if (!inputState.current.right) { inputState.current.right = true; changed = true; } break;
        }
        if (changed) {
            updateInputVector();
        }
    }, []); // Empty dependency array, relies on ref

    const handleKeyUp = useCallback((event: KeyboardEvent) => {
        let changed = false;
        switch (event.key) {
            case 'w': case 'ArrowUp': if (inputState.current.up) { inputState.current.up = false; changed = true; } break;
            case 's': case 'ArrowDown': if (inputState.current.down) { inputState.current.down = false; changed = true; } break;
            case 'a': case 'ArrowLeft': if (inputState.current.left) { inputState.current.left = false; changed = true; } break;
            case 'd': case 'ArrowRight': if (inputState.current.right) { inputState.current.right = false; changed = true; } break;
        }
        if (changed) {
            updateInputVector();
        }
    }, []); // Empty dependency array, relies on ref

    // Helper function to update the dx, dy state based on the ref
    const updateInputVector = () => {
        const dx = (inputState.current.right ? 1 : 0) - (inputState.current.left ? 1 : 0);
        const dy = (inputState.current.down ? 1 : 0) - (inputState.current.up ? 1 : 0);
        // Only update state if the vector actually changed
        setInputVector(prev => (prev.dx === dx && prev.dy === dy) ? prev : { dx, dy });
    };

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        // Ensure vector is updated on initial load
        updateInputVector();

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [handleKeyDown, handleKeyUp]); // Add handlers to dependency array

    // Return the calculated dx, dy vector which can be sent to the server
    return inputVector;
}
