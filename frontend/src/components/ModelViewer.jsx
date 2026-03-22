import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { Suspense } from 'react';

function Model({ url }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
}

function ModelViewer({ glbUrl }) {
  if (!glbUrl) return null;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Suspense fallback={<div className="model-loading" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#8f887d' }}>Loading 3D Model...</div>}>
        <Canvas style={{ width: '100%', height: '100%' }}>
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 5]} intensity={1} />
          <Model url={glbUrl} />
          <OrbitControls />
        </Canvas>
      </Suspense>
    </div>
  );
}

export default ModelViewer;