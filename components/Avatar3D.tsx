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
  const coreRef = useRef<any>(null);
  const seed = useRef(Math.random() * Math.PI * 2);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() + seed.current;
    if (group.current) {
      group.current.position.y = position[1] + Math.sin(t * 2) * 0.07;
      group.current.rotation.y = Math.sin(t * 0.6) * 0.22;
    }
    if (coreRef.current) {
      coreRef.current.material.emissiveIntensity = 0.8 + Math.sin(t * 4) * 0.4;
    }
  });

  const activeColor = dimmed ? '#3a3a5c' : color;

  return (
    <group position={position}>
      <group ref={group} onClick={onClick}>
        {/* body: sleek suit */}
        <mesh position={[0, 0.75, 0]}>
          <capsuleGeometry args={[0.32, 0.55, 8, 16]} />
          <meshStandardMaterial color={activeColor} roughness={0.35} metalness={0.25} />
        </mesh>

        {/* chest core light / arc reactor */}
        <mesh ref={coreRef} position={[0, 0.85, 0.32]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.07, 0.07, 0.03, 16]} />
          <meshStandardMaterial
            color="#fff"
            emissive={highlight ? '#FFC53D' : activeColor}
            emissiveIntensity={1.2}
            roughness={0.2}
          />
        </mesh>

        {/* left & right shoulder pads */}
        <mesh position={[-0.38, 0.95, 0]}>
          <boxGeometry args={[0.14, 0.18, 0.22]} />
          <meshStandardMaterial color={activeColor} roughness={0.3} metalness={0.4} />
        </mesh>
        <mesh position={[0.38, 0.95, 0]}>
          <boxGeometry args={[0.14, 0.18, 0.22]} />
          <meshStandardMaterial color={activeColor} roughness={0.3} metalness={0.4} />
        </mesh>

        {/* head / helmet */}
        <mesh position={[0, 1.48, 0]}>
          <sphereGeometry args={[0.26, 24, 24]} />
          <meshStandardMaterial color={dimmed ? '#4a4a6c' : '#1c1c38'} roughness={0.3} metalness={0.3} />
        </mesh>

        {/* glowing cyber visor */}
        <mesh position={[0, 1.5, 0.16]}>
          <boxGeometry args={[0.32, 0.11, 0.12]} />
          <meshStandardMaterial
            color={highlight ? '#FFC53D' : activeColor}
            emissive={highlight ? '#FFC53D' : activeColor}
            emissiveIntensity={dimmed ? 0.2 : 1.6}
            roughness={0.1}
            metalness={0.6}
          />
        </mesh>

        {/* headphone cups */}
        <mesh position={[-0.27, 1.48, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.09, 0.09, 0.06, 16]} />
          <meshStandardMaterial color="#111" metalness={0.7} roughness={0.2} />
        </mesh>
        <mesh position={[-0.3, 1.48, 0]} rotation={[0, 0, Math.PI / 2]}>
          <ringGeometry args={[0.04, 0.07, 16]} />
          <meshBasicMaterial color={activeColor} />
        </mesh>
        <mesh position={[0.27, 1.48, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.09, 0.09, 0.06, 16]} />
          <meshStandardMaterial color="#111" metalness={0.7} roughness={0.2} />
        </mesh>
        <mesh position={[0.3, 1.48, 0]} rotation={[0, 0, Math.PI / 2]}>
          <ringGeometry args={[0.04, 0.07, 16]} />
          <meshBasicMaterial color={activeColor} />
        </mesh>

        {/* floating mini halo */}
        <mesh position={[0, 1.88, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.2, 0.015, 8, 24]} />
          <meshStandardMaterial
            color={activeColor}
            emissive={activeColor}
            emissiveIntensity={highlight ? 2 : 0.9}
            transparent
            opacity={dimmed ? 0.2 : 0.85}
          />
        </mesh>

        {highlight && (
          <pointLight position={[0, 2.2, 0.5]} intensity={8} distance={7} color="#FFC53D" />
        )}

        <Billboard position={[0, 2.15, 0]}>
          <Html center distanceFactor={8} style={{ pointerEvents: 'none' }}>
            <div
              style={{
                fontFamily: '"Baloo 2", sans-serif',
                fontWeight: 800,
                fontSize: 12,
                color: '#FFF6E9',
                background: 'rgba(10, 10, 28, 0.88)',
                backdropFilter: 'blur(6px)',
                border: `1.5px solid ${highlight ? '#FFC53D' : activeColor}`,
                padding: '2px 10px',
                borderRadius: 999,
                boxShadow: `0 0 10px ${activeColor}66`,
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: activeColor,
                  boxShadow: `0 0 6px ${activeColor}`,
                }}
              />
              {name}
            </div>
          </Html>
        </Billboard>
      </group>

      {/* shadow disc with outer glow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <circleGeometry args={[0.44, 24]} />
        <meshBasicMaterial color={highlight ? '#FFC53D' : '#000'} transparent opacity={highlight ? 0.6 : 0.4} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <ringGeometry args={[0.42, 0.46, 24]} />
        <meshBasicMaterial color={activeColor} transparent opacity={dimmed ? 0.1 : 0.45} />
      </mesh>
    </group>
  );
}
