import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, test } from 'vitest';
import manifestJson from '../../fixtures/media/manifest.json';
import {
  loadQaMidiAssignments,
  loadQaMidiChannels,
  validateQaMidiAssignments,
  type QaManifest
} from '../../../src/lib/qa/loadQaMedia';
import { DEFAULT_RACK_BOTTOM, DEFAULT_RACK_TOP } from '../../../src/lib/modules/catalog';
import { midiChannels, clearMidiChannels } from '../../../src/lib/stores/midiChannels';
import { midiLayers } from '../../../src/lib/stores/rack';
import { moduleTriggerSource, noteIsHighlighted } from '../../../src/lib/stores/midiTrigger';
import { get } from 'svelte/store';

const manifest = manifestJson as QaManifest;
const sourceRoot = path.resolve('..', 'test_media');

describe('desktop QA MIDI assignments', () => {
  beforeEach(() => {
    midiLayers.update((layers) => Object.fromEntries(Object.keys(layers).map((id) => [id, null])));
    moduleTriggerSource.set({});
    clearMidiChannels();
  });

  test('rejects unsupported and inactive module mappings', () => {
    const unsupported = structuredClone(manifest);
    unsupported.midiAssignments![0] = {
      ...unsupported.midiAssignments![0],
      moduleId: 'speedramp'
    };
    expect(() => validateQaMidiAssignments(unsupported)).toThrow('unsupported module');

    const inactive = structuredClone(manifest);
    inactive.midiAssignments![0] = {
      ...inactive.midiAssignments![0],
      moduleId: 'streak'
    };
    expect(() => validateQaMidiAssignments(inactive)).toThrow('inactive rack module');
  });

  test('loads seven real parts into module layers and trigger sources only', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString();
      const virtualPath = decodeURIComponent(url.replace(/^\/qa-media\//, ''));
      const bytes = await readFile(path.resolve(sourceRoot, virtualPath.slice('redline/'.length)));
      return new Response(new Uint8Array(bytes), {
        status: 200,
        headers: { 'content-type': 'audio/midi' }
      });
    };

    try {
      await loadQaMidiAssignments(manifest);
    } finally {
      globalThis.fetch = originalFetch;
    }

    const assignments = validateQaMidiAssignments(
      manifest,
      [...DEFAULT_RACK_TOP, ...DEFAULT_RACK_BOTTOM]
    );
    const layers = get(midiLayers);
    const triggers = get(moduleTriggerSource);
    expect(assignments).toHaveLength(7);
    for (const { moduleId, file } of assignments) {
      const layer = layers[moduleId];
      expect(layer?.name).toBe(file.split('/').at(-1));
      expect(layer?.identity?.startsWith(`${layer?.name}:`)).toBe(true);
      expect(layer?.notes.length, moduleId).toBeGreaterThan(0);
      expect(layer?.duration, moduleId).toBeGreaterThan(0);
      expect(triggers[moduleId]).toBe('midi');
      expect(noteIsHighlighted(layer!.notes[0].time, layer!.notes[0].time, layer!.duration, false)).toBe(false);
    }
    expect(get(midiChannels)).toEqual([]);
  });

  test('loads every inventoried stem into arranger trigger lanes', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString();
      const virtualPath = decodeURIComponent(url.replace(/^\/qa-media\//, ''));
      const bytes = await readFile(path.resolve(sourceRoot, virtualPath.slice('redline/'.length)));
      return new Response(new Uint8Array(bytes), {
        status: 200,
        headers: { 'content-type': 'audio/midi' }
      });
    };

    try {
      await loadQaMidiChannels(manifest);
    } finally {
      globalThis.fetch = originalFetch;
    }

    const channels = get(midiChannels);
    expect(channels).toHaveLength(7);
    expect(new Set(channels.map((channel) => channel.name)).size).toBe(7);
    for (const channel of channels) {
      expect(channel.onsets.length).toBeGreaterThan(0);
      expect(channel.noteCount).toBeGreaterThan(0);
    }
    expect(get(midiLayers)).toEqual(
      Object.fromEntries(Object.keys(get(midiLayers)).map((id) => [id, null]))
    );
  });
});
