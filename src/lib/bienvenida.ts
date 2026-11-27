/**
 * EL SONIDO DE BIENVENIDA: un «logo sonoro» (hecho con Web Audio, sin archivos) y la voz del celular PRESENTANDO,
 * de una sola vez y rápido, encima de las campanas: «Bienvenido a Control Team Barranquilla».
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
import { esNavidad } from "@/lib/temporada";

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

/**
 * NAVIDAD: «We Wish You a Merry Christmas» (tradicional inglés — dominio público) en campanas, con bajo y acordes
 * suaves y un destello de campanitas justo cuando el globo aterriza y se levanta la nieve (ver GloboNavidad). La
 * música baja un poco mientras la voz dice la frase. Devuelve en cuántos ms entra la voz y la ganancia de la música.
 */
const VILLANCICO: [number, number][] = [ // [nota MIDI, duración en tiempos de 3/4]
  [74, 1],
  [79, 1], [79, 0.5], [81, 0.5], [79, 0.5], [78, 0.5], [76, 1], [76, 1], [76, 1],
  [81, 1], [81, 0.5], [83, 0.5], [81, 0.5], [79, 0.5], [78, 1], [74, 1], [74, 1],
  [83, 1], [83, 0.5], [84, 0.5], [83, 0.5], [81, 0.5], [79, 1], [76, 1], [74, 0.5], [74, 0.5],
  [76, 1], [81, 1], [78, 1], [79, 3],
];
/* Un compás por fila: [bajo, acorde]. */
const ACORDES: [number, number[]][] = [
  [43, [59, 62, 67]], [48, [60, 64, 67]], [45, [57, 61, 64]], [50, [57, 62, 66]],
  [47, [59, 64, 67]], [48, [60, 64, 67]], [50, [57, 62, 66]], [43, [59, 62, 67]],
];
export function villancico(): { voz: number; musica: GainNode } | null {
  if (!ctx) return null;
  const c = ctx, t0 = c.currentTime + 0.03, musica = c.createGain();
  musica.gain.value = 1; musica.connect(salida());
  /* Destello de campanitas que bajan: la nieve que se levanta. */
  [100, 96, 93, 91, 88, 86, 84].forEach((n, i) => campanaDe(t0 + 0.62 + i * 0.045, n, 0.9, 0.035, musica));
  const ini = t0 + 0.9, tiempo = 0.4;
  let t = ini;
  for (const [n, d] of VILLANCICO) {
    campanaDe(t, n, Math.max(1.4, d * tiempo * 1.5), 0.15, musica);
    campanaDe(t + 0.01, n + 12, 0.7, 0.025, musica);
    t += d * tiempo;
  }
  /* El bajo entra con el primer compás completo (después de la anacrusa). */
  ACORDES.forEach(([b, acorde], k) => {
    const tc = ini + tiempo + k * 3 * tiempo;
    campanaDe(tc, b, 1.8, 0.11, musica);
    colchon(tc, acorde, 3 * tiempo + (k === ACORDES.length - 1 ? 1.2 : 0.05), 0.012, musica);
  });
  return { voz: Math.round((ini - c.currentTime + 7 * tiempo) * 1000), musica };
}

async function presentacionNavidad() {
  let m: ReturnType<typeof villancico> = null;
  try { m = villancico() } catch { /* sigue */ }
  await espera(m?.voz ?? 2800);
  try {
    if (m && ctx) { const g = m.musica.gain, t = ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(1, t); g.linearRampToValueAtTime(0.45, t + 0.25); g.setValueAtTime(0.45, t + 3.2); g.linearRampToValueAtTime(1, t + 3.8) }
  } catch { /* sigue */ }
  try { window.speechSynthesis?.cancel() } catch { /* sigue */ }
  await decir("Feliz Navidad. Bienvenido a Control Tim Barranquilla", 1.05, 0.95);
}

/** LA PRESENTACIÓN: el tono Oro y, encima de sus campanas, la frase de una sola vez, ágil y sin pausas.
 *  En temporada de Navidad (lib/temporada.ts) suena el villancico en su lugar. */
export async function presentacion() {
  if (esNavidad()) return presentacionNavidad();
  try { logoSonoro("oro") } catch { /* sigue */ }
  await espera(700);
  try { window.speechSynthesis?.cancel() } catch { /* sigue */ }
  await decir("Bienvenido a Control Tim Barranquilla", 1.08, 0.92);
}

/* UNA VEZ POR SESIÓN: suene donde suene primero (sola al abrir, al primer toque o al darle «Entrar»), no se repite. */
const YA = "cd38-bienvenida-sono";
const yaSono = () => { try { return sessionStorage.getItem(YA) === "1" } catch { return false } };
const marcar = () => { try { sessionStorage.setItem(YA, "1") } catch { /* sigue */ } };

/**
 * SONAR SOLA AL ABRIR LA APP. Se intenta sin que nadie toque nada:
 *   · Android (app instalada) y Chrome/Edge en computador donde ya se usa CONTROL: el navegador lo permite → suena sola.
 *   · iPhone: Apple no deja sonar NUNCA sin un toque. Ahí suena con el PRIMER toque que la persona haga en
 *     cualquier parte (la entrada, el campo de usuario, un módulo…), sin botón aparte.
 */
export function sonarAlAbrir() {
  if (yaSono()) return;
  let hecho = false;
  const sonar = () => { if (hecho || yaSono()) return; hecho = true; marcar(); quitar(); void presentacion() };
  const alTocar = () => { prepararBienvenida(); sonar() };
  const eventos = ["pointerdown", "keydown", "touchend"] as const;
  const quitar = () => eventos.forEach((e) => window.removeEventListener(e, alTocar, true));
  eventos.forEach((e) => window.addEventListener(e, alTocar, { capture: true, passive: true }));
  /* El intento sin toque: si el navegador deja correr el audio, suena ya. */
  try {
    try { (navigator as unknown as { audioSession?: { type: string } }).audioSession!.type = "playback" } catch { /* otro navegador */ }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    const c = ctx;
    void c.resume().then(() => { if (c.state === "running") sonar() }).catch(() => { /* espera el primer toque */ });
    window.setTimeout(() => { if (c.state === "running") sonar() }, 250);
  } catch { /* espera el primer toque */ }
}

/** Al darle «Entrar»: suena si en esta sesión todavía no ha sonado. */
export function sonarBienvenida(nombre?: string | null) {
  void nombre; // la frase es la misma para todos; el nombre queda por si se quiere volver a usar
  if (yaSono()) return;
  marcar();
  void presentacion();
}
