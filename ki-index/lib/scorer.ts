export interface Weights {
  water: number;
  terrain: number;
  green: number;
  airQuality: number;
  quiet: number;
  geomagnetic: number;
}

export interface Breakdown {
  water: number | null;
  terrain: number | null;
  green: number | null;
  airQuality: number | null;
  quiet: number | null;
  geomagnetic: number | null;
}

export const DEFAULT_WEIGHTS: Weights = {
  water: 0.25,
  terrain: 0.20,
  green: 0.20,
  airQuality: 0.15,
  quiet: 0.15,
  geomagnetic: 0.05,
};

export function computeKiScore(breakdown: Breakdown, weights: Weights = DEFAULT_WEIGHTS): number {
  const keys = Object.keys(weights) as (keyof Weights)[];

  // Filter to available factors
  const available = keys.filter((k) => breakdown[k] !== null && breakdown[k] !== undefined);
  if (available.length === 0) return 0;

  // Sum weights of available factors
  const totalWeight = available.reduce((sum, k) => sum + weights[k], 0);

  // Weighted average, normalized
  const score = available.reduce((sum, k) => {
    const frac = weights[k] / totalWeight;
    return sum + frac * (breakdown[k] as number);
  }, 0);

  return Math.round(Math.max(0, Math.min(100, score)));
}

const FACTOR_LABELS: Record<keyof Breakdown, string> = {
  water: 'water proximity',
  terrain: 'terrain',
  green: 'green space',
  airQuality: 'air quality',
  quiet: 'quiet surroundings',
  geomagnetic: 'geomagnetic harmony',
};

export function generateExplanation(breakdown: Breakdown): string {
  const available = (Object.keys(breakdown) as (keyof Breakdown)[]).filter(
    (k) => breakdown[k] !== null && breakdown[k] !== undefined
  );

  if (available.length === 0) return 'Insufficient data to generate an explanation.';

  const sorted = [...available].sort((a, b) => (breakdown[b] as number) - (breakdown[a] as number));
  const top2 = sorted.slice(0, 2);
  const bottom2 = sorted.slice(-2).filter((k) => (breakdown[k] as number) < 50);

  let explanation = '';

  if (top2.length > 0) {
    const topLabels = top2.map((k) => FACTOR_LABELS[k]);
    explanation += `Strong ${topLabels.join(' and ')}`;
  }

  if (bottom2.length > 0 && bottom2[0] !== top2[0]) {
    const bottomLabels = bottom2.map((k) => FACTOR_LABELS[k]);
    explanation += `; lower scores for ${bottomLabels.join(' and ')}`;
  }

  explanation += '.';
  return explanation.charAt(0).toUpperCase() + explanation.slice(1);
}
