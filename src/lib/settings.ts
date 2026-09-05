export type ClubSettings = {
  timeLimit: number;
  pointsLimit: number;
};

export const DEFAULT_SETTINGS: ClubSettings = {
  timeLimit: 90,
  pointsLimit: 12,
};

const STORAGE_KEY = "fencing-scorer:v1:settings";

function clampTimeLimit(value: number): number {
  const stepped = Math.round(value / 10) * 10;
  return Math.min(300, Math.max(60, stepped));
}

function clampPointsLimit(value: number): number {
  return Math.min(20, Math.max(5, Math.round(value)));
}

export function normalizeSettings(value: Partial<ClubSettings> | null | undefined): ClubSettings {
  const timeLimit = clampTimeLimit(Number(value?.timeLimit) || DEFAULT_SETTINGS.timeLimit);
  const pointsLimit = clampPointsLimit(Number(value?.pointsLimit) || DEFAULT_SETTINGS.pointsLimit);
  return { timeLimit, pointsLimit };
}

export function readSettings(): ClubSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return normalizeSettings(JSON.parse(raw) as Partial<ClubSettings>);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function writeSettings(settings: ClubSettings): ClubSettings {
  const next = normalizeSettings(settings);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota / private-mode failures.
  }
  return next;
}
