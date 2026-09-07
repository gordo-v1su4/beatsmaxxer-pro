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

  test('Studio upload passes through the original MP3', () => {
    const preparation = source('audio/prepareStudioUpload.ts');

    expect(preparation).toContain('return file;');
    expect(preparation).toContain('MP3 uploads only');
    expect(preparation).toContain('STUDIO_UPLOAD_MAX_BYTES');
  });

  test('legacy rhythm preparation still re-encodes for desktop', () => {
    const preparation = source('audio/prepareAnalysisUpload.ts');

    expect(preparation).not.toContain('return file;');
    expect(preparation).toContain('RHYTHM_UPLOAD_MAX_BYTES');
    expect(preparation).toContain('`${stem}-${suffix}.wav`');
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
    expect(topBar).toContain('full MP3');
    expect(topBar).toContain('not supported for analysis yet');
    expect(topBar).toContain('>ANALYZE</button>');
    expect(topBar).toContain('>LOCAL ONLY</button>');
    expect(topBar).toContain('>CANCEL</button>');
    expect(topBar).toContain("e.key === 'Escape'");
  });
});
