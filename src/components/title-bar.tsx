import { useState, useEffect } from "react";
import { HardDrive, AppWindow, Minus, X, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { TabType } from "@/App";

interface TitleBarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const navItems: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: "storage", label: "Storage", icon: <HardDrive className="w-5 h-5" /> },
  { id: "apps", label: "Apps", icon: <AppWindow className="w-5 h-5" /> },
  // { id: "junk", label: "Junk", icon: <Sparkles className="w-5 h-5" /> },
];

export function TitleBar({ activeTab, onTabChange }: TitleBarProps) {
  const [isHoveringTrafficLights, setIsHoveringTrafficLights] = useState(false);
  const [visible, setVisible] = useState(false);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const startDrag = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    appWindow.startDragging();
  };

  return (
    <>
      {/* Invisible drag region across the top */}
      <div
        onMouseDown={startDrag}
        className="fixed top-0 left-0 right-0 h-8 z-50"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />

      {/* Traffic lights */}
      <div
        className="fixed top-3 left-4 z-50 flex items-center gap-2"
        onMouseEnter={() => setIsHoveringTrafficLights(true)}
        onMouseLeave={() => setIsHoveringTrafficLights(false)}
      >
        <button
          onClick={() => appWindow.close()}
          className="w-3 h-3 rounded-full bg-[#FF5F57] hover:bg-[#FF5F57]/80 transition-colors cursor-pointer flex items-center justify-center"
        >
          {isHoveringTrafficLights && (
            <X className="w-2 h-2 text-[#4D0000]" />
          )}
        </button>
        <button
          onClick={() => appWindow.minimize()}
          className="w-3 h-3 rounded-full bg-[#FEBC2E] hover:bg-[#FEBC2E]/80 transition-colors cursor-pointer flex items-center justify-center"
        >
          {isHoveringTrafficLights && (
            <Minus className="w-2 h-2 text-[#5C4100]" />
          )}
        </button>
        <button
          onClick={() => appWindow.toggleMaximize()}
          className="w-3 h-3 rounded-full bg-[#28C840] hover:bg-[#28C840]/80 transition-colors cursor-pointer flex items-center justify-center"
        >
          {isHoveringTrafficLights && (
            <Maximize2 className="w-1.5 h-1.5 text-[#0A4D00]" />
          )}
        </button>
      </div>

      {/* Floating icon nav sidebar */}
      <div
        className={cn(
          "fixed left-3 top-10 z-40 flex flex-col rounded-2xl overflow-hidden transition-all duration-300 ease-out",
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
        <div className="flex flex-col items-center py-2 px-1.5 gap-1">
          {/* App logo */}
          <div className="w-10 h-10 flex items-center justify-center mb-1">
            <img
              src="/logo.png"
              alt="Limpoo"
              className="w-7 h-7 rounded-lg object-contain"
            />
          </div>

          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center transition-all relative group",
                activeTab === item.id
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/[0.06]"
              )}
              style={
                activeTab === item.id
                  ? {
                      background:
                        "linear-gradient(135deg, oklch(0.65 0.2 250 / 0.2) 0%, oklch(0.55 0.18 280 / 0.15) 100%)",
                    }
                  : undefined
              }
              title={item.label}
            >
              {item.icon}
              {/* Tooltip */}
              <span className="absolute left-full ml-2 px-2 py-1 rounded-md text-xs font-medium text-foreground bg-popover border border-white/[0.1] opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
