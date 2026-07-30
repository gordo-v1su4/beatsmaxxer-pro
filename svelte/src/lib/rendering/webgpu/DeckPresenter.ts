import { webGpuEngine } from './WebGpuEngine';
import { getModuleShader } from './shaders/registry';
import type { ModuleType } from '$lib/engine/contracts';

/** Per-module preview canvas presenter backed by WebGpuEngine. */
export class DeckPresenter {
  attach(moduleId: ModuleType, canvas: HTMLCanvasElement, color: [number, number, number]) {
    return webGpuEngine.attachCanvas(`deck-${moduleId}`, canvas, color);
  }

  detach(moduleId: ModuleType) {
    webGpuEngine.detachCanvas(`deck-${moduleId}`);
  }

  shaderFor(moduleId: ModuleType) {
    return getModuleShader(moduleId);
  }
}

export const deckPresenter = new DeckPresenter();
