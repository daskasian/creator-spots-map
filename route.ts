import { NextRequest, NextResponse } from "next/server";
import { CREATORS } from "@/lib/creators";
import { extractWithConfidence } from "@/lib/parse-description";
import { readCache, writeCache, isCacheValid, invalidateCache } from "@/lib/spot-cache";

export interface Spot {
  id: string;
  name: string;
  lat: number;
  lng: number;
  creatorId: string;
  creatorName: string;
  videoId: string;
  videoTitle: string;
  confidence: "high" | "medium" | "low";
}

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// ─── YouTube helpers ─────────────────────────────────────────────────────────

async function getChannelUploadsPlaylistId(channelId: string): Promise<string> {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${YOUTUBE_API_KEY}`
  );
  if (!res.ok) throw new Error(`YouTube channels API error: ${res.status}`);
  const data = await res.json();
  const id = data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!id) throw new Error(`No uploads playlist for channel ${channelId}`);
  return id;
}

async function getPlaylistVideoIds(
  playlistId: string,
  maxResults = 20
): Promise<{ videoId: string }[]> {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${playlistId}&maxResults=${maxResults}&key=${YOUTUBE_API_KEY}`
  );
  if (!res.ok) throw new Error(`YouTube playlistItems API error: ${res.status}`);
  const data = await res.json();
  return (data.items ?? []).map((item: Record<string, unknown>) => ({
    videoId: (item.contentDetails as Record<string, string>).videoId,
  }));
}

async function getVideoSnippets(
  videoIds: string[]
): Promise<{ videoId: string; title: string; description: string }[]> {
  const results = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50).join(",");
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${chunk}&key=${YOUTUBE_API_KEY}`
    );
    if (!res.ok) throw new Error(`YouTube videos API error: ${res.status}`);
    const data = await res.json();
    for (const item of data.items ?? []) {
      results.push({
        videoId: item.id as string,
        title: (item.snippet?.title ?? "") as string,
        description: (item.snippet?.description ?? "") as string,
      });
    }
  }
  return results;
}

// ─── Geocoding (Nominatim) ───────────────────────────────────────────────────

const geocodeCache = new Map<string, { lat: number; lng: number } | null>();

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function geocode(query: string): Promise<{ lat: number; lng: number } | null> {
  const key = query.toLowerCase().trim();
  if (geocodeCache.has(key)) return geocodeCache.get(key)!;

  await sleep(1100); // Nominatim ToS: max 1 req/sec

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=0`;
    const res = await fetch(url, {
      headers: { "User-Agent": "CreatorSpotsMap/1.0" },
    });
    if (!res.ok) { geocodeCache.set(key, null); return null; }
    const data = await res.json();
    if (!data.length) { geocodeCache.set(key, null); return null; }

    const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    geocodeCache.set(key, result);
    return result;
  } catch {
    geocodeCache.set(key, null);
    return null;
  }
}

// ─── Core extraction ─────────────────────────────────────────────────────────

async function fetchSpotsForCreator(
  creatorId: string,
  creatorName: string,
  channelId: string
): Promise<Spot[]> {
  const playlistId = await getChannelUploadsPlaylistId(channelId);
  const videoRefs = await getPlaylistVideoIds(playlistId, 20);
  const snippets = await getVideoSnippets(videoRefs.map((v) => v.videoId));

  const spots: Spot[] = [];

  for (const { videoId, title, description } of snippets) {
    const candidates = extractWithConfidence(description);

    // Only geocode high + medium confidence candidates; skip low to save quota
    const ranked = candidates.filter((c) => c.confidence !== "low");

    let spotsThisVideo = 0;

    for (const candidate of ranked) {
      if (spotsThisVideo >= 3) break;

      const coords = await geocode(candidate.text);
      if (!coords) continue;

      spots.push({
        id: `${creatorId}-${videoId}-${candidate.text.slice(0, 20).replace(/\W+/g, "-")}`,
        name: candidate.text,
        lat: coords.lat,
        lng: coords.lng,
        creatorId,
        creatorName,
        videoId,
        videoTitle: title,
        confidence: candidate.confidence,
      });

      spotsThisVideo++;
    }
  }

  return spots;
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  if (!YOUTUBE_API_KEY) {
    return NextResponse.json(
      { error: "YOUTUBE_API_KEY is not set. Add it to .env.local — see README." },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const creatorId = searchParams.get("creatorId");
  const forceRefresh = searchParams.get("refresh") === "true";

  const cacheKey = creatorId ?? "all";

  // ── Serve from cache if valid ──
  if (!forceRefresh) {
    const cached = await readCache(cacheKey);
    if (isCacheValid(cached)) {
      return NextResponse.json({
        spots: cached.spots,
        fromCache: true,
        cachedAt: new Date(cached.writtenAt).toISOString(),
      });
    }
  } else {
    await invalidateCache(cacheKey);
  }

  // ── Resolve creators to fetch ──
  const targets = creatorId
    ? CREATORS.filter((c) => c.id === creatorId)
    : CREATORS;

  if (targets.length === 0) {
    return NextResponse.json(
      { error: `Creator "${creatorId}" not found` },
      { status: 404 }
    );
  }

  // ── Fetch fresh spots ──
  const allSpots: Spot[] = [];

  for (const creator of targets) {
    // When fetching "all", reuse valid individual caches to avoid redundant work
    if (!creatorId) {
      const creatorCache = await readCache(creator.id);
      if (isCacheValid(creatorCache)) {
        allSpots.push(...creatorCache.spots);
        continue;
      }
    }

    try {
      const spots = await fetchSpotsForCreator(creator.id, creator.name, creator.channelId);
      allSpots.push(...spots);
      await writeCache(creator.id, spots); // always persist per-creator
    } catch (err) {
      console.error(`Failed to load spots for ${creator.name}:`, err);
    }
  }

  await writeCache(cacheKey, allSpots);

  return NextResponse.json({ spots: allSpots, fromCache: false });
}
