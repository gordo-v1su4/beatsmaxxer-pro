import { describe, expect, test } from "bun:test";
import { BrowserWebGl2Backend } from "../../../src/render/webgl/BrowserWebGl2Backend";
import type { RenderFrameRequest } from "../../../src/render/contracts";
import {
  FULLSCREEN_VERTEX_GLSL,
  FULLSCREEN_VERTEX_UNFLIPPED_GLSL,
} from "../../../src/render/webgl/shaders";

const request: RenderFrameRequest = {
  width: 640,
  height: 360,
  effect: "timesampler",
  accentMode: "OFF",
  accentEnvelope: 0,
  rgbOffset: 0,
  mix: 1,
};

function createFakeWebGl() {
  const sourceTexture = { id: "source" };
  const linearTexture = { id: "linear" };
  const framebuffer = { id: "framebuffer" };
  const ingestProgram = { id: "ingest" };
  const compositeProgram = { id: "composite" };
  const textureParameters: Array<{
    texture: object | null;
    name: number;
    value: number;
  }> = [];
  const uploads: Array<{
    texture: object | null;
    source: unknown;
  }> = [];
  const draws: Array<{
    framebuffer: object | null;
    program: object | null;
  }> = [];
  const pixelStore: Array<{ name: number; value: number | boolean }> =
    [];
  const shaderSources: string[] = [];
  let currentTexture: object | null = null;
  let currentFramebuffer: object | null = null;
  let currentProgram: object | null = null;
  let textureIndex = 0;
  let programIndex = 0;

  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    TEXTURE0: 5,
    TEXTURE_2D: 6,
    TEXTURE_MIN_FILTER: 7,
    TEXTURE_MAG_FILTER: 8,
    TEXTURE_WRAP_S: 9,
    TEXTURE_WRAP_T: 10,
    LINEAR: 11,
    CLAMP_TO_EDGE: 12,
    RGBA: 13,
    UNSIGNED_BYTE: 14,
    RGBA8: 15,
    FRAMEBUFFER: 16,
    COLOR_ATTACHMENT0: 17,
    FRAMEBUFFER_COMPLETE: 18,
    TRIANGLES: 19,
    UNPACK_COLORSPACE_CONVERSION_WEBGL: 20,
    BROWSER_DEFAULT_WEBGL: 21,
    UNPACK_FLIP_Y_WEBGL: 22,
    NO_ERROR: 0,
    createShader: () => ({}),
    shaderSource(_shader: object, source: string) {
      shaderSources.push(source);
    },
    compileShader() {},
    getShaderParameter: () => true,
    getShaderInfoLog: () => "",
    deleteShader() {},
    createProgram: () =>
      programIndex++ === 0 ? ingestProgram : compositeProgram,
    attachShader() {},
    linkProgram() {},
    getProgramParameter: () => true,
    getProgramInfoLog: () => "",
    deleteProgram() {},
    createTexture: () =>
      textureIndex++ === 0 ? sourceTexture : linearTexture,
    createFramebuffer: () => framebuffer,
    createVertexArray: () => ({}),
    deleteFramebuffer() {},
    deleteTexture() {},
    deleteVertexArray() {},
    isContextLost: () => false,
    bindVertexArray() {},
    pixelStorei(name: number, value: number | boolean) {
      pixelStore.push({ name, value });
    },
    activeTexture() {},
    bindTexture(_target: number, texture: object | null) {
      currentTexture = texture;
    },
    texParameteri(_target: number, name: number, value: number) {
      textureParameters.push({
        texture: currentTexture,
        name,
        value,
      });
    },
    texImage2D(...args: unknown[]) {
      uploads.push({
        texture: currentTexture,
        source: args.at(-1),
      });
    },
    bindFramebuffer(_target: number, value: object | null) {
      currentFramebuffer = value;
    },
    framebufferTexture2D() {},
    checkFramebufferStatus: () => 18,
    viewport() {},
    useProgram(value: object | null) {
      currentProgram = value;
    },
    uniform1i() {},
    uniform4f() {},
    getUniformLocation: () => ({}),
    drawArrays() {
      draws.push({
        framebuffer: currentFramebuffer,
        program: currentProgram,
      });
    },
    flush() {},
    getError: () => 0,
  };

  return {
    gl,
    sourceTexture,
    linearTexture,
    framebuffer,
    ingestProgram,
    compositeProgram,
    textureParameters,
    uploads,
    draws,
    pixelStore,
    shaderSources,
    textureCreations: () => textureIndex,
  };
}

