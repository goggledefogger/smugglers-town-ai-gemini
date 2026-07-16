export enum AIState {
  SEEKING_ITEM,
  PURSUING_CARRIER,
  RETURNING_TO_BASE,
  INTERCEPTING, // lead-pursuit of a distant opponent carrier
  DEFENDING, // escorting a teammate carrier
}
