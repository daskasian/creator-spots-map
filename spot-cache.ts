/**
 * File-based spot cache.
 *
 * Stores results in .cache/spots/ as JSON files — one file per creator,
 * plus one for the "all" aggregate. Each file records when it was written
 * so it can be expired after CACHE_TTL_MS.
 */

import fs from "fs/promises";
import path from "path";
import type { Spot } from "./app/api/spots/route";

/** How long a cache entry is valid (default: 24 hours) */
const CACHE_TTL_MS =
  parseInt(process.env.SPOT_CACHE_TTL_MS ?? "", 10) || 24 * 60 * 60 * 1000;

/** Directory (relative to project root) where cache files live */
const CACHE_DIR = path.join(process.cwd(), ".cache", "spots");

export interface CacheEntry {
  creatorId: string;
  writtenAt: number;
  spots: Spot[];
}

function cacheFilePath(creatorId: string): string {
  const safe = creatorId.replace(/[^a-z0-9_-]/gi, "_").slice(0, 80);
  return path.join(CACHE_DIR, `${safe}.json`);
}

async function ensureCacheDir(): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

export async function readCache(creatorId: string): Promise<CacheEntry | null> {
  try {
    const raw = await fs.readFile(cacheFilePath(creatorId), "utf-8");
    return JSON.parse(raw) as CacheEntry;
  } catch {
    return null;
  }
}

export async function writeCache(creatorId: string, spots: Spot[]): Promise<void> {
  await ensureCacheDir();
  const entry: CacheEntry = {
    creatorId,
    writtenAt: Date.now(),
    spots,
  };
  await fs.writeFile(
    cacheFilePath(creatorId),
    JSON.stringify(entry, null, 2),
    "utf-8",
  );
}

export function isCacheValid(entry: CacheEntry | null): entry is CacheEntry {
  if (!entry) return false;
  return Date.now() - entry.writtenAt < CACHE_TTL_MS;
}

export async function invalidateCache(creatorId: string): Promise<void> {
  try {
    await fs.unlink(cacheFilePath(creatorId));
  } catch {
    // File didn't exist — that's fine
  }
}

export async function clearAllCache(): Promise<void> {
  try {
    const files = await fs.readdir(CACHE_DIR);
    await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map((f) => fs.unlink(path.join(CACHE_DIR, f))),
    );
  } catch {
    // Dir didn't exist — that's fine
  }
}

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
        }),
    );
    return entries.filter(
      (e): e is NonNullable<(typeof entries)[number]> => e !== null,
    );
  } catch {
    return [];
  }
}

