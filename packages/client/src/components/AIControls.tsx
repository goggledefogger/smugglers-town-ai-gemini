import React from 'react';

interface AIControlsProps {
  onAddAi: (team: 'Red' | 'Blue') => void;
}

const AIControls: React.FC<AIControlsProps> = ({ onAddAi }) => {
  // Base button style from our design system concept
  const baseButtonStyle = "block w-full text-center px-3 py-1.5 rounded font-semibold shadow-md transition-colors duration-150 text-sm"; // Centered text, slightly larger padding

  return (
    // REMOVED inline style for position, rely on parent container
    <div
      // style={{ position: 'absolute', top: '1rem', right: '1rem' }}
      className="p-2 rounded text-white text-xs shadow-md z-30 space-y-2 w-full" // Removed bg-gray-800 bg-opacity-70
    >
      <span className="block font-bold mb-1 text-center">Add AI Player:</span>
      <button
        onClick={() => onAddAi('Red')}
        className={`${baseButtonStyle} bg-red-600/80 hover:bg-red-700/90 text-white`}
      >
        Team Red
      </button>
      <button
        onClick={() => onAddAi('Blue')}
        className={`${baseButtonStyle} bg-blue-600/80 hover:bg-blue-700/90 text-white`}
      >
        Team Blue
      </button>
    </div>
  );
};

export default AIControls;
