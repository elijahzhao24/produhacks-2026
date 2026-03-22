import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';

function Model({ url }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
}

function ModelViewer({ glbUrl }) {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Canvas style={{ width: '100%', height: '100%' }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <Model url={glbUrl} />
        <OrbitControls />
      </Canvas>
    </div>
  );
}

export default ModelViewer;