'use client';

import React, { useState } from 'react';
import { Weights, DEFAULT_WEIGHTS, computeKiScore, Breakdown } from '@/lib/scorer';

interface KiResult {
  lat: number;
  lng: number;
  kiScore: number;
  breakdown: Record<string, number>;
  dataAvailable: Record<string, boolean>;
  explanation: string;
}

interface Props {
  result: KiResult | null;
  loading: boolean;
}

const FACTOR_LABELS: Record<string, string> = {
  water: 'Water',
  terrain: 'Terrain',
  green: 'Green Space',
  airQuality: 'Air Quality',
  quiet: 'Quiet',
  geomagnetic: 'Geomagnetic',
};

function scoreColor(score: number): string {
  if (score >= 70) return 'text-green-500';
  if (score >= 40) return 'text-yellow-500';
  return 'text-red-500';
}

function barColor(score: number): string {
  if (score >= 70) return 'bg-green-500';
  if (score >= 40) return 'bg-yellow-500';
  return 'bg-red-500';
}

export default function ScoreCard({ result, loading }: Props) {
  const [weightsOpen, setWeightsOpen] = useState(false);
  const [weights, setWeights] = useState<Weights>({ ...DEFAULT_WEIGHTS });

  const localScore = result
    ? computeKiScore(
        result.breakdown as unknown as Breakdown,
        weights
      )
    : null;

  const displayScore = localScore ?? result?.kiScore ?? null;

  function handleWeightChange(key: keyof Weights, val: number) {
    setWeights((prev) => ({ ...prev, [key]: val }));
  }

  if (loading) {
    return (
      <div className="absolute bottom-6 left-6 z-[1000] bg-white rounded-2xl shadow-xl p-6 w-80 flex items-center gap-3">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-gray-600 font-medium">Calculating Ki Index…</span>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="absolute bottom-6 left-6 z-[1000] bg-white rounded-2xl shadow-xl p-6 w-80">
        <h2 className="text-xl font-bold text-gray-800 mb-1">Ki Index</h2>
        <p className="text-gray-500 text-sm">Click anywhere on the map to calculate the environmental harmony score for that location.</p>
      </div>
    );
  }

  return (
    <div className="absolute bottom-6 left-6 z-[1000] bg-white rounded-2xl shadow-xl p-6 w-80 max-h-[85vh] overflow-y-auto">
      {/* Big score */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Ki Index</h2>
          <p className="text-xs text-gray-400">{result.lat.toFixed(4)}, {result.lng.toFixed(4)}</p>
        </div>
        <div className={`text-5xl font-black ${scoreColor(displayScore ?? 0)}`}>
          {displayScore}
        </div>
      </div>

      {/* Explanation */}
      <p className="text-sm text-gray-600 mb-4 italic">{result.explanation}</p>

      {/* Factor bars */}
      <div className="space-y-2 mb-4">
        {Object.keys(FACTOR_LABELS).map((key) => {
          const available = result.dataAvailable[key];
          const score = result.breakdown[key];
          return (
            <div key={key}>
              <div className="flex justify-between text-xs text-gray-600 mb-0.5">
                <span>{FACTOR_LABELS[key]}</span>
                <span>{available ? score : 'N/A'}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                {available ? (
                  <div
                    className={`h-full rounded-full ${barColor(score)} transition-all duration-500`}
                    style={{ width: `${score}%` }}
                  />
                ) : (
                  <div className="h-full rounded-full bg-gray-300 w-full" />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Weight sliders */}
      <button
        onClick={() => setWeightsOpen(!weightsOpen)}
        className="w-full text-left text-xs font-semibold text-blue-600 hover:text-blue-800 mb-2 flex items-center gap-1"
      >
        <span>{weightsOpen ? '▾' : '▸'}</span> Adjust Weights
      </button>

      {weightsOpen && (
        <div className="space-y-2 mb-4 p-3 bg-gray-50 rounded-xl">
          {(Object.keys(weights) as (keyof Weights)[]).map((key) => (
            <div key={key}>
              <div className="flex justify-between text-xs text-gray-600 mb-0.5">
                <span>{FACTOR_LABELS[key]}</span>
                <span>{weights[key].toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={0.5}
                step={0.01}
                value={weights[key]}
                onChange={(e) => handleWeightChange(key, parseFloat(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>
          ))}
          <button
            onClick={() => setWeights({ ...DEFAULT_WEIGHTS })}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            Reset to defaults
          </button>
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-gray-400 border-t pt-3 leading-relaxed">
        Ki Index — an Environmental Harmony Score inspired by traditional Korean geomancy (pungsu-jiri). Calculated from real environmental data (green space, water, terrain, air quality, noise). This is not a literal measurement of a metaphysical energy field.
      </p>
    </div>
  );
}
