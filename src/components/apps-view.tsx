import { useState, useEffect } from "react";
import {
  Search,
  Trash2,
  ChevronDown,
  Loader2,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { cn, formatSize } from "@/lib/utils";
import { listApps, getAppRelatedFiles, uninstallApp } from "@/lib/disk";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { AppInfo, AppRelatedFiles } from "@/lib/types";

interface AppsViewProps {
  preloadedApps: AppInfo[] | null;
}

export function AppsView({ preloadedApps }: AppsViewProps) {
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedApps, setSelectedApps] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<"name" | "size">("size");
  const [expandedApp, setExpandedApp] = useState<string | null>(null);
  const [relatedFiles, setRelatedFiles] = useState<
    Record<string, AppRelatedFiles>
  >({});
  const [loadingRelated, setLoadingRelated] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [uninstalling, setUninstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use preloaded apps if available, otherwise fetch
  useEffect(() => {
    if (preloadedApps !== null) {
      setApps(preloadedApps);
      setLoading(false);
    } else {
      listApps()
        .then(setApps)
        .catch(() => setApps([]))
        .finally(() => setLoading(false));
    }
  }, [preloadedApps]);

  const filteredApps = apps
    .filter((app) =>
      app.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === "size") return b.size - a.size;
      if (sortBy === "name") return a.name.localeCompare(b.name);
      return 0;
    });

  const toggleSelection = (id: string) => {
    const newSelection = new Set(selectedApps);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedApps(newSelection);
    setConfirming(null);
  };

  const toggleAll = () => {
    if (selectedApps.size === filteredApps.length) {
      setSelectedApps(new Set());
    } else {
      setSelectedApps(new Set(filteredApps.map((app) => app.id)));
    }
    setConfirming(null);
  };

  const handleExpand = async (app: AppInfo) => {
    if (expandedApp === app.id) {
      setExpandedApp(null);
      return;
    }
    setExpandedApp(app.id);

    if (!relatedFiles[app.id]) {
      setLoadingRelated(app.id);
      try {
        const related = await getAppRelatedFiles(app.bundle_id, app.name);
        setRelatedFiles((prev) => ({ ...prev, [app.id]: related }));
      } catch {
        // ignore
      } finally {
        setLoadingRelated(null);
      }
    }
  };

  const handleUninstall = async (app: AppInfo) => {
    if (confirming !== app.id) {
      setConfirming(app.id);
      setError(null);
      return;
    }

    setUninstalling(true);
    setError(null);

    try {
      const related = relatedFiles[app.id];
      const relatedPaths = related
        ? [
            ...related.caches,
            ...related.app_support,
            ...related.preferences,
            ...related.logs,
          ]
        : [];

      const results = await uninstallApp(app.path, relatedPaths);
      const failed = results.filter((r) => !r.success);

      if (failed.length > 0) {
        setError(
          `${failed.length} item${failed.length > 1 ? "s" : ""} couldn't be removed: ${failed[0].error}`
        );
      }

      setApps((prev) => prev.filter((a) => a.id !== app.id));
      setSelectedApps((prev) => {
        const next = new Set(prev);
        next.delete(app.id);
        return next;
      });
      setExpandedApp(null);
      setConfirming(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setUninstalling(false);
    }
  };

  const handleBulkUninstall = async () => {
    if (confirming !== "bulk") {
      setConfirming("bulk");
      setError(null);
      return;
    }

    setUninstalling(true);
    setError(null);

    try {
      const appsToDelete = filteredApps.filter((a) => selectedApps.has(a.id));
      let totalFailed = 0;

      for (const app of appsToDelete) {
        let related = relatedFiles[app.id];
        if (!related) {
          try {
            related = await getAppRelatedFiles(app.bundle_id, app.name);
          } catch {
            // continue
          }
        }

        const relatedPaths = related
          ? [
              ...related.caches,
              ...related.app_support,
              ...related.preferences,
              ...related.logs,
            ]
          : [];

        const results = await uninstallApp(app.path, relatedPaths);
        const failed = results.filter((r) => !r.success);
        totalFailed += failed.length;

        setApps((prev) => prev.filter((a) => a.id !== app.id));
      }

      if (totalFailed > 0) {
        setError(`${totalFailed} item(s) couldn't be removed`);
      }

      setSelectedApps(new Set());
      setConfirming(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setUninstalling(false);
    }
  };

  const totalSelectedSize = filteredApps
    .filter((app) => selectedApps.has(app.id))
    .reduce((sum, app) => sum + app.size, 0);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">
            Scanning applications...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full relative">
      {/* Main floating panel for the app list */}
      <div
        className="absolute left-[76px] top-10 bottom-3 right-3 z-10 flex flex-col rounded-2xl overflow-hidden"
        style={{
          background: "oklch(0.12 0.02 260 / 0.82)",
          backdropFilter: "blur(32px) saturate(1.5)",
          WebkitBackdropFilter: "blur(32px) saturate(1.5)",
          border: "1px solid oklch(0.60 0.02 260 / 0.12)",
          boxShadow:
            "0 12px 48px oklch(0 0 0 / 0.4), 0 4px 16px oklch(0 0 0 / 0.2), inset 0 0.5px 0 oklch(1 0 0 / 0.06)",
        }}
      >
        {/* Header */}
        <div className="px-5 py-3 flex items-center gap-4 shrink-0">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              placeholder="Search applications..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all"
              style={{
                background: "oklch(0.16 0.02 260 / 0.6)",
                border: "1px solid oklch(0.60 0.02 260 / 0.08)",
              }}
            />
          </div>

          <button
            onClick={() => setSortBy(sortBy === "size" ? "name" : "size")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground transition-all hover:bg-white/[0.04]"
          >
            Sort: {sortBy === "size" ? "Size" : "Name"}
            <ChevronDown className="w-3 h-3" />
          </button>

          <span className="text-xs text-muted-foreground tabular-nums">
            {apps.length} apps
          </span>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-5 mb-2 px-3 py-2 flex items-start gap-2 text-xs text-destructive rounded-lg bg-destructive/10">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* App list */}
        <div className="flex-1 overflow-y-auto scrollbar-hidden px-2">
          <div className="space-y-0.5">
            {filteredApps.map((app) => {
              const isSelected = selectedApps.has(app.id);
              const isExpanded = expandedApp === app.id;
              const related = relatedFiles[app.id];
              const isLoadingRelated = loadingRelated === app.id;

              return (
                <div key={app.id} className="rounded-xl overflow-hidden">
                  <div
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.04] transition-all group cursor-pointer",
                      isSelected && "bg-white/[0.04]",
                      isExpanded && "bg-white/[0.03]"
                    )}
                    onClick={() => handleExpand(app)}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleSelection(app.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="opacity-0 group-hover:opacity-100 checked:opacity-100 transition-opacity w-3.5 h-3.5 rounded accent-primary shrink-0"
                    />

                    <div className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center shrink-0 overflow-hidden relative">
                      {app.icon_path ? (
                        <>
                          <span className="text-xs font-semibold text-muted-foreground/60 absolute">
                            {app.name.charAt(0)}
                          </span>
                          <img
                            src={convertFileSrc(app.icon_path)}
                            alt={app.name}
                            className="w-9 h-9 object-contain relative z-10"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                        </>
                      ) : (
                        <span className="text-xs font-semibold text-muted-foreground/60">
                          {app.name.charAt(0)}
                        </span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">
                          {app.name}
                        </span>
                        {app.version && (
                          <span className="text-[10px] text-muted-foreground/70 bg-white/[0.04] px-1.5 py-0.5 rounded">
                            {app.version}
                          </span>
                        )}
                      </div>
                      {app.bundle_id && (
                        <p className="text-[11px] text-muted-foreground/60 mt-0.5 truncate">
                          {app.bundle_id}
                        </p>
                      )}
                    </div>

                    <span className="text-xs font-medium text-muted-foreground tabular-nums shrink-0">
                      {formatSize(app.size)}
                    </span>

                    <ChevronRight
                      className={cn(
                        "w-3.5 h-3.5 text-muted-foreground/50 shrink-0 transition-transform",
                        isExpanded && "rotate-90"
                      )}
                    />
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-4 pb-3 pt-1 ml-10 space-y-2.5">
                      {isLoadingRelated ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Scanning related files...
                        </div>
                      ) : related ? (
                        <div className="space-y-1">
                          {related.caches.length > 0 && (
                            <RelatedSection
                              label="Caches"
                              paths={related.caches}
                            />
                          )}
                          {related.app_support.length > 0 && (
                            <RelatedSection
                              label="App Support"
                              paths={related.app_support}
                            />
                          )}
                          {related.preferences.length > 0 && (
                            <RelatedSection
                              label="Preferences"
                              paths={related.preferences}
                            />
                          )}
                          {related.logs.length > 0 && (
                            <RelatedSection
                              label="Logs"
                              paths={related.logs}
                            />
                          )}
                          {related.total_size > 0 && (
                            <p className="text-[11px] text-muted-foreground/70 pt-1">
                              Related: {formatSize(related.total_size)}
                            </p>
                          )}
                          {related.caches.length === 0 &&
                            related.app_support.length === 0 &&
                            related.preferences.length === 0 &&
                            related.logs.length === 0 && (
                              <p className="text-[11px] text-muted-foreground/60">
                                No related files found
                              </p>
                            )}
                        </div>
                      ) : null}

                      <div className="flex items-center gap-2 pt-1">
                        {confirming === app.id && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirming(null);
                            }}
                            disabled={uninstalling}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium text-foreground hover:bg-white/[0.08] transition-all disabled:opacity-50"
                            style={{
                              background: "oklch(0.18 0.02 260 / 0.6)",
                              border: "1px solid oklch(0.60 0.02 260 / 0.08)",
                            }}
                          >
                            Cancel
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUninstall(app);
                          }}
                          disabled={uninstalling}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
                          style={{
                            background:
                              confirming === app.id
                                ? "linear-gradient(135deg, oklch(0.55 0.22 25) 0%, oklch(0.48 0.2 10) 100%)"
                                : "linear-gradient(135deg, oklch(0.55 0.22 25 / 0.8) 0%, oklch(0.50 0.2 350 / 0.8) 100%)",
                            boxShadow:
                              "0 4px 16px oklch(0.55 0.22 25 / 0.3), inset 0 1px 0 oklch(1 0 0 / 0.1)",
                          }}
                        >
                          {uninstalling && confirming === app.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                          {uninstalling && confirming === app.id
                            ? "Uninstalling..."
                            : confirming === app.id
                              ? "Confirm Uninstall"
                              : "Uninstall"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 flex items-center justify-between shrink-0 border-t border-white/[0.06]">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={
                selectedApps.size === filteredApps.length &&
                filteredApps.length > 0
              }
              onChange={toggleAll}
              className="w-3.5 h-3.5 rounded accent-primary"
            />
            <span className="text-xs text-muted-foreground">
              {selectedApps.size > 0
                ? `${selectedApps.size} selected (${formatSize(totalSelectedSize)})`
                : `${filteredApps.length} applications`}
            </span>
          </div>

          {selectedApps.size > 0 && (
            <div className="flex items-center gap-2">
              {confirming === "bulk" && (
                <button
                  onClick={() => setConfirming(null)}
                  disabled={uninstalling}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-foreground hover:bg-white/[0.08] transition-all disabled:opacity-50"
                  style={{
                    background: "oklch(0.18 0.02 260 / 0.6)",
                    border: "1px solid oklch(0.60 0.02 260 / 0.08)",
                  }}
                >
                  Cancel
                </button>
              )}
              <button
                disabled={uninstalling}
                onClick={handleBulkUninstall}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
                style={{
                  background:
                    confirming === "bulk"
                      ? "linear-gradient(135deg, oklch(0.55 0.22 25) 0%, oklch(0.48 0.2 10) 100%)"
                      : "linear-gradient(135deg, oklch(0.55 0.22 25 / 0.8) 0%, oklch(0.50 0.2 350 / 0.8) 100%)",
                  boxShadow:
                    "0 4px 16px oklch(0.55 0.22 25 / 0.3), inset 0 1px 0 oklch(1 0 0 / 0.1)",
                }}
              >
                {uninstalling && confirming === "bulk" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                {uninstalling && confirming === "bulk"
                  ? "Uninstalling..."
                  : confirming === "bulk"
                    ? "Confirm Uninstall"
                    : "Uninstall Selected"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RelatedSection({
  label,
  paths,
}: {
  label: string;
  paths: string[];
}) {
  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground/80">
        {label}
      </p>
      {paths.map((p) => {
        const shortPath = p.replace(/^\/Users\/[^/]+\//, "~/");
        return (
          <p
            key={p}
            className="text-[10px] text-muted-foreground/50 truncate pl-2"
          >
            {shortPath}
          </p>
        );
      })}
    </div>
  );
}
