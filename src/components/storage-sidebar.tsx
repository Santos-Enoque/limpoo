import { useState, useEffect } from "react";
import { HardDrive, ChevronRight, Usb } from "lucide-react";
import { cn, formatSize } from "@/lib/utils";
import type { Drive } from "@/lib/types";

interface StorageSidebarProps {
  drives: Drive[];
  selectedDrive: string;
  onDriveSelect: (driveId: string) => void;
  onFolderSelect: (folder: {
    name: string;
    path: string;
    color: string;
  }) => void;
}

const QUICK_FOLDERS = [
  { name: "Applications", path: "/Applications", color: "#5BC5A7" },
  { name: "Documents", path: "~/Documents", color: "#F76E6E" },
  { name: "Downloads", path: "~/Downloads", color: "#F7B955" },
  { name: "Desktop", path: "~/Desktop", color: "#A78BFA" },
  { name: "Library", path: "~/Library", color: "#4F8EF7" },
];

export function StorageSidebar({
  drives,
  selectedDrive,
  onDriveSelect,
  onFolderSelect,
}: StorageSidebarProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  return (
    <div
      className={cn(
        "absolute left-[76px] top-10 bottom-3 w-52 z-20 flex flex-col rounded-2xl overflow-hidden transition-all duration-300 ease-out",
        visible
          ? "opacity-100 translate-x-0"
          : "opacity-0 -translate-x-4"
      )}
      style={{
        background: "oklch(0.12 0.02 260 / 0.82)",
        backdropFilter: "blur(32px) saturate(1.5)",
        WebkitBackdropFilter: "blur(32px) saturate(1.5)",
        border: "1px solid oklch(0.60 0.02 260 / 0.12)",
        boxShadow:
          "0 12px 48px oklch(0 0 0 / 0.4), 0 4px 16px oklch(0 0 0 / 0.2), inset 0 0.5px 0 oklch(1 0 0 / 0.06)",
      }}
    >
      <div className="px-4 py-3">
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Storages
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hidden">
        <div className="px-2 space-y-1">
          {drives.map((drive) => {
            const usedPercent =
              ((drive.total - drive.free) / drive.total) * 100;
            const isSelected = selectedDrive === drive.id;

            return (
              <button
                key={drive.id}
                onClick={() => onDriveSelect(drive.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all",
                  isSelected
                    ? "bg-white/[0.08] shadow-sm"
                    : "hover:bg-white/[0.04]"
                )}
              >
                {drive.is_removable ? (
                  <Usb className="w-4 h-4 text-muted-foreground shrink-0" />
                ) : (
                  <HardDrive className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {drive.name}
                  </p>
                  <div className="mt-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${usedPercent}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {formatSize(drive.free)} free of {formatSize(drive.total)}
                  </p>
                </div>
                {isSelected && (
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        <div className="px-3 py-3 border-t border-white/[0.06] mt-2">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Quick Access
          </h2>
          <div className="space-y-0.5">
            {QUICK_FOLDERS.map((folder) => (
              <button
                key={folder.path}
                onClick={() => onFolderSelect(folder)}
                className="w-full flex items-center gap-3 px-3 py-1.5 rounded-lg text-left hover:bg-white/[0.04] transition-all"
              >
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: folder.color }}
                />
                <p className="text-sm text-foreground truncate">
                  {folder.name}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
