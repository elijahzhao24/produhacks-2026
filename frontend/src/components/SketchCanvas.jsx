import { ReactSketchCanvas } from 'react-sketch-canvas';
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';

const GROUP_PADDING = 18;
const MIN_GROUP_SIZE = 24;

function getBoundsFromPoints(points) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}

function expandBounds(bounds, padding) {
  return {
    left: bounds.left - padding,
    top: bounds.top - padding,
    right: bounds.right + padding,
    bottom: bounds.bottom + padding,
  };
}

function unionBounds(a, b) {
  return {
    left: Math.min(a.left, b.left),
    top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
  };
}

function boundsOverlap(a, b) {
  return !(a.right < b.left || b.right < a.left || a.bottom < b.top || b.bottom < a.top);
}

function normalizeBounds(bounds) {
  const width = Math.max(bounds.right - bounds.left, MIN_GROUP_SIZE);
  const height = Math.max(bounds.bottom - bounds.top, MIN_GROUP_SIZE);

  return {
    x: bounds.left,
    y: bounds.top,
    width,
    height,
  };
}

function groupDrawablePaths(paths) {
  const drawableEntries = paths
    .filter((path) => path.drawMode && path.paths.length > 0)
    .map((path, index) => {
      const rawBounds = getBoundsFromPoints(path.paths);
      const expandedBounds = expandBounds(rawBounds, Math.max(GROUP_PADDING, path.strokeWidth * 2));

      return {
        id: `path-${index}`,
        path,
        rawBounds,
        expandedBounds,
      };
    });

  const groups = [];

  drawableEntries.forEach((entry) => {
    const overlappingGroups = groups.filter((group) => boundsOverlap(group.expandedBounds, entry.expandedBounds));

    if (overlappingGroups.length === 0) {
      groups.push({
        ids: [entry.id],
        paths: [entry.path],
        rawBounds: entry.rawBounds,
        expandedBounds: entry.expandedBounds,
      });
      return;
    }

    const mergedGroup = overlappingGroups.reduce(
      (accumulator, group) => ({
        ids: [...accumulator.ids, ...group.ids],
        paths: [...accumulator.paths, ...group.paths],
        rawBounds: unionBounds(accumulator.rawBounds, group.rawBounds),
        expandedBounds: unionBounds(accumulator.expandedBounds, group.expandedBounds),
      }),
      {
        ids: [entry.id],
        paths: [entry.path],
        rawBounds: entry.rawBounds,
        expandedBounds: entry.expandedBounds,
      },
    );

    const remainingGroups = groups.filter((group) => !overlappingGroups.includes(group));
    remainingGroups.push(mergedGroup);
    groups.splice(0, groups.length, ...remainingGroups);
  });

  return groups.map((group, index) => ({
    id: `object-${index}`,
    paths: group.paths,
    bounds: normalizeBounds(group.expandedBounds),
  }));
}

function buildObjectPreview(paths, bounds) {
  const padding = 18;
  const width = Math.ceil(bounds.width + padding * 2);
  const height = Math.ceil(bounds.height + padding * 2);

  const pathMarkup = paths
    .map((path) => {
      const normalizedPoints = path.paths.map((point) => ({
        x: point.x - bounds.x + padding,
        y: point.y - bounds.y + padding,
      }));

      if (normalizedPoints.length === 1) {
        const [point] = normalizedPoints;
        const radius = Math.max(path.strokeWidth / 2, 1);
        return `<circle cx="${point.x}" cy="${point.y}" r="${radius}" fill="${path.strokeColor}" />`;
      }

      const d = normalizedPoints
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
        .join(' ');

      return `<path d="${d}" fill="none" stroke="${path.strokeColor}" stroke-width="${path.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />`;
    })
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" rx="20" fill="white" />${pathMarkup}</svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function rectsIntersect(a, b) {
  return !(a.right < b.left || b.right < a.left || a.bottom < b.top || b.bottom < a.top);
}

