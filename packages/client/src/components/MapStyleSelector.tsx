import React from 'react';

interface MapStyle {
  id: string;
  name: string;
}

// Define a few initial styles based on MapTiler documentation
const availableStyles: MapStyle[] = [
  { id: 'streets-v2', name: 'Streets' },
  { id: 'hybrid', name: 'Satellite' }, // Hybrid includes labels
  { id: 'basic-v2', name: 'Basic' },
  { id: 'outdoor-v2', name: 'Outdoor' },
  { id: 'streets-v2-dark', name: 'Streets Dark' },
  // Add more styles here as needed
];

interface MapStyleSelectorProps {
  currentStyleId: string;
  onStyleChange: (styleId: string) => void;
}

const MapStyleSelector: React.FC<MapStyleSelectorProps> = ({
  currentStyleId,
  onStyleChange,
}) => {
  // Base button style from our design system concept
  const baseButtonStyle = "block w-full text-left px-2 py-1 rounded transition-colors duration-150";

  return (
    // REMOVED inline style for position, rely on parent container
    <div
      // style={{ position: 'absolute', top: '8rem', right: '1rem' }} // Position below AI Controls
      className="p-2 rounded text-white text-xs space-y-1 shadow-md z-30 w-full" // Removed bg-gray-800 bg-opacity-70
    >
      <span className="block font-bold mb-1">Map Style:</span>
      {availableStyles.map((style) => (
        <button
          key={style.id}
          onClick={() => onStyleChange(style.id)}
          // Apply base button style and conditional active style
          className={`${baseButtonStyle} ${
            currentStyleId === style.id
              ? 'bg-blue-600 font-semibold' // Active state
              : 'bg-gray-700 hover:bg-gray-600' // Default state
          }`}
        >
          {style.name}
        </button>
      ))}
    </div>
  );
};

export default MapStyleSelector;
