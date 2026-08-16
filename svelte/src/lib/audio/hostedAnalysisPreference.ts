/**
 * Remembered answer to the hosted-analysis consent prompt, so a song dropped in
 * after the operator opted in is analyzed immediately instead of stopping on the
 * modal every time. Only an explicit "remember" tick writes anything; an absent
 * or unreadable value means ask again, so the safe path is the default path.
 */
const STORAGE_KEY = 'bmx.hostedAnalysis.consent';

export type HostedAnalysisPreference = 'ask' | 'analyze' | 'local';

function isPreference(value: unknown): value is HostedAnalysisPreference {
  return value === 'ask' || value === 'analyze' || value === 'local';
}

export function readHostedAnalysisPreference(): HostedAnalysisPreference {
  if (typeof localStorage === 'undefined') return 'ask';
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isPreference(stored) ? stored : 'ask';
  } catch {
    // Private-mode or disabled storage must not break song loading.
    return 'ask';
  }
}

export function setHostedAnalysisPreference(preference: HostedAnalysisPreference): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (preference === 'ask') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    /* storage unavailable — the prompt keeps asking */
  }
}
