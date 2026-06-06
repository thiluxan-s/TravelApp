'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { env } from '@/lib/env.client';
import type { Segment } from '@/lib/db/schema';

type HoverDetail = { segmentId: string; active: boolean };

export function TripMap({ segments }: { segments: Segment[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  // keys: "${segmentId}::start" | "${segmentId}::end" | "${segmentId}::hotel"
  const markersRef = useRef<Map<string, { marker: mapboxgl.Marker; el: HTMLElement }>>(new Map());
  const [mapLoaded, setMapLoaded] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  // Initialise map once on mount
  useEffect(() => {
    if (!containerRef.current) return;
    mapboxgl.accessToken = env.NEXT_PUBLIC_MAPBOX_TOKEN;
    const m = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [0, 20],
      zoom: 1.5,
    });
    m.on('load', () => setMapLoaded(true));
    mapRef.current = m;
    return () => {
      m.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, []);

  // Render pins + connecting line whenever segments or mapLoaded changes
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapLoaded) return;

    // Remove existing markers
    markersRef.current.forEach(({ marker }) => marker.remove());
    markersRef.current.clear();

    // Remove existing route layer/source
    if (m.getLayer('route-line')) m.removeLayer('route-line');
    if (m.getSource('route')) m.removeSource('route');

    const coords: [number, number][] = [];

    for (const seg of segments) {
      const startLat = seg.startLat != null ? parseFloat(seg.startLat) : null;
      const startLng = seg.startLng != null ? parseFloat(seg.startLng) : null;
      const endLat = seg.endLat != null ? parseFloat(seg.endLat) : null;
      const endLng = seg.endLng != null ? parseFloat(seg.endLng) : null;

      if (seg.type === 'flight') {
        if (startLat != null && startLng != null) {
          const el = makeMarkerEl('flight');
          const marker = new mapboxgl.Marker({ element: el })
            .setLngLat([startLng, startLat])
            .addTo(m);
          markersRef.current.set(`${seg.id}::start`, { marker, el });
          coords.push([startLng, startLat]);
        }
        if (endLat != null && endLng != null) {
          const el = makeMarkerEl('flight');
          const marker = new mapboxgl.Marker({ element: el })
            .setLngLat([endLng, endLat])
            .addTo(m);
          markersRef.current.set(`${seg.id}::end`, { marker, el });
          coords.push([endLng, endLat]);
        }
      } else {
        // hotel_stay: single pin at startLat/startLng
        if (startLat != null && startLng != null) {
          const el = makeMarkerEl('hotel');
          const marker = new mapboxgl.Marker({ element: el })
            .setLngLat([startLng, startLat])
            .addTo(m);
          markersRef.current.set(`${seg.id}::hotel`, { marker, el });
          coords.push([startLng, startLat]);
        }
      }
    }

    // Draw straight connecting line through all pin coords in order
    if (coords.length > 1) {
      m.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: coords },
        },
      });
      m.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        paint: { 'line-color': '#3b82f6', 'line-width': 1.5, 'line-dasharray': [2, 2] },
      });
    }

    // Fit map bounds to all visible pins
    if (coords.length === 1) {
      m.flyTo({ center: coords[0], zoom: 11, duration: 500 });
    } else if (coords.length > 1) {
      const bounds = coords.reduce(
        (b, c) => b.extend(c as mapboxgl.LngLatLike),
        new mapboxgl.LngLatBounds(coords[0], coords[0]),
      );
      m.fitBounds(bounds, { padding: 60, maxZoom: 12, duration: 500 });
    }
  }, [segments, mapLoaded]);

  // Apply / remove highlight styles when highlightedId changes
  useEffect(() => {
    markersRef.current.forEach(({ el }, key) => {
      const segId = key.split('::')[0];
      if (highlightedId && segId === highlightedId) {
        el.style.transform = 'scale(1.6)';
        el.style.boxShadow = '0 0 0 3px rgba(255,255,255,0.6)';
      } else {
        el.style.transform = 'scale(1)';
        el.style.boxShadow = 'none';
      }
    });
  }, [highlightedId]);

  // Listen for segment-hover custom DOM events from SegmentWrapper
  useEffect(() => {
    function handleHover(e: Event) {
      const { segmentId, active } = (e as CustomEvent<HoverDetail>).detail;
      setHighlightedId(active ? segmentId : null);
    }
    window.addEventListener('segment-hover', handleHover);
    return () => window.removeEventListener('segment-hover', handleHover);
  }, []);

  const hasCoords = segments.some((s) => s.startLat != null || s.endLat != null);

  return (
    <div className="relative h-full min-h-[400px] overflow-hidden rounded-lg border border-border">
      <div ref={containerRef} className="h-full w-full" />
      {!hasCoords && segments.length > 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="rounded-md bg-background/80 px-3 py-1.5 text-xs text-muted-foreground">
            No location data for this day
          </p>
        </div>
      )}
    </div>
  );
}

function makeMarkerEl(type: 'flight' | 'hotel'): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = [
    'width: 14px',
    'height: 14px',
    'border-radius: 50%',
    'border: 2px solid #09090b',
    `background: ${type === 'hotel' ? '#a855f7' : '#3b82f6'}`,
    'transition: transform 150ms ease, box-shadow 150ms ease',
    'cursor: default',
  ].join(';');
  return el;
}
