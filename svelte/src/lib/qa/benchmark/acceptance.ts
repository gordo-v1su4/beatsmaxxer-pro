export interface ScoredRun {
  completed: boolean;
  elapsed: number;
  invalid: string[];
  decks: {
    cuts: number;
    onTimePercent: number;
    presentationUpdates: number;
    longestExcessSourceErrorSeconds: number;
    stats: Record<string, unknown>;
  }[];
  programSummary: {cuts:number;onTimePercent:number};
}

/** One run passing is necessary, but is not a repeatable comparison winner. */
export function evaluateAcceptance(run: ScoredRun) {
  const reasons = [...run.invalid];
  if (!run.completed || run.elapsed < 120) reasons.push('Requires a completed run of at least 120 seconds');
  if (!run.decks.length) reasons.push('No measured decks');
  if (!run.programSummary.cuts || !(run.programSummary.onTimePercent >= 99)) reasons.push('Program cuts below 99% within one display interval');
  run.decks.forEach((deck, index) => {
    if (!deck.cuts || !(deck.onTimePercent >= 99)) reasons.push(`Deck ${index+1}: cuts below 99%`);
    if (!(deck.presentationUpdates > 0)) reasons.push(`Deck ${index+1}: no submitted frames`);
    if (!(deck.longestExcessSourceErrorSeconds <= .1)) reasons.push(`Deck ${index+1}: sustained source error`);
    if (Number(deck.stats.cacheMisses ?? 0) > 0) reasons.push(`Deck ${index+1}: resident cache misses`);
  });
  return {passed:reasons.length===0,reasons};
}

export function scoreProgramCuts(
  scheduled: number[],
  submitted: {beat:number;submitted:number;ready:boolean}[],
  elapsed: number,
  interval: number
) {
  const due = scheduled.map((at,index)=>({at,index})).filter(event=>event.at>=0&&event.at<elapsed);
  const first = new Map<number, (typeof submitted)[number]>();
  for(const cut of submitted) if(!first.has(cut.beat)) first.set(cut.beat,cut);
  const onTime = due.filter(event=>{
    const cut=first.get(event.index);
    return cut?.ready && cut.submitted>=event.at && cut.submitted-event.at<=interval;
  }).length;
  const missedCuts=due.filter(event=>!first.get(event.index)?.ready).length;
  return {cuts:due.length,missedCuts,lateCuts:due.length-onTime-missedCuts,onTimeCuts:onTime,onTimePercent:due.length?100*onTime/due.length:0};
}
