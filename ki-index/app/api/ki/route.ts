import { NextRequest, NextResponse } from 'next/server';
import { cacheGet, cacheSet } from '@/lib/cache';
import { computeKiScore, generateExplanation, DEFAULT_WEIGHTS, Breakdown } from '@/lib/scorer';

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function timeout(ms: number): AbortController {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller;
}

async function fetchGreenSpace(lat: number, lng: number): Promise<number | null> {
  try {
    const query = `[out:json][timeout:10];
(
  node["leisure"="park"](around:500,${lat},${lng});
  way["leisure"="park"](around:500,${lat},${lng});
  relation["leisure"="park"](around:500,${lat},${lng});
  node["natural"="wood"](around:500,${lat},${lng});
  way["natural"="wood"](around:500,${lat},${lng});
  node["landuse"="forest"](around:500,${lat},${lng});
  way["landuse"="forest"](around:500,${lat},${lng});
);
out count;`;
    const ctrl = timeout(10000);
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
      cache: 'no-store',
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const count = data?.elements?.[0]?.tags?.total ?? data?.elements?.length ?? 0;
    return Math.min(100, (count / 5) * 100);
  } catch {
    return null;
  }
}

async function fetchWaterProximity(lat: number, lng: number): Promise<number | null> {
  try {
    const query = `[out:json][timeout:10];
(
  node["natural"="water"](around:1000,${lat},${lng});
  way["natural"="water"](around:1000,${lat},${lng});
  node["waterway"="river"](around:1000,${lat},${lng});
  way["waterway"="river"](around:1000,${lat},${lng});
  node["natural"="coastline"](around:1000,${lat},${lng});
  way["natural"="coastline"](around:1000,${lat},${lng});
);
out geom;`;
    const ctrl = timeout(10000);
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
      cache: 'no-store',
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const elements = data?.elements ?? [];
    if (elements.length === 0) return 0;

    // Find nearest distance
    let minDist = 1000;
    for (const el of elements) {
      const pts: { lat: number; lon: number }[] = [];
      if (el.lat && el.lon) pts.push({ lat: el.lat, lon: el.lon });
      if (el.geometry) pts.push(...el.geometry);
      for (const pt of pts) {
        const d = haversine(lat, lng, pt.lat, pt.lon);
        if (d < minDist) minDist = d;
      }
    }
    return Math.max(0, Math.min(100, ((1000 - minDist) / 1000) * 100));
  } catch {
    return null;
  }
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function offsetLatLng(lat: number, lng: number, distM: number, bearingDeg: number): [number, number] {
  const R = 6371000;
  const d = distM / R;
  const b = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lng * Math.PI) / 180;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lon2 = lon1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return [(lat2 * 180) / Math.PI, (lon2 * 180) / Math.PI];
}

