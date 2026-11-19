'use client';

import { PaperTexture } from '@paper-design/shaders-react';

/**
 * The hero's surface: real receipt paper (Paper Design's PaperTexture shader, via 21st.dev).
 * Static: no animation cost, and nothing moves for reduced-motion users.
 */
export function HeroPaper() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
      <PaperTexture
        style={{ width: '100%', height: '100%' }}
        colorBack="#f3efe6"
        colorPaper="#f5f1e8"
        colorShadow="#9c917c"
        roughness={0.35}
        roughnessSize={0.4}
        fiber={0.3}
        fiberSize={0.25}
        folds={0.55}
        foldSizeX={0.62}
        foldSizeY={0.9}
        foldOffsetX={0.42}
        foldOffsetY={0.5}
        crumples={0.18}
        crumpleCount={6}
        wrinkles={0.08}
        drops={0.12}
        angle={70}
        seed={21}
        speed={0}
      />
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-paper" />
    </div>
  );
}
