export interface ArrangementLoopSpan {
  startSeconds: number;
  endSeconds: number;
}

/** When a loop region is active, ARMED cuts only fire for steps inside it. */
export function cutStepAllowedInLoop(
  stepSeconds: number,
  loop: ArrangementLoopSpan | null,
): boolean {
  if (!loop || loop.endSeconds <= loop.startSeconds) return true;
  return stepSeconds >= loop.startSeconds && stepSeconds < loop.endSeconds;
}
