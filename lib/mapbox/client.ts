import { env } from '@/lib/env.server';

type GeocodingResponse = {
  features: Array<{
    geometry: { type: string; coordinates: [number, number] };
  }>;
};

export async function geocode(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${env.MAPBOX_SECRET_TOKEN}&limit=1`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = (await response.json()) as GeocodingResponse;
    const first = data.features[0];
    if (!first) return null;
    const [lng, lat] = first.geometry.coordinates;
    if (lat === undefined || lng === undefined) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}
