import React, { useState, useRef } from 'react';

interface FloatingPanelProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const FloatingPanel: React.FC<FloatingPanelProps> = ({ children, className = '', style }) => {
  const [hovered, setHovered] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    setHovered(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setHovered(false), 2000); // 2s fade out
  };

  // Define dynamic opacity
  const opacity = hovered ? 1 : 0.3; // 100% on hover, 30% default

  return (
    <div
      // Use transition-opacity for the fade effect
      className={`bg-slate-800 transition-opacity duration-500 ${className}`}
      style={{
        opacity: opacity, // Apply overall opacity
        ...style, // Apply other passed styles
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </div>
  );
};
