import type { AnalysisStatus } from '$lib/engine/contracts';
import type { ArrangementStructureStatus } from '$lib/stores/arrangement';

export type AnalysisBadgeTone = 'idle' | 'loading' | 'ready' | 'fallback' | 'error' | 'muted';

export interface AnalysisStatusBadge {
  label: string;
  color: string;
  title: string;
  tone: AnalysisBadgeTone;
}

const COLORS = {
  idle: '#4a5060',
  loading: '#f59e0b',
  ready: '#4ade80',
  fallback: '#38bdf8',
  error: '#ef4444',
  muted: '#6b7280',
} as const;

export function rhythmStatusBadge(input: {
  analysisStatus: AnalysisStatus;
  usingUploadedTrack: boolean;
  analysisConfidence?: number | null;
  analysisError?: string | null;
}): AnalysisStatusBadge {
  switch (input.analysisStatus) {
    case 'analyzing':
      return {
        label: 'RHY·…',
        color: COLORS.loading,
        tone: 'loading',
        title: 'Hosted rhythm analysis in progress…',
      };
    case 'ready': {
      const conf =
        input.analysisConfidence != null
          ? ` · ${Math.round(input.analysisConfidence * 100)}% conf`
          : '';
      return {
        label: 'RHY·OK',
        color: COLORS.ready,
        tone: 'ready',
        title: `Rhythm analysis succeeded — beat grid from Essentia (analyze once, shift in real time)${conf}`,
      };
    }
    case 'fallback':
      return {
        label: 'RHY·RT',
        color: COLORS.fallback,
        tone: 'fallback',
        title: 'Following the beat in real time — hosted rhythm analysis was not used or failed',
      };
    case 'error':
      return {
        label: 'RHY·ERR',
        color: COLORS.error,
        tone: 'error',
        title: input.analysisError ?? 'Rhythm analysis failed — following in real time',
      };
    default:
      return {
        label: input.usingUploadedTrack ? 'RHY·…' : 'RHY·OFF',
        color: input.usingUploadedTrack ? COLORS.loading : COLORS.idle,
        tone: input.usingUploadedTrack ? 'loading' : 'idle',
        title: input.usingUploadedTrack
          ? 'Preparing rhythm analysis…'
          : 'Load a song to run hosted rhythm + section analysis',
      };
  }
}

export function arrangementStatusBadge(input: {
  analysisStatus: AnalysisStatus;
  structureStatus: ArrangementStructureStatus;
  usingUploadedTrack: boolean;
}): AnalysisStatusBadge {
  if (!input.usingUploadedTrack && input.analysisStatus === 'idle') {
    return {
      label: 'ARR·OFF',
      color: COLORS.idle,
      tone: 'idle',
      title: 'Song sections appear here after hosted Studio analysis',
    };
  }

  if (input.analysisStatus === 'analyzing') {
    return {
      label: 'ARR·…',
      color: COLORS.muted,
      tone: 'muted',
      title: 'Waiting for rhythm analysis before section detection',
    };
  }

  if (input.analysisStatus === 'error') {
    return {
      label: 'ARR·—',
      color: COLORS.muted,
      tone: 'muted',
      title: 'Section detection skipped — rhythm analysis failed',
    };
  }

  if (input.analysisStatus === 'fallback') {
    return {
      label: 'ARR·—',
      color: COLORS.muted,
      tone: 'muted',
      title: 'Section detection needs hosted Studio analysis',
    };
  }

  switch (input.structureStatus) {
    case 'loading':
      return {
        label: 'ARR·…',
        color: COLORS.loading,
        tone: 'loading',
        title: 'Detecting song sections for the arrangement strip',
      };
    case 'ready':
      return {
        label: 'ARR·OK',
        color: COLORS.ready,
        tone: 'ready',
        title: 'Arrangement sections seeded from Essentia structure analysis',
      };
    case 'error':
      return {
        label: 'ARR·ERR',
        color: COLORS.error,
        tone: 'error',
        title: 'Section detection failed — arrangement keeps the default template strips',
      };
    default:
      return {
        label: 'ARR·TPL',
        color: COLORS.muted,
        tone: 'muted',
        title: 'Default arrangement template — waiting for section detection',
      };
  }
}

export function analysisStatusFootnote(
  rhythm: AnalysisStatusBadge,
  arrangement: AnalysisStatusBadge,
): string {
  if (arrangement.tone === 'loading') return arrangement.title;
  if (rhythm.tone === 'loading' || rhythm.tone === 'idle') return rhythm.title;
  if (arrangement.tone === 'ready' || arrangement.tone === 'error') return arrangement.title;
  return rhythm.title;
}
