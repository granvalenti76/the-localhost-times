/*
 * The newsroom's sounds, made on the spot with Web Audio (no files): the typewriter's keys and its
 * bell, the rubber stamp, the red pencil, the press. Off unless the Editor turns them on (the
 * choice is remembered in this browser); browsers only play sound after a click on the page.
 */

const KEY = 'lt-sound';
let ctx = null;
let on = (() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } })();
const listeners = new Set();

export const soundOn = () => on;
export function setSound(v) {
  on = !!v;
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* private window: this page only */ }
  listeners.forEach((f) => f(on));
  if (on) click();
}
export const onSound = (f) => { listeners.add(f); return () => listeners.delete(f); };

function ac() {
  if (!on) return null;
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}

/** A short burst of filtered noise: the body of every mechanical sound. */
function noise(c, { at = 0, dur = 0.03, freq = 2400, q = 1.2, gain = 0.25, type = 'bandpass' } = {}) {
  const t = c.currentTime + at;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t);
  src.stop(t + dur + 0.02);
}

function tone(c, { at = 0, freq = 2600, dur = 0.6, gain = 0.12 } = {}) {
  const t = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t); o.stop(t + dur + 0.05);
}

const click = () => { const c = ac(); if (c) noise(c, { dur: 0.02, freq: 3000, gain: 0.15 }); };

/** One key of the typewriter (slightly different every time). */
export function key() {
  const c = ac();
  if (!c) return;
  noise(c, { dur: 0.018 + Math.random() * 0.01, freq: 1800 + Math.random() * 1600, gain: 0.18 + Math.random() * 0.08 });
  noise(c, { at: 0.012, dur: 0.03, freq: 400, q: 0.8, gain: 0.08, type: 'lowpass' });
}

/** The bell at the end of the line, and the carriage going back. */
export function bell() {
  const c = ac();
  if (!c) return;
  tone(c, { freq: 2637, dur: 0.9, gain: 0.08 });
  tone(c, { freq: 3951, dur: 0.5, gain: 0.03 });
  noise(c, { at: 0.15, dur: 0.25, freq: 900, q: 0.6, gain: 0.07 });
}

/** The rubber stamp: a thud on the desk. */
export function stamp() {
  const c = ac();
  if (!c) return;
  noise(c, { dur: 0.12, freq: 180, q: 0.7, gain: 0.6, type: 'lowpass' });
  noise(c, { at: 0.005, dur: 0.05, freq: 1200, gain: 0.15 });
}

/** The red pencil: a quick scratch. */
export function pencil() {
  const c = ac();
  if (!c) return;
  noise(c, { dur: 0.09, freq: 5200, q: 2, gain: 0.07, type: 'highpass' });
  noise(c, { at: 0.1, dur: 0.07, freq: 4800, q: 2, gain: 0.05, type: 'highpass' });
}

/** The press: a rumble with the rhythm of the rollers, for a few seconds. */
export function press(seconds = 3) {
  const c = ac();
  if (!c) return;
  for (let k = 0; k < seconds * 6; k++) {
    noise(c, { at: k / 6, dur: 0.16, freq: 140 + (k % 2) * 40, q: 0.5, gain: 0.22 * Math.min(1, k / 4, (seconds * 6 - k) / 4), type: 'lowpass' });
    noise(c, { at: k / 6 + 0.05, dur: 0.04, freq: 2200, gain: 0.04 });
  }
}

/** Copies earned: a small cash-register ring. */
export function coin() {
  const c = ac();
  if (!c) return;
  tone(c, { freq: 1568, dur: 0.18, gain: 0.07 });
  tone(c, { at: 0.08, freq: 2093, dur: 0.3, gain: 0.07 });
}