async function fetchTerrain(lat: number, lng: number): Promise<number | null> {
  try {
    const bearings = [0, 45, 90, 135, 180, 225, 270, 315];
    const ringPoints = bearings.map((b) => offsetLatLng(lat, lng, 300, b));
    const allPoints = [[lat, lng], ...ringPoints];
    const locations = allPoints.map(([la, lo]) => ({ latitude: la, longitude: lo }));

    const ctrl = timeout(10000);
    const res = await fetch('https://api.open-elevation.com/api/v1/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations }),
      cache: 'no-store',
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const results: { elevation: number }[] = data?.results ?? [];
    if (results.length < 9) return null;

    // North points: 0 (N), 1 (NE), 7 (NW) — indices 1, 2, 8 in allPoints (0=center)
    const northElevs = [results[1].elevation, results[2].elevation, results[8].elevation];
    // South points: 4 (S), 3 (SE), 5 (SW) — indices 5, 4, 6
    const southElevs = [results[5].elevation, results[4].elevation, results[6].elevation];

    const avgNorth = northElevs.reduce((a, b) => a + b, 0) / northElevs.length;
    const avgSouth = southElevs.reduce((a, b) => a + b, 0) / southElevs.length;

    const diff = avgNorth - avgSouth; // positive = mountain backing (good feng shui)
    // Normalize: diff range roughly -100 to +100m → 0-100 score
    const score = 50 + (diff / 100) * 50;
    return Math.max(0, Math.min(100, score));
  } catch {
    return null;
  }
}

async function fetchAirQuality(lat: number, lng: number): Promise<number | null> {
  const apiKey = process.env.OPENWEATHERMAP_API_KEY;
  if (!apiKey) return null;
  try {
    const ctrl = timeout(10000);
    const res = await fetch(
      `http://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lng}&appid=${apiKey}`,
      { cache: 'no-store', signal: ctrl.signal }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const aqi: number = data?.list?.[0]?.main?.aqi;
    if (!aqi) return null;
    // AQI 1=100, AQI 5=0
    return Math.max(0, Math.min(100, ((5 - aqi) / 4) * 100));
  } catch {
    return null;
  }
}

async function fetchQuiet(lat: number, lng: number): Promise<number | null> {
  try {
    const query = `[out:json][timeout:10];
(
  way["highway"="motorway"](around:2000,${lat},${lng});
  way["highway"="trunk"](around:2000,${lat},${lng});
  way["highway"="primary"](around:2000,${lat},${lng});
);
out geom;`;
    const ctrl = timeout(10000);
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
      cache: 'no-store',
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const elements = data?.elements ?? [];
    if (elements.length === 0) return 100;

    let minDist = 2000;
    for (const el of elements) {
      const pts: { lat: number; lon: number }[] = el.geometry ?? [];
      for (const pt of pts) {
        const d = haversine(lat, lng, pt.lat, pt.lon);
        if (d < minDist) minDist = d;
      }
    }
    return Math.max(0, Math.min(100, (minDist / 2000) * 100));
  } catch {
    return null;
  }
}

async function fetchGeomagnetic(lat: number, lng: number): Promise<number | null> {
  try {
    const ctrl = timeout(10000);
    const url = `https://www.ngdc.noaa.gov/geomag-web/calculators/calculateIgrfwmm?lat=${lat}&lon=${lng}&resultFormat=json`;
    const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
    if (!res.ok) return null;
    const data = await res.json();
    const intensity: number = data?.result?.[0]?.totalintensity;
    if (intensity == null) return null;
    // Normalize 25000-65000 nT → 0-100
    return Math.max(0, Math.min(100, ((intensity - 25000) / 40000) * 100));
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get('lat') ?? '');
  const lng = parseFloat(searchParams.get('lng') ?? '');

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 });
  }

  const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const cached = cacheGet<object>(cacheKey);
  if (cached) return NextResponse.json(cached);

  const [green, water, terrain, airQuality, quiet, geomagnetic] = await Promise.all([
    fetchGreenSpace(lat, lng),
    fetchWaterProximity(lat, lng),
    fetchTerrain(lat, lng),
    fetchAirQuality(lat, lng),
    fetchQuiet(lat, lng),
    fetchGeomagnetic(lat, lng),
  ]);

  const breakdown: Breakdown = { water, terrain, green, airQuality, quiet, geomagnetic };

  const kiScore = computeKiScore(breakdown, DEFAULT_WEIGHTS);
  const explanation = generateExplanation(breakdown);

  const dataAvailable = {
    water: water !== null,
    terrain: terrain !== null,
    green: green !== null,
    airQuality: airQuality !== null,
    quiet: quiet !== null,
    geomagnetic: geomagnetic !== null,
  };

  const result = {
    lat,
    lng,
    kiScore,
    breakdown: {
      water: water ?? 0,
      terrain: terrain ?? 0,
      green: green ?? 0,
      airQuality: airQuality ?? 0,
      quiet: quiet ?? 0,
      geomagnetic: geomagnetic ?? 0,
    },
    dataAvailable,
    explanation,
  };

  cacheSet(cacheKey, result, CACHE_TTL);
  return NextResponse.json(result);
}
