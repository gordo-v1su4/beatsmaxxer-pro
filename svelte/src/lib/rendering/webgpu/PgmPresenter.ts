import { webGpuEngine } from './WebGpuEngine';
import { hotDeckManager, markDeckHot } from '$lib/runtime/decks/hotDeck';
import type { ModuleType } from '$lib/engine/contracts';
import type { DeckFrameHandleRef } from '$lib/engine/contracts';

/**
 * PGM presenter — swaps visible deck texture inside the single WebGpuEngine rAF tick.
 * No Svelte store promotion cycle; cuts are initiated by DeckAuthority.
 */
export class PgmPresenter {
  private liveId: ModuleType | null = null;
  private canvasId = 'pgm-main';

  async attach(canvas: HTMLCanvasElement, moduleId: ModuleType, color: [number, number, number]) {
    this.canvasId = `pgm-${moduleId}`;
    this.liveId = moduleId;
    await webGpuEngine.attachCanvas(this.canvasId, canvas, color);
    const deck = hotDeckManager.upsert(moduleId, moduleId, moduleId);
    const frame: DeckFrameHandleRef = {
      id: `${moduleId}-frame-0`,
      kind: 'proxyTexture',
      sourceId: moduleId,
      deckId: moduleId,
      sourceTimeMs: 0,
      createdAtMs: Date.now(),
      staleAfterMs: null
    };
    hotDeckManager.update(moduleId, markDeckHot(deck, frame));
  }

  cutTo(moduleId: ModuleType, color: [number, number, number], canvas: HTMLCanvasElement) {
    webGpuEngine.detachCanvas(this.canvasId);
    this.canvasId = `pgm-${moduleId}`;
    this.liveId = moduleId;
    void webGpuEngine.attachCanvas(this.canvasId, canvas, color);
  }

  getLiveId() {
    return this.liveId;
  }
}

export const pgmPresenter = new PgmPresenter();
