import React from 'react';

interface HUDProps {
  redScore: number;
  blueScore: number;
  gameTimeRemaining: number | undefined; // Can be undefined initially
  itemsScoredCount: number;
  myTeam?: 'Red' | 'Blue';
  mapLoading?: boolean;
}

// Helper to format seconds into MM:SS
const formatTime = (totalSeconds: number | undefined): string => {
  if (totalSeconds === undefined || totalSeconds < 0) {
    return "--:--"; // Placeholder or loading state
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const HUD: React.FC<HUDProps> = ({ redScore, blueScore, gameTimeRemaining, itemsScoredCount, myTeam, mapLoading }) => {
  // Basic styles for positioning and appearance
  const hudStyle: React.CSSProperties = {
    display: 'flex',
    gap: '15px',
    alignItems: 'center',
    color: 'white',
    padding: '8px 15px',
    borderRadius: '10px',
    fontFamily: 'Source Sans Pro, sans-serif', // Match design doc
    fontSize: '1.2em',
    pointerEvents: 'none', // Allow clicks to pass through to game if needed
  };

  const scoreStyle: React.CSSProperties = {
      textAlign: 'center',
  };

  const timerStyle: React.CSSProperties = {
      textAlign: 'center',
      fontVariantNumeric: 'tabular-nums', // Monospaced numbers
  };

  const blueScoreStyle = { ...scoreStyle, color: '#60a5fa' }; // Tailwind blue-400 approx
  const redScoreStyle = { ...scoreStyle, color: '#f87171' }; // Tailwind red-400 approx

  // Style for item count
  const itemCountStyle: React.CSSProperties = {
      textAlign: 'center',
      fontSize: '0.9em',
      opacity: 0.9,
      fontVariantNumeric: 'tabular-nums',
  };

  return (
    <div style={hudStyle}>
      {/* Display Scores */}
      <div style={blueScoreStyle}>{blueScore}</div>
      {/* Placeholder Timer or Loading State */}
      <div style={timerStyle}>
        {mapLoading ? <span style={{fontSize: '0.8em', color: '#fbbf24', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'}}>LOADING MAP...</span> : formatTime(gameTimeRemaining)}
      </div>
      {/* Display Scores */}
      <div style={redScoreStyle}>{redScore}</div>

      {/* Display Item Count */}
      <div style={itemCountStyle}>
          Items: {itemsScoredCount} / 4 {/* TODO: Get total number from constant/config */}
      </div>

      {/* Your team badge */}
      {myTeam && (
        <div style={{
            fontSize: '0.7em',
            fontWeight: 700,
            letterSpacing: '0.05em',
            padding: '2px 8px',
            borderRadius: '9999px',
            color: myTeam === 'Red' ? '#f87171' : '#60a5fa',
            border: `1px solid ${myTeam === 'Red' ? '#f87171' : '#60a5fa'}`,
        }}>
            YOU
        </div>
      )}
    </div>
  );
};

export default HUD;
