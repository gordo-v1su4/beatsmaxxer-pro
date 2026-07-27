export interface EffectClock {
  srcTime: number;
  aux1: number;
  aux2: number;
}

const schedules = new Map<string, EffectClock>();

export function getEffectClock(moduleId: string): EffectClock {
  let clock = schedules.get(moduleId);
  if (!clock) {
    clock = { srcTime: 0, aux1: 0, aux2: 0 };
    schedules.set(moduleId, clock);
  }
  return clock;
}

export function writeEffectClock(
  moduleId: string,
  update: Partial<EffectClock>,
) {
  const clock = getEffectClock(moduleId);
  if (update.srcTime !== undefined) clock.srcTime = update.srcTime;
  if (update.aux1 !== undefined) clock.aux1 = update.aux1;
  if (update.aux2 !== undefined) clock.aux2 = update.aux2;
}

export function resetEffectSchedulesForTests() {
  schedules.clear();
}
