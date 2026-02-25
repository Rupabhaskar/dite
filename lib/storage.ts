const CACHE_KEY = "protein200challenge_cache";

export type ProteinEntry = {
  grams: number;
  note: string;
  calories?: number;
  fiber?: number;
};
export type ProteinData = Record<string, ProteinEntry[]>;

export function getCachedProteinData(): ProteinData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProteinData;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function setCachedProteinData(data: ProteinData): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

export function getTodayKey(): string {
  const d = new Date();
  return formatDateKey(d);
}

export function getYesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return formatDateKey(d);
}

function formatDateKey(d: Date): string {
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}
