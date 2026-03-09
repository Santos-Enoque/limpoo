import { invoke } from "@tauri-apps/api/core";
import type { Drive, DirEntry, StorageItem, AppInfo, AppRelatedFiles, JunkScanResult } from "./types";

const COLORS = [
  "#4F8EF7", // Blue
  "#5BC5A7", // Teal
  "#F7B955", // Yellow/Gold
  "#F76E6E", // Red/Coral
  "#A78BFA", // Purple
  "#67D4F1", // Cyan
  "#F97316", // Orange
  "#EC4899", // Pink
  "#10B981", // Emerald
  "#6366F1", // Indigo
  "#EF4444", // Red
  "#8B5CF6", // Violet
];

export async function listDisks(): Promise<Drive[]> {
  return invoke<Drive[]>("list_disks");
}

export async function scanDirectory(
  path: string,
  depth: number = 1
): Promise<DirEntry[]> {
  return invoke<DirEntry[]>("scan_directory", { path, depth });
}

export async function scanDirectoryWithProgress(
  path: string,
  depth: number = 1
): Promise<DirEntry[]> {
  return invoke<DirEntry[]>("scan_directory_with_progress", { path, depth });
}

export interface DeleteResult {
  path: string;
  success: boolean;
  error: string | null;
}

export async function moveToTrash(paths: string[]): Promise<DeleteResult[]> {
  return invoke<DeleteResult[]>("move_to_trash", { paths });
}

export async function listApps(): Promise<AppInfo[]> {
  return invoke<AppInfo[]>("list_apps");
}

export async function getAppRelatedFiles(
  bundleId: string,
  appName: string
): Promise<AppRelatedFiles> {
  return invoke<AppRelatedFiles>("get_app_related_files", {
    bundleId,
    appName,
  });
}

export async function uninstallApp(
  appPath: string,
  relatedPaths: string[]
): Promise<DeleteResult[]> {
  return invoke<DeleteResult[]>("uninstall_app", {
    request: { app_path: appPath, related_paths: relatedPaths },
  });
}

export async function scanJunk(): Promise<JunkScanResult> {
  return invoke<JunkScanResult>("scan_junk");
}

export function dirEntriesToStorageItems(entries: DirEntry[]): StorageItem[] {
  return entries.map((entry, index) => {
    const color = COLORS[index % COLORS.length];
    return dirEntryToStorageItem(entry, color);
  });
}

function dirEntryToStorageItem(entry: DirEntry, color: string): StorageItem {
  const children = entry.children
    ? entry.children.map((child) => dirEntryToStorageItem(child, color))
    : undefined;

  return {
    id: entry.id,
    name: entry.name,
    size: entry.size,
    color,
    path: entry.path,
    type: entry.is_dir ? "folder" : "file",
    children,
  };
}
