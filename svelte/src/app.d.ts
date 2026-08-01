/// <reference types="@webgpu/types" />

declare namespace App {
  interface Locals {}
  interface PageData {}
  interface PageState {}
  interface Platform {}
}

interface Navigator {
  gpu?: GPU;
}

interface Window {
  __BSP_QA__?: {
    snapshot: () => import('$lib/qa/bspQa').BspQaSnapshot;
    waitForClips: (count?: number, timeoutMs?: number) => Promise<import('$lib/qa/bspQa').BspQaSnapshot>;
    waitForPlaying: (timeoutMs?: number) => Promise<import('$lib/qa/bspQa').BspQaSnapshot>;
    waitForUploadedTrackLoad: (afterGeneration: number, timeoutMs?: number) => Promise<import('$lib/qa/bspQa').BspQaSnapshot>;
    sampleCanvasPixel: (canvasId: string) => { r: number; g: number; b: number; w: number; h: number } | { method: 'webgpu-only' } | null;
    getEngine: () => unknown;
    eightVideoSnapshot: () => unknown;
    prepareEightVideoBenchmark: (timeoutMs?: number) => Promise<unknown>;
    cutEightVideoPgm: (moduleId: string, settleMs?: number) => Promise<unknown>;
    catalogHotSwapCatalog: () => import('$lib/qa/eightVideoProof').CatalogHotSwapStressEvidence['catalog'];
    catalogHotSwapBaseline: () => import('$lib/qa/eightVideoProof').CatalogHotSwapStressEvidence['baseline'];
    catalogHotSwapSnapshot: (phase?: 'before' | 'settle', elapsedMs?: number) => import('$lib/qa/eightVideoProof').CatalogHotSwapFrameSample;
    stressCatalogModule: (moduleId: string, preferredSlotIndex: number, settleMs?: number) => Promise<unknown>;
    realAudioSnapshot: () => unknown;
  };
  __BSP_ERRS__?: string[];
}
