'use client';
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Html } from '@react-three/drei';

export function Avatar3D({
  color,
  name,
  position = [0, 0, 0] as [number, number, number],
  highlight = false,
  dimmed = false,
  onClick,
}: {
  color: string;
  name: string;
  position?: [number, number, number];
  highlight?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
}) {
  const group = useRef<any>(null);
  const seed = useRef(Math.random() * Math.PI * 2);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() + seed.current;
    if (group.current) {
      group.current.position.y = position[1] + Math.sin(t * 2) * 0.06;
      group.current.rotation.y = Math.sin(t * 0.6) * 0.25;
    }
  });
  return (
    <group position={position}>
      <group ref={group} onClick={onClick}>
        {/* body: capsule-ish */}
        <mesh position={[0, 0.75, 0]}>
          <capsuleGeometry args={[0.32, 0.55, 6, 14]} />
          <meshStandardMaterial color={dimmed ? '#3a3a5c' : color} roughness={0.5} metalness={0.1} />
        </mesh>
        {/* head */}
        <mesh position={[0, 1.5, 0]}>
          <sphereGeometry args={[0.24, 20, 20]} />
          <meshStandardMaterial color={dimmed ? '#4a4a6c' : '#ffe3c2'} roughness={0.6} />
        </mesh>
        {/* visor stripe */}
        <mesh position={[0, 1.52, 0.18]}>
          <boxGeometry args={[0.3, 0.09, 0.08]} />
          <meshStandardMaterial color={highlight ? '#FFC53D' : '#101028'} emissive={highlight ? '#FFC53D' : '#000000'} emissiveIntensity={highlight ? 1.4 : 0} />
        </mesh>
        {highlight && (
          <pointLight position={[0, 2.2, 0.5]} intensity={6} distance={6} color="#FFC53D" />
        )}
        <Billboard position={[0, 2.05, 0]}>
          <Html center distanceFactor={8} style={{ pointerEvents: 'none' }}>
            <div
              style={{
                fontFamily: '"Baloo 2", sans-serif',
                fontWeight: 800,
                fontSize: 13,
                color: '#FFF6E9',
                background: 'rgba(13,13,36,.72)',
                border: '1px solid rgba(255,255,255,.2)',
                padding: '2px 10px',
                borderRadius: 999,
                whiteSpace: 'nowrap',
              }}
            >
              {name}
            </div>
          </Html>
        </Billboard>
      </group>
      {/* shadow disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <circleGeometry args={[0.42, 24]} />
        <meshBasicMaterial color={highlight ? '#FFC53D' : '#000'} transparent opacity={highlight ? 0.5 : 0.35} />
      </mesh>
    </group>
  );
}
