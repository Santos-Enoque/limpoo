import { useState, useEffect } from "react";
import {
  Loader2,
  Trash2,
  AlertTriangle,
  ChevronRight,
  Folder,
  File,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { cn, formatSize } from "@/lib/utils";
import { scanJunk, moveToTrash } from "@/lib/disk";
import type { JunkScanResult, JunkCategory } from "@/lib/types";

interface JunkViewProps {
  preloadedJunk: JunkScanResult | null;
}

export function JunkView({ preloadedJunk }: JunkViewProps) {
  const [result, setResult] = useState<JunkScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (preloadedJunk !== null) {
      setResult(preloadedJunk);
      setLoading(false);
      // Auto-select all items
      const allPaths = new Set<string>();
      preloadedJunk.categories.forEach((cat) =>
        cat.items.forEach((item) => allPaths.add(item.path))
      );
      setSelectedItems(allPaths);
    } else {
      scanJunk()
        .then((r) => {
          setResult(r);
          const allPaths = new Set<string>();
          r.categories.forEach((cat) =>
            cat.items.forEach((item) => allPaths.add(item.path))
          );
          setSelectedItems(allPaths);
        })
        .catch(() => setResult({ categories: [], total_size: 0 }))
        .finally(() => setLoading(false));
    }
  }, [preloadedJunk]);

  const handleRescan = async () => {
    setLoading(true);
    setError(null);
    setConfirming(false);
    try {
      const r = await scanJunk();
      setResult(r);
      const allPaths = new Set<string>();
      r.categories.forEach((cat) =>
        cat.items.forEach((item) => allPaths.add(item.path))
      );
      setSelectedItems(allPaths);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (cat: JunkCategory) => {
    const catPaths = cat.items.map((i) => i.path);
    const allSelected = catPaths.every((p) => selectedItems.has(p));
    const next = new Set(selectedItems);
    if (allSelected) {
      catPaths.forEach((p) => next.delete(p));
    } else {
      catPaths.forEach((p) => next.add(p));
    }
    setSelectedItems(next);
    setConfirming(false);
  };

  const toggleItem = (path: string) => {
    const next = new Set(selectedItems);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    setSelectedItems(next);
    setConfirming(false);
  };

  const selectedSize = result
    ? result.categories.reduce(
        (sum, cat) =>
          sum +
          cat.items
            .filter((i) => selectedItems.has(i.path))
            .reduce((s, i) => s + i.size, 0),
        0
      )
    : 0;

  const handleClean = async () => {
    if (!confirming) {
      setConfirming(true);
      setError(null);
      return;
    }

    setCleaning(true);
    setError(null);

    try {
      const paths = Array.from(selectedItems);
      const results = await moveToTrash(paths);
      const succeeded = new Set(
        results.filter((r) => r.success).map((r) => r.path)
      );
      const failed = results.filter((r) => !r.success);

      if (failed.length > 0) {
        setError(
          `${failed.length} item(s) couldn't be removed: ${failed[0].error}`
        );
      }

      // Remove cleaned items from result
      if (result && succeeded.size > 0) {
        const updatedCategories = result.categories
          .map((cat) => {
            const remainingItems = cat.items.filter(
              (i) => !succeeded.has(i.path)
            );
            const newSize = remainingItems.reduce((s, i) => s + i.size, 0);
            return { ...cat, items: remainingItems, total_size: newSize };
          })
          .filter((cat) => cat.items.length > 0);

        const newTotal = updatedCategories.reduce(
          (s, c) => s + c.total_size,
          0
        );
        setResult({ categories: updatedCategories, total_size: newTotal });

        // Remove cleaned from selection
        const next = new Set(selectedItems);
        succeeded.forEach((p) => next.delete(p));
        setSelectedItems(next);
      }

      setConfirming(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setCleaning(false);
    }
  };

  const CATEGORY_COLORS: Record<string, string> = {
    user_caches: "#F7B955",
    logs: "#A78BFA",
    downloads: "#4F8EF7",
    xcode_derived: "#67D4F1",
    brew_cache: "#5BC5A7",
    dev_caches: "#F97316",
    trash: "#F76E6E",
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">
            Scanning for junk files...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full relative">
      <div
        className="absolute left-[76px] top-10 bottom-3 right-3 z-10 flex flex-col rounded-2xl overflow-hidden"
        style={{
          background: "linear-gradient(160deg, oklch(0.14 0.025 265 / 0.82) 0%, oklch(0.11 0.03 290 / 0.78) 50%, oklch(0.13 0.02 245 / 0.80) 100%)",
          backdropFilter: "blur(32px) saturate(1.5)",
          WebkitBackdropFilter: "blur(32px) saturate(1.5)",
          border: "1px solid oklch(0.55 0.06 275 / 0.14)",
          boxShadow:
            "0 12px 48px oklch(0 0 0 / 0.4), 0 4px 16px oklch(0 0 0 / 0.2), inset 0 0.5px 0 oklch(1 0 0 / 0.08), inset 0 0 0 0.5px oklch(0.60 0.1 270 / 0.06)",
        }}
      >
        {/* Header */}
        <div className="px-5 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                System Junk
              </h2>
              <p className="text-[11px] text-muted-foreground">
                {result
                  ? `${formatSize(result.total_size)} found across ${result.categories.length} categories`
                  : "No junk found"}
              </p>
            </div>
          </div>

          <button
            onClick={handleRescan}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-all disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Rescan
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-5 mb-2 px-3 py-2 flex items-start gap-2 text-xs text-destructive rounded-lg bg-destructive/10">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Categories */}
        <div className="flex-1 overflow-y-auto scrollbar-hidden px-2">
          {result && result.categories.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-center">
                <Sparkles className="w-10 h-10 text-primary/40" />
                <p className="text-sm text-muted-foreground">
                  Your system is clean!
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-1 py-1">
              {result?.categories.map((cat) => {
                const color = CATEGORY_COLORS[cat.id] || "#6366F1";
                const isExpanded = expandedCategory === cat.id;
                const catPaths = cat.items.map((i) => i.path);
                const allCatSelected = catPaths.every((p) =>
                  selectedItems.has(p)
                );
                const someCatSelected = catPaths.some((p) =>
                  selectedItems.has(p)
                );
                return (
                  <div key={cat.id} className="rounded-xl overflow-hidden">
                    {/* Category row */}
                    <div
                      className={cn(
                        "flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/[0.04] transition-all cursor-pointer group",
                        isExpanded && "bg-white/[0.03]"
                      )}
                      onClick={() =>
                        setExpandedCategory(isExpanded ? null : cat.id)
                      }
                    >
                      <input
                        type="checkbox"
                        checked={allCatSelected}
                        ref={(el) => {
                          if (el)
                            el.indeterminate =
                              someCatSelected && !allCatSelected;
                        }}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleCategory(cat);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                      />

                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${color}20` }}
                      >
                        <Folder
                          className="w-4 h-4"
                          style={{ color }}
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {cat.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground/60">
                          {cat.description}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="text-xs font-medium text-foreground tabular-nums">
                          {formatSize(cat.total_size)}
                        </p>
                        <p className="text-[10px] text-muted-foreground/50">
                          {cat.items.length} items
                        </p>
                      </div>

                      <ChevronRight
                        className={cn(
                          "w-3.5 h-3.5 text-muted-foreground/50 shrink-0 transition-transform",
                          isExpanded && "rotate-90"
                        )}
                      />
                    </div>

                    {/* Expanded items */}
                    {isExpanded && (
                      <div className="ml-10 pl-2 pb-2 space-y-0.5">
                        {cat.items.slice(0, 50).map((item) => {
                          const isSelected = selectedItems.has(item.path);
                          return (
                            <div
                              key={item.path}
                              className={cn(
                                "flex items-center gap-2.5 px-3 py-1.5 rounded-lg hover:bg-white/[0.04] transition-all group/item cursor-pointer",
                                isSelected && "bg-white/[0.03]"
                              )}
                              onClick={() => toggleItem(item.path)}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleItem(item.path)}
                                onClick={(e) => e.stopPropagation()}
                                className="opacity-0 group-hover/item:opacity-100 checked:opacity-100 transition-opacity w-3 h-3 rounded accent-primary shrink-0"
                              />
                              {item.is_dir ? (
                                <Folder
                                  className="w-3.5 h-3.5 shrink-0"
                                  style={{ color }}
                                />
                              ) : (
                                <File
                                  className="w-3.5 h-3.5 shrink-0"
                                  style={{ color }}
                                />
                              )}
                              <span className="flex-1 text-xs text-foreground/80 truncate">
                                {item.name}
                              </span>
                              <span className="text-[11px] text-muted-foreground/60 tabular-nums shrink-0">
                                {formatSize(item.size)}
                              </span>
                            </div>
                          );
                        })}
                        {cat.items.length > 50 && (
                          <p className="text-[11px] text-muted-foreground/50 px-3 py-1">
                            ...and {cat.items.length - 50} more items
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 flex items-center justify-between shrink-0 border-t border-white/[0.06]">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {selectedItems.size > 0
                ? `${selectedItems.size} items selected (${formatSize(selectedSize)})`
                : "No items selected"}
            </span>
          </div>

          {selectedItems.size > 0 && (
            <div className="flex items-center gap-2">
              {confirming && (
                <button
                  onClick={() => setConfirming(false)}
                  disabled={cleaning}
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
                onClick={handleClean}
                disabled={cleaning}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
                style={{
                  background: confirming
                    ? "linear-gradient(135deg, oklch(0.55 0.22 25) 0%, oklch(0.48 0.2 10) 100%)"
                    : "linear-gradient(135deg, oklch(0.65 0.2 250) 0%, oklch(0.55 0.18 280) 100%)",
                  boxShadow: confirming
                    ? "0 4px 20px oklch(0.55 0.22 25 / 0.4), inset 0 1px 0 oklch(1 0 0 / 0.15)"
                    : "0 4px 20px oklch(0.65 0.2 250 / 0.4), inset 0 1px 0 oklch(1 0 0 / 0.15)",
                }}
              >
                {cleaning ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                {cleaning
                  ? "Cleaning..."
                  : confirming
                    ? `Confirm Clean (${formatSize(selectedSize)})`
                    : `Clean (${formatSize(selectedSize)})`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
