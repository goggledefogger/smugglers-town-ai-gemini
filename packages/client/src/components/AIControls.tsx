import React, { useState } from 'react';

interface AIControlsProps {
  onAddAi: (team: 'Red' | 'Blue') => void;
}

const AIControls: React.FC<AIControlsProps> = ({ onAddAi }) => {
  const [addingRed, setAddingRed] = useState(false);
  const [addingBlue, setAddingBlue] = useState(false);

  // Base button style from our design system concept
  const baseButtonStyle = "block w-full text-center px-3 py-1.5 rounded font-semibold shadow-md transition-colors duration-150 text-sm disabled:opacity-50 disabled:cursor-not-allowed";

  const handleAddAi = (team: 'Red' | 'Blue') => {
    if (team === 'Red') {
      if (addingRed) return;
      setAddingRed(true);
      onAddAi('Red');
      setTimeout(() => setAddingRed(false), 1500);
    } else {
      if (addingBlue) return;
      setAddingBlue(true);
      onAddAi('Blue');
      setTimeout(() => setAddingBlue(false), 1500);
    }
  };

  return (
    // REMOVED inline style for position, rely on parent container
    <div
      // style={{ position: 'absolute', top: '1rem', right: '1rem' }}
      className="p-2 rounded text-white text-xs shadow-md z-30 space-y-2 w-full" // Removed bg-gray-800 bg-opacity-70
    >
      <span className="block font-bold mb-1 text-center">Add AI Player:</span>
      <button
        onClick={() => handleAddAi('Red')}
        disabled={addingRed}
        className={`${baseButtonStyle} bg-red-600/80 hover:bg-red-700/90 text-white`}
      >
        {addingRed ? 'Adding...' : 'Team Red'}
      </button>
      <button
        onClick={() => handleAddAi('Blue')}
        disabled={addingBlue}
        className={`${baseButtonStyle} bg-blue-600/80 hover:bg-blue-700/90 text-white`}
      >
        {addingBlue ? 'Adding...' : 'Team Blue'}
      </button>
    </div>
  );
};

export default AIControls;
