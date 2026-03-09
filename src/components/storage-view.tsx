import { useState, useEffect, useCallback } from "react";
import { BubbleChart } from "@/components/bubble-chart";
import { StorageSidebar } from "@/components/storage-sidebar";
import { FileListPanel } from "@/components/file-list-panel";
import { listDisks, scanDirectory, scanDirectoryWithProgress, dirEntriesToStorageItems } from "@/lib/disk";
import { listen } from "@tauri-apps/api/event";
import type { StorageItem, Drive } from "@/lib/types";
import { HardDrive, Search } from "lucide-react";
import { formatSize } from "@/lib/utils";

// Folders to hide from the bubble chart (they appear as drives in the sidebar)
const HIDDEN_NAMES = new Set(["volumes", ".vol"]);

export function StorageView() {
  const [drives, setDrives] = useState<Drive[]>([]);
  const [selectedDrive, setSelectedDrive] = useState<string>("");
  const [storageData, setStorageData] = useState<StorageItem[]>([]);
  const [selectedPath, setSelectedPath] = useState<StorageItem[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [hasScanned, setHasScanned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clickedItem, setClickedItem] = useState<StorageItem | null>(null);
  const [scanningName, setScanningName] = useState("");

  useEffect(() => {
    listDisks().then((disks) => {
      setDrives(disks);
      const root = disks.find((d) => d.mount_point === "/");
      if (root) {
        setSelectedDrive(root.id);
      } else if (disks.length > 0) {
        setSelectedDrive(disks[0].id);
      }
    });
  }, []);

  const scanDrive = useCallback(
    async (driveId: string) => {
      const drive = drives.find((d) => d.id === driveId);
      if (!drive) return;

      setScanning(true);
      setError(null);
      setSelectedPath([]);
      setClickedItem(null);
      setScanProgress(0);
      setScanningName("");

      // Listen for real progress events from the backend
      const unlisten = await listen<{ current: number; total: number; name: string }>(
        "scan-progress",
        (event) => {
          const { current, total, name } = event.payload;
          setScanProgress(Math.round((current / total) * 100));
          setScanningName(name);
        }
      );

      try {
        const entries = await scanDirectoryWithProgress(drive.mount_point, 2);
        const items = dirEntriesToStorageItems(entries);
        setStorageData(items);
        setHasScanned(true);
        setScanProgress(100);
      } catch (err) {
        setError(String(err));
        setStorageData([]);
      } finally {
        unlisten();
        setTimeout(() => setScanning(false), 400);
      }
    },
    [drives]
  );

  const handleStartScan = () => {
    if (selectedDrive) {
      scanDrive(selectedDrive);
    }
  };

  // Filter out hidden folders (Volumes, etc.) at root level
  const filteredStorageData = storageData.filter(
    (item) => !HIDDEN_NAMES.has(item.name.toLowerCase())
  );

  const displayItems = (() => {
    if (selectedPath.length === 0) {
      return filteredStorageData;
    }
    const lastItem = selectedPath[selectedPath.length - 1];
    return lastItem.children || [];
  })();

  const handleItemClick = (item: StorageItem, path: StorageItem[]) => {
    if (item.children && item.children.length > 0) {
      setSelectedPath(path);
      setClickedItem(item);
    } else if (item.type === "folder" && item.path) {
      drillInto(item, path);
    }
  };

  const drillInto = async (item: StorageItem, currentPath: StorageItem[]) => {
    if (!item.path) return;
    setScanning(true);
    try {
      const entries = await scanDirectory(item.path, 1);
      const children = dirEntriesToStorageItems(entries).map((child) => ({
        ...child,
        color: item.color,
      }));
      const expandedItem: StorageItem = { ...item, children };
      setSelectedPath([...currentPath.slice(0, -1), expandedItem]);
      setClickedItem(expandedItem);
    } catch {
      setSelectedPath(currentPath);
    } finally {
      setScanning(false);
    }
  };

  const handleFileListClick = async (item: StorageItem) => {
    if (item.children && item.children.length > 0) {
      setSelectedPath([...selectedPath, item]);
      setClickedItem(item);
    } else if (item.type === "folder" && item.path) {
      setScanning(true);
      try {
        const entries = await scanDirectory(item.path, 1);
        const children = dirEntriesToStorageItems(entries).map((child) => ({
          ...child,
          color: item.color,
        }));
        const expandedItem: StorageItem = { ...item, children };
        setSelectedPath([...selectedPath, expandedItem]);
        setClickedItem(expandedItem);
      } catch {
        setSelectedPath([...selectedPath, item]);
      } finally {
        setScanning(false);
      }
    }
  };

  const handleNavigateBack = (index: number) => {
    if (index < 0) {
      setSelectedPath([]);
      setClickedItem(null);
    } else {
      setSelectedPath(selectedPath.slice(0, index + 1));
      setClickedItem(selectedPath[index]);
    }
  };

  const handleClosePanel = () => {
    setClickedItem(null);
  };

  const handleDeleted = (deletedPaths: string[], totalSize: number) => {
    const deletedSet = new Set(deletedPaths);

    // Remove deleted items from storageData
    const removeDeleted = (items: StorageItem[]): StorageItem[] =>
      items
        .filter((item) => !item.path || !deletedSet.has(item.path))
        .map((item) => {
          if (item.children) {
            const newChildren = removeDeleted(item.children);
            const newSize = newChildren.reduce((s, c) => s + c.size, 0);
            return { ...item, children: newChildren, size: newSize };
          }
          return item;
        });

    setStorageData((prev) => removeDeleted(prev));

    // Update selectedPath to reflect removed children
    setSelectedPath((prev) => {
      if (prev.length === 0) return prev;
      const updated = prev.map((pathItem) => {
        if (pathItem.children) {
          const newChildren = removeDeleted(pathItem.children);
          const newSize = newChildren.reduce((s, c) => s + c.size, 0);
          return { ...pathItem, children: newChildren, size: newSize };
        }
        return pathItem;
      });
      return updated;
    });

    // Update clickedItem too
    setClickedItem((prev) => {
      if (!prev) return prev;
      if (prev.children) {
        const newChildren = removeDeleted(prev.children);
        const newSize = newChildren.reduce((s, c) => s + c.size, 0);
        return { ...prev, children: newChildren, size: newSize };
      }
      return prev;
    });

    // Update drive free space
    if (totalSize > 0) {
      setDrives((prev) =>
        prev.map((drive) =>
          drive.id === selectedDrive
            ? { ...drive, free: drive.free + totalSize }
            : drive
        )
      );
    }
  };

  const handleDriveSelect = (driveId: string) => {
    if (driveId !== selectedDrive) {
      setSelectedDrive(driveId);
      setHasScanned(false);
      setStorageData([]);
      setSelectedPath([]);
      setClickedItem(null);
    }
  };

  const handleFolderSelect = async (folder: {
    name: string;
    path: string;
    color: string;
  }) => {
    if (!hasScanned) return;
    const matchingItem = filteredStorageData.find(
      (item) => item.name.toLowerCase() === folder.name.toLowerCase()
    );
    if (matchingItem) {
      setSelectedPath([matchingItem]);
      setClickedItem(matchingItem);
    } else {
      setScanning(true);
      try {
        const entries = await scanDirectory(folder.path, 1);
        const children = dirEntriesToStorageItems(entries).map((child) => ({
          ...child,
          color: folder.color,
        }));
        const totalSize = children.reduce((sum, c) => sum + c.size, 0);
        const folderItem: StorageItem = {
          id: folder.path,
          name: folder.name,
          size: totalSize,
          color: folder.color,
          path: folder.path,
          type: "folder",
          children,
        };
        setSelectedPath([folderItem]);
        setClickedItem(folderItem);
      } catch {
        // ignore
      } finally {
        setScanning(false);
      }
    }
  };

  const currentDrive = drives.find((d) => d.id === selectedDrive);

  return (
    <div className="relative h-full">
      <StorageSidebar
        drives={drives}
        selectedDrive={selectedDrive}
        onDriveSelect={handleDriveSelect}
        onFolderSelect={handleFolderSelect}
      />

      <div className="h-full relative">
        {!hasScanned && !scanning ? (
          <div className="h-full flex items-center justify-center p-8">
            <div className="flex flex-col items-center gap-6 max-w-sm text-center">
              <div className="relative">
                <div className="w-24 h-24 rounded-full glass-panel flex items-center justify-center">
                  <HardDrive className="w-10 h-10 text-primary" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                  <Search className="w-4 h-4 text-primary" />
                </div>
              </div>

              {currentDrive && (
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold text-foreground">
                    {currentDrive.name}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {formatSize(currentDrive.free)} free of{" "}
                    {formatSize(currentDrive.total)}
                  </p>
                  <div className="w-48 h-2 bg-muted/50 rounded-full overflow-hidden mx-auto mt-2">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{
                        width: `${((currentDrive.total - currentDrive.free) / currentDrive.total) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              <button
                onClick={handleStartScan}
                className="scan-button px-8 py-3 rounded-xl text-sm font-semibold text-white transition-all hover:scale-105 active:scale-95"
              >
                Start Scan
              </button>

              <p className="text-xs text-muted-foreground">
                Analyze your disk to find what's taking up space
              </p>
            </div>
          </div>
        ) : scanning && storageData.length === 0 ? (
          <div className="h-full flex items-center justify-center p-8">
            <div className="flex flex-col items-center gap-6">
              <div className="relative w-40 h-40">
                <svg className="w-full h-full animate-spin-slow" viewBox="0 0 160 160">
                  <circle cx="80" cy="80" r="70" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted/30" />
                  <circle
                    cx="80" cy="80" r="70" fill="none"
                    stroke="url(#scanGradient)" strokeWidth="3" strokeLinecap="round"
                    strokeDasharray={`${scanProgress * 4.4} ${440 - scanProgress * 4.4}`}
                    className="transition-all duration-300"
                  />
                  <defs>
                    <linearGradient id="scanGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="var(--primary)" />
                      <stop offset="100%" stopColor="#5BC5A7" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <HardDrive className="w-8 h-8 text-primary mb-2 animate-pulse" />
                  <span className="text-2xl font-bold text-foreground">
                    {Math.round(scanProgress)}%
                  </span>
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-32 h-32 rounded-full border border-primary/20 animate-ping-slow" />
                </div>
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium text-foreground">Scanning disk...</p>
                <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                  {scanningName ? `/${scanningName}` : "Analyzing files and directories"}
                </p>
              </div>
            </div>
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-sm text-destructive">{error}</div>
          </div>
        ) : storageData.length > 0 ? (
          <>
            <BubbleChart
              data={displayItems}
              onItemClick={handleItemClick}
              selectedPath={selectedPath}
              onNavigateBack={handleNavigateBack}
            />

            {/* Floating file list panel - only when a circle is clicked */}
            {clickedItem && (
              <FileListPanel
                selectedItem={clickedItem}
                items={displayItems}
                onItemClick={handleFileListClick}
                onClose={handleClosePanel}
                onDeleted={handleDeleted}
              />
            )}

            {scanning && (
              <div className="absolute top-4 right-4 flex items-center gap-2 text-muted-foreground glass-panel px-3 py-1.5 rounded-lg z-30">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-xs">Loading...</span>
              </div>
            )}
          </>
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Select a drive to scan</p>
          </div>
        )}
      </div>
    </div>
  );
}
