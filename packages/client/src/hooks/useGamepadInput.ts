import { useState, useEffect, useCallback, useRef } from 'react';

const GAMEPAD_DEADZONE = 0.15; // Ignore small stick movements

export interface GamepadInputVector {
  dx: number;
  dy: number;
}

export function useGamepadInput() {
  const [connectedGamepadIndex, setConnectedGamepadIndex] = useState<number | null>(null);
  const latestInputRef = useRef<GamepadInputVector>({ dx: 0, dy: 0 });

  const handleGamepadConnected = useCallback((event: GamepadEvent) => {
    console.log(
      '[useGamepadInput] Gamepad connected:',
      event.gamepad.id,
      'Index:',
      event.gamepad.index
    );
    // Automatically use the first connected gamepad
    if (connectedGamepadIndex === null) {
      setConnectedGamepadIndex(event.gamepad.index);
    }
  }, [connectedGamepadIndex]); // Depend on index to only set if null

  const handleGamepadDisconnected = useCallback((event: GamepadEvent) => {
    console.log(
      '[useGamepadInput] Gamepad disconnected:',
      event.gamepad.id,
      'Index:',
      event.gamepad.index
    );
    if (connectedGamepadIndex === event.gamepad.index) {
      setConnectedGamepadIndex(null);
      latestInputRef.current = { dx: 0, dy: 0 }; // Reset input on disconnect
    }
  }, [connectedGamepadIndex]);

  useEffect(() => {
    window.addEventListener('gamepadconnected', handleGamepadConnected);
    window.addEventListener('gamepaddisconnected', handleGamepadDisconnected);

    // Check if a gamepad is already connected on hook mount
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (gamepads) {
        for (let i = 0; i < gamepads.length; i++) {
            const gamepad = gamepads[i]; // Assign to variable first
            if (gamepad) { // Now check if the variable is not null
                // Use the first already-connected gamepad found
                setConnectedGamepadIndex(gamepad.index);
                break;
            }
        }
    }


    return () => {
      window.removeEventListener('gamepadconnected', handleGamepadConnected);
      window.removeEventListener('gamepaddisconnected', handleGamepadDisconnected);
    };
  }, [handleGamepadConnected, handleGamepadDisconnected]); // Re-run if handlers change

  const pollGamepad = useCallback((): GamepadInputVector => {
    if (connectedGamepadIndex === null) {
      latestInputRef.current = { dx: 0, dy: 0 };
      return latestInputRef.current;
    }

    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gamepad = gamepads[connectedGamepadIndex];

    if (gamepad) {
      // Use the left stick (axes 0 and 1) for movement
      let dx = gamepad.axes[0] ?? 0;
      let dy = gamepad.axes[1] ?? 0;

      // Apply deadzone
      if (Math.abs(dx) < GAMEPAD_DEADZONE) dx = 0;
      if (Math.abs(dy) < GAMEPAD_DEADZONE) dy = 0;

      // Normalize if needed (optional, but good for consistency)
      const magnitude = Math.sqrt(dx * dx + dy * dy);
      if (magnitude > 1) {
          dx /= magnitude;
          dy /= magnitude;
      }

      latestInputRef.current = { dx, dy };
    } else {
      // Gamepad might have become null (e.g., browser glitch)
      latestInputRef.current = { dx: 0, dy: 0 };
      // Attempt to find another connected gamepad if the current one becomes null
      const otherGamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      let foundNewGamepad = false;
      for (let i = 0; i < otherGamepads.length; i++) {
          if (otherGamepads[i] && i !== connectedGamepadIndex) {
              console.log(`[useGamepadInput] Switching to gamepad index ${i}`);
              setConnectedGamepadIndex(i);
              foundNewGamepad = true;
              break;
          }
      }
      if (!foundNewGamepad) {
          setConnectedGamepadIndex(null);
      }
    }

    return latestInputRef.current;
  }, [connectedGamepadIndex]);

  return { pollGamepad, isGamepadConnected: connectedGamepadIndex !== null };
}
