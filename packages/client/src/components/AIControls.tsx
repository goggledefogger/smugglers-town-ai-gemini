import React, { useState, useMemo } from 'react';
import { Player } from '@smugglers-town/shared-schemas';
import { MapSchema } from '@colyseus/schema';

interface AIControlsProps {
  onAddAi: (team: 'Red' | 'Blue') => void;
  players: MapSchema<Player>;
  localPlayerTeam?: 'Red' | 'Blue' | 'none';
}

const AIControls: React.FC<AIControlsProps> = ({ onAddAi, players, localPlayerTeam }) => {
  const [addingRed, setAddingRed] = useState(false);
  const [addingBlue, setAddingBlue] = useState(false);

  const teamCounts = useMemo(() => {
    const counts = {
      Red: { human: 0, ai: 0 },
      Blue: { human: 0, ai: 0 },
    };
    if (players) {
      players.forEach(player => {
        if (player.team === 'Red' || player.team === 'Blue') {
          if (player.isAI) {
            counts[player.team].ai++;
          } else {
            counts[player.team].human++;
          }
        }
      });
    }
    return counts;
  }, [players]);

  // Base button style from our design system concept
  const baseButtonStyle = "block w-full text-center px-3 py-1.5 rounded font-semibold shadow-md transition-colors duration-150 text-sm disabled:opacity-50 disabled:cursor-not-allowed";

  const handleAddAi = (team: 'Red' | 'Blue') => {
    if (team === 'Red') {
      if (addingRed) return;
      setAddingRed(true);
      onAddAi('Red');
      setTimeout(() => setAddingRed(false), 1500);
    } else if (team === 'Blue') {
      if (addingBlue) return;
      setAddingBlue(true);
      onAddAi('Blue');
      setTimeout(() => setAddingBlue(false), 1500);
    }
  };

  // Helper function to get background style
  const getTeamSectionStyle = (team: 'Red' | 'Blue'): string => {
    if (localPlayerTeam === team) {
      // Use a faint version of the team color for the background
      const baseStyle = 'p-1 rounded';
      if (team === 'Red') {
        return `bg-red-900/50 ${baseStyle}`;
      } else if (team === 'Blue') {
        return `bg-blue-900/50 ${baseStyle}`;
      }
    }
    return 'p-1'; // Default padding only if not player's team
  };

  return (
    <div className="p-2 rounded text-white text-xs shadow-md z-30 space-y-1 w-full">
      <span className="block font-bold mb-2 text-center">Add AI Player:</span>

      {/* Red Team Button and Counts */}
      <div className={`space-y-1 ${getTeamSectionStyle('Red')}`}> {/* Apply conditional style */}
        <button
          onClick={() => handleAddAi('Red')}
          disabled={addingRed}
          className={`${baseButtonStyle} bg-red-600/80 hover:bg-red-700/90 text-white`}
        >
          {addingRed ? 'Adding...' : 'Team Red'}
        </button>
        <div className="flex justify-center items-center space-x-2 text-xs opacity-80">
          <span>👤 {teamCounts.Red.human}</span>
          <span>🤖 {teamCounts.Red.ai}</span>
        </div>
      </div>

      {/* Blue Team Button and Counts */}
      <div className={`space-y-1 mt-1 ${getTeamSectionStyle('Blue')}`}> {/* Apply conditional style, reduced mt */}
        <button
          onClick={() => handleAddAi('Blue')}
          disabled={addingBlue}
          className={`${baseButtonStyle} bg-blue-600/80 hover:bg-blue-700/90 text-white`}
        >
          {addingBlue ? 'Adding...' : 'Team Blue'}
        </button>
        <div className="flex justify-center items-center space-x-2 text-xs opacity-80">
          <span>👤 {teamCounts.Blue.human}</span>
          <span>🤖 {teamCounts.Blue.ai}</span>
        </div>
      </div>

    </div>
  );
};

export default AIControls;
