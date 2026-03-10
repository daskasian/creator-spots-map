"use client";

import type { Spot } from "../api/spots/route";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";

const defaultCenter: [number, number] = [51.509865, -0.118092]; // London as a sensible default

const spotIcon = L.divIcon({
  className: "spot-marker",
  html: '<span style="background:#fbbf24;border-radius:9999px;width:14px;height:14px;display:block;border:2px solid #92400e;"></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

interface MapProps {
  spots: Spot[];
}

export default function Map({ spots }: MapProps) {
  const center: [number, number] =
    spots.length > 0
      ? [spots[0].lat, spots[0].lng]
      : defaultCenter;

  return (
    <MapContainer
      center={center}
      zoom={12}
      className="h-full w-full"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {spots.map((spot) => (
        <Marker
          key={spot.id}
          position={[spot.lat, spot.lng]}
          icon={spotIcon}
        >
          <Popup>
            <div className="space-y-1">
              <p className="font-medium text-sm">{spot.name}</p>
              <p className="text-xs text-stone-500">{spot.creatorName}</p>
              <a
                href={`https://www.youtube.com/watch?v=${spot.videoId}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-amber-600 hover:underline"
              >
                {spot.videoTitle}
              </a>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

