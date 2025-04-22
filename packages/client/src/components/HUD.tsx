import React from 'react';

interface HUDProps {
  // Props for scores, timer, etc. will be added later
  redScore: number;
  blueScore: number;
  gameTimeRemaining: number | undefined; // Can be undefined initially
  localPlayerTeam?: 'Red' | 'Blue';
  itemsScoredCount: number; // Replaced itemStatusString
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

const HUD: React.FC<HUDProps> = ({ redScore, blueScore, gameTimeRemaining, localPlayerTeam, itemsScoredCount }) => {
  // Basic styles for positioning and appearance
  const hudStyle: React.CSSProperties = {
    position: 'absolute',
    top: '10px',
    left: '50%',
    transform: 'translateX(-50%)', // Center horizontally
    display: 'flex',
    gap: '30px',
    backgroundColor: 'rgba(19, 22, 25, 0.7)', // Charcoal semi-transparent bg
    color: 'white',
    padding: '8px 15px',
    borderRadius: '10px',
    fontFamily: 'Source Sans Pro, sans-serif', // Match design doc
    fontSize: '1.2em',
    zIndex: 10, // Ensure it's above map/pixi
    pointerEvents: 'none', // Allow clicks to pass through to game if needed
  };

  const scoreStyle: React.CSSProperties = {
      minWidth: '40px', // Ensure some space
      textAlign: 'center',
  };

  const timerStyle: React.CSSProperties = {
      minWidth: '60px',
      textAlign: 'center',
      fontVariantNumeric: 'tabular-nums', // Monospaced numbers
  };

  const blueScoreStyle = { ...scoreStyle, color: '#60a5fa' }; // Tailwind blue-400 approx
  const redScoreStyle = { ...scoreStyle, color: '#f87171' }; // Tailwind red-400 approx

  // Style for team indicator
  const teamStyle: React.CSSProperties = {
    padding: '0 10px',
    fontWeight: 'bold',
  };

  // Style for item count
  const itemCountStyle: React.CSSProperties = {
      minWidth: '100px', // Give it some space
      textAlign: 'center',
      fontSize: '0.9em',
      opacity: 0.9,
      fontVariantNumeric: 'tabular-nums',
  };

  const playerTeamColor = localPlayerTeam === 'Red' ? redScoreStyle.color : localPlayerTeam === 'Blue' ? blueScoreStyle.color : 'white';

  return (
    <div style={hudStyle}>
      {/* Display Player Team */}
      {localPlayerTeam && (
        <div style={{ ...teamStyle, color: playerTeamColor }}>
          Team: {localPlayerTeam}
        </div>
      )}

      {/* Display Scores */}
      <div style={blueScoreStyle}>{blueScore}</div>
      {/* Placeholder Timer */}
      <div style={timerStyle}>{formatTime(gameTimeRemaining)}</div>
      {/* Display Scores */}
      <div style={redScoreStyle}>{redScore}</div>

      {/* Display Item Count */}
      <div style={itemCountStyle}>
          Items: {itemsScoredCount} / 4 {/* TODO: Get total number from constant/config */}
      </div>
    </div>
  );
};

export default HUD;
