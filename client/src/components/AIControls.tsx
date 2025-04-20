import React from 'react';

interface AIControlsProps {
  onAddAi: (team: 'Red' | 'Blue') => void;
}

const AIControls: React.FC<AIControlsProps> = ({ onAddAi }) => {
  return (
    <div className="absolute top-4 right-4 z-50 flex flex-col space-y-2 pointer-events-auto">
      <button
        onClick={() => onAddAi('Red')}
        className="bg-red-600/80 hover:bg-red-700/90 text-white font-semibold py-2 px-4 rounded-lg text-sm shadow transition-colors duration-150"
      >
        Add Red AI
      </button>
      <button
        onClick={() => onAddAi('Blue')}
        className="bg-blue-600/80 hover:bg-blue-700/90 text-white font-semibold py-2 px-4 rounded-lg text-sm shadow transition-colors duration-150"
      >
        Add Blue AI
      </button>
    </div>
  );
};

export default AIControls;
