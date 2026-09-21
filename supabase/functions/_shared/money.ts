/** Rounds to two decimals without the usual binary-float drift on .5 cases. */
export function roundToCents(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/** Called amount for a subscription: commitment × percentage, in cents. */
export function computeCallAmount(subscriptionAmount: number, callPercentage: number): number {
  return roundToCents(subscriptionAmount * callPercentage / 100);
}