const SketchCanvas = forwardRef(
  (
    {
      strokeColor,
      strokeWidth,
      toolMode,
      dropTargetRef,
      onSelectionDrop,
      onSelectionDragStateChange,
      onChange,
      backgroundImageUrl,
    },
    ref,
  ) => {
    const wrapperRef = useRef(null);
    const [paths, setPaths] = useState([]);
    const [selectedObjectId, setSelectedObjectId] = useState(null);
    const [dragState, setDragState] = useState(null);

    useEffect(() => {
      ref.current?.eraseMode(toolMode === 'erase');
    }, [toolMode, ref]);

    const objects = useMemo(() => groupDrawablePaths(paths), [paths]);
    const selectedObject = objects.find((object) => object.id === selectedObjectId) ?? null;

    useEffect(() => {
      if (selectedObjectId && !objects.some((object) => object.id === selectedObjectId)) {
        setSelectedObjectId(null);
      }
    }, [objects, selectedObjectId]);

    useEffect(() => {
      if (toolMode !== 'select') {
        setDragState(null);
        onSelectionDragStateChange?.(false);
      }
    }, [toolMode, onSelectionDragStateChange]);

    useEffect(() => {
      if (!dragState) return undefined;

      const handlePointerMove = (event) => {
        const wrapperRect = wrapperRef.current?.getBoundingClientRect();
        const dropRect = dropTargetRef?.current?.getBoundingClientRect();

        if (!wrapperRect) return;

        const isOverDropTarget = dropRect
          ? rectsIntersect(
            {
              left: event.clientX - dragState.grabOffsetX,
              top: event.clientY - dragState.grabOffsetY,
              right: event.clientX - dragState.grabOffsetX + dragState.bounds.width,
              bottom: event.clientY - dragState.grabOffsetY + dragState.bounds.height,
            },
            dropRect,
          )
          : false;

        onSelectionDragStateChange?.(isOverDropTarget);

        const ghostRect = {
          left: event.clientX - dragState.grabOffsetX,
          top: event.clientY - dragState.grabOffsetY,
          right: event.clientX - dragState.grabOffsetX + dragState.bounds.width,
          bottom: event.clientY - dragState.grabOffsetY + dragState.bounds.height,
        };

        setDragState((current) =>
          current
            ? {
              ...current,
              pointerX: event.clientX,
              pointerY: event.clientY,
              isOverDropTarget,
            }
            : current,
        );
      };

      const handlePointerUp = (event) => {
        const dropRect = dropTargetRef?.current?.getBoundingClientRect();
        const object = objects.find((candidate) => candidate.id === dragState.objectId);
        const isOverDropTarget =
          dropRect &&
          rectsIntersect(
            {
              left: event.clientX - dragState.grabOffsetX,
              top: event.clientY - dragState.grabOffsetY,
              right: event.clientX - dragState.grabOffsetX + dragState.bounds.width,
              bottom: event.clientY - dragState.grabOffsetY + dragState.bounds.height,
            },
            dropRect,
          );

        onSelectionDragStateChange?.(false);

        if (object && isOverDropTarget) {
          onSelectionDrop?.({
            id: object.id,
            bounds: object.bounds,
            paths: object.paths,
            previewUrl: buildObjectPreview(object.paths, object.bounds),
          });
        }

        setDragState(null);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp, { once: true });

      return () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };
    }, [dragState, dropTargetRef, objects, onSelectionDragStateChange, onSelectionDrop]);

    const handleSelectionPointerDown = (event, object) => {
      if (toolMode !== 'select') return;

      event.preventDefault();
      event.stopPropagation();

      const wrapperRect = wrapperRef.current?.getBoundingClientRect();
      if (!wrapperRect) return;

      setSelectedObjectId(object.id);
      setDragState({
        objectId: object.id,
        pointerX: event.clientX,
        pointerY: event.clientY,
        grabOffsetX: event.clientX - (wrapperRect.left + object.bounds.x),
        grabOffsetY: event.clientY - (wrapperRect.top + object.bounds.y),
        bounds: object.bounds,
        isOverDropTarget: false,
      });
      onSelectionDragStateChange?.(false);
    };

    const dragGhostStyle =
      dragState && selectedObject
        ? {
          left: dragState.pointerX - dragState.grabOffsetX,
          top: dragState.pointerY - dragState.grabOffsetY,
          width: selectedObject.bounds.width,
          height: selectedObject.bounds.height,
        }
        : null;

    return (
      <div ref={wrapperRef} className={`sketch-canvas-shell ${toolMode === 'select' ? 'is-selecting' : ''}`}>
        {backgroundImageUrl && (
          <div
            className="sketch-background"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundImage: `url(${backgroundImageUrl})`,
              backgroundSize: 'contain',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              opacity: 0.5,
              pointerEvents: 'none'
            }}
          />
        )}
        <ReactSketchCanvas
          ref={ref}
          strokeWidth={strokeWidth}
          strokeColor={strokeColor}
          canvasColor="transparent"
          width="100%"
          height="100%"
          eraserWidth={strokeWidth * 4}
          onChange={(newPaths) => {
            setPaths(newPaths);
            onChange?.(newPaths);
            onSelectionDragStateChange?.(false); // Reset drag state on change
          }}
        />

        {toolMode === 'select' && (
          <div className="selection-layer">
            {objects.map((object) => {
              const isSelected = selectedObjectId === object.id;
              const isDragging = dragState?.objectId === object.id;

              return (
                <button
                  key={object.id}
                  type="button"
                  className={`selection-box ${isSelected ? 'active' : ''} ${isDragging ? 'dragging' : ''}`}
                  style={{
                    left: object.bounds.x,
                    top: object.bounds.y,
                    width: object.bounds.width,
                    height: object.bounds.height,
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    setSelectedObjectId(object.id);
                  }}
                  onPointerDown={(event) => handleSelectionPointerDown(event, object)}
                  aria-label={`Select sketched object ${object.id}`}
                >
                  <span className="selection-handle">Selected</span>
                </button>
              );
            })}
          </div>
        )}

        {dragGhostStyle && selectedObject && (
          <div
            className={`selection-drag-ghost ${dragState?.isOverDropTarget ? 'over-drop-target' : ''}`}
            style={dragGhostStyle}
          >
            <img src={buildObjectPreview(selectedObject.paths, selectedObject.bounds)} alt="" />
          </div>
        )}
      </div>
    );
  },
);

SketchCanvas.displayName = 'SketchCanvas';

export default SketchCanvas;
