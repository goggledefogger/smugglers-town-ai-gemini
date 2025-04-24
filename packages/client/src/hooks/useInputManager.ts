import { useState, useEffect, useCallback, useRef } from 'react';
import { useKeyboardInput } from './useKeyboardInput';
import { useGamepadInput } from './useGamepadInput';

// Unified Input Vector type
export interface InputVector {
    dx: number;
    dy: number;
}

export function useInputManager() {
    const { getKeyboardInput } = useKeyboardInput();
    const { pollGamepad, isGamepadConnected } = useGamepadInput();
    const animationFrameRef = useRef<number | null>(null);
    const [currentInputVector, setCurrentInputVector] = useState<InputVector>({ dx: 0, dy: 0 });

    const updateInput = useCallback(() => {
        let newInputVector: InputVector = { dx: 0, dy: 0 };

        const gamepadInput = pollGamepad(); // Poll gamepad state first

        if (isGamepadConnected && (gamepadInput.dx !== 0 || gamepadInput.dy !== 0)) {
            // Use gamepad input if connected and active
            newInputVector = gamepadInput;
        } else {
            // Otherwise, use keyboard input
            const keyboardInput = getKeyboardInput();
            newInputVector = keyboardInput;
        }

         setCurrentInputVector(newInputVector);

        // Request next frame
        animationFrameRef.current = requestAnimationFrame(updateInput);
    }, [getKeyboardInput, pollGamepad, isGamepadConnected]); // Dependencies needed

    useEffect(() => {
        // Start polling loop
        animationFrameRef.current = requestAnimationFrame(updateInput);

        // Cleanup function to cancel the animation frame request
        return () => {
            if (animationFrameRef.current !== null) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [updateInput]); // Re-run effect if updateInput changes

    // Return the continuously updated input vector
    return { inputVector: currentInputVector };
}
