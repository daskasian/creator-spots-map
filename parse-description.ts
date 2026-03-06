/**
 * Extract place names from YouTube video descriptions.
 *
 * Handles the wide variety of formats travel/food creators use:
 *   - Timestamp lines:   "0:00 Jay Fai, Bangkok"
 *   - Pin emoji:         "📍 Som Tam Nua, Silom"
 *   - Address prefix:    "Address: 123 Thanon Charoen Krung"
 *   - Numbered lists:    "1. Din Tai Fung, Xinyi"
 *   - Dash/arrow lists:  "- Tsukiji Outer Market"  "→ Night Market"
 *   - Bracket labels:    "[Restaurant] Jiro Dreams of Sushi"
 *   - Bold markdown:     "**Place Name**"
 *   - All-caps headings: "BANGKOK STREET FOOD"
 *   - "Location:" prefix: "Location: Penang, Malaysia"
 *
 * Returns candidates ranked by confidence (high → low).
 */

export interface PlaceCandidate {
  text: string;
  confidence: "high" | "medium" | "low";
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Words that almost never form useful geocodable place names */
const JUNK_WORDS = new Set([
  "subscribe", "instagram", "twitter", "facebook", "tiktok", "patreon",
  "merch", "discount", "affiliate", "sponsored", "promo", "code", "link",
  "click", "here", "watch", "video", "channel", "playlist", "comment",
  "like", "share", "follow", "follow me", "check out", "thank you", "thanks",
  "intro", "outro", "music", "editing", "filmed", "camera", "gear",
  "vpn", "app", "website", "blog", "podcast", "newsletter",
]);

/** Common geocodable suffixes that strongly suggest a real place */
const PLACE_SUFFIXES = [
  /\b(restaurant|cafe|café|bar|market|temple|shrine|park|beach|street|road|avenue|district|quarter|village|town|city|island|mountain|river|lake|museum|hotel|hostel|guesthouse|mall|plaza|square|station|airport|port|harbour|harbor)\b/i,
];

/** Country and major city names (partial list for scoring) */
const GEO_TERMS = new Set([
  "bangkok", "tokyo", "osaka", "kyoto", "seoul", "taipei", "hong kong",
  "singapore", "kuala lumpur", "jakarta", "bali", "penang", "hanoi",
  "ho chi minh", "saigon", "phnom penh", "yangon", "chiang mai",
  "mumbai", "delhi", "kathmandu", "colombo", "dhaka",
  "cairo", "marrakech", "nairobi", "cape town", "accra", "lagos",
  "paris", "rome", "madrid", "barcelona", "lisbon", "amsterdam",
  "berlin", "prague", "budapest", "istanbul", "athens",
  "london", "edinburgh", "dublin",
  "new york", "los angeles", "chicago", "miami", "new orleans",
  "mexico city", "oaxaca", "havana", "lima", "bogota", "buenos aires",
  "sydney", "melbourne", "auckland",
  "thailand", "japan", "korea", "taiwan", "china", "vietnam",
  "cambodia", "myanmar", "malaysia", "indonesia", "philippines",
  "india", "nepal", "sri lanka", "bangladesh",
  "egypt", "morocco", "kenya", "tanzania", "ghana", "nigeria",
  "france", "italy", "spain", "portugal", "germany", "greece", "turkey",
  "usa", "mexico", "peru", "colombia", "argentina", "brazil",
  "australia", "new zealand",
]);

function hasGeoTerm(text: string): boolean {
  const lower = text.toLowerCase();
  for (const term of GEO_TERMS) {
    if (lower.includes(term)) return true;
  }
  return false;
}

function hasPlaceSuffix(text: string): boolean {
  return PLACE_SUFFIXES.some((re) => re.test(text));
}

function isJunk(text: string): boolean {
  const lower = text.toLowerCase();
  // Contains a URL
  if (/https?:\/\/|bit\.ly|youtu\.be/i.test(lower)) return true;
  // Mostly numbers / punctuation
  if (/^[\d\s\-_,.:/\\@#$%^&*()+=[\]{}|<>?!'"]+$/.test(text)) return true;
  // Looks like a social handle
  if (/^@\w+/.test(text)) return true;
  // Contains junk keyword
  for (const word of JUNK_WORDS) {
    if (lower.includes(word)) return true;
  }
  // All caps AND longer than a typical place name acronym → likely a heading/promo
  if (text === text.toUpperCase() && text.length > 25) return true;
  return false;
}

function cleanLine(line: string): string {
  return line
    // Remove timestamp prefix: "0:00 -", "1:23:45 –"
    .replace(/^\d{1,2}:\d{2}(?::\d{2})?\s*[-–—:]\s*/i, "")
    // Remove emoji prefixes
    .replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]+\s*/u, "")
    // Remove label prefixes
    .replace(/^(location|address|spot|place|restaurant|cafe|café|bar|shop|visit|stop|day\s*\d+)\s*[:\-–—]\s*/i, "")
    // Remove numbered list markers: "1.", "1)", "#1"
    .replace(/^#?\d+[.)]\s*/i, "")
    // Remove bullet/arrow markers
    .replace(/^[-–—→►▶•·▪️🔹]\s*/i, "")
    // Remove bracket labels: "[Food]", "(Optional)"
    .replace(/^\[.*?\]\s*/i, "")
    .replace(/^\(.*?\)\s*/i, "")
    // Remove bold markdown
    .replace(/\*\*(.*?)\*\*/g, "$1")
    // Remove trailing hashtags/mentions
    .replace(/\s+#\w+/g, "")
    .replace(/\s+@\w+/g, "")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function extractPlaceCandidates(description: string): string[] {
  const rawCandidates = extractWithConfidence(description);
  // Return high/medium first, deduplicated, limited to 20
  return rawCandidates
    .filter((c) => c.confidence !== "low")
    .concat(rawCandidates.filter((c) => c.confidence === "low"))
    .map((c) => c.text)
    .slice(0, 20);
}

export function extractWithConfidence(description: string): PlaceCandidate[] {
  const seen = new Set<string>();
  const candidates: PlaceCandidate[] = [];

  function addCandidate(text: string, confidence: PlaceCandidate["confidence"]) {
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    if (text.length < 4 || text.length > 120) return;
    if (isJunk(text)) return;
    seen.add(key);
    candidates.push({ text, confidence });
  }

  const lines = description
    .split(/[\n\r]+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 3);

  for (const rawLine of lines) {
    // ── HIGH confidence: explicit location signals ──

    // 📍 pin emoji line
    if (/^[\p{Emoji_Presentation}]*📍/u.test(rawLine)) {
      const c = cleanLine(rawLine);
      if (c) addCandidate(c, "high");
      continue;
    }

    // "Location:", "Address:", "Where:", "Find us at:"
    if (/^(location|address|where|find us at|visit us at)\s*[:\-–]/i.test(rawLine)) {
      const c = cleanLine(rawLine);
      if (c) addCandidate(c, "high");
      continue;
    }

    // Timestamp line with a non-trivial name: "0:00 Jay Fai, Bangkok"
    if (/^\d{1,2}:\d{2}/.test(rawLine)) {
      const c = cleanLine(rawLine);
      if (c.length > 4 && !/^\d/.test(c)) {
        // Contains a comma (Name, City) or geo term → high, else medium
        const conf = (c.includes(",") || hasGeoTerm(c)) ? "high" : "medium";
        addCandidate(c, conf);
      }
      continue;
    }

    // ── MEDIUM confidence: structural/list signals ──

    const cleaned = cleanLine(rawLine);
    if (!cleaned || cleaned.length < 4) continue;

    // Was a numbered/bulleted list item
    const wasList =
      /^#?\d+[.)]\s/.test(rawLine) ||
      /^[-–—→►▶•·▪️🔹]\s/.test(rawLine);

    if (wasList) {
      if (isJunk(cleaned)) continue;
      const conf = (cleaned.includes(",") || hasGeoTerm(cleaned) || hasPlaceSuffix(cleaned))
        ? "high"
        : "medium";
      addCandidate(cleaned, conf);
      continue;
    }

    // ── LOW confidence: lines that just contain geo terms ──
    if (hasGeoTerm(cleaned) || hasPlaceSuffix(cleaned)) {
      if (!isJunk(cleaned) && cleaned.length < 80) {
        addCandidate(cleaned, "low");
      }
    }
  }

  return candidates;
}
