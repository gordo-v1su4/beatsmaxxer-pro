import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { audioEngine, type AudioState } from './AudioEngine';

interface AudioContextValue {
  state: AudioState;
  playing: boolean;
  togglePlay: () => void;
  setBPM: (bpm: number) => void;
  unlockBPM: () => void;
  tapTempo: () => void;
  loadAudioFile: (file: File) => Promise<void>;
  clearUploadedTrack: () => void;
}

const defaultState: AudioState = {
  bpm: 128,
  bpmLocked: false,
  beat: 0,
  beatPhase: 0,
  amplitude: 0,
  bassAmp: 0,
  highAmp: 0,
  fftBands: new Array(8).fill(0),
  playing: false,
  time: 0,
  duration: 0,
  trackName: 'Internal Drum Loop',
  usingUploadedTrack: false,
  analysisStatus: 'idle',
  analysisConfidence: null,
  analysisError: null,
};

const Ctx = createContext<AudioContextValue>({
  state: defaultState,
  playing: false,
  togglePlay: () => {},
  setBPM: () => {},
  unlockBPM: () => {},
  tapTempo: () => {},
  loadAudioFile: async () => {},
  clearUploadedTrack: () => {},
});

const UI_SNAPSHOT_INTERVAL_MS = 100;

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AudioState>(audioEngine.getState());
  const [playing, setPlaying] = useState(false);
  const rafRef = useRef<number>(0);
  const lastSnapshotRef = useRef(0);
  const tapTimesRef = useRef<number[]>([]);

  useEffect(() => {
    const poll = (now: number) => {
      if (now - lastSnapshotRef.current >= UI_SNAPSHOT_INTERVAL_MS) {
        const next = audioEngine.getState();
        setState(next);
        setPlaying(next.playing);
        lastSnapshotRef.current = now;
      }
      rafRef.current = requestAnimationFrame(poll);
    };
    rafRef.current = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const togglePlay = async () => {
    if (!playing) {
      await audioEngine.start();
      setPlaying(audioEngine.getState().playing);
    } else {
      audioEngine.stop();
      setPlaying(false);
    }
  };

  const setBPM = (bpm: number) => {
    audioEngine.setBPM(bpm);
  };

  const unlockBPM = () => {
    audioEngine.unlockBPM();
  };

  const tapTempo = () => {
    const now = performance.now();
    tapTimesRef.current.push(now);
    if (tapTimesRef.current.length > 6) tapTimesRef.current.shift();
    if (tapTimesRef.current.length >= 2) {
      const diffs = tapTimesRef.current.slice(1).map((t, i) => t - tapTimesRef.current[i]);
      const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      const bpm = Math.round(60000 / avg);
      audioEngine.setBPM(bpm);
    }
  };

  const loadAudioFile = async (file: File) => {
    await audioEngine.loadAudioFile(file);
    setState(audioEngine.getState());
    setPlaying(false);
  };

  const clearUploadedTrack = () => {
    audioEngine.clearUploadedTrack();
    setState(audioEngine.getState());
    setPlaying(false);
  };

  return (
    <Ctx.Provider value={{ state, playing, togglePlay, setBPM, unlockBPM, tapTempo, loadAudioFile, clearUploadedTrack }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAudio() {
  return useContext(Ctx);
}
