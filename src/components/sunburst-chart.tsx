import { useState, useMemo } from "react";
import { formatSize } from "@/lib/utils";
import type { StorageItem } from "@/lib/types";

interface SunburstChartProps {
  data: StorageItem[];
  onItemClick: (item: StorageItem, path: StorageItem[]) => void;
  selectedPath: StorageItem[];
}

export function SunburstChart({
  data,
  onItemClick,
  selectedPath,
}: SunburstChartProps) {
  const [hoveredItem, setHoveredItem] = useState<StorageItem | null>(null);

  const size = 400;
  const centerX = size / 2;
  const centerY = size / 2;
  const innerRadius = 60;
  const maxRadius = 180;
  const maxDepth = 3;

  const totalSize = useMemo(() => {
    return data.reduce((sum, item) => sum + item.size, 0);
  }, [data]);

  const flattenData = (
    items: StorageItem[],
    depth: number,
    startAngle: number,
    endAngle: number,
    parentPath: StorageItem[] = []
  ): Array<{
    item: StorageItem;
    depth: number;
    startAngle: number;
    endAngle: number;
    path: StorageItem[];
  }> => {
    if (depth > maxDepth) return [];

    const result: Array<{
      item: StorageItem;
      depth: number;
      startAngle: number;
      endAngle: number;
      path: StorageItem[];
    }> = [];

    const totalSizeAtLevel = items.reduce((sum, item) => sum + item.size, 0);
    let currentAngle = startAngle;

    items.forEach((item) => {
      const angleSpan =
        ((endAngle - startAngle) * item.size) / totalSizeAtLevel;
      const itemEndAngle = currentAngle + angleSpan;
      const currentPath = [...parentPath, item];

      result.push({
        item,
        depth,
        startAngle: currentAngle,
        endAngle: itemEndAngle,
        path: currentPath,
      });

      if (item.children && item.children.length > 0) {
        result.push(
          ...flattenData(
            item.children,
            depth + 1,
            currentAngle,
            itemEndAngle,
            currentPath
          )
        );
      }

      currentAngle = itemEndAngle;
    });

    return result;
  };

  const segments = useMemo(() => {
    return flattenData(data, 0, 0, 2 * Math.PI);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const createArcPath = (
    innerR: number,
    outerR: number,
    startAngle: number,
    endAngle: number
  ): string => {
    const startAngleOffset = startAngle - Math.PI / 2;
    const endAngleOffset = endAngle - Math.PI / 2;

    const x1 = centerX + innerR * Math.cos(startAngleOffset);
    const y1 = centerY + innerR * Math.sin(startAngleOffset);
    const x2 = centerX + outerR * Math.cos(startAngleOffset);
    const y2 = centerY + outerR * Math.sin(startAngleOffset);
    const x3 = centerX + outerR * Math.cos(endAngleOffset);
    const y3 = centerY + outerR * Math.sin(endAngleOffset);
    const x4 = centerX + innerR * Math.cos(endAngleOffset);
    const y4 = centerY + innerR * Math.sin(endAngleOffset);

    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

    return `
      M ${x1} ${y1}
      L ${x2} ${y2}
      A ${outerR} ${outerR} 0 ${largeArc} 1 ${x3} ${y3}
      L ${x4} ${y4}
      A ${innerR} ${innerR} 0 ${largeArc} 0 ${x1} ${y1}
      Z
    `;
  };

  const radiusStep = (maxRadius - innerRadius) / (maxDepth + 1);

  const isInSelectedPath = (item: StorageItem): boolean => {
    return selectedPath.some((p) => p.id === item.id);
  };

  return (
    <div className="relative flex items-center justify-center">
      <svg width={size} height={size} className="drop-shadow-2xl">
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {segments.map(({ item, depth, startAngle, endAngle, path }, index) => {
          const innerR = innerRadius + depth * radiusStep;
          const outerR = innerRadius + (depth + 1) * radiusStep - 2;
          const isHovered = hoveredItem?.id === item.id;
          const isSelected = isInSelectedPath(item);

          return (
            <path
              key={`${item.id}-${index}`}
              d={createArcPath(innerR, outerR, startAngle, endAngle)}
              fill={item.color}
              stroke="rgba(0,0,0,0.3)"
              strokeWidth={1}
              className="cursor-pointer transition-all duration-150"
              style={{
                opacity: isHovered || isSelected ? 1 : 0.85,
                filter: isHovered ? "url(#glow) brightness(1.2)" : "none",
                transform: isHovered ? `scale(1.02)` : "scale(1)",
                transformOrigin: `${centerX}px ${centerY}px`,
              }}
              onMouseEnter={() => setHoveredItem(item)}
              onMouseLeave={() => setHoveredItem(null)}
              onClick={() => onItemClick(item, path)}
            />
          );
        })}

        <circle
          cx={centerX}
          cy={centerY}
          r={innerRadius - 5}
          fill="var(--background)"
          className="drop-shadow-lg"
        />
      </svg>

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center">
          {hoveredItem ? (
            <>
              <p className="text-sm text-muted-foreground truncate max-w-[100px]">
                {hoveredItem.name}
              </p>
              <p className="text-lg font-semibold text-foreground">
                {formatSize(hoveredItem.size)}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="text-lg font-semibold text-foreground">
                {formatSize(totalSize)}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
