"use client";

import { useState, useEffect } from "react";
import Map from "@/components/Map";
import { CREATORS, type Creator, type CreatorCategory } from "@/lib/creators";
import type { Spot } from "@/app/api/spots/route";

const CATEGORIES: { id: CreatorCategory; label: string }[] = [
  { id: "foods", label: "Foods" },
  { id: "things-to-do", label: "Things to do" },
  { id: "secret-spots", label: "Secret spots" },
];

export default function Home() {
  const [category, setCategory] = useState<CreatorCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedCreatorId, setSelectedCreatorId] = useState<string | null>(null);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  const filteredCreators = CREATORS.filter((c) => {
    const matchCategory = category === "all" || c.category === category;
    const matchSearch =
      !search || c.name.toLowerCase().includes(search.toLowerCase());
    return matchCategory && matchSearch;
  });

  useEffect(() => {
    if (selectedCreatorId) {
      setLoading(true);
      setError(null);
      fetch(`/api/spots?creatorId=${selectedCreatorId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.error) throw new Error(data.error);
          setSpots(data.spots || []);
          setHasLoaded(true);
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    } else {
      setSpots([]);
    }
  }, [selectedCreatorId]);

  const loadAllSpots = () => {
    setLoading(true);
    setError(null);
    setSelectedCreatorId(null);
    fetch("/api/spots")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setSpots(data.spots || []);
        setHasLoaded(true);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  return (
    <div className="flex flex-col h-screen">
      <header className="border-b border-stone-200 bg-white px-4 py-3 shrink-0">
        <h1 className="text-lg font-medium text-stone-800">
          Creator Spots Map
        </h1>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className="w-72 border-r border-stone-200 bg-white flex flex-col shrink-0">
          <div className="p-3 space-y-3">
            <input
              type="text"
              placeholder="Search creators..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
            />

            <div className="flex flex-wrap gap-1">
              <button
                onClick={loadAllSpots}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  !selectedCreatorId
                    ? "bg-amber-500 text-white"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
              >
                All spots
              </button>
              <span className="text-stone-300 text-xs self-center">|</span>
              <button
                onClick={() => setCategory("all")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  category === "all"
                    ? "bg-amber-500 text-white"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
              >
                All
              </button>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setCategory(cat.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    category === cat.id
                      ? "bg-amber-500 text-white"
                      : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-4">
            <p className="text-xs text-stone-500 mb-2 px-1">Select a creator</p>
            {filteredCreators.length === 0 ? (
              <p className="text-sm text-stone-500 px-1">
                No creators yet. Edit <code className="text-xs bg-stone-100 px-1 rounded">src/data/creators.json</code> to add your picks.
              </p>
            ) : (
            <ul className="space-y-0.5">
              {filteredCreators.map((creator) => (
                <CreatorItem
                  key={creator.id}
                  creator={creator}
                  selected={selectedCreatorId === creator.id}
                  onSelect={() =>
                    setSelectedCreatorId(
                      selectedCreatorId === creator.id ? null : creator.id
                    )
                  }
                />
              ))}
            </ul>
            )}
          </div>
        </aside>

        <main className="flex-1 flex flex-col min-w-0">
          {error && (
            <div className="px-4 py-2 bg-red-50 text-red-700 text-sm">
              {error}
            </div>
          )}
          {loading && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] px-4 py-2 bg-white rounded-lg shadow-lg text-sm text-stone-600">
              Loading spots...
            </div>
          )}
          <div className="flex-1 relative">
            {!loading && spots.length === 0 && !error && (
              <div className="absolute inset-0 flex items-center justify-center bg-stone-50/80 z-10">
                <p className="text-stone-500 text-sm">
                  {hasLoaded ? "No spots found in descriptions" : "Click All or select a creator to load spots"}
                </p>
              </div>
            )}
            <Map spots={spots} />
          </div>
        </main>
      </div>
    </div>
  );
}

function CreatorItem({
  creator,
  selected,
  onSelect,
}: {
  creator: Creator;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        onClick={onSelect}
        className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
          selected
            ? "bg-amber-50 text-amber-800 border border-amber-200"
            : "hover:bg-stone-50 text-stone-700"
        }`}
      >
        {creator.name}
      </button>
    </li>
  );
}