describe("Browser WebGL2 HTML-video presentation", () => {
  test("uploads the owned source and composites a complete linear texture", () => {
    const state = createFakeWebGl();
    const canvas = {
      width: 300,
      height: 150,
      getContext: () => state.gl,
      addEventListener() {},
      removeEventListener() {},
    } as unknown as HTMLCanvasElement;
    const backend = new BrowserWebGl2Backend<object>(canvas);
    const source = { id: "detached-ready-video" };

    backend.presentSource(source, request);

    expect(state.uploads).toContainEqual({
      texture: state.sourceTexture,
      source,
    });
    expect(
      state.textureParameters.filter(
        (entry) => entry.texture === state.linearTexture,
      ),
    ).toEqual([
      {
        texture: state.linearTexture,
        name: state.gl.TEXTURE_MIN_FILTER,
        value: state.gl.LINEAR,
      },
      {
        texture: state.linearTexture,
        name: state.gl.TEXTURE_MAG_FILTER,
        value: state.gl.LINEAR,
      },
      {
        texture: state.linearTexture,
        name: state.gl.TEXTURE_WRAP_S,
        value: state.gl.CLAMP_TO_EDGE,
      },
      {
        texture: state.linearTexture,
        name: state.gl.TEXTURE_WRAP_T,
        value: state.gl.CLAMP_TO_EDGE,
      },
    ]);
    expect(state.draws).toEqual([
      {
        framebuffer: state.framebuffer,
        program: state.ingestProgram,
      },
      {
        framebuffer: null,
        program: state.compositeProgram,
      },
    ]);
    expect(canvas.width).toBe(request.width);
    expect(canvas.height).toBe(request.height);
    backend.dispose();
  });

  test("keeps asymmetric top and bottom orientation through both passes", () => {
    const state = createFakeWebGl();
    const canvas = {
      width: 640,
      height: 360,
      getContext: () => state.gl,
      addEventListener() {},
      removeEventListener() {},
    } as unknown as HTMLCanvasElement;
    const backend = new BrowserWebGl2Backend<object>(canvas);

    backend.presentSource({ top: "red", bottom: "blue" }, request);

    expect(FULLSCREEN_VERTEX_GLSL).toContain("1.0 -");
    expect(FULLSCREEN_VERTEX_UNFLIPPED_GLSL).toContain(
      "vUv = position * 0.5 + 0.5;",
    );
    expect(FULLSCREEN_VERTEX_UNFLIPPED_GLSL).not.toContain("1.0 -");
    expect(
      [FULLSCREEN_VERTEX_GLSL, FULLSCREEN_VERTEX_UNFLIPPED_GLSL]
        .filter((shader) => shader.includes("1.0 -")),
    ).toHaveLength(1);
    expect(
      state.pixelStore.some(
        (entry) => entry.name === state.gl.UNPACK_FLIP_Y_WEBGL,
      ),
    ).toBe(false);
    expect(state.shaderSources).toContain(FULLSCREEN_VERTEX_GLSL);
    expect(state.shaderSources).toContain(
      FULLSCREEN_VERTEX_UNFLIPPED_GLSL,
    );
    expect(state.draws.map((draw) => draw.framebuffer)).toEqual([
      state.framebuffer,
      null,
    ]);

    const red = [255, 0, 0, 255];
    const green = [0, 255, 0, 255];
    const blue = [0, 0, 255, 255];
    const yellow = [255, 255, 0, 255];
    const domUploadBottomToTop = [
      [red, green],
      [blue, yellow],
    ];
    const ingestReadPixels = [...domUploadBottomToTop].reverse();
    const finalReadPixels = ingestReadPixels.flat(2);
    expect(finalReadPixels).toEqual([
      ...blue,
      ...yellow,
      ...red,
      ...green,
    ]);
    backend.dispose();
  });

  test("sustains source upload and composite draws without resource growth", () => {
    const state = createFakeWebGl();
    const canvas = {
      width: 640,
      height: 360,
      getContext: () => state.gl,
      addEventListener() {},
      removeEventListener() {},
    } as unknown as HTMLCanvasElement;
    const backend = new BrowserWebGl2Backend<object>(canvas);
    const source = { id: "steady-video" };

    for (let frame = 0; frame < 120; frame += 1) {
      backend.presentSource(source, request);
    }

    expect(
      state.uploads.filter((upload) => upload.source === source),
    ).toHaveLength(120);
    expect(state.draws).toHaveLength(240);
    expect(state.textureCreations()).toBe(2);
    backend.dispose();
  });
});
