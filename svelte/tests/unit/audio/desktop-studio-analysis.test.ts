import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchEssentiaStudioAnalysis } from '$lib/audio/studioJobs';
import { tauriInvoke } from '$lib/platform/tauriInvoke';

vi.mock('$lib/platform/tauriInvoke', () => ({ tauriInvoke: vi.fn() }));

const response = (body: unknown, status = 200) => ({ status, body: JSON.stringify(body) });

describe('desktop Studio transport', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); });

  it.each(['mp3', 'wav'])('uploads the full %s through binary IPC and returns Studio beats and sections', async (format) => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const bytes = new Uint8Array(format === 'wav' ? 12_000_001 : 4_000_001);
    bytes[bytes.length - 1] = 123;
    const file = new File([bytes], `whole-song.${format}`, { type: format === 'wav' ? 'audio/wav' : 'audio/mpeg' });
    vi.mocked(tauriInvoke)
      .mockResolvedValueOnce(response({ id: 'job-1', status: 'queued', stage: 'queued' }, 202))
      .mockResolvedValueOnce(response({ id: 'job-1', status: 'completed', stage: 'complete', result: {
        schema_version: 'studio-audio-v1', duration: 210, bpm: 120,
        beats: [0, 0.5, 1, 209.5], onsets: [0.5, 209.5], confidence: 0.95,
        energy: { curve: [0.1, 0.8], sample_rate_hz: 1, start_time_s: 0 },
        structure: { sections: [{ start: 0, end: 210, label: 'verse', energy: 0.6 }] },
      } }));
    const analysis = await fetchEssentiaStudioAnalysis(file);
    const [command, args, options] = vi.mocked(tauriInvoke).mock.calls[0]!;
    expect(command).toBe('submit_studio_analysis');
    expect(args).toBeInstanceOf(ArrayBuffer);
    expect((args as ArrayBuffer).byteLength).toBe(file.size);
    expect(new Uint8Array(args as ArrayBuffer).at(-1)).toBe(123);
    expect(options?.headers).toEqual({ 'x-analysis-format': format, 'x-idempotency-key': expect.any(String) });
    expect(tauriInvoke).toHaveBeenLastCalledWith('poll_studio_analysis', { jobId: 'job-1' });
    expect(fetch).not.toHaveBeenCalled();
    expect(analysis.beats.at(-1)).toBe(209.5);
    expect(analysis.structure?.sections[0]?.end).toBe(210);
    expect(analysis.verified).toBe(true);
  });

  it('surfaces a Studio submission failure without polling or a legacy retry', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    vi.mocked(tauriInvoke).mockResolvedValueOnce(response({ detail: 'Invalid API key' }, 401));
    await expect(fetchEssentiaStudioAnalysis(new File(['mp3'], 'song.mp3')))
      .rejects.toThrow('Invalid API key');
    expect(tauriInvoke).toHaveBeenCalledTimes(1);
  });
});
