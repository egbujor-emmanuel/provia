'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { drawSurface, drawTruth, TEX_W, TEX_H } from './receipt-textures';

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Refracting glass lens: inside the circle, the truth layer, slightly magnified, with chromatic
// aberration, a bright rim, a glint and a drop shadow cast on the alert.
const fragment = /* glsl */ `
  uniform sampler2D uA;
  uniform sampler2D uB;
  uniform vec2 uMouse;
  uniform float uRadius;
  uniform float uAspect;
  uniform float uReveal;
  varying vec2 vUv;

  void main() {
    vec2 d = vUv - uMouse;
    vec2 da = vec2(d.x * uAspect, d.y);
    float r = length(da);
    float R = uRadius * uReveal;
    float inside = 1.0 - smoothstep(R - 0.003, R, r);
    float k = clamp(r / max(R, 1e-4), 0.0, 1.0);

    vec2 uvL = uMouse + d * (0.9 + 0.1 * k * k);
    vec2 dir = normalize(da + 1e-5) * 0.006 * k;
    vec3 b = vec3(texture2D(uB, uvL + dir).r, texture2D(uB, uvL).g, texture2D(uB, uvL - dir).b);

    vec4 a = texture2D(uA, vUv);
    float shadow = smoothstep(R + 0.08, R, r) * (1.0 - inside);
    float edge = smoothstep(R + 0.006, R, r) * (1.0 - inside);
    float rim = smoothstep(R - 0.018, R - 0.002, r) * inside;
    float glint = smoothstep(0.34 * R, 0.0, length(da - vec2(-0.42, 0.42) * R)) * inside;

    vec3 col = mix(a.rgb * (1.0 - 0.28 * shadow), b, inside) + rim * 0.42 + glint * 0.2;
    col = mix(col, vec3(0.08, 0.08, 0.06), edge * 0.9);
    gl_FragColor = vec4(col, a.a);
  }
`;

const AUTO_SPEED = 0.32;
type Pointer = { x: number; y: number; active: boolean };

function Card({ surface, truth, pointer, still }: { surface: THREE.Texture; truth: THREE.Texture; pointer: React.RefObject<Pointer>; still: boolean }) {
  const mesh = useRef<THREE.Mesh>(null);
  const { viewport } = useThree();
  const aspect = TEX_W / TEX_H;
  const width = Math.min(viewport.width * 0.82, viewport.height * 0.78 * aspect);
  const height = width / aspect;
  const target = useRef(new THREE.Vector2(0.45, 0.55));
  const tilt = useRef(new THREE.Vector2());

  const uniforms = useMemo(
    () => ({
      uA: { value: surface },
      uB: { value: truth },
      uMouse: { value: new THREE.Vector2(0.45, 0.55) },
      uRadius: { value: 0.33 },
      uAspect: { value: aspect },
      uReveal: { value: still ? 1 : 0 },
    }),
    [surface, truth, aspect, still],
  );

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const p = pointer.current;
    if (p?.active) {
      target.current.set(0.5 + (p.x * viewport.width) / (2 * width), 0.5 + (p.y * viewport.height) / (2 * height));
    } else if (!still) {
      target.current.set(0.46 + 0.22 * Math.sin(t * AUTO_SPEED * 1.3), 0.5 + 0.16 * Math.sin(t * AUTO_SPEED * 2.1 + 1.2));
    }
    const ease = still ? 1 : 1 - Math.pow(0.002, delta);
    uniforms.uMouse.value.lerp(target.current, ease);
    uniforms.uReveal.value += (1 - uniforms.uReveal.value) * Math.min(1, delta * 2.2);
    if (mesh.current && !still) {
      tilt.current.lerp(new THREE.Vector2((uniforms.uMouse.value.x - 0.5) * 0.3, (uniforms.uMouse.value.y - 0.5) * -0.22), ease);
      mesh.current.rotation.y = tilt.current.x;
      mesh.current.rotation.x = tilt.current.y;
      mesh.current.position.y = Math.sin(t * 0.8) * 0.03;
    }
  });

  return (
    <mesh ref={mesh}>
      <planeGeometry args={[width, height, 1, 1]} />
      <shaderMaterial vertexShader={vertex} fragmentShader={fragment} uniforms={uniforms} transparent />
    </mesh>
  );
}

function useTextures() {
  const [tex, setTex] = useState<{ surface: THREE.Texture; truth: THREE.Texture } | null>(null);
  useEffect(() => {
    let alive = true;
    const made: THREE.Texture[] = [];
    const scale = Math.min(2, window.devicePixelRatio || 1);
    Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]).then(() => {
      if (!alive) return;
      const make = (cv: HTMLCanvasElement) => {
        const t = new THREE.CanvasTexture(cv);
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        made.push(t);
        return t;
      };
      setTex({ surface: make(drawSurface(scale)), truth: make(drawTruth(scale)) });
    });
    return () => {
      alive = false;
      made.forEach((t) => t.dispose());
    };
  }, []);
  return tex;
}

/** The truth lens: a forged alert in 3D, and a glass lens that shows what Paystack really says. */
export function TruthLens({ onUnsupported }: { onUnsupported: () => void }) {
  const tex = useTextures();
  const host = useRef<HTMLDivElement>(null);
  const pointer = useRef<Pointer>({ x: 0, y: 0, active: false });
  const [env, setEnv] = useState<{ still: boolean } | null>(null);

  useEffect(() => {
    const c = document.createElement('canvas');
    if (!c.getContext('webgl2') && !c.getContext('webgl')) {
      onUnsupported();
      return;
    }
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setEnv({ still });
    const el = host.current;
    if (still || !el || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      pointer.current = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -(((e.clientY - r.top) / r.height) * 2 - 1), active: true };
    };
    const leave = () => (pointer.current = { ...pointer.current, active: false });
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    return () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
    };
  }, [onUnsupported]);

  return (
    <div ref={host} className="h-full w-full" role="img" aria-label="A forged bank alert. A lens reveals that Paystack has no such transaction.">
      {tex && env && (
        <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 5], fov: 35 }} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }} onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}>
          <Card surface={tex.surface} truth={tex.truth} pointer={pointer} still={env.still} />
        </Canvas>
      )}
    </div>
  );
}
