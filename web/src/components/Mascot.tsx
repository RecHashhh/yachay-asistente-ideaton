import './Mascot.css';
import { useId } from 'react';

export type MascotMood = 'idle' | 'thinking' | 'talking' | 'happy';

/** Cabeza vectorial inspirada en el robot de referencia, legible incluso a 28 px. */
export function Mascot({ size = 36, mood = 'idle', decorative }: { size?: number; mood?: MascotMood; decorative?: boolean }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const shellId = `robot-shell-${id}`;
  const ledsId = `robot-leds-${id}`;
  // La matriz se reserva para tamaños donde se distingue; en el lateral los ojos son sólidos.
  const eyeFill = size >= 64 ? `url(#${ledsId})` : '#d7ffff';
  return (
    <svg className="mascot mascot-robot" data-mood={mood} width={size} height={size} viewBox="0 0 80 80"
      {...(decorative ? { 'aria-hidden': true as const } : { role: 'img', 'aria-label': 'Yachi, mascota robot de Yachay Tech' })}>
      <defs>
        <linearGradient id={shellId} x1="0" y1="0" x2=".8" y2="1" gradientUnits="objectBoundingBox">
          <stop stopColor="#fbfcfd" /><stop offset=".55" stopColor="#d9e0e5" /><stop offset="1" stopColor="#a3afb9" />
        </linearGradient>
        <pattern id={ledsId} width="1.8" height="1.8" patternUnits="userSpaceOnUse">
          <circle cx=".9" cy=".9" r=".62" fill="#d7ffff" />
        </pattern>
      </defs>
      <g className="robot-head" strokeLinejoin="round" strokeLinecap="round">
        {/* Casco plateado, banda azul y protectores circulares de la nueva referencia. */}
        <path d="M29 65v7h22v-7" fill="#526777" stroke="#223b4b" strokeWidth="2" />
        <rect x="5" y="31" width="10" height="22" rx="5" fill="#27618e" stroke="#223b4b" strokeWidth="2" />
        <rect x="65" y="31" width="10" height="22" rx="5" fill="#27618e" stroke="#223b4b" strokeWidth="2" />
        <path d="M10 32Q9 9 32 6h16q23 3 22 26l-2 19q-2 15-18 18H30Q14 66 12 51Z" fill={`url(#${shellId})`} stroke="#526777" strokeWidth="2" />
        <path d="M28 8q12-4 24 0l4 22H24Z" fill="#27618e" />
        <path d="m29 10-3 17m25-17 3 17" stroke="#8cc3df" strokeWidth="1.3" fill="none" />
        <path d="m34 13 6 5 6-5m-6 5v6" stroke="#e3f5ff" strokeWidth="2.4" fill="none" />
        <path d="m18 25 5-12m39 12-5-12" stroke="#e45049" strokeWidth="3.5" />
        <ellipse cx="15" cy="32" rx="3.4" ry="5" fill="#27618e" stroke="#223b4b" strokeWidth="1.4" />
        <ellipse cx="65" cy="32" rx="3.4" ry="5" fill="#27618e" stroke="#223b4b" strokeWidth="1.4" />
        <path d="m18 61 8 4m28 0 8-4" stroke="#f4f7f9" strokeWidth="2" />
        {/* Grand visor negro: el acento rojo enmarca los ojos, no las mejillas. */}
        <path d="M13 36q0-6 6-7 21-5 42 0 6 1 6 7v15q-1 8-9 10-18 4-36 0-8-2-9-10Z" fill="#101e25" stroke="#81919b" strokeWidth="2" />
        <path d="M20 29q20-5 40 0M21 62q19 4 38 0" fill="none" stroke="#e45049" strokeWidth="3" />
        <path d="m18 35 6-2" fill="none" stroke="#d9f7fa" strokeWidth="1.2" opacity=".4" />
        <g className="robot-gaze">
          <g className="robot-eyes" fill={eyeFill}>
            {mood === 'happy' ? (
              <path d="M23 45q6-9 12 0m10 0q6-9 12 0" fill="none" stroke="#d7ffff" strokeWidth="3.5" />
            ) : (
              <><ellipse cx="29" cy="43" rx="6" ry="6.5" /><ellipse cx="51" cy="43" rx="6" ry="6.5" /></>
            )}
          </g>
        </g>
        <path className="robot-smile" d={mood === 'thinking' ? 'M37 54h6' : 'M36 53q4 3 8 0'} fill="none" stroke="#a3e9e8" strokeWidth="1.6" />
        {mood === 'talking' && <g className="robot-voice" stroke="#a3e9e8" strokeWidth="1.8"><path d="M35 52v4" /><path d="M40 51v6" /><path d="M45 52v4" /></g>}
      </g>
    </svg>
  );
}
