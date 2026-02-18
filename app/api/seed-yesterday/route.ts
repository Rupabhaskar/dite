import { NextResponse } from "next/server";
import { getYesterdayKey } from "@/lib/storage";
import { getProteinData, saveProteinData } from "@/lib/firestore";
import type { ProteinEntry } from "@/lib/storage";

const YESTERDAY_ENTRIES: ProteinEntry[] = [
  { grams: 5, note: "morning" },
  { grams: 30, note: "afternoon" },
  { grams: 24, note: "evening" },
  { grams: 6, note: "night" },
];

export async function POST() {
  try {
    const yesterdayKey = getYesterdayKey();
    const data = await getProteinData();
    data[yesterdayKey] = YESTERDAY_ENTRIES;
    await saveProteinData(data);
    return NextResponse.json({
      ok: true,
      date: yesterdayKey,
      entries: YESTERDAY_ENTRIES,
      total: YESTERDAY_ENTRIES.reduce((s, e) => s + e.grams, 0),
    });
  } catch (err) {
    console.error("seed-yesterday error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
