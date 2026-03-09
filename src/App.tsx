import { useState, useEffect, useRef } from "react";
import { TitleBar } from "@/components/title-bar";
import { StorageView } from "@/components/storage-view";
import { AppsView } from "@/components/apps-view";
import { JunkView } from "@/components/junk-view";
import { listApps, scanJunk } from "@/lib/disk";
import type { AppInfo, JunkScanResult } from "@/lib/types";

export type TabType = "storage" | "apps" | "junk";

function App() {
  const [activeTab, setActiveTab] = useState<TabType>("storage");
  const [preloadedApps, setPreloadedApps] = useState<AppInfo[] | null>(null);
  const [preloadedJunk, setPreloadedJunk] = useState<JunkScanResult | null>(
    null
  );
  const loading = useRef(false);

  // Pre-fetch apps and junk in background on launch
  useEffect(() => {
    if (loading.current) return;
    loading.current = true;
    listApps()
      .then(setPreloadedApps)
      .catch(() => setPreloadedApps([]));
    scanJunk()
      .then(setPreloadedJunk)
      .catch(() =>
        setPreloadedJunk({ categories: [], total_size: 0 })
      );
  }, []);

  return (
    <div
      className="h-screen overflow-hidden rounded-xl relative"
      style={{ background: "linear-gradient(145deg, oklch(0.10 0.02 270 / 0.92) 0%, oklch(0.08 0.025 300 / 0.90) 40%, oklch(0.09 0.02 240 / 0.88) 100%)" }}
    >
      <TitleBar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Keep all views mounted, hide with CSS to preserve state */}
      <div className={activeTab === "storage" ? "h-full" : "hidden"}>
        <StorageView />
      </div>
      <div className={activeTab === "apps" ? "h-full" : "hidden"}>
        <AppsView preloadedApps={preloadedApps} />
      </div>
      <div className={activeTab === "junk" ? "h-full" : "hidden"}>
        <JunkView preloadedJunk={preloadedJunk} />
      </div>
    </div>
  );
}

export default App;
