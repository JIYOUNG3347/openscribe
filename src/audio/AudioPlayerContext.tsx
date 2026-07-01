import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

interface PlayerState {
  src: string | null;
  key: string | null; // meeting id — identifies the loaded track
  title: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  peaks: number[]; // normalized 0..1 amplitudes for the waveform
  ready: boolean;
}

interface PlayerApi extends PlayerState {
  load: (src: string, key: string, title?: string) => void;
  unload: () => void;
  toggle: () => void;
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  /** seek to a fraction 0..1 of the duration */
  seekFraction: (frac: number) => void;
  cyclePlaybackRate: () => void;
}

const Ctx = createContext<PlayerApi | null>(null);

const RATES = [1, 1.25, 1.5, 0.75];
const PEAK_BUCKETS = 200;
// Skip full-file decode above this size (avoids a heavy second download +
// in-memory decode). The player still works; PlayerBar shows flat fallback bars.
const PEAK_MAX_BYTES = 60 * 1024 * 1024; // 60 MiB

// Module-level cache so re-mounts don't re-decode.
const peaksCache = new Map<string, number[]>();

async function computePeaks(src: string, buckets: number): Promise<number[]> {
  if (peaksCache.has(src)) return peaksCache.get(src)!;

  // Cheap size probe (1 byte) — bail out for large files before downloading.
  try {
    const probe = await fetch(src, { headers: { Range: 'bytes=0-0' } });
    const cr = probe.headers.get('Content-Range'); // e.g. "bytes 0-0/12345"
    const total = cr ? parseInt(cr.split('/')[1], 10) : NaN;
    if (Number.isFinite(total) && total > PEAK_MAX_BYTES) {
      peaksCache.set(src, []); // remember the skip so we don't re-probe
      return [];
    }
  } catch {
    // probe failed — fall through and try a normal decode
  }

  const res = await fetch(src);
  if (!res.ok) throw new Error(`audio fetch failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  const AudioCtx: typeof AudioContext =
    window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const audioBuf = await ctx.decodeAudioData(buf);
    const channel = audioBuf.getChannelData(0);
    const block = Math.floor(channel.length / buckets) || 1;
    const peaks: number[] = [];
    let max = 0;
    for (let i = 0; i < buckets; i++) {
      let peak = 0;
      const start = i * block;
      for (let j = 0; j < block; j++) {
        const v = Math.abs(channel[start + j] || 0);
        if (v > peak) peak = v;
      }
      peaks.push(peak);
      if (peak > max) max = peak;
    }
    const norm = max > 0 ? peaks.map((p) => p / max) : peaks;
    peaksCache.set(src, norm);
    return norm;
  } finally {
    ctx.close();
  }
}

export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<PlayerState>({
    src: null,
    key: null,
    title: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    playbackRate: 1,
    peaks: [],
    ready: false,
  });

  const load = useCallback(
    (src: string, key: string, title?: string) => {
      setState((s) => {
        if (s.key === key && s.src === src) return s; // already loaded
        return {
          ...s,
          src,
          key,
          title: title ?? null,
          isPlaying: false,
          currentTime: 0,
          duration: 0,
          peaks: peaksCache.get(src) ?? [],
          ready: false,
        };
      });

      let cancelled = false;
      computePeaks(src, PEAK_BUCKETS)
        .then((peaks) => {
          if (!cancelled) setState((s) => (s.src === src ? { ...s, peaks } : s));
        })
        .catch(() => {
          // Decoding failed (unsupported codec etc.) — player still works without bars.
        });
      return () => {
        cancelled = true;
      };
    },
    []
  );

  const unload = useCallback(() => {
    const a = audioRef.current;
    if (a) a.pause();
    setState({
      src: null,
      key: null,
      title: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      playbackRate: 1,
      peaks: [],
      ready: false,
    });
  }, []);

  const play = useCallback(() => {
    audioRef.current?.play().catch(() => {});
  }, []);
  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);
  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  }, []);

  const seek = useCallback((time: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, time);
    setState((s) => ({ ...s, currentTime: a.currentTime }));
  }, []);

  const seekFraction = useCallback(
    (frac: number) => {
      const a = audioRef.current;
      if (!a || !a.duration) return;
      seek(Math.min(1, Math.max(0, frac)) * a.duration);
    },
    [seek]
  );

  const cyclePlaybackRate = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    const idx = RATES.indexOf(a.playbackRate);
    const next = RATES[(idx + 1) % RATES.length];
    a.playbackRate = next;
    setState((s) => ({ ...s, playbackRate: next }));
  }, []);

  // Wire audio element events.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setState((s) => ({ ...s, currentTime: a.currentTime }));
    const onMeta = () => setState((s) => ({ ...s, duration: a.duration || 0, ready: true }));
    const onPlay = () => setState((s) => ({ ...s, isPlaying: true }));
    const onPause = () => setState((s) => ({ ...s, isPlaying: false }));
    const onEnded = () => setState((s) => ({ ...s, isPlaying: false }));
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('durationchange', onMeta);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('ended', onEnded);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onMeta);
      a.removeEventListener('durationchange', onMeta);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('ended', onEnded);
    };
  }, []);

  const api: PlayerApi = {
    ...state,
    load,
    unload,
    toggle,
    play,
    pause,
    seek,
    seekFraction,
    cyclePlaybackRate,
  };

  return (
    <Ctx.Provider value={api}>
      {children}
      <audio ref={audioRef} src={state.src ?? undefined} preload="metadata" className="hidden" />
    </Ctx.Provider>
  );
}

export function useAudioPlayer(): PlayerApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAudioPlayer must be used within AudioPlayerProvider');
  return ctx;
}
