import { describe, expect, it } from 'vitest';
import {
  analysisStatusFootnote,
  arrangementStatusBadge,
  rhythmStatusBadge,
} from '$lib/audio/analysisStatusBadges';

describe('analysis status badges', () => {
  it('keeps rhythm and arrangement badges visible with idle grey before a song loads', () => {
    const rhythm = rhythmStatusBadge({ analysisStatus: 'idle', usingUploadedTrack: false });
    const arrangement = arrangementStatusBadge({
      analysisStatus: 'idle',
      structureStatus: 'idle',
      usingUploadedTrack: false,
    });

    expect(rhythm.label).toBe('RHY·OFF');
    expect(rhythm.tone).toBe('idle');
    expect(arrangement.label).toBe('ARR·OFF');
    expect(arrangement.tone).toBe('idle');
  });

  it('shows loading then ready colors through hosted analysis', () => {
    const analyzing = rhythmStatusBadge({ analysisStatus: 'analyzing', usingUploadedTrack: true });
    const ready = rhythmStatusBadge({
      analysisStatus: 'ready',
      usingUploadedTrack: true,
      analysisConfidence: 0.91,
    });
    const sections = arrangementStatusBadge({
      analysisStatus: 'ready',
      structureStatus: 'ready',
      usingUploadedTrack: true,
    });

    expect(analyzing.tone).toBe('loading');
    expect(ready.tone).toBe('ready');
    expect(ready.label).toBe('RHY·OK');
    expect(sections.tone).toBe('ready');
    expect(sections.label).toBe('ARR·OK');
  });

  it('surfaces errors in red without hiding the arrangement badge', () => {
    const rhythm = rhythmStatusBadge({
      analysisStatus: 'error',
      usingUploadedTrack: true,
      analysisError: 'upstream_rejected',
    });
    const arrangement = arrangementStatusBadge({
      analysisStatus: 'error',
      structureStatus: 'idle',
      usingUploadedTrack: true,
    });

    expect(rhythm.tone).toBe('error');
    expect(arrangement.tone).toBe('muted');
    expect(arrangement.label).toBe('ARR·—');
  });

  it('prefers the arrangement footnote while sections are loading', () => {
    const rhythm = rhythmStatusBadge({ analysisStatus: 'ready', usingUploadedTrack: true });
    const arrangement = arrangementStatusBadge({
      analysisStatus: 'ready',
      structureStatus: 'loading',
      usingUploadedTrack: true,
    });

    expect(analysisStatusFootnote(rhythm, arrangement)).toBe(arrangement.title);
  });
});
