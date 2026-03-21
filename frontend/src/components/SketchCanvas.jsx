import { ReactSketchCanvas } from 'react-sketch-canvas';
import { forwardRef } from 'react';

const SketchCanvas = forwardRef(({ strokeColor, strokeWidth, eraseMode }, ref) => {
  const handleMouseDown = async (e) => {
    if (!eraseMode) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const paths = await ref.current.exportPaths();
    const newPaths = paths.filter(path => {
      // Check if the click point is close to any point in the path
      return !path.paths.some(point => {
        const dx = point.x - x;
        const dy = point.y - y;
        return Math.sqrt(dx * dx + dy * dy) > 10; // 10px tolerance
      });
    });

    await ref.current.importPaths(newPaths);
  };

  return (
    <div 
      style={{ width: '100%', height: '100%', border: 'none' }}
      onMouseDown={handleMouseDown}
    >
      <ReactSketchCanvas
        ref={ref}
        strokeWidth={strokeWidth}
        strokeColor={strokeColor}
        canvasColor="white"
        width="100%"
        height="100%"
        eraseMode={false}
      />
    </div>
  );
});

SketchCanvas.displayName = 'SketchCanvas';

export default SketchCanvas;