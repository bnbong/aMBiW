// Probe whether WebGL is actually usable on this device. A context that merely
// *returns* from getContext("webgl2") is not enough — some mobile browsers
// (notably iOS Safari under memory pressure / Low Power Mode / some older
// Android WebViews) hand back a context that fails on the very first call
// Three.js makes: gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.HIGH_FLOAT).
// When that returns null, Three.js crashes with
//   "null is not an object (evaluating '...getShaderPrecisionFormat(...).precision')"
// which blanks the scene. We reproduce that exact call here and treat a null
// response as "WebGL not safe to use".
export type WebGLStatus =
  | { ok: true; version: "webgl2" | "webgl" }
  | { ok: false; reason: string };

export function detectWebGL(): WebGLStatus {
  if (typeof document === "undefined") {
    return { ok: false, reason: "no document (SSR)" };
  }
  let canvas: HTMLCanvasElement | null = null;
  try {
    canvas = document.createElement("canvas");
  } catch (err) {
    return {
      ok: false,
      reason: `canvas element not creatable: ${stringifyError(err)}`,
    };
  }

  const contextOpts: WebGLContextAttributes = {
    alpha: false,
    antialias: false,
    depth: true,
    stencil: false,
    failIfMajorPerformanceCaveat: false,
    powerPreference: "default",
    preserveDrawingBuffer: false,
  };

  let gl: WebGL2RenderingContext | WebGLRenderingContext | null = null;
  let version: "webgl2" | "webgl" = "webgl2";
  try {
    gl =
      (canvas.getContext("webgl2", contextOpts) as WebGL2RenderingContext | null) ||
      null;
    if (!gl) {
      version = "webgl";
      gl =
        (canvas.getContext("webgl", contextOpts) as WebGLRenderingContext | null) ||
        (canvas.getContext("experimental-webgl", contextOpts) as WebGLRenderingContext | null) ||
        null;
    }
  } catch (err) {
    return {
      ok: false,
      reason: `getContext threw: ${stringifyError(err)}`,
    };
  }

  if (!gl) {
    return { ok: false, reason: "no WebGL context" };
  }

  try {
    const fmt = gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.HIGH_FLOAT);
    if (!fmt || typeof fmt.precision !== "number") {
      return {
        ok: false,
        reason: "getShaderPrecisionFormat returned null (device/mode restricts WebGL)",
      };
    }
  } catch (err) {
    return {
      ok: false,
      reason: `getShaderPrecisionFormat threw: ${stringifyError(err)}`,
    };
  }

  // Best-effort: release the probe context so we don't hold a slot.
  try {
    const lose = gl.getExtension("WEBGL_lose_context");
    lose?.loseContext();
  } catch {
    /* ignore */
  }

  return { ok: true, version };
}

function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
