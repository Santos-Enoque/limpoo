import { useState, useEffect } from "react";
import { Folder, File, X, AlertTriangle, Loader2, CheckSquare } from "lucide-react";
import { cn, formatSize } from "@/lib/utils";
import { moveToTrash } from "@/lib/disk";
import type { StorageItem } from "@/lib/types";

interface FileListPanelProps {
  selectedItem: StorageItem | null;
  items: StorageItem[];
  onItemClick: (item: StorageItem) => void;
  onClose: () => void;
  onDeleted: (deletedPaths: string[], totalSize: number) => void;
}

export function FileListPanel({
  selectedItem,
  items,
  onItemClick,
  onClose,
  onDeleted,
}: FileListPanelProps) {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [visible, setVisible] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Only reset confirm state when items change, NOT the selection
  useEffect(() => {
    setConfirming(false);
    setDeleteError(null);
  }, [items]);

  const toggleSelection = (id: string) => {
    const newSelection = new Set(selectedItems);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedItems(newSelection);
    setConfirming(false);
    setDeleteError(null);
  };

  const toggleSelectAll = () => {
    const currentIds = new Set(sortedItems.map((i) => i.id));
    const allSelected = sortedItems.every((i) => selectedItems.has(i.id));

    if (allSelected) {
      const newSelection = new Set(selectedItems);
      currentIds.forEach((id) => newSelection.delete(id));
      setSelectedItems(newSelection);
    } else {
      const newSelection = new Set(selectedItems);
      currentIds.forEach((id) => newSelection.add(id));
      setSelectedItems(newSelection);
    }
    setConfirming(false);
  };

  const sortedItems = [...items].sort((a, b) => b.size - a.size);

  const currentSelected = sortedItems.filter((item) =>
    selectedItems.has(item.id)
  );
  const currentSelectedSize = currentSelected.reduce(
    (sum, item) => sum + item.size,
    0
  );
  const allCurrentSelected =
    sortedItems.length > 0 &&
    sortedItems.every((i) => selectedItems.has(i.id));

  const totalSelectedCount = selectedItems.size;

  const handleRemoveClick = () => {
    if (!confirming) {
      setConfirming(true);
      setDeleteError(null);
      return;
    }
    performDelete();
  };

  const performDelete = async () => {
    const allItems = sortedItems.filter((item) => selectedItems.has(item.id));
    const pathsToDelete = allItems
      .map((item) => item.path)
      .filter((p): p is string => !!p);

    if (pathsToDelete.length === 0) return;

    setDeleting(true);
    setDeleteError(null);

    try {
      const results = await moveToTrash(pathsToDelete);
      const succeeded = results.filter((r) => r.success).map((r) => r.path);
      const failed = results.filter((r) => !r.success);

      if (failed.length > 0) {
        setDeleteError(
          `${failed.length} item${failed.length > 1 ? "s" : ""} couldn't be removed: ${failed[0].error}`
        );
      }

      if (succeeded.length > 0) {
        const succeededSet = new Set(succeeded);
        const newSelection = new Set(selectedItems);
        for (const item of allItems) {
          if (item.path && succeededSet.has(item.path)) {
            newSelection.delete(item.id);
          }
        }
        setSelectedItems(newSelection);
        setConfirming(false);

        const succeededSize = allItems
          .filter((i) => i.path && succeededSet.has(i.path))
          .reduce((s, i) => s + i.size, 0);
        onDeleted(succeeded, succeededSize);
      }
    } catch (err) {
      setDeleteError(String(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      {/* File list panel */}
      <div
        className={cn(
          "absolute right-3 top-10 bottom-3 w-80 z-20 flex flex-col rounded-2xl overflow-hidden transition-all duration-300 ease-out",
          visible
            ? "opacity-100 translate-x-0"
            : "opacity-0 translate-x-4"
        )}
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
        <div className="px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: selectedItem?.color }}
            />
            <span className="text-sm font-semibold text-foreground truncate">
              {selectedItem?.name || "Files"}
            </span>
            {selectedItem && (
              <span className="text-xs text-muted-foreground">
                {formatSize(selectedItem.size)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={toggleSelectAll}
              className={cn(
                "p-1 rounded-md transition-all",
                allCurrentSelected
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/[0.06]"
              )}
              title={allCurrentSelected ? "Deselect all" : "Select all"}
            >
              <CheckSquare className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Item count */}
        <div className="px-4 pb-2">
          <span className="text-xs text-muted-foreground">
            {items.length} items
            {totalSelectedCount > 0 && (
              <> &middot; {totalSelectedCount} selected</>
            )}
          </span>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto px-1 scrollbar-hidden">
          <div className="space-y-0.5">
            {sortedItems.map((item) => {
              const isFolder = item.type === "folder";
              const isSelected = selectedItems.has(item.id);

              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/[0.06] transition-all group cursor-pointer",
                    isSelected && "bg-white/[0.05]"
                  )}
                  onClick={() => {
                    if (isFolder) onItemClick(item);
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleSelection(item.id);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="opacity-0 group-hover:opacity-100 checked:opacity-100 transition-opacity w-3.5 h-3.5 rounded accent-primary shrink-0"
                  />

                  {isFolder ? (
                    <Folder
                      className="w-4 h-4 shrink-0"
                      style={{ color: item.color }}
                    />
                  ) : (
                    <File
                      className="w-4 h-4 shrink-0"
                      style={{ color: item.color }}
                    />
                  )}

                  <span className="flex-1 text-sm text-foreground truncate">
                    {item.name}
                  </span>

                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {formatSize(item.size)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Error message */}
        {deleteError && (
          <div className="px-4 py-2 flex items-start gap-2 text-xs text-destructive">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{deleteError}</span>
          </div>
        )}

        {/* Footer - selection info only */}
        {currentSelected.length > 0 && (
          <div className="px-4 py-2.5 shrink-0 border-t border-white/[0.06]">
            <span className="text-xs text-muted-foreground">
              {currentSelected.length} selected &middot;{" "}
              {formatSize(currentSelectedSize)}
            </span>
          </div>
        )}
      </div>

      {/* Floating delete button - bottom center of canvas */}
      {currentSelected.length > 0 && (
        <div
          className={cn(
            "absolute bottom-6 left-1/2 -translate-x-1/2 z-30 transition-all duration-300 ease-out",
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          )}
        >
          {confirming && !deleting && (
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap glass-panel px-3 py-1.5 rounded-lg">
              <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
              <span>Items will be moved to Trash</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            {confirming && (
              <button
                onClick={() => setConfirming(false)}
                disabled={deleting}
                className="px-4 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                style={{
                  background: "oklch(0.18 0.02 260 / 0.9)",
                  backdropFilter: "blur(20px)",
                  border: "1px solid oklch(0.60 0.02 260 / 0.15)",
                  boxShadow: "0 8px 32px oklch(0 0 0 / 0.3)",
                }}
              >
                Cancel
              </button>
            )}
            <button
              onClick={handleRemoveClick}
              disabled={deleting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
              style={{
                background: confirming
                  ? "linear-gradient(135deg, oklch(0.55 0.22 25) 0%, oklch(0.48 0.2 10) 100%)"
                  : "linear-gradient(135deg, oklch(0.55 0.22 25) 0%, oklch(0.50 0.2 350) 100%)",
                boxShadow: confirming
                  ? "0 6px 28px oklch(0.55 0.22 25 / 0.5), 0 2px 8px oklch(0 0 0 / 0.2), inset 0 1px 0 oklch(1 0 0 / 0.15)"
                  : "0 4px 20px oklch(0.55 0.22 25 / 0.4), 0 2px 8px oklch(0 0 0 / 0.2), inset 0 1px 0 oklch(1 0 0 / 0.15)",
              }}
            >
              {deleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 6h18" />
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
              )}
              {deleting
                ? "Removing..."
                : confirming
                  ? `Confirm Remove (${formatSize(currentSelectedSize)})`
                  : `Remove ${currentSelected.length} items (${formatSize(currentSelectedSize)})`}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
