import React from 'react';

interface MapStyle {
  id: string;
  name: string;
}

// Define styles based on the screenshot from https://cloud.maptiler.com/maps/
const availableStyles: MapStyle[] = [
  { id: 'aquarelle', name: 'Aquarelle' },
  { id: 'backdrop', name: 'Backdrop' },
  { id: 'basic-v2', name: 'Basic' },
  { id: 'bright-v2', name: 'Bright' },
  { id: 'dataviz', name: 'Dataviz' },
  { id: 'landscape', name: 'Landscape' },
  { id: 'ocean', name: 'Ocean' },
  { id: 'openstreetmap', name: 'OpenStreetMap' },
  { id: 'outdoor-v2', name: 'Outdoor' },
  { id: 'satellite', name: 'Satellite' }, // Using standard satellite, not hybrid
  { id: 'streets-v2', name: 'Streets' },
  { id: 'toner-v2', name: 'Toner' },
  { id: 'topo-v2', name: 'Topo' },
  { id: 'winter-v2', name: 'Winter' },
];

interface MapStyleSelectorProps {
  currentStyleId: string;
  onStyleChange: (styleId: string) => void;
}

const MapStyleSelector: React.FC<MapStyleSelectorProps> = ({
  currentStyleId,
  onStyleChange,
}) => {
  const handleSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onStyleChange(event.target.value);
  };

  return (
    // REMOVED inline style for position, rely on parent container
    <div
      // style={{ position: 'absolute', top: '8rem', right: '1rem' }} // Position below AI Controls
      className="p-2 rounded text-white text-xs shadow-md z-30 w-full" // Removed space-y-1
    >
      <label className="block font-bold mb-1" htmlFor="map-style-select">Map Style:</label>
      {/* Use a select dropdown instead of buttons */}
      <select
        id="map-style-select"
        value={currentStyleId}
        onChange={handleSelectChange}
        // Style the select to match the theme (dark background, white text)
        className="block w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
      >
        {availableStyles.map((style) => (
          <option key={style.id} value={style.id}>
            {style.name}
          </option>
        ))}
      </select>
    </div>
  );
};

export default MapStyleSelector;
