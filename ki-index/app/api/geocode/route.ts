import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');
  if (!q) return NextResponse.json({ error: 'q is required' }, { status: 400 });

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`,
      {
        cache: 'no-store',
        headers: { 'User-Agent': 'KiIndex/1.0' },
      }
    );
    if (!res.ok) return NextResponse.json({ error: 'Geocoding failed' }, { status: 502 });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
