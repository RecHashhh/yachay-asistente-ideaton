import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';

export type MascotMood = 'idle' | 'thinking' | 'talking' | 'happy';

/**
 * Mascota PROVISIONAL dibujada en SVG. Al tener el arte oficial de la mascota de Yachay Tech,
 * conserva los grupos `eyes`, `mouth` y `body` (o sus equivalentes) para que las animaciones sigan funcionando.
 */
export function Mascot({ size = 36, mood = 'idle', decorative }: { size?: number; mood?: MascotMood; decorative?: boolean }) {
  const reduce = useReducedMotion();
  const [blink, setBlink] = useState(false);

  // Parpadeo a intervalos irregulares.
  useEffect(() => {
    if (reduce) return;
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      t = setTimeout(() => { setBlink(true); setTimeout(() => setBlink(false), 140); loop(); }, 2200 + Math.random() * 2800);
    };
    loop();
    return () => clearTimeout(t);
  }, [reduce]);

  const look = mood === 'thinking' ? { x: 2.5, y: -2.5 } : { x: 0, y: 0 };
  const eyeScale = blink ? 0.1 : mood === 'happy' ? 0.55 : 1;

  return (
    <svg className="mascot" width={size} height={size} viewBox="0 0 64 64" {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': 'Mascota de Yachay Tech' })}>
      <motion.g
        animate={reduce ? undefined : mood === 'thinking' ? { y: [0, -2.5, 0], rotate: [0, -3, 0] } : mood === 'talking' ? { y: [0, -1, 0] } : { y: [0, -1.2, 0] }}
        transition={{ duration: mood === 'thinking' ? 1.1 : mood === 'talking' ? 0.5 : 3.2, repeat: Infinity, ease: 'easeInOut' }}
        style={{ originX: '32px', originY: '56px' }}
      >
        {/* cuerpo */}
        <path d="M32 6c14 0 24 10 24 25 0 15-10 27-24 27S8 46 8 31C8 16 18 6 32 6z" fill="#27618E" />
        <path d="M20 12c3-3 7-4.5 12-4.5" stroke="rgba(255,255,255,.35)" strokeWidth="3" strokeLinecap="round" fill="none" />
        {/* mejillas */}
        <circle cx="17" cy="38" r="3.4" fill="var(--warm)" opacity=".55" />
        <circle cx="47" cy="38" r="3.4" fill="var(--warm)" opacity=".55" />
        {/* ojos */}
        <motion.g animate={look} transition={{ type: 'spring', stiffness: 200, damping: 16 }}>
          {[23, 41].map((cx) => (
            <motion.ellipse key={cx} cx={cx} cy={29} rx={4.2} ry={5.2} fill="#fff" animate={{ scaleY: eyeScale }} transition={{ duration: 0.09 }} style={{ originX: `${cx}px`, originY: '29px' }} />
          ))}
          {[24, 42].map((cx) => (
            <motion.circle key={cx} cx={cx} cy={30} r={2.1} fill="#0b1020" animate={{ scaleY: eyeScale, opacity: mood === 'happy' ? 0 : 1 }} transition={{ duration: 0.09 }} style={{ originX: `${cx}px`, originY: '30px' }} />
          ))}
        </motion.g>
        {/* boca */}
        <motion.path
          fill="#0b1020"
          animate={{ d: mood === 'talking' ? ['M27 41 Q32 43 37 41 Q32 46 27 41Z', 'M27 41 Q32 41 37 41 Q32 49 27 41Z'] : mood === 'thinking' ? 'M29 43 Q32 42 35 43 Q32 44 29 43Z' : 'M26 40 Q32 42 38 40 Q32 48 26 40Z' }}
          transition={mood === 'talking' ? { duration: 0.28, repeat: Infinity, repeatType: 'reverse' } : { duration: 0.25 }}
        />
      </motion.g>
      {/* chispas al pensar */}
      {mood === 'thinking' && !reduce && [0, 1, 2].map((i) => (
        <motion.circle key={i} r={2} fill="var(--warm)" cx={54} cy={10}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: [0, 1, 0], scale: [0, 1, 0], cx: [52, 56 + i * 2, 60], cy: [14, 8 - i * 3, 2] }}
          transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.35, ease: 'easeOut' }} />
      ))}
    </svg>
  );
}
