import { NextRequest, NextResponse } from "next/server";
import { CREATORS } from "../../../creators";
import { extractWithConfidence } from "../../../parse-description";
import {
  isCacheValid,
  readCache,
  writeCache,
  invalidateCache,
} from "../../../spot-cache";

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

async function getChannelUploadsPlaylistId(channelId: string): Promise<string> {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${YOUTUBE_API_KEY}`,
  );
  if (!res.ok) throw new Error(`YouTube channels API error: ${res.status}`);
  const data = await res.json();
  const id = data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!id) throw new Error(`No uploads playlist for channel ${channelId}`);
  return id;
}

async function getPlaylistVideoIds(
  playlistId: string,
  maxResults = 100,
): Promise<{ videoId: string }[]> {
  // Page through the uploads playlist until we reach maxResults or run out.
  const perPage = 50;
  let collected: { videoId: string }[] = [];
  let pageToken: string | undefined;

  // Safety cap: never fetch more than 500 videos in a single run,
  // even if maxResults is set higher.
  const hardCap = Math.min(maxResults, 500);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const url = new URL(
      "https://www.googleapis.com/youtube/v3/playlistItems",
    );
    url.searchParams.set("part", "contentDetails");
    url.searchParams.set("playlistId", playlistId);
    url.searchParams.set("maxResults", String(perPage));
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    url.searchParams.set("key", YOUTUBE_API_KEY!);

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`YouTube playlistItems API error: ${res.status}`);
    }
    const data = await res.json();
    const items = (data.items ?? []) as Array<{ contentDetails?: { videoId: string } }>;

    collected = collected.concat(
      items
        .map((item) => item.contentDetails?.videoId)
        .filter((id): id is string => !!id)
        .map((videoId) => ({ videoId })),
    );

    if (collected.length >= hardCap) {
      collected = collected.slice(0, hardCap);
      break;
    }

    pageToken = data.nextPageToken as string | undefined;
    if (!pageToken) break;
  }

  return collected;
}

async function getVideoSnippets(
  videoIds: string[],
): Promise<{ videoId: string; title: string; description: string }[]> {
  const results = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50).join(",");
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${chunk}&key=${YOUTUBE_API_KEY}`,
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

const geocodeCache = new Map<string, { lat: number; lng: number } | null>();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function geocode(
  query: string,
): Promise<{ lat: number; lng: number } | null> {
  const key = query.toLowerCase().trim();
  if (geocodeCache.has(key)) return geocodeCache.get(key)!;

  await sleep(1100);

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      query,
    )}&format=json&limit=1&addressdetails=0`;
    const res = await fetch(url, {
      headers: { "User-Agent": "CreatorSpotsMap/1.0" },
    });
    if (!res.ok) {
      geocodeCache.set(key, null);
      return null;
    }
    const data = await res.json();
    if (!data.length) {
      geocodeCache.set(key, null);
      return null;
    }

    const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    geocodeCache.set(key, result);
    return result;
  } catch {
    geocodeCache.set(key, null);
    return null;
  }
}

async function fetchSpotsForCreator(
  creatorId: string,
  creatorName: string,
  channelId: string,
): Promise<Spot[]> {
  const playlistId = await getChannelUploadsPlaylistId(channelId);
  const videoRefs = await getPlaylistVideoIds(playlistId, 20);
  const snippets = await getVideoSnippets(videoRefs.map((v) => v.videoId));

  const spots: Spot[] = [];

  for (const { videoId, title, description } of snippets) {
    const candidates = extractWithConfidence(description);
    const ranked = candidates.filter((c) => c.confidence !== "low");
    let spotsThisVideo = 0;

    for (const candidate of ranked) {
      if (spotsThisVideo >= 3) break;

      // For some creators (like Taste Cadets), most spots are in London even
      // when the city isn't written out. Bias geocoding slightly by appending
      // London to the query when no city is present.
      const biasedQuery =
        creatorName.toLowerCase().includes("taste cadets") &&
        !/london/i.test(candidate.text)
          ? `${candidate.text}, London`
          : candidate.text;

      const coords = await geocode(biasedQuery);
      if (!coords) continue;

      spots.push({
        id: `${creatorId}-${videoId}-${candidate.text
          .slice(0, 20)
          .replace(/\W+/g, "-")}`,
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

export async function GET(request: NextRequest) {
  if (!YOUTUBE_API_KEY) {
    return NextResponse.json(
      {
        error:
          "YOUTUBE_API_KEY is not set. Add it to .env.local or your Vercel project environment variables.",
      },
      { status: 500 },
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const creatorId = searchParams.get("creatorId");
    const channelId = searchParams.get("channelId");
    const creatorNameFromQuery = searchParams.get("creatorName");
    const forceRefresh = searchParams.get("refresh") === "true";

    const cacheKey = channelId ?? creatorId ?? "all";

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

    let targets:
      | { id: string; name: string; channelId: string }[]
      | null = null;

    if (channelId) {
      // Dynamic creator passed explicitly from client
      targets = [
        {
          id: channelId,
          name: creatorNameFromQuery || "Unknown creator",
          channelId,
        },
      ];
    } else {
      // Fallback to static creators list
      targets = creatorId
        ? CREATORS.filter((c) => c.id === creatorId)
        : CREATORS;

      if (targets.length === 0) {
        return NextResponse.json(
          { error: `Creator "${creatorId}" not found` },
          { status: 404 },
        );
      }
    }

    const allSpots: Spot[] = [];

    for (const creator of targets) {
      // When fetching \"all\" static creators, reuse individual caches
      if (!channelId && !creatorId) {
        const creatorCache = await readCache(creator.id);
        if (isCacheValid(creatorCache)) {
          allSpots.push(...creatorCache.spots);
          continue;
        }
      }

      try {
        const spots = await fetchSpotsForCreator(
          creator.id,
          creator.name,
          creator.channelId,
        );
        allSpots.push(...spots);
        await writeCache(creator.id, spots);
      } catch (err) {
        console.error(`Failed to load spots for ${creator.name}:`, err);
      }
    }

    await writeCache(cacheKey, allSpots);

    return NextResponse.json({ spots: allSpots, fromCache: false });
  } catch (err: any) {
    console.error("Unhandled error in /api/spots:", err);
    return NextResponse.json(
      { error: err?.message || String(err) || "Unknown error" },
      { status: 500 },
    );
  }
}

