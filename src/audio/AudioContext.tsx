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
const SONG_DB_NAME = 'beat-surfer-song';
const SONG_STORE = 'song';
const SONG_KEY = 'last';

function idbOp<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const { promise, resolve, reject } = Promise.withResolvers<T>();
  const openReq = indexedDB.open(SONG_DB_NAME, 1);
  openReq.onupgradeneeded = () => {
    openReq.result.createObjectStore(SONG_STORE);
  };
  openReq.onsuccess = () => {
    const db = openReq.result;
    const tx = db.transaction(SONG_STORE, mode);
    const req = fn(tx.objectStore(SONG_STORE));
    req.onsuccess = () => { db.close(); resolve(req.result); };
    req.onerror = () => { db.close(); reject(req.error); };
  };
  openReq.onerror = () => reject(openReq.error);
  return promise;
}

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AudioState>(defaultState);
  const [playing, setPlaying] = useState(false);
  const tapTimesRef = useRef<number[]>([]);
  const restoredRef = useRef(false);

  useEffect(() => {
    const id = setInterval(() => {
      setState(audioEngine.getState());
      setPlaying(audioEngine.getState().playing);
    }, UI_SNAPSHOT_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // Restore the previously uploaded song from IndexedDB on mount so the
  // user doesn't have to re-select it every reload.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    void idbOp('readonly', (store) => store.get(SONG_KEY))
      .then((saved) => {
        if (!(saved instanceof File)) return;
        return audioEngine.loadAudioFile(saved).then(() => {
          setState(audioEngine.getState());
        });
      })
      .catch(() => {
        // non-fatal: no saved song or IndexedDB unavailable
      });
  }, []);

  const togglePlay = () => {
    const next = !playing;
    if (next) {
      void audioEngine.start();
    } else {
      audioEngine.stop();
    }
    setPlaying(next);
  };

  const setBPM = (bpm: number) => {
    audioEngine.setBPM(bpm);
    setState(audioEngine.getState());
  };

  const unlockBPM = () => {
    audioEngine.unlockBPM();
    setState(audioEngine.getState());
  };

  const tapTempo = () => {
    const now = performance.now();
    tapTimesRef.current = tapTimesRef.current.filter((t) => now - t < 3000);
    tapTimesRef.current.push(now);
    if (tapTimesRef.current.length >= 2) {
      const diffs: number[] = [];
      for (let i = 1; i < tapTimesRef.current.length; i++) {
        diffs.push(tapTimesRef.current[i]! - tapTimesRef.current[i - 1]!);
      }
      const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      const bpm = Math.round(60000 / avg);
      audioEngine.setBPM(bpm);
    }
  };

  const loadAudioFile = async (file: File) => {
    await audioEngine.loadAudioFile(file);
    setState(audioEngine.getState());
    setPlaying(false);
    // Persist so the next reload auto-restores this song.
    void idbOp('readwrite', (store) => store.put(file, SONG_KEY)).catch(() => {
      // non-fatal: persistence is a convenience, not a requirement
    });
  };

  const clearUploadedTrack = () => {
    audioEngine.clearUploadedTrack();
    setState(audioEngine.getState());
    setPlaying(false);
    void idbOp('readwrite', (store) => store.delete(SONG_KEY)).catch(() => {
      // ignore
    });
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
