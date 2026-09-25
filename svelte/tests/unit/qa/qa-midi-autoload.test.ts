import { beforeEach, describe, expect, test } from 'vitest';
import { get } from 'svelte/store';
import { cutAtStep, cuts } from '$lib/stores/arrangement';
import {
  CLOUD_QA_MANIFEST_FILE,
  REDLINE_QA_MANIFEST_FILE,
  resolveQaManifestFile,
  shouldAutoloadQaArrangerMidi,
  shouldAutoloadQaMidi,
  shouldAutoloadQaSequencerArm,
} from '$lib/qa/loadQaMedia';
import { midiUiOpen, setMidiUiOpen } from '$lib/stores/rackUi';
import { moduleTriggerSource, setModuleTriggerSource } from '$lib/stores/midiTrigger';

describe('QA MIDI autoload', () => {
  test('does not load rack module parts unless qaMidi=1', () => {
    expect(shouldAutoloadQaMidi('?qa=1')).toBe(false);
    expect(shouldAutoloadQaMidi('?qa=1&qaAutoplay=1')).toBe(false);
  });

  test('opts in only with qaMidi=1', () => {
    expect(shouldAutoloadQaMidi('?qa=1&qaMidi=1')).toBe(true);
    expect(shouldAutoloadQaMidi('?qa=1&qaMidi=1&qaAutoplay=1')).toBe(true);
  });
});

describe('QA arranger MIDI autoload', () => {
  test('does not load arrangement stem lanes unless qaArrangerMidi=1', () => {
    expect(shouldAutoloadQaArrangerMidi('?qa=1')).toBe(false);
    expect(shouldAutoloadQaArrangerMidi('?qa=1&qaAutoplay=1')).toBe(false);
  });

  test('opts in only with qaArrangerMidi=1', () => {
    expect(shouldAutoloadQaArrangerMidi('?qa=1&qaArrangerMidi=1')).toBe(true);
  });
});

describe('QA manifest resolution', () => {
  test('forces cloud or redline manifests from query params', async () => {
    await expect(resolveQaManifestFile('?qa=1&qaManifest=cloud')).resolves.toBe(CLOUD_QA_MANIFEST_FILE);
    await expect(resolveQaManifestFile('?qa=1&qaManifest=redline')).resolves.toBe(REDLINE_QA_MANIFEST_FILE);
  });

  test('falls back to cloud fixtures when Redline assets are missing', async () => {
    const probe = async (url: string, init?: RequestInit) => {
      if (url === '/qa-media/manifest.json') {
        return new Response(
          JSON.stringify({ clips: ['redline/missing/clip.mp4'] }),
          { status: 200 }
        );
      }
      if (url === '/qa-media/redline/missing/clip.mp4' && init?.method === 'HEAD') {
        return new Response(null, { status: 404 });
      }
      throw new Error(`unexpected probe ${url}`);
    };
    await expect(resolveQaManifestFile('?qa=1', probe)).resolves.toBe(CLOUD_QA_MANIFEST_FILE);
  });
});

describe('QA sequencer ARM autoload', () => {
  test('does not ARM unless qaSequencerArm=1', () => {
    expect(shouldAutoloadQaSequencerArm('?qa=1&qaAutoplay=1')).toBe(false);
  });

  test('opts in with qaSequencerArm=1', () => {
    expect(shouldAutoloadQaSequencerArm('?qa=1&qaSequencerArm=1')).toBe(true);
  });

  test('ships unrolled demo cuts for ARMED playback QA', () => {
    const list = get(cuts);
    expect(list.length).toBeGreaterThan(0);
    expect(cutAtStep(list, list[0]!.step)).toBe(list[0]!.slotIndex);
  });
});

describe('MIDI surface toggle', () => {
  beforeEach(() => {
    midiUiOpen.set(false);
    moduleTriggerSource.set({});
  });

  test('hiding MIDI returns every module to audio triggers', () => {
    setModuleTriggerSource('transition', 'midi');
    setModuleTriggerSource('leak', 'midi');
    setMidiUiOpen(true);
    expect(get(midiUiOpen)).toBe(true);
    expect(get(moduleTriggerSource).transition).toBe('midi');

    setMidiUiOpen(false);
    expect(get(midiUiOpen)).toBe(false);
    expect(get(moduleTriggerSource).transition).toBe('audio');
    expect(get(moduleTriggerSource).leak).toBe('audio');
  });
});
