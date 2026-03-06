# Creator Spots Map

Find spots reviewed by your favorite YouTube creators. Spots are extracted from video descriptions and displayed on a map.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `.env.local` with your YouTube API key:
   ```
   YOUTUBE_API_KEY=your_key_here
   ```
   Get a key from [Google Cloud Console](https://console.cloud.google.com/apis/credentials). Enable "YouTube Data API v3".

3. Add creators to `src/data/creators.json` (see `src/data/creators_example.json` for format).

4. Run the dev server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000)

## How it works

- **YouTube API**: Fetches video descriptions from creator channels (free tier: 10,000 units/day)
- **Geocoding**: Uses Nominatim (OpenStreetMap) — completely free, no API key needed
- **Map**: Leaflet + OpenStreetMap tiles — free
- **Cache**: Results are cached in `.cache/spots/` for 24 hours so you don't re-fetch on every reload. Force refresh with `?refresh=true` appended to the API URL.

## Adding creators

Edit `src/data/creators.json`:

```json
[
  {
    "id": "markwiens",
    "name": "Mark Wiens",
    "channelId": "UCyEd6QBSgat5kkC6svyAjCw",
    "category": "foods"
  }
]
```

Categories: `foods`, `things-to-do`, `secret-spots`

Find a channel ID from its YouTube URL (`youtube.com/channel/UC...`) or use [commentpicker.com/youtube-channel-id.php](https://commentpicker.com/youtube-channel-id.php) for handle-based URLs.

## Cache

Spot data is cached in `.cache/spots/` (gitignored). Default TTL is 24 hours. Override with:
```
SPOT_CACHE_TTL_MS=3600000
```
in `.env.local`.
