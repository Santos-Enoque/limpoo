export interface StorageItem {
  id: string;
  name: string;
  size: number;
  color: string;
  path?: string;
  type?: "folder" | "file";
  children?: StorageItem[];
}

export interface Drive {
  id: string;
  name: string;
  mount_point: string;
  total: number;
  free: number;
  is_removable: boolean;
}

export interface DirEntry {
  id: string;
  name: string;
  path: string;
  size: number;
  is_dir: boolean;
  children?: DirEntry[];
}

export interface FavoriteFolder {
  id: string;
  name: string;
  path: string;
  size: number;
  color: string;
}

export interface AppInfo {
  id: string;
  name: string;
  path: string;
  bundle_id: string;
  version: string;
  size: number;
  icon_path: string | null;
}

export interface AppRelatedFiles {
  caches: string[];
  app_support: string[];
  preferences: string[];
  logs: string[];
  total_size: number;
}

export interface JunkItem {
  path: string;
  name: string;
  size: number;
  is_dir: boolean;
}

export interface JunkCategory {
  id: string;
  name: string;
  description: string;
  items: JunkItem[];
  total_size: number;
}

export interface JunkScanResult {
  categories: JunkCategory[];
  total_size: number;
}
