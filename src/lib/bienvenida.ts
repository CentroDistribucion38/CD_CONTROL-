/**
 * EL SONIDO DE BIENVENIDA: un «logo sonoro» (hecho con Web Audio, sin archivos) y la voz del celular PRESENTANDO,
 * como locutor de evento, en tres tiempos con su pausa (sin pitos en medio: la música va solo al principio):
 *     «Bienvenido a…»   ·   «¡CONTROL TEAM!»   ·   «¡BARRANQUILLA!»
 * A la voz se le escribe «Tim»: las voces en español leen «Team» como «te-am».
 *
 * TRES TONOS (el que suena es TONO_APP):
 *   oro        barrido de aire, golpe suave y un arpegio de campanas doradas que sube (sol · do · mi · sol) con eco.
 *   marimba    tres notas de marimba limpias y un colchón de acorde que se queda sonando. Corporativo.
 *   fanfarria  dos acordes de metales, de estadio, con golpe grave.
 *
 * POR QUÉ EN DOS PASOS. Los navegadores (sobre todo el iPhone) solo dejan sonar dentro de un toque. El inicio de
 * sesión espera a Supabase antes de saber si entró, y para entonces el toque ya «se gastó». Por eso, en el mismo
 * toque de «Entrar», `prepararBienvenida()` despierta el audio y la voz en silencio; y cuando la clave resulta
 * buena, `sonarBienvenida()` ya puede sonar. Si la clave está mala, no suena nada. Con el celular en silencio no suena.
 */
export type Tono = "oro" | "marimba" | "fanfarria";
export const TONO_APP: Tono = "oro";
export const FRASE_BIENVENIDA = "Bienvenido a Control Tim Barranquilla.";

let ctx: AudioContext | null = null;
let eco: ConvolverNode | null = null;

export function prepararBienvenida() {
  /* iPhone: con el botón de silencio puesto, el audio de una página web no suena… salvo que la página diga que
     reproduce medios («playback»). Safari 16.4+ lo permite con navigator.audioSession. */
  try { (navigator as unknown as { audioSession?: { type: string } }).audioSession!.type = "playback" } catch { /* otro navegador */ }
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) {
      ctx ??= new AC();
      void ctx.resume();
      /* Un sonido mudo dentro del toque: en iPhone es lo que deja «desbloqueado» el audio para después. */
      const b = ctx.createBuffer(1, 1, 22050), src = ctx.createBufferSource();
      src.buffer = b; src.connect(ctx.destination); src.start(0);
    }
  } catch { /* sin audio, sigue */ }
  try {
    if ("speechSynthesis" in window) {
      /* La voz también se «desbloquea» hablando dentro del toque (en silencio). Un espacio solo, iPhone lo ignora. */
      const u = new SpeechSynthesisUtterance("listo");
      u.volume = 0; u.rate = 2;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    }
  } catch { /* sin voz, sigue */ }
}

/* ---------- piezas de sonido ---------- */
function salida(): AudioNode {
  const c = ctx!;
  if (!eco) {
    /* Un eco de sala: ruido que se apaga en 2 s. */
    const n = c.sampleRate * 2, b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3) }
    eco = c.createConvolver(); eco.buffer = b;
    const g = c.createGain(); g.gain.value = 0.35; eco.connect(g).connect(c.destination);
  }
  const m = c.createGain(); m.gain.value = 1;
  m.connect(c.destination); m.connect(eco);
  return m;
}
const hz = (nota: number) => 440 * Math.pow(2, (nota - 69) / 12); // número MIDI → Hz

function campanaDe(t: number, nota: number, dur: number, vol: number, dst: AudioNode) {
  const c = ctx!, f = hz(nota);
  for (const [m, v] of [[1, 1], [2.0, 0.45], [3.01, 0.18], [4.2, 0.08]] as const) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = "sine"; o.frequency.value = f * m;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol * v, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur / m ** 0.3);
    o.connect(g).connect(dst); o.start(t); o.stop(t + dur + 0.1);
  }
}
function marimbaDe(t: number, nota: number, vol: number, dst: AudioNode) {
  const c = ctx!, f = hz(nota);
  for (const [m, v, d] of [[1, 1, 0.9], [4, 0.25, 0.15], [10, 0.08, 0.05]] as const) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = m === 1 ? "triangle" : "sine"; o.frequency.value = f * m;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol * v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(dst); o.start(t); o.stop(t + d + 0.05);
  }
}
function colchon(t: number, notas: number[], dur: number, vol: number, dst: AudioNode) {
  const c = ctx!;
  for (const n of notas) for (const det of [-6, 6]) {
    const o = c.createOscillator(), g = c.createGain(), fl = c.createBiquadFilter();
    o.type = "sawtooth"; o.frequency.value = hz(n); o.detune.value = det;
    fl.type = "lowpass"; fl.frequency.value = 1400;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.35); g.gain.setValueAtTime(vol, t + dur - 0.6); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(fl).connect(g).connect(dst); o.start(t); o.stop(t + dur + 0.05);
  }
}
function metal(t: number, notas: number[], dur: number, vol: number, dst: AudioNode) {
  const c = ctx!;
  for (const n of notas) {
    const o = c.createOscillator(), g = c.createGain(), fl = c.createBiquadFilter();
    o.type = "sawtooth"; o.frequency.value = hz(n);
    fl.type = "lowpass"; fl.Q.value = 2; fl.frequency.setValueAtTime(600, t); fl.frequency.linearRampToValueAtTime(3200, t + 0.08); fl.frequency.exponentialRampToValueAtTime(900, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(fl).connect(g).connect(dst); o.start(t); o.stop(t + dur + 0.05);
  }
}
function golpe(t: number, vol: number, dst: AudioNode) {
  const c = ctx!, o = c.createOscillator(), g = c.createGain();
  o.type = "sine"; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.6);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
  o.connect(g).connect(dst); o.start(t); o.stop(t + 1.2);
}
function aire(t: number, dur: number, vol: number, dst: AudioNode) {
  const c = ctx!, n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
  s.buffer = b; fl.type = "bandpass"; fl.Q.value = 1.2;
  fl.frequency.setValueAtTime(300, t); fl.frequency.exponentialRampToValueAtTime(4000, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.85); g.gain.linearRampToValueAtTime(0, t + dur);
  s.connect(fl).connect(g).connect(dst); s.start(t); s.stop(t + dur);
}

