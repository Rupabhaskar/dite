import { NextResponse } from "next/server";
import { getYesterdayKey } from "@/lib/storage";
import { getProteinData, saveProteinData } from "@/lib/firestore";
import type { ProteinEntry } from "@/lib/storage";

const DEFAULT_ENTRIES: ProteinEntry[] = [
  { grams: 30, note: "afternoon" },
  { grams: 25, note: "evening" },
  { grams: 5, note: "night" }, 
];

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function parseEntries(raw: unknown): ProteinEntry[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ProteinEntry[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== "object") return null;
    const grams = Number((item as { grams?: unknown }).grams);
    const note = typeof (item as { note?: unknown }).note === "string"
      ? (item as { note: string }).note
      : "";
    if (!Number.isFinite(grams) || grams < 0) return null;
    out.push({ grams: Math.round(grams), note });
  }
  return out;
}

export async function POST(request: Request) {
  try {
    let dateKey = getYesterdayKey();
    let entries: ProteinEntry[] = DEFAULT_ENTRIES;

    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => null);
      if (body && typeof body === "object") {
        if (typeof (body as { date?: unknown }).date === "string") {
          const d = (body as { date: string }).date.trim();
          if (isValidDate(d)) dateKey = d;
        }
        const parsed = parseEntries((body as { entries?: unknown }).entries);
        if (parsed !== null && parsed.length > 0) entries = parsed;
      }
    }

    const data = await getProteinData();
    data[dateKey] = entries;
    await saveProteinData(data);

    const total = entries.reduce((s, e) => s + e.grams, 0);
    return NextResponse.json({
      ok: true,
      date: dateKey,
      entries,
      total,
    });
  } catch (err) {
    console.error("seed-yesterday error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
