'use client';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Stars } from '@react-three/drei';
import { useMemo, useRef } from 'react';
import { Avatar3D } from './Avatar3D';
import type { Player } from '@/lib/types';

function Cartridge({ position, color, label, angle }: { position: [number, number, number]; color: string; label: string; angle: number }) {
  const mesh = useRef<any>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (mesh.current) {
      mesh.current.position.y = position[1] + Math.sin(t * 1.4 + angle) * 0.18;
      mesh.current.rotation.y = t * 0.5 + angle;
    }
  });
  return (
    <group position={[position[0], 0, position[2]]}>
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.5, 0.65, 0.7, 6]} />
        <meshStandardMaterial color="#23235c" roughness={0.4} metalness={0.3} />
      </mesh>
      <mesh ref={mesh} position={[0, position[1], 0]}>
        <boxGeometry args={[0.55, 0.8, 0.28]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.55} roughness={0.35} />
      </mesh>
    </group>
  );
}

export function LobbyScene({
  players,
  cartridges,
  dimmed = false,
}: {
  players: Player[];
  cartridges: { id: string; label: string; color: string }[];
  dimmed?: boolean;
}) {
  const n = Math.max(players.length, 1);
  const avatarPos = useMemo(
    () =>
      players.map((_, i) => {
        const a = (i / Math.max(n, 3)) * Math.PI * 2;
        return [Math.cos(a) * 2.1, 0, Math.sin(a) * 2.1] as [number, number, number];
      }),
    [players, n],
  );
  const cartPos = useMemo(
    () =>
      cartridges.map((_, i) => {
        const a = (i / Math.max(cartridges.length, 1)) * Math.PI * 2 + Math.PI / cartridges.length;
        return [Math.cos(a) * 4.3, 1.7, Math.sin(a) * 4.3] as [number, number, number];
      }),
    [cartridges],
  );
  return (
    <Canvas camera={{ position: [0, 5.2, 8.5], fov: 50 }} dpr={[1, 1.75]}>
      <color attach="background" args={[dimmed ? '#08081a' : '#0d0d24']} />
      <fog attach="fog" args={[dimmed ? '#08081a' : '#0d0d24', 12, 26]} />
      <ambientLight intensity={dimmed ? 0.25 : 0.7} />
      <directionalLight position={[5, 8, 4]} intensity={dimmed ? 0.3 : 1} color="#fff6e9" />
      <pointLight position={[0, 4, 0]} intensity={dimmed ? 4 : 22} distance={16} color={dimmed ? '#5b2a86' : '#ff6b35'} />
      <pointLight position={[-6, 2, -4]} intensity={10} distance={14} color="#ff3d81" />
      <Stars radius={40} depth={20} count={1500} factor={3} fade />
      {/* lounge floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[7.5, 48]} />
        <meshStandardMaterial color={dimmed ? '#14142c' : '#1b1b40'} roughness={0.8} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[2.6, 2.75, 48]} />
        <meshBasicMaterial color="#ff6b35" transparent opacity={dimmed ? 0.25 : 0.8} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[4.3, 4.38, 48]} />
        <meshBasicMaterial color="#ff3d81" transparent opacity={dimmed ? 0.2 : 0.55} />
      </mesh>
      {/* center holo table */}
      <Float speed={2} rotationIntensity={0.4} floatIntensity={0.6}>
        <mesh position={[0, 1.1, 0]}>
          <octahedronGeometry args={[0.55]} />
          <meshStandardMaterial color="#8b5cf6" emissive="#8b5cf6" emissiveIntensity={1.2} wireframe />
        </mesh>
      </Float>
      {players.map((p, i) => (
        <Avatar3D key={p.uid} color={p.avatarColor} name={p.name} position={avatarPos[i]!} dimmed={dimmed} />
      ))}
      {cartridges.map((c, i) => (
        <Cartridge key={c.id} position={cartPos[i]!} color={c.color} label={c.label} angle={i} />
      ))}
    </Canvas>
  );
}