/** Suena el logo sonoro. Devuelve en cuántos ms conviene que entre la voz. */
export function logoSonoro(tono: Tono = TONO_APP): number {
  if (!ctx) return 0;
  const t = ctx.currentTime + 0.03, dst = salida();
  if (tono === "oro") {
    aire(t, 0.45, 0.12, dst);
    golpe(t + 0.42, 0.35, dst);
    [67, 72, 76, 79].forEach((n, i) => campanaDe(t + 0.42 + i * 0.11, n, 1.8, 0.16, dst));
    campanaDe(t + 0.42 + 4 * 0.11, 84, 2.4, 0.09, dst);
    return 1500;
  }
  if (tono === "marimba") {
    [76, 83, 88].forEach((n, i) => marimbaDe(t + i * 0.14, n, 0.35, dst));
    colchon(t + 0.3, [64, 71, 76, 80], 2.2, 0.035, dst);
    return 1150;
  }
  golpe(t, 0.5, dst);
  metal(t, [60, 64, 67, 72], 0.45, 0.07, dst);
  metal(t + 0.5, [65, 69, 72, 77], 0.3, 0.06, dst);
  metal(t + 0.82, [67, 71, 74, 79], 1.4, 0.08, dst);
  golpe(t + 0.82, 0.4, dst);
  return 1700;
}

export function vozBienvenida(texto = FRASE_BIENVENIDA, opciones: { voz?: SpeechSynthesisVoice | null; velocidad?: number; tono?: number } = {}) {
  if (!("speechSynthesis" in window)) return;
  const s = window.speechSynthesis;
  const u = new SpeechSynthesisUtterance(texto);
  u.lang = "es-CO"; u.rate = opciones.velocidad ?? 0.95; u.pitch = opciones.tono ?? 0.9; u.volume = 1;
  const vs = s.getVoices();
  const v = opciones.voz ?? vs.find((x) => /^es[-_]CO/i.test(x.lang)) ?? vs.find((x) => /^es[-_](MX|US|419)/i.test(x.lang)) ?? vs.find((x) => /^es/i.test(x.lang));
  if (v) { u.voice = v; u.lang = v.lang }
  s.cancel(); s.speak(u);
}

/** Dice un pedazo y avisa cuando termina (o a los N ms si el navegador no avisa). */
function decir(texto: string, rate: number, pitch: number): Promise<void> {
  return new Promise((listo) => {
    if (!("speechSynthesis" in window)) { listo(); return }
    const s = window.speechSynthesis, u = new SpeechSynthesisUtterance(texto);
    u.lang = "es-CO"; u.rate = rate; u.pitch = pitch; u.volume = 1;
    const vs = s.getVoices();
    const v = vs.find((x) => /^es[-_]CO/i.test(x.lang)) ?? vs.find((x) => /^es[-_](MX|US|419)/i.test(x.lang)) ?? vs.find((x) => /^es/i.test(x.lang));
    if (v) { u.voice = v; u.lang = v.lang }
    let hecho = false;
    const fin = () => { if (!hecho) { hecho = true; listo() } };
    u.onend = fin; u.onerror = fin;
    window.setTimeout(fin, 600 + texto.length * 95 / rate);
    s.speak(u);
  });
}
const espera = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/** LA PRESENTACIÓN: el tono Oro al principio y luego la voz sola, en tres tiempos con su pausa (sin sonidos en medio). */
export async function presentacion() {
  let t0 = 0;
  try { t0 = logoSonoro("oro") } catch { /* sigue */ }
  await espera(Math.max(400, t0 - 250));
  try { window.speechSynthesis?.cancel() } catch { /* sigue */ }
  await decir("Bienvenido a", 0.9, 0.85);
  await espera(220);
  await decir("Control Tim", 0.8, 0.78);
  await espera(260);
  await decir("¡Barranquilla!", 0.82, 0.8);
}

export function sonarBienvenida(nombre?: string | null) {
  void nombre; // la frase es la misma para todos; el nombre queda por si se quiere volver a usar
  void presentacion();
}
