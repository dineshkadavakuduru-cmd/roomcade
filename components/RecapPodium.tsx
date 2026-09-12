'use client';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import { useRef } from 'react';
import { Avatar3D } from './Avatar3D';
import type { Player } from '@/lib/types';

function Confetti() {
  const ref = useRef<any>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.getElapsedTime() * 0.15;
  });
  const pieces = Array.from({ length: 60 }, (_, i) => {
    const a = (i / 60) * Math.PI * 2;
    const r = 2 + ((i * 37) % 40) / 10;
    return { pos: [Math.cos(a) * r, 3 + ((i * 53) % 40) / 10, Math.sin(a) * r] as [number, number, number], c: ['#FF6B35', '#FF3D81', '#FFC53D', '#34D399', '#38BDF8'][i % 5]! };
  });
  return (
    <group ref={ref}>
      {pieces.map((p, i) => (
        <mesh key={i} position={p.pos}>
          <boxGeometry args={[0.09, 0.09, 0.02]} />
          <meshBasicMaterial color={p.c} />
        </mesh>
      ))}
    </group>
  );
}

export function RecapPodium({ players }: { players: Player[] }) {
  const sorted = [...players].sort((a, b) => b.score - a.score).slice(0, 3);
  const heights = [1.6, 1.1, 0.8];
  const xs = [0, -1.7, 1.7];
  return (
    <Canvas camera={{ position: [0, 3.4, 7.5], fov: 50 }} dpr={[1, 1.75]}>
      <color attach="background" args={['#0d0d24']} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[4, 7, 3]} intensity={1} />
      <pointLight position={[0, 5, 2]} intensity={30} distance={18} color="#FFC53D" />
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[7, 40]} />
        <meshStandardMaterial color="#1b1b40" roughness={0.85} />
      </mesh>
      <Confetti />
      {sorted.map((p, i) => (
        <group key={p.uid} position={[xs[i]!, 0, 0]}>
          <mesh position={[0, heights[i]! / 2, 0]}>
            <boxGeometry args={[1.3, heights[i]!, 1.3]} />
            <meshStandardMaterial color={i === 0 ? '#FFC53D' : i === 1 ? '#B8B8D4' : '#FF6B35'} metalness={0.5} roughness={0.35} />
          </mesh>
          <Float speed={2} floatIntensity={0.4}>
            <Avatar3D color={p.avatarColor} name={`${p.name} · ${p.score}`} position={[0, heights[i]!, 0]} highlight={i === 0} />
          </Float>
        </group>
      ))}
    </Canvas>
  );
}
