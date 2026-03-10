"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { CREATORS, type Creator, type CreatorCategory } from "../creators";
import type { Spot } from "./api/spots/route";

const Map = dynamic(() => import("./components/Map"), { ssr: false });

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

  // Load spots for the currently selected creator
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

  // On first visit, show all spots for favourite creators
  useEffect(() => {
    void loadAllSpots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-stone-50">
      {/* Map fills the screen */}
      <div className="absolute inset-0">
        <Map spots={spots} />
      </div>

      {/* Top bar with title and creator search */}
      <div className="fixed top-4 left-1/2 z-40 w-full max-w-3xl -translate-x-1/2 px-4">
        <div className="flex items-center justify-between gap-3 rounded-xl bg-white/90 px-4 py-2 shadow-md backdrop-blur">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-stone-800">
              Creator Spots Map
            </span>
          </div>
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search followed creators or discover more..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-stone-200 px-3 py-1.5 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
            />
            {search && filteredCreators.length > 0 && (
              <div className="absolute left-0 right-0 top-9 max-h-64 overflow-y-auto rounded-md border border-stone-200 bg-white shadow-lg">
                <ul className="py-1">
                  {filteredCreators.map((creator) => (
                    <li key={creator.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCreatorId(creator.id);
                          setSearch(creator.name);
                        }}
                        className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm text-stone-700 hover:bg-stone-50"
                      >
                        <span>{creator.name}</span>
                        <span className="text-[11px] uppercase tracking-wide text-stone-400">
                          {creator.category.replace(/-/g, " ")}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Category filters in the top-right corner */}
      <div className="fixed right-4 top-4 z-40">
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap justify-end gap-1 rounded-xl bg-white/90 px-3 py-2 shadow-md backdrop-blur">
            <button
              type="button"
              onClick={() => setCategory("all")}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
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
                type="button"
                onClick={() => setCategory(cat.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                  category === cat.id
                    ? "bg-amber-500 text-white"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={loadAllSpots}
            className="rounded-full bg-amber-500 px-3 py-1.5 text-xs font-medium text-white shadow-md hover:bg-amber-600"
          >
            All spots
          </button>
        </div>
      </div>

      {/* Status overlays */}
      {error && (
        <div className="fixed left-1/2 top-24 z-50 -translate-x-1/2 px-4">
          <div className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700 shadow-md">
            {error}
          </div>
        </div>
      )}

      {loading && (
        <div className="fixed left-1/2 top-32 z-50 -translate-x-1/2 px-4">
          <div className="rounded-md bg-white px-4 py-2 text-sm text-stone-600 shadow-md">
            Loading spots...
          </div>
        </div>
      )}

      {!loading && spots.length === 0 && !error && (
        <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 px-4">
          <div className="rounded-full bg-white/90 px-4 py-2 text-xs text-stone-600 shadow-md backdrop-blur">
            {hasLoaded
              ? "No spots found in descriptions for these videos."
              : "You’re on the map — search a creator or tap All spots to get started."}
          </div>
        </div>
      )}
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

