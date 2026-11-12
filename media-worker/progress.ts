/** Native decoder diagnostics may share stdout with newline-delimited JSON. */
export function parsePipelineMessage(line: string): Record<string, any> | null {
  try {
    const payload = JSON.parse(line);
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null;
  } catch { return null; }
}
