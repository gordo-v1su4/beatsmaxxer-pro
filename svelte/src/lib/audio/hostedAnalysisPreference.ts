/**
 * Remembered answer to the hosted-analysis consent prompt.
 *
 * The prompt itself is a privacy boundary and is never removed: audio leaves the
 * device only after an explicit, informed choice. What this module allows is for
 * that choice to *persist*, so a song dropped in after the operator has already
 * opted in is analyzed immediately instead of stopping on a modal every time.
 *
 * Only an explicit "remember" tick writes anything. An absent or unreadable
 * value always means "ask again", so the safe path is also the default path.
 */
const STORAGE_KEY = 'bsp.hostedAnalysis.consent';

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
    // Private-mode / disabled storage must not break song loading.
    return 'ask';
  }
}

export function setHostedAnalysisPreference(preference: HostedAnalysisPreference): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (preference === 'ask') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    /* storage unavailable — the prompt simply keeps asking */
  }
}

export function clearHostedAnalysisPreference(): void {
  setHostedAnalysisPreference('ask');
}
