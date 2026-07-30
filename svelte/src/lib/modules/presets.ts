import type { ModuleType } from '$lib/engine/contracts';

export const MODULE_PRESETS: Partial<
  Record<ModuleType, { n: string; title: string; set: Record<string, number> }[]>
> = {
  tapdelay: [
    {
      n: '1',
      title: 'Swung triplets',
      set: { type: 1, time: 50, velCrv: 50, feel: 1, scratchMode: 0, scratchDepth: 35, end: 65, mix: 70 }
    },
    {
      n: '2',
      title: 'Dotted pong',
      set: { type: 1, time: 30, velCrv: 75, feel: 2, scratchMode: 2, scratchDepth: 60, end: 55, mix: 75 }
    },
    {
      n: '3',
      title: 'Chaos',
      set: { type: 1, time: 70, velCrv: 100, feel: 0, scratchMode: 3, scratchDepth: 80, end: 75, mix: 85 }
    }
  ],
  timesampler: [
    {
      n: '1',
      title: 'Bar march',
      set: { mode: 0, size: 90, slices: 8, accent: 0, chance: 40, rate: 43, mix: 70 }
    },
    {
      n: '2',
      title: 'Pong halves',
      set: { mode: 2, size: 70, slices: 16, accent: 0, chance: 55, rate: 43, mix: 75 }
    },
    {
      n: '3',
      title: 'Juggle',
      set: { mode: 3, size: 50, slices: 32, accent: 0, chance: 75, rate: 43, mix: 85 }
    }
  ]
};
