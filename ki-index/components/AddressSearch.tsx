'use client';

import React, { useState, FormEvent } from 'react';

interface Props {
  onSelect: (lat: number, lng: number, label: string) => void;
}

export default function AddressSearch({ onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!data || data.length === 0) {
        setError('No results found.');
        return;
      }
      const result = data[0];
      onSelect(parseFloat(result.lat), parseFloat(result.lon), result.display_name);
    } catch {
      setError('Search failed. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] w-96 max-w-[90vw]">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a location…"
          className="flex-1 px-4 py-2 rounded-xl shadow-lg border border-gray-200 bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg text-sm font-semibold disabled:opacity-60 transition-colors"
        >
          {loading ? '…' : 'Go'}
        </button>
      </form>
      {error && (
        <p className="mt-1 text-xs text-red-500 bg-white rounded-lg px-3 py-1 shadow">{error}</p>
      )}
    </div>
  );
}
