"use client";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
export function SailPositionMap({
  latitude,
  longitude,
  placeLabel,
  onPick,
}: {
  latitude: number | null;
  longitude: number | null;
  placeLabel?: string;
  onPick?: (lat: number, lon: number) => void;
}) {
  const [enabled, setEnabled] = useState(false),
    [error, setError] = useState("");
  const container = useRef<HTMLDivElement>(null),
    map = useRef<LeafletMap | null>(null),
    pick = useRef(onPick),
    marker = useRef<import("leaflet").Marker | null>(null);
  useEffect(() => {
    pick.current = onPick;
  }, [onPick]);
  useEffect(() => {
    if (!enabled || !container.current) return;
    let disposed = false;
    void import("leaflet")
      .then((L) => {
        if (disposed || !container.current) return;
        const m = L.map(container.current, { scrollWheelZoom: false }).setView(
          latitude != null && longitude != null
            ? [latitude, longitude]
            : [20, -30],
          latitude == null ? 2 : 7,
        );
        map.current = m;
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 18,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(m);
        const icon = L.divIcon({
          className: "sail-map-pin",
          html: '<span aria-hidden="true">●</span>',
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        if (latitude != null && longitude != null)
          marker.current = L.marker([latitude, longitude], {
            icon,
            alt: "Reported boat position",
          }).addTo(m);
        m.on("click", (event) => {
          if (!pick.current) return;
          const lat = Math.round(event.latlng.lat * 100000) / 100000,
            lon =
              Math.round(
                (((((event.latlng.lng + 180) % 360) + 360) % 360) - 180) *
                  100000,
              ) / 100000;
          pick.current(lat, lon);
        });
      })
      .catch(() => {
        if (!disposed)
          setError("The map could not load. You can still use the place name.");
      });
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
    // Coordinates are updated separately without resetting the map while the owner pans.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || map.current !== m) return;
      if (latitude == null || longitude == null) {
        marker.current?.remove();
        marker.current = null;
        return;
      }
      if (marker.current) marker.current.setLatLng([latitude, longitude]);
      else
        marker.current = L.marker([latitude, longitude], {
          icon: L.divIcon({
            className: "sail-map-pin",
            html: '<span aria-hidden="true">●</span>',
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          }),
          alt: "Reported boat position",
        }).addTo(m);
      if (!m.getBounds().contains([latitude, longitude]))
        m.setView([latitude, longitude], 7);
    });
    return () => {
      cancelled = true;
    };
  }, [latitude, longitude]);
  return (
    <div className="sail-map-wrap">
      {enabled ? (
        <div
          ref={container}
          className="sail-map"
          role="region"
          aria-label={
            placeLabel ? `Map: ${placeLabel}` : "Choose a position on the map"
          }
        />
      ) : (
        <button
          type="button"
          className="sail-map-load"
          onClick={() => setEnabled(true)}
        >
          <span aria-hidden="true">↗</span>
          <strong>{onPick ? "Open map to place a pin" : "Show map"}</strong>
          <small>OpenStreetMap</small>
        </button>
      )}
      {error ? <p role="status">{error}</p> : null}
    </div>
  );
}
