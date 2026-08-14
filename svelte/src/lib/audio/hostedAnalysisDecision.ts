import type { HostedAnalysisPreference } from '$lib/audio/hostedAnalysisPreference';

/**
 * Whether a song upload can be loaded straight away, and with what.
 *
 * Both shells have to answer the same question — does this file go to the hosted
 * analyser, stay local, or wait on a disclosure — and getting different answers
 * is exactly what went wrong. The desktop bar asked it and the phone drawer did
 * not, so `loadAudioFile` was called with no options at all on mobile; since it
 * requires `hostedAnalysis === true` to reach the analyser, every phone song load
 * silently fell back to the weaker realtime beat grid.
 *
 * One rule, one place, and it is a pure function so both shells can be checked
 * without a browser.
 */
export type AudioUploadPlan =
  | { action: 'load'; hostedAnalysis: boolean }
  | { action: 'ask' };

export function planAudioUpload(
  preference: HostedAnalysisPreference,
  hostedAvailable: boolean
): AudioUploadPlan {
  // A build without hosted analysis configured has nothing to disclose and
  // nowhere to send the audio. Prompting there offers a choice that cannot be
  // honoured, and answering ANALYZE would start an upload doomed to fail.
  if (!hostedAvailable) return { action: 'load', hostedAnalysis: false };

  // A remembered choice is still an explicit one, so honour it rather than
  // asking again. This only ever skips forward from a stored answer; absence is
  // never read as consent.
  if (preference === 'analyze') return { action: 'load', hostedAnalysis: true };
  if (preference === 'local') return { action: 'load', hostedAnalysis: false };

  return { action: 'ask' };
}
