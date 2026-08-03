import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const source = (path: string) => readFileSync(resolve('src/lib', path), 'utf8');

describe('hosted analysis consent boundary', () => {
  test('AudioEngine defaults file uploads to local-only and gates hosted analysis explicitly', () => {
    const engine = source('audio/AudioEngine.ts');
    const fileLoader = engine.slice(
      engine.indexOf('async loadAudioFile'),
      engine.indexOf('async loadAudioUrl')
    );

    expect(fileLoader).toContain('options: AudioFileLoadOptions = {}');
    expect(fileLoader).toContain('if (options.hostedAnalysis !== true) {');
    expect(fileLoader).toContain('this.analysisRequestId += 1;');
    expect(fileLoader.indexOf('this.analysisRequestId += 1;')).toBeLessThan(
      fileLoader.indexOf('fetchEssentiaRhythmAnalysis(file)')
    );
  });

  test('analysis preparation never passes through the original upload', () => {
    const preparation = source('audio/prepareAnalysisUpload.ts');

    expect(preparation).not.toContain('return file;');
    expect(preparation).toContain('ANALYSIS_MAX_DURATION_S');
    expect(preparation).toContain('ANALYSIS_UPLOAD_MAX_BYTES');
    expect(preparation).toContain('`${stem}-analysis.wav`');
  });

  test('URL/QA loading does not invoke hosted analysis', () => {
    const engine = source('audio/AudioEngine.ts');
    const urlLoader = engine.slice(
      engine.indexOf('async loadAudioUrl'),
      engine.indexOf('clearUploadedTrack')
    );

    expect(urlLoader).not.toContain('fetchEssentiaRhythmAnalysis');
    expect(urlLoader).toContain('prepareUploadedTrack(trackName, false)');
  });

  test('TopBar exposes all explicit choices and the required disclosure', () => {
    const topBar = source('components/TopBar.svelte');

    expect(topBar).toContain("resolveAudioUpload(choice: 'analyze' | 'local' | 'cancel')");
    expect(topBar).toContain("hostedAnalysis: choice === 'analyze'");
    expect(topBar).toContain('bounded, prepared excerpt');
    expect(topBar).toContain("does not establish that service's retention");
    expect(topBar).toContain('>ANALYZE</button>');
    expect(topBar).toContain('>LOCAL ONLY</button>');
    expect(topBar).toContain('>CANCEL</button>');
    expect(topBar).toContain("e.key === 'Escape'");
  });
});
