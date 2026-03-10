import { NextRequest, NextResponse } from "next/server";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

interface ChannelSearchResult {
  channelId: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
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

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  if (!query || query.length < 2) {
    return NextResponse.json({ items: [] satisfies ChannelSearchResult[] });
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "channel");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", "8");
  url.searchParams.set("key", YOUTUBE_API_KEY);

  const res = await fetch(url.toString());
  if (!res.ok) {
    return NextResponse.json(
      { error: `YouTube search API error: ${res.status}` },
      { status: 502 },
    );
  }

  const data = await res.json();
  const items: ChannelSearchResult[] = (data.items ?? []).map((item: any) => ({
    channelId: item.id?.channelId as string,
    title: item.snippet?.title ?? "",
    description: item.snippet?.description ?? "",
    thumbnailUrl:
      item.snippet?.thumbnails?.default?.url ??
      item.snippet?.thumbnails?.high?.url ??
      null,
  }));

  return NextResponse.json({ items });
}

