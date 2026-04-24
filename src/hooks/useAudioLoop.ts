import { useCallback, useEffect, useRef, useState } from "react";

type LoopState = "idle" | "loading" | "ready" | "error";

export interface UseAudioLoopOptions {
  src: string;
  fallbackSrc?: string;
  volume?: number;
  fadeMs?: number;
  /** Where in the buffer the seamless loop section begins (seconds). */
  loopStartSec?: number;
  /** Where in the buffer the seamless loop section ends (seconds). */
  loopEndSec?: number;
}

export interface AudioStartResult {
  ok: boolean;
  error?: string;
}

export interface UseAudioLoopReturn {
  state: LoopState;
  isPlaying: boolean;
  start: () => Promise<AudioStartResult>;
  stop: () => void;
  toggle: () => Promise<AudioStartResult | void>;
}

// Web Audio loop with sample-accurate boundary and exponential gain ramps for
// click-free fades. Decoded buffers loop seamlessly because BufferSource repeats
// the buffer without any per-iteration restart cost.
export function useAudioLoop({
  src,
  fallbackSrc,
  volume = 0.55,
  fadeMs = 700,
  loopStartSec,
  loopEndSec,
}: UseAudioLoopOptions): UseAudioLoopReturn {
  const ctxRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const loadPromiseRef = useRef<Promise<AudioStartResult> | null>(null);
  const stopTimerRef = useRef<number | null>(null);

  const [state, setState] = useState<LoopState>("idle");
  const [isPlaying, setIsPlaying] = useState(false);

  const ensureContext = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (ctxRef.current) return ctxRef.current;
    const Ctor =
      (window as unknown as {
        AudioContext?: typeof AudioContext;
        webkitAudioContext?: typeof AudioContext;
      }).AudioContext ||
      (window as unknown as {
        webkitAudioContext?: typeof AudioContext;
      }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    ctxRef.current = ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    gainRef.current = gain;
    return ctx;
  }, []);

  const decodeOne = useCallback(
    async (ctx: AudioContext, url: string): Promise<AudioBuffer> => {
      const res = await fetch(url, { cache: "force-cache" });
      if (!res.ok) {
        throw new Error(`Failed to fetch ${url}: ${res.status}`);
      }
      const arr = await res.arrayBuffer();
      // decodeAudioData callback signature is widely supported across Safari.
      return await new Promise<AudioBuffer>((resolve, reject) => {
        ctx.decodeAudioData(arr.slice(0), resolve, reject);
      });
    },
    []
  );

  const ensureBuffer = useCallback(async (): Promise<AudioStartResult> => {
    if (bufferRef.current) return { ok: true };
    if (loadPromiseRef.current) return loadPromiseRef.current;
    const ctx = ensureContext();
    if (!ctx) {
      setState("error");
      return { ok: false, error: "Web Audio not supported" };
    }
    setState("loading");
    const promise = (async (): Promise<AudioStartResult> => {
      try {
        bufferRef.current = await decodeOne(ctx, src);
        setState("ready");
        return { ok: true };
      } catch (err) {
        if (fallbackSrc) {
          try {
            bufferRef.current = await decodeOne(ctx, fallbackSrc);
            setState("ready");
            return { ok: true };
          } catch (err2) {
            console.warn("Audio fallback failed", err2);
          }
        }
        console.warn("Audio load failed", err);
        setState("error");
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Audio load failed",
        };
      } finally {
        loadPromiseRef.current = null;
      }
    })();
    loadPromiseRef.current = promise;
    return promise;
  }, [decodeOne, ensureContext, fallbackSrc, src]);

  const start = useCallback(async (): Promise<AudioStartResult> => {
    const ctx = ensureContext();
    if (!ctx) {
      return { ok: false, error: "Web Audio not supported" };
    }
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        return { ok: false, error: "AudioContext could not resume" };
      }
    }
    const loadResult = await ensureBuffer();
    if (!loadResult.ok) return loadResult;
    if (!bufferRef.current || !gainRef.current) {
      return { ok: false, error: "Audio not initialized" };
    }

    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        /* already stopped */
      }
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    const source = ctx.createBufferSource();
    source.buffer = bufferRef.current;
    source.loop = true;
    const dur = bufferRef.current.duration;
    const inset = Math.min(0.004, dur * 0.001);
    const ls =
      loopStartSec !== undefined
        ? Math.max(0, Math.min(loopStartSec, dur - 0.05))
        : inset;
    const le =
      loopEndSec !== undefined
        ? Math.max(ls + 0.05, Math.min(loopEndSec, dur - inset))
        : Math.max(inset + 0.05, dur - inset);
    source.loopStart = ls;
    source.loopEnd = le;
    source.connect(gainRef.current);
    // Begin playback inside the loop window so listeners immediately hear the
    // stable section instead of any pre-loop transient.
    source.start(0, ls);
    sourceRef.current = source;

    const now = ctx.currentTime;
    const gain = gainRef.current.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(Math.max(gain.value, 0.0001), now);
    gain.exponentialRampToValueAtTime(volume, now + fadeMs / 1000);
    setIsPlaying(true);
    return { ok: true };
  }, [ensureBuffer, ensureContext, fadeMs, loopEndSec, loopStartSec, volume]);

  const stop = useCallback(() => {
    const ctx = ctxRef.current;
    const gainNode = gainRef.current;
    if (!ctx || !gainNode) {
      setIsPlaying(false);
      return;
    }
    const now = ctx.currentTime;
    const gain = gainNode.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(Math.max(gain.value, 0.0001), now);
    gain.exponentialRampToValueAtTime(0.0001, now + fadeMs / 1000);

    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
    }
    stopTimerRef.current = window.setTimeout(() => {
      if (sourceRef.current) {
        try {
          sourceRef.current.stop();
        } catch {
          /* already stopped */
        }
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }
      gain.setValueAtTime(0, ctxRef.current?.currentTime ?? 0);
      stopTimerRef.current = null;
    }, fadeMs + 40);

    setIsPlaying(false);
  }, [fadeMs]);

  const toggle = useCallback(async () => {
    if (isPlaying) {
      stop();
      return;
    }
    return await start();
  }, [isPlaying, start, stop]);

  useEffect(() => {
    return () => {
      if (stopTimerRef.current !== null) {
        window.clearTimeout(stopTimerRef.current);
      }
      if (sourceRef.current) {
        try {
          sourceRef.current.stop();
        } catch {
          /* noop */
        }
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }
      if (ctxRef.current) {
        ctxRef.current.close().catch(() => undefined);
        ctxRef.current = null;
      }
    };
  }, []);

  return { state, isPlaying, start, stop, toggle };
}
