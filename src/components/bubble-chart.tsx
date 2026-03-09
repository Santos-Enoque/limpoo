import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { formatSize } from "@/lib/utils";
import { Folder, File, ChevronRight, RotateCcw } from "lucide-react";
import type { StorageItem } from "@/lib/types";

interface BubbleChartProps {
  data: StorageItem[];
  onItemClick: (item: StorageItem, path: StorageItem[]) => void;
  selectedPath: StorageItem[];
  onNavigateBack: (index: number) => void;
}

interface PackedCircle {
  x: number;
  y: number;
  r: number;
  item: StorageItem;
}

function packCircles(
  items: StorageItem[],
  containerSize: number
): PackedCircle[] {
  if (items.length === 0) return [];

  const maxItems = 30;
  const sorted = [...items].sort((a, b) => b.size - a.size).slice(0, maxItems);

  const totalSize = sorted.reduce((s, i) => s + i.size, 0);
  const usableArea = containerSize * containerSize * 0.55;

  const circles: PackedCircle[] = sorted.map((item) => ({
    r: Math.max(22, Math.sqrt(((item.size / totalSize) * usableArea) / Math.PI)),
    item,
    x: 0,
    y: 0,
  }));

  const maxR = containerSize * 0.22;
  circles.forEach((c) => {
    if (c.r > maxR) c.r = maxR;
  });

  if (circles.length === 0) return [];

  circles[0].x = 0;
  circles[0].y = 0;

  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let i = 1; i < circles.length; i++) {
    const angle = i * goldenAngle;
    const dist = circles[0].r + circles[i].r + 6;
    circles[i].x = Math.cos(angle) * dist;
    circles[i].y = Math.sin(angle) * dist;
  }

  for (let iter = 0; iter < 100; iter++) {
    let moved = false;
    for (let i = 0; i < circles.length; i++) {
      for (let j = i + 1; j < circles.length; j++) {
        const dx = circles[j].x - circles[i].x;
        const dy = circles[j].y - circles[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = circles[i].r + circles[j].r + 4;

        if (dist < minDist && dist > 0) {
          const overlap = (minDist - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;
          circles[i].x -= nx * overlap;
          circles[i].y -= ny * overlap;
          circles[j].x += nx * overlap;
          circles[j].y += ny * overlap;
          moved = true;
        }
      }
    }

    for (let i = 0; i < circles.length; i++) {
      const cx = circles[i].x;
      const cy = circles[i].y;
      const dist = Math.sqrt(cx * cx + cy * cy);
      if (dist > 1) {
        circles[i].x -= (cx / dist) * 0.5;
        circles[i].y -= (cy / dist) * 0.5;
      }
    }

    if (!moved) break;
  }

  const minX = Math.min(...circles.map((c) => c.x - c.r));
  const maxX = Math.max(...circles.map((c) => c.x + c.r));
  const minY = Math.min(...circles.map((c) => c.y - c.r));
  const maxY = Math.max(...circles.map((c) => c.y + c.r));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  circles.forEach((c) => {
    c.x -= cx;
    c.y -= cy;
  });

  return circles;
}

export function BubbleChart({
  data,
  onItemClick,
  selectedPath,
  onNavigateBack,
}: BubbleChartProps) {
  const [hoveredItem, setHoveredItem] = useState<StorageItem | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState(500);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, ox: 0, oy: 0, moved: false });
  const [animatingOut, setAnimatingOut] = useState(false);
  const [animatingIn, setAnimatingIn] = useState(false);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const size = Math.min(
          entry.contentRect.width,
          entry.contentRect.height
        );
        setContainerSize(size);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Reset zoom/pan when data changes
  useEffect(() => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  }, [data]);

  const circles = useMemo(
    () => packCircles(data, containerSize),
    [data, containerSize]
  );

  const totalSize = useMemo(
    () => data.reduce((sum, item) => sum + item.size, 0),
    [data]
  );

  // Scroll to zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = -e.deltaY * 0.001;
      setZoom((prev) => Math.max(0.3, Math.min(4, prev + delta * prev)));
    },
    []
  );

  // Pan by click-dragging on the background
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only start pan from left-click on the background (not on a circle)
      if (e.button !== 0) return;
      e.preventDefault();
      setIsPanning(true);
      panStart.current = {
        x: e.clientX,
        y: e.clientY,
        ox: panOffset.x,
        oy: panOffset.y,
        moved: false,
      };
    },
    [panOffset]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning) return;
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      // Only count as panning if moved more than a tiny threshold
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        panStart.current.moved = true;
      }
      setPanOffset({
        x: panStart.current.ox + dx,
        y: panStart.current.oy + dy,
      });
    },
    [isPanning]
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleCircleClick = (circle: PackedCircle) => {
    // If user was dragging, don't trigger a click
    if (panStart.current.moved) return;

    // Animate out, then trigger the data change
    setAnimatingOut(true);
    setTimeout(() => {
      setAnimatingOut(false);
      setAnimatingIn(true);
      onItemClick(circle.item, [...selectedPath, circle.item]);
      setTimeout(() => {
        setAnimatingIn(false);
      }, 350);
    }, 250);
  };

  const handleNavigate = (index: number) => {
    setAnimatingOut(true);
    setTimeout(() => {
      setAnimatingOut(false);
      setAnimatingIn(true);
      onNavigateBack(index);
      setTimeout(() => {
        setAnimatingIn(false);
      }, 350);
    }, 200);
  };

  const resetView = () => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const isInSelectedPath = (item: StorageItem): boolean => {
    return selectedPath.some((p) => p.id === item.id);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex flex-col items-center overflow-hidden"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ cursor: isPanning ? "grabbing" : "grab" }}
    >
      {/* Breadcrumb bar - centered above bubbles */}
      <div className="shrink-0 flex items-center justify-center gap-2 pt-3 pb-1 z-10">
        {selectedPath.length > 0 ? (
          <div className="glass-panel px-4 py-2 rounded-xl flex items-center gap-1.5 text-sm">
            <button
              onClick={() => handleNavigate(-1)}
              className="text-muted-foreground hover:text-foreground transition-colors font-medium"
            >
              Root
            </button>
            {selectedPath.map((item, index) => (
              <div key={item.id} className="flex items-center gap-1.5">
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
                <button
                  onClick={() => handleNavigate(index)}
                  className={
                    index === selectedPath.length - 1
                      ? "text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground transition-colors"
                  }
                >
                  {item.name}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-panel px-4 py-2 rounded-xl">
            <span className="text-xs text-muted-foreground">Total: </span>
            <span className="text-sm font-semibold text-foreground">
              {formatSize(totalSize)}
            </span>
          </div>
        )}

        {/* Zoom reset button */}
        {(zoom !== 1 || panOffset.x !== 0 || panOffset.y !== 0) && (
          <button
            onClick={resetView}
            className="glass-panel p-2 rounded-xl text-muted-foreground hover:text-foreground transition-colors"
            title="Reset zoom"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Zoomable/pannable bubble container */}
      <div className="flex-1 flex items-center justify-center w-full relative">
        <div
          className="relative"
          style={{
            width: containerSize,
            height: containerSize,
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
            transition: isPanning ? "none" : "transform 0.2s ease-out",
            transformOrigin: "center center",
          }}
        >
          {circles.map((circle, index) => {
            const isHovered = hoveredItem?.id === circle.item.id;
            const isSelected = isInSelectedPath(circle.item);
            const isFolder = circle.item.type === "folder";
            const diameter = circle.r * 2;
            const showLabel = circle.r > 28;
            const showSize = circle.r > 36;

            return (
              <div
                key={`${circle.item.id}-${index}`}
                className="absolute cursor-pointer"
                style={{
                  width: diameter,
                  height: diameter,
                  left: containerSize / 2 + circle.x - circle.r,
                  top: containerSize / 2 + circle.y - circle.r,
                  transform: `scale(${
                    animatingOut
                      ? 0
                      : animatingIn
                        ? 1
                        : isHovered
                          ? 1.08
                          : 1
                  })`,
                  opacity: animatingOut ? 0 : animatingIn ? 1 : 1,
                  transition: animatingOut
                    ? "transform 0.25s cubic-bezier(0.4, 0, 1, 1), opacity 0.25s ease-out"
                    : animatingIn
                      ? `transform 0.35s cubic-bezier(0, 0, 0.2, 1) ${index * 30}ms, opacity 0.3s ease-in ${index * 30}ms`
                      : "transform 0.2s ease-out",
                  transformOrigin: "center center",
                  zIndex: isHovered ? 20 : isSelected ? 10 : 1,
                }}
                onMouseEnter={() => setHoveredItem(circle.item)}
                onMouseLeave={() => setHoveredItem(null)}
                onClick={() => handleCircleClick(circle)}
              >
                {/* Outer glow */}
                {(isHovered || isSelected) && (
                  <div
                    className="absolute inset-[-3px] rounded-full transition-opacity duration-200"
                    style={{
                      background: `${circle.item.color}40`,
                      boxShadow: `0 0 20px ${circle.item.color}60, 0 0 40px ${circle.item.color}30`,
                    }}
                  />
                )}

                {/* Circle body */}
                <div
                  className="absolute inset-0 rounded-full flex flex-col items-center justify-center overflow-hidden transition-all duration-200"
                  style={{
                    background: `linear-gradient(135deg, ${circle.item.color}30 0%, ${circle.item.color}15 100%)`,
                    border: `1.5px solid ${isHovered || isSelected ? circle.item.color : circle.item.color + "60"}`,
                    backdropFilter: "blur(8px)",
                    boxShadow: isHovered
                      ? `inset 0 1px 1px ${circle.item.color}40, 0 4px 16px rgba(0,0,0,0.3)`
                      : `inset 0 1px 1px ${circle.item.color}20, 0 2px 8px rgba(0,0,0,0.2)`,
                  }}
                >
                  {isFolder ? (
                    <Folder
                      className="shrink-0"
                      style={{
                        width: Math.max(12, circle.r * 0.35),
                        height: Math.max(12, circle.r * 0.35),
                        color: circle.item.color,
                      }}
                    />
                  ) : (
                    <File
                      className="shrink-0"
                      style={{
                        width: Math.max(12, circle.r * 0.3),
                        height: Math.max(12, circle.r * 0.3),
                        color: circle.item.color,
                      }}
                    />
                  )}

                  {showLabel && (
                    <p
                      className="text-center text-foreground font-medium truncate px-1 mt-0.5 leading-tight"
                      style={{
                        fontSize: Math.max(8, Math.min(12, circle.r * 0.18)),
                        maxWidth: diameter - 10,
                      }}
                    >
                      {circle.item.name}
                    </p>
                  )}

                  {showSize && (
                    <p
                      className="text-center text-muted-foreground truncate px-1 leading-tight"
                      style={{
                        fontSize: Math.max(7, Math.min(10, circle.r * 0.14)),
                        maxWidth: diameter - 10,
                      }}
                    >
                      {formatSize(circle.item.size)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Hover tooltip */}
      {hoveredItem && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 glass-panel px-4 py-2 rounded-xl pointer-events-none z-30">
          <div className="flex items-center gap-2">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: hoveredItem.color }}
            />
            <span className="text-sm text-foreground font-medium">
              {hoveredItem.name}
            </span>
            <span className="text-sm text-muted-foreground">
              {formatSize(hoveredItem.size)}
            </span>
          </div>
        </div>
      )}

      {/* Zoom indicator */}
      {zoom !== 1 && (
        <div className="absolute bottom-4 right-4 glass-panel px-3 py-1.5 rounded-lg pointer-events-none z-30">
          <span className="text-xs text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
        </div>
      )}
    </div>
  );
}
