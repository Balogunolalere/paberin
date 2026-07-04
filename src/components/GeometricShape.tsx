'use client';

import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Line } from '@react-three/drei';
import * as THREE from 'three';

function OctahedronGeometry() {
  const meshRef = useRef<THREE.Group>(null);

  const edges = useMemo(() => {
    // Octahedron vertices (unit scale)
    const v = [
      [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
    ];
    // Edge pairs (indices into v)
    const pairs = [
      [0, 2], [0, 3], [0, 4], [0, 5],
      [1, 2], [1, 3], [1, 4], [1, 5],
      [2, 4], [2, 5], [3, 4], [3, 5],
    ];

    const points: [number, number, number][] = [];
    for (const [a, b] of pairs) {
      points.push(
        [v[a][0], v[a][1], v[a][2]],
        [v[b][0], v[b][1], v[b][2]]
      );
    }
    return points;
  }, []);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += delta * 0.15;
      meshRef.current.rotation.y += delta * 0.2;
    }
  });

  return (
    <Float speed={1.5} rotationIntensity={0.3} floatIntensity={0.5}>
      <group ref={meshRef}>
        {/* Wireframe edges */}
        {edges.map((_, i) => {
          if (i % 2 !== 0) return null;
          const start = new THREE.Vector3(edges[i][0], edges[i][1], edges[i][2]);
          const end = new THREE.Vector3(edges[i + 1][0], edges[i + 1][1], edges[i + 1][2]);
          return (
            <Line
              key={i}
              points={[start, end]}
              color="#FF5C00"
              lineWidth={0.5}
              transparent
              opacity={0.7}
            />
          );
        })}

        {/* Vertex glow points */}
        {[[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map(
          (pos, i) => (
            <mesh key={`v-${i}`} position={[pos[0], pos[1], pos[2]]}>
              <sphereGeometry args={[0.06, 8, 8]} />
              <meshBasicMaterial color="#FF5C00" />
            </mesh>
          )
        )}

        {/* Semi-transparent faces */}
        <mesh>
          <octahedronGeometry args={[0.95, 0]} />
          <meshBasicMaterial
            color="#FF5C00"
            transparent
            opacity={0.04}
            wireframe={false}
          />
        </mesh>
      </group>
    </Float>
  );
}

export function GeometricShape() {
  return (
    <div className="w-full h-full min-h-[300px] md:min-h-[500px]">
      <Canvas
        camera={{ position: [2.5, 1.5, 2.5], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.3} />
        <pointLight position={[5, 5, 5]} intensity={1} color="#FF5C00" />
        <pointLight position={[-3, -3, -3]} intensity={0.3} color="#FF7A33" />
        <OctahedronGeometry />
      </Canvas>
    </div>
  );
}
