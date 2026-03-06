// Lightweight no-op cache helpers for the simple website version.
// These keep the types compiling without requiring any filesystem access.

export interface CacheEntry {
  creatorId: string;
  writtenAt: number;
  spots: unknown[];
}

export async function readCache(_creatorId: string): Promise<CacheEntry | null> {
  return null;
}

export async function writeCache(_creatorId: string, _spots: unknown[]): Promise<void> {
  return;
}

export function isCacheValid(_entry: CacheEntry | null): _entry is CacheEntry {
  return false;
}

export async function invalidateCache(_creatorId: string): Promise<void> {
  return;
}

export async function clearAllCache(): Promise<void> {
  return;
}

export async function listCacheEntries(): Promise<
  { creatorId: string; writtenAt: number; spotCount: number; valid: boolean }[]
> {
  return [];
}

