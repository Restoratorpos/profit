// ─── Notification sound engine ───────────────────────────────────────
// Synthesises short, pleasant notification tones via Web Audio API.
// Inspired by iOS/macOS system sound design: sine-wave chords with
// fast attack, smooth exponential decay.

let audioCtx: AudioContext | null = null;

const getAudioCtx = (): AudioContext | null => {
  if (typeof AudioContext === "undefined") {
    return null;
  }
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
};

interface ToneNote {
  delay: number;
  duration: number;
  freq: number;
  gain: number;
}

// ── Sound palettes per toast type ───────────────────────────────────
// Each palette is a set of short sine tones played together as a chord
// or in quick succession to create a recognisable micro-interaction.

const SOUND_PALETTES: Record<string, ToneNote[]> = {
  // ── Toast sounds ────────────────────────────────────────────────────
  // Success: ascending major third — C5 → E5 (bright, affirming)
  success: [
    { delay: 0, duration: 0.1, freq: 523.25, gain: 0.15 },
    { delay: 0.08, duration: 0.12, freq: 659.25, gain: 0.18 },
  ],
  // Error: dissonant minor second rumble — E4 → F4 → E4 (tense, alerting)
  error: [
    { delay: 0, duration: 0.08, freq: 329.63, gain: 0.18 },
    { delay: 0.1, duration: 0.08, freq: 349.23, gain: 0.18 },
    { delay: 0.2, duration: 0.1, freq: 329.63, gain: 0.14 },
  ],
  // Warning: whole-tone step — D5 → C5 (descending, cautionary)
  warning: [
    { delay: 0, duration: 0.1, freq: 587.33, gain: 0.16 },
    { delay: 0.1, duration: 0.12, freq: 523.25, gain: 0.14 },
  ],
  // Info: single soft bell tone — G5 (neutral, gentle)
  info: [{ delay: 0, duration: 0.15, freq: 783.99, gain: 0.1 }],
  // Loading: quick soft tick — A5 (subtle, non-intrusive)
  loading: [{ delay: 0, duration: 0.06, freq: 880.0, gain: 0.07 }],

  // ── Chat sounds ─────────────────────────────────────────────────────
  // Message sent: soft upward pop — A4 → D5 (quick, satisfying send feel)
  "chat:send": [
    { delay: 0, duration: 0.06, freq: 440.0, gain: 0.1 },
    { delay: 0.04, duration: 0.08, freq: 587.33, gain: 0.12 },
  ],
  // Response complete: gentle resolved chord — E5 → G5 (warm arrival)
  "chat:receive": [
    { delay: 0, duration: 0.12, freq: 659.25, gain: 0.1 },
    { delay: 0.06, duration: 0.14, freq: 783.99, gain: 0.12 },
  ],
  // Stop generation: short descending tap — D5 → A4 (decisive halt)
  "chat:stop": [
    { delay: 0, duration: 0.06, freq: 587.33, gain: 0.1 },
    { delay: 0.05, duration: 0.08, freq: 440.0, gain: 0.08 },
  ],
  // Tool approval needed: attention bell — B5 (clear, requesting input)
  "chat:approval": [
    { delay: 0, duration: 0.1, freq: 987.77, gain: 0.12 },
    { delay: 0.12, duration: 0.08, freq: 987.77, gain: 0.08 },
  ],
};

type ToastSoundType = keyof typeof SOUND_PALETTES;

const playTone = (
  ctx: AudioContext,
  note: ToneNote,
  startTime: number
): void => {
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();

  osc.type = "sine";
  osc.frequency.value = note.freq;

  const t = startTime + note.delay;

  // Fast attack, smooth exponential decay
  gainNode.gain.setValueAtTime(0, t);
  gainNode.gain.linearRampToValueAtTime(note.gain, t + 0.005);
  gainNode.gain.exponentialRampToValueAtTime(0.001, t + note.duration);

  osc.connect(gainNode);
  gainNode.connect(ctx.destination);

  osc.start(t);
  osc.stop(t + note.duration + 0.05);
};

/**
 * Play a notification sound for the given toast type.
 */
const playNotificationSound = (type: ToastSoundType): void => {
  const ctx = getAudioCtx();
  if (!ctx) {
    return;
  }

  const notes = SOUND_PALETTES[type];
  if (!notes) {
    return;
  }

  const now = ctx.currentTime;
  for (const note of notes) {
    playTone(ctx, note, now);
  }
};

/**
 * Clean up audio resources.
 */
const destroyNotificationSounds = (): void => {
  if (audioCtx) {
    audioCtx.close();
    audioCtx = null;
  }
};

export type { ToastSoundType };
export { destroyNotificationSounds, playNotificationSound };
