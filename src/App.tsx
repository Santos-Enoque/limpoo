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
      style={{ background: "oklch(0.10 0.015 260 / 0.88)" }}
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
