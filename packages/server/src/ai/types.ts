export enum AIState {
  SEEKING_ITEM,
  PURSUING_CARRIER, // Simple chase
  RETURNING_TO_BASE,
  INTERCEPTING, // Smarter chase
  DEFENDING, // Escorting teammate
  // IDLE // Potential future state
}

// Add other AI-specific types or interfaces here if needed later
