"use client";

import { cn } from "@repo/design-system/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";

/** Resolve the bar color from props, inherited CSS color, or foreground variable. */
function resolveBarColor(
  barColor: string | undefined,
  canvas: HTMLCanvasElement
): string {
  if (barColor) {
    if (barColor.startsWith("var(")) {
      const varName = barColor.slice(4, -1).trim();
      const resolved = getComputedStyle(document.documentElement)
        .getPropertyValue(varName)
        .trim();
      if (resolved) {
        return resolved;
      }
    }
    return barColor;
  }
  const inherited = getComputedStyle(canvas).getPropertyValue("color").trim();
  if (inherited) {
    return inherited;
  }
  const fg = getComputedStyle(document.documentElement)
    .getPropertyValue("--foreground")
    .trim();
  return fg || "#888888";
}

interface TBarConfig {
  barGap: number;
  barHeight: number;
  barWidth: number;
}

/** Prepare a canvas context for drawing, handling DPR scaling. Returns null if not ready. */
function prepareCanvas(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = rect.width * dpr;
  const h = rect.height * dpr;

  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h, dpr };
}

/** Draw frequency bars from analyser data onto the canvas. */
function drawFrequencyBars(
  canvas: HTMLCanvasElement,
  analyser: AnalyserNode,
  dataArray: Uint8Array<ArrayBuffer>,
  bufferLength: number,
  config: TBarConfig,
  color: string | undefined
) {
  const prepared = prepareCanvas(canvas);
  if (!prepared) {
    return;
  }
  const { ctx, w, h, dpr } = prepared;

  analyser.getByteFrequencyData(dataArray);

  const scaledBarWidth = config.barWidth * dpr;
  const scaledBarGap = config.barGap * dpr;
  const scaledBarHeight = config.barHeight * dpr;
  const step = scaledBarWidth + scaledBarGap;
  const barCount = Math.floor(w / step);
  const startX = (w - barCount * step + scaledBarGap) / 2;

  ctx.fillStyle = resolveBarColor(color, canvas);

  for (let i = 0; i < barCount; i++) {
    const dataIndex = Math.floor((i / barCount) * bufferLength * 0.8);
    const value = dataArray[dataIndex] / 255;
    const barH = Math.max(scaledBarHeight, value * h * 0.85);
    const x = startX + i * step;
    const y = (h - barH) / 2;
    const radius = Math.min(scaledBarWidth / 2, barH / 2);

    ctx.beginPath();
    ctx.roundRect(x, y, scaledBarWidth, barH, radius);
    ctx.fill();
  }
}

interface LiveWaveformProps extends React.HTMLAttributes<HTMLCanvasElement> {
  /** Whether the waveform is actively listening to the microphone */
  active?: boolean;
  /** Bar color (defaults to currentColor) */
  barColor?: string;
  /** Gap between bars in pixels */
  barGap?: number;
  /** Minimum height of each bar in pixels */
  barHeight?: number;
  /** Width of each frequency bar in pixels */
  barWidth?: number;
  /** Container height */
  height?: number | string;
  /** Show animated idle waves while awaiting input */
  processing?: boolean;
}

/**
 * LiveWaveform — real-time audio waveform visualizer.
 *
 * When `active` is true, requests microphone access and renders
 * frequency data as vertical bars on a canvas element.
 *
 * When `processing` is true (but not active), shows an animated
 * idle wave pattern to indicate the system is ready.
 *
 * @example
 * ```tsx
 * <LiveWaveform active={isRecording} height={80} barColor="#7c3aed" />
 * ```
 */
export function LiveWaveform({
  active = false,
  processing = false,
  barWidth = 3,
  barHeight = 4,
  barGap = 1,
  barColor,
  height = 64,
  className,
  style,
  ...props
}: LiveWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [idlePhase, setIdlePhase] = useState(0);

  const cleanup = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = 0;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  // Active mode — mic + AnalyserNode + canvas draw loop
  useEffect(() => {
    if (!active) {
      cleanup();
      return;
    }

    let cancelled = false;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (cancelled) {
          for (const track of stream.getTracks()) {
            track.stop();
          }
          return;
        }

        streamRef.current = stream;
        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;

        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.7;
        source.connect(analyser);
        analyserRef.current = analyser;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const config = { barWidth, barGap, barHeight };
        const draw = () => {
          if (cancelled) {
            return;
          }
          animationRef.current = requestAnimationFrame(draw);
          const canvas = canvasRef.current;
          if (canvas) {
            drawFrequencyBars(
              canvas,
              analyser,
              dataArray,
              bufferLength,
              config,
              barColor
            );
          }
        };

        draw();
      } catch {
        // getUserMedia denied or unavailable — fail silently
      }
    };

    start();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [active, barWidth, barGap, barHeight, barColor, cleanup]);

  // Processing/idle mode — animated sine wave
  useEffect(() => {
    if (active || !processing) {
      setIdlePhase(0);
      return;
    }

    let frame: number;
    const animate = () => {
      setIdlePhase((p) => p + 0.04);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(frame);
  }, [active, processing]);

  useEffect(() => {
    if (active || !processing) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const prepared = prepareCanvas(canvas);
    if (!prepared) {
      return;
    }
    const { ctx, w, h, dpr } = prepared;

    const scaledBarWidth = barWidth * dpr;
    const scaledBarGap = barGap * dpr;
    const scaledBarHeight = barHeight * dpr;
    const step = scaledBarWidth + scaledBarGap;
    const barCount = Math.floor(w / step);
    const startX = (w - barCount * step + scaledBarGap) / 2;

    ctx.fillStyle = resolveBarColor(barColor, canvas);

    for (let i = 0; i < barCount; i++) {
      const normalizedPos = i / barCount;
      const wave =
        Math.sin(normalizedPos * Math.PI * 4 + idlePhase) * 0.3 +
        Math.sin(normalizedPos * Math.PI * 2 + idlePhase * 0.7) * 0.2;
      const value = 0.15 + Math.abs(wave) * 0.4;
      const barH = Math.max(scaledBarHeight, value * h * 0.6);
      const x = startX + i * step;
      const y = (h - barH) / 2;
      const radius = Math.min(scaledBarWidth / 2, barH / 2);

      ctx.beginPath();
      ctx.roundRect(x, y, scaledBarWidth, barH, radius);
      ctx.fill();
    }
  }, [active, processing, idlePhase, barWidth, barGap, barHeight, barColor]);

  return (
    <canvas
      className={cn("w-full", className)}
      data-slot="live-waveform"
      ref={canvasRef}
      style={{ height, ...style }}
      {...props}
    />
  );
}

LiveWaveform.displayName = "StriveUI.LiveWaveform";
