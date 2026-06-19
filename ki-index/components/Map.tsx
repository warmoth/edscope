'use client';

import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import AddressSearch from './AddressSearch';
import ScoreCard from './ScoreCard';

// Fix default leaflet marker icons
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface KiResult {
  lat: number;
  lng: number;
  kiScore: number;
  breakdown: Record<string, number>;
  dataAvailable: Record<string, boolean>;
  explanation: string;
}

interface MapClickHandlerProps {
  onMapClick: (lat: number, lng: number) => void;
}

function MapClickHandler({ onMapClick }: MapClickHandlerProps) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

interface FlyToProps {
  lat: number;
  lng: number;
}

function FlyTo({ lat, lng }: FlyToProps) {
  const map = useMapEvents({});
  useEffect(() => {
    map.flyTo([lat, lng], 14);
  }, [lat, lng, map]);
  return null;
}

export default function Map() {
  const [pinPos, setPinPos] = useState<[number, number] | null>(null);
  const [kiResult, setKiResult] = useState<KiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function fetchKi(lat: number, lng: number) {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setPinPos([lat, lng]);
    setLoading(true);
    setKiResult(null);
    try {
      const res = await fetch(`/api/ki?lat=${lat}&lng=${lng}`, { signal: ctrl.signal });
      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      setKiResult(data);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        console.error(e);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleAddressSelect(lat: number, lng: number) {
    setFlyTarget([lat, lng]);
    fetchKi(lat, lng);
  }

  return (
    <div className="relative w-full h-screen">
      <MapContainer
        center={[37.5665, 126.978]}
        zoom={11}
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapClickHandler onMapClick={fetchKi} />
        {pinPos && <Marker position={pinPos} />}
        {flyTarget && <FlyTo lat={flyTarget[0]} lng={flyTarget[1]} />}
      </MapContainer>

      <AddressSearch onSelect={handleAddressSelect} />
      <ScoreCard result={kiResult} loading={loading} />
    </div>
  );
}
