import { describe, expect, it, vi } from 'vitest';
import { requestLegacySyncAnalysis } from '$lib/analysis/adapters/legacySync';

function response(bpm: number, status = 200) {
  return new Response(JSON.stringify({ bpm, beats: [0, 0.5, 1], onsets: [0.25], confidence: 0.9, duration: 2 }), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function formData() {
  const data = new FormData();
  data.set('file', new File([new Uint8Array([1, 2, 3])], 'prepared.wav', { type: 'audio/wav' }));
  return data;
}

describe('legacy analysis provider routing', () => {
  it('routes an explicit Essentia request directly to rhythm', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response(133));
    const result = await requestLegacySyncAnalysis(formData(), {
      endpointFor: (endpoint) => new URL(`https://app.example/__api/analyze/${endpoint}`),
      engineHint: 'essentia',
      fetch
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe('https://app.example/__api/analyze/rhythm');
    expect((fetch.mock.calls[0]?.[1]?.body as FormData).get('file')).toBeInstanceOf(File);
    expect(result.effective.rhythm.bpm).toBe(133);
  });

  it('keeps fast-first routing for non-Essentia analysis', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response(128));
    await requestLegacySyncAnalysis(formData(), {
      endpointFor: (endpoint) => new URL(`https://app.example/__api/analyze/${endpoint}`),
      engineHint: 'aubio',
      fetch
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe('https://app.example/__api/analyze/fast');
  });

  it('falls back from an allowed fast failure to rhythm', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response(0, 422))
      .mockResolvedValueOnce(response(133));
    await requestLegacySyncAnalysis(formData(), {
      endpointFor: (endpoint) => new URL(`https://app.example/__api/analyze/${endpoint}`),
      fetch
    });

    expect(fetch.mock.calls.map((call) => call[0])).toEqual([
      'https://app.example/__api/analyze/fast',
      'https://app.example/__api/analyze/rhythm'
    ]);
  });
});
