/**
 * File-based spot cache.
 *
 * Stores results in .cache/spots/ as JSON files — one file per creator,
 * plus one for the "all" aggregate. Each file records when it was written
 * so it can be expired after CACHE_TTL_MS.
 *
 * Why file-based (not in-memory)?
 *   Next.js dev server hot-reloads wipe in-memory state constantly.
 *   A file cache survives restarts and means you don't burn YouTube/Nominatim
 *   quota on every code change.
 *
 * Usage:
 *   import { readCache, writeCache, isCacheValid } from "@/lib/spot-cache";
 *
 *   const cached = await readCache(creatorId);
 *   if (isCacheValid(cached)) return cached.spots;
 *   const fresh = await fetchSpots(creatorId);
 *   await writeCache(creatorId, fresh);
 */

import fs from "fs/promises";
import path from "path";
import type { Spot } from "@/app/api/spots/route";

/** How long a cache entry is valid (default: 24 hours) */
const CACHE_TTL_MS = parseInt(process.env.SPOT_CACHE_TTL_MS ?? "", 10) || 24 * 60 * 60 * 1000;

/** Directory (relative to project root) where cache files live */
const CACHE_DIR = path.join(process.cwd(), ".cache", "spots");

export interface CacheEntry {
  creatorId: string;
  writtenAt: number; // Date.now()
  spots: Spot[];
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function cacheFilePath(creatorId: string): string {
  // Sanitise the key so it's safe as a filename
  const safe = creatorId.replace(/[^a-z0-9_-]/gi, "_").slice(0, 80);
  return path.join(CACHE_DIR, `${safe}.json`);
}

async function ensureCacheDir(): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Read a cache entry. Returns null if the file doesn't exist or is unreadable.
 * Does NOT check TTL — call isCacheValid() for that.
 */
export async function readCache(creatorId: string): Promise<CacheEntry | null> {
  try {
    const raw = await fs.readFile(cacheFilePath(creatorId), "utf-8");
    return JSON.parse(raw) as CacheEntry;
  } catch {
    return null;
  }
}

/**
 * Write spots to cache for a given creator (or "all" for the aggregate).
 */
export async function writeCache(creatorId: string, spots: Spot[]): Promise<void> {
  await ensureCacheDir();
  const entry: CacheEntry = {
    creatorId,
    writtenAt: Date.now(),
    spots,
  };
  await fs.writeFile(cacheFilePath(creatorId), JSON.stringify(entry, null, 2), "utf-8");
}

/**
 * Returns true if a cache entry exists and is within the TTL window.
 */
export function isCacheValid(entry: CacheEntry | null): entry is CacheEntry {
  if (!entry) return false;
  return Date.now() - entry.writtenAt < CACHE_TTL_MS;
}

/**
 * Delete the cache file for a specific creator (or "all").
 * Useful for the ?refresh=true query param.
 */
export async function invalidateCache(creatorId: string): Promise<void> {
  try {
    await fs.unlink(cacheFilePath(creatorId));
  } catch {
    // File didn't exist — that's fine
  }
}

/**
 * Delete all cache files.
 */
export async function clearAllCache(): Promise<void> {
  try {
    const files = await fs.readdir(CACHE_DIR);
    await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map((f) => fs.unlink(path.join(CACHE_DIR, f)))
    );
  } catch {
    // Dir didn't exist — that's fine
  }
}

/**
 * Returns metadata about all cached creators without loading their spots.
 */
export async function listCacheEntries(): Promise<
  { creatorId: string; writtenAt: number; spotCount: number; valid: boolean }[]
> {
  await ensureCacheDir();
  try {
    const files = await fs.readdir(CACHE_DIR);
    const entries = await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map(async (f) => {
          try {
            const raw = await fs.readFile(path.join(CACHE_DIR, f), "utf-8");
            const entry = JSON.parse(raw) as CacheEntry;
            return {
              creatorId: entry.creatorId,
              writtenAt: entry.writtenAt,
              spotCount: entry.spots.length,
              valid: isCacheValid(entry),
            };
          } catch {
            return null;
          }
        })
    );
    return entries.filter((e): e is NonNullable<typeof e> => e !== null);
  } catch {
    return [];
  }
}
