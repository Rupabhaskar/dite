export type ProteinEntry = { grams: number; note: string };
export type ProteinData = Record<string, ProteinEntry[]>;

export function getTodayKey(): string {
  const d = new Date();
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}
