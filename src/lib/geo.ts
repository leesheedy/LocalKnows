import type { Locality } from './types';

const EARTH_KM = 6371;

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

export interface Neighbour {
  locality: Locality;
  distanceKm: number;
  crossesBorder: boolean;
}

/**
 * Nearest localities by great circle distance.
 *
 * `crossBorderBias` deliberately promotes the other state. Albury linking to
 * Wodonga is the whole product thesis, so the link block must not be allowed to
 * fill up with six NSW suburbs before it reaches the river.
 */
export function nearestLocalities(
  origin: Locality,
  pool: Locality[],
  limit: number,
  crossBorderBias = 0.75,
): Neighbour[] {
  return pool
    .filter((l) => l.id !== origin.id)
    .map((l) => {
      const raw = distanceKm(origin, l);
      const crossesBorder = l.state !== origin.state;
      return { locality: l, distanceKm: raw, crossesBorder, sort: crossesBorder ? raw * crossBorderBias : raw };
    })
    .sort((a, b) => a.sort - b.sort)
    .slice(0, limit)
    .map(({ locality, distanceKm: d, crossesBorder }) => ({
      locality,
      distanceKm: Math.round(d * 10) / 10,
      crossesBorder,
    }));
}
