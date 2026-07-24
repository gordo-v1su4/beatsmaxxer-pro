import type { RenderFrameRequest } from "../contracts";
import type { WebGl2Backend } from "./WebCodecsRenderer";
import {
  EXTERNAL_TO_LINEAR_GLSL,
  FULLSCREEN_VERTEX_GLSL,
  TIMESAMPLER_COMPOSITE_GLSL,
} from "./shaders";

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("webgl-shader-create-failed");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message =
      gl.getShaderInfoLog(shader) || "webgl-shader-compile-failed";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(
  gl: WebGL2RenderingContext,
  fragmentSource: string,
) {
  const program = gl.createProgram();
  if (!program) throw new Error("webgl-program-create-failed");
  const vertex = compileShader(
    gl,
    gl.VERTEX_SHADER,
    FULLSCREEN_VERTEX_GLSL,
  );
  const fragment = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    fragmentSource,
  );
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message =
      gl.getProgramInfoLog(program) || "webgl-program-link-failed";
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

function effectMode(request: RenderFrameRequest) {
  if (request.effect !== "timesampler" || request.accentMode === "OFF") {
    return 2;
  }
  return request.accentMode === "LUM" ? 0 : 1;
}

export class BrowserWebGl2Backend<Source extends object>
  implements WebGl2Backend<Source>
{
  private readonly gl: WebGL2RenderingContext;
  private readonly ingestProgram: WebGLProgram;
  private readonly compositeProgram: WebGLProgram;
  private readonly sourceTexture: WebGLTexture;
  private readonly linearTexture: WebGLTexture;
  private readonly framebuffer: WebGLFramebuffer;
  private readonly vao: WebGLVertexArrayObject;
  private contextLost = false;
  private readonly lossListeners = new Set<(reason: string) => void>();

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      premultipliedAlpha: false,
    });
    if (!gl) throw new Error("webgl2-unavailable");
    this.gl = gl;
    this.ingestProgram = createProgram(gl, EXTERNAL_TO_LINEAR_GLSL);
    this.compositeProgram = createProgram(
      gl,
      TIMESAMPLER_COMPOSITE_GLSL,
    );
    const sourceTexture = gl.createTexture();
    const linearTexture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    const vao = gl.createVertexArray();
    if (!sourceTexture || !linearTexture || !framebuffer || !vao) {
      throw new Error("webgl-resource-create-failed");
    }
    this.sourceTexture = sourceTexture;
    this.linearTexture = linearTexture;
    this.framebuffer = framebuffer;
    this.vao = vao;
    canvas.addEventListener("webglcontextlost", this.handleContextLost);
  }

  get lost() {
    return this.contextLost || this.gl.isContextLost();
  }

  presentSource(source: Source, request: RenderFrameRequest) {
    const { gl } = this;
    if (this.lost) throw new Error("webgl-context-lost");
    if (
      this.canvas.width !== request.width ||
      this.canvas.height !== request.height
    ) {
      this.canvas.width = request.width;
      this.canvas.height = request.height;
    }
    gl.bindVertexArray(this.vao);
    gl.pixelStorei(
      gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,
      gl.BROWSER_DEFAULT_WEBGL,
    );
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      source as unknown as TexImageSource,
    );

    gl.bindTexture(gl.TEXTURE_2D, this.linearTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      request.width,
      request.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.linearTexture,
      0,
    );
    if (
      gl.checkFramebufferStatus(gl.FRAMEBUFFER) !==
      gl.FRAMEBUFFER_COMPLETE
    ) {
      throw new Error("webgl-linear-framebuffer-incomplete");
    }
    gl.viewport(0, 0, request.width, request.height);
    gl.useProgram(this.ingestProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
    gl.uniform1i(
      gl.getUniformLocation(this.ingestProgram, "uSource"),
      0,
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(this.compositeProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.linearTexture);
    gl.uniform1i(
      gl.getUniformLocation(
        this.compositeProgram,
        "uLinearSource",
      ),
      0,
    );
    gl.uniform4f(
      gl.getUniformLocation(this.compositeProgram, "uEffect"),
      effectMode(request),
      request.accentEnvelope,
      request.rgbOffset,
      request.mix,
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.flush();
  }

  onContextLost(callback: (reason: string) => void) {
    this.lossListeners.add(callback);
    return () => this.lossListeners.delete(callback);
  }

  dispose() {
    const { gl } = this;
    this.canvas.removeEventListener(
      "webglcontextlost",
      this.handleContextLost,
    );
    this.lossListeners.clear();
    gl.deleteFramebuffer(this.framebuffer);
    gl.deleteTexture(this.sourceTexture);
    gl.deleteTexture(this.linearTexture);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.ingestProgram);
    gl.deleteProgram(this.compositeProgram);
  }

  private readonly handleContextLost = (event: Event) => {
    event.preventDefault();
    this.contextLost = true;
    for (const listener of this.lossListeners) {
      listener("webgl-context-lost");
    }
  };
}
