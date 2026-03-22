import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF, Environment, ContactShadows } from '@react-three/drei';
import { Suspense } from 'react';

function Model({ url }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
}

function ModelViewer({ glbUrl }) {
  if (!glbUrl) return null;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#1a1a1a', borderRadius: '20px', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 15, left: 15, zIndex: 10, color: '#666', fontSize: '12px', fontFamily: 'monospace', pointerEvents: 'none' }}>
        Perspective | User View
      </div>
      <Suspense fallback={<div className="model-loading" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#8f887d' }}>Loading 3D Model...</div>}>
        <Canvas style={{ width: '100%', height: '100%' }} camera={{ position: [5, 5, 5], fov: 45 }} shadows>
          <color attach="background" args={['#1a1a1a']} />
          <Environment preset="city" />
          <ambientLight intensity={0.6} />
          <pointLight position={[10, 10, 10]} intensity={2} />
          <spotLight position={[-10, 10, 10]} angle={0.15} penumbra={1} intensity={2} castShadow />

          <ContactShadows position={[0, -0.01, 0]} opacity={0.4} scale={20} blur={2} far={4.5} />
          <gridHelper args={[20, 20, '#333', '#222']} />
          <axesHelper args={[5]} />

          <Model url={glbUrl} />
          <OrbitControls makeDefault minDistance={2} maxDistance={20} />
        </Canvas>
      </Suspense>
      <div style={{ position: 'absolute', bottom: 15, right: 15, zIndex: 10, color: '#444', fontSize: '10px', fontFamily: 'monospace', pointerEvents: 'none' }}>
        LeGenesis Viewport v1.1
      </div>
    </div>
  );
}

export default ModelViewer;