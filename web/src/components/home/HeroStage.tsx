'use client';

import { GrainGradient } from '@paper-design/shaders-react';
import { useEffect, useState } from 'react';

/** Full-bleed shader stage behind the hero: slow, dark, grainy light (Paper Design via 21st.dev). */
export function HeroStage() {
  const [still, setStill] = useState(false);
  useEffect(() => setStill(window.matchMedia('(prefers-reduced-motion: reduce)').matches), []);
  return (
    <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
      <GrainGradient
        style={{ width: '100%', height: '100%' }}
        colorBack="#050608"
        colors={['#2a0d07', '#ff5a3c', '#0b2a1a', '#101215']}
        softness={0.85}
        intensity={0.45}
        noise={0.35}
        shape="corners"
        speed={still ? 0 : 0.18}
        scale={1.15}
        offsetX={0.12}
      />
      <div className="absolute inset-0 bg-[radial-gradient(70%_60%_at_30%_50%,rgba(5,6,8,0.85),rgba(5,6,8,0.2)_70%)]" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[#0a0b0d]" />
    </div>
  );
}
