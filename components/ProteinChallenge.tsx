"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getTodayKey,
  type ProteinData,
  type ProteinEntry,
} from "@/lib/storage";
import {
  getProteinData,
  saveProteinData,
  subscribeProteinData,
} from "@/lib/firestore";

function getLevel(total: number): string {
  if (total >= 80) return "bg-[#0d5c3d]";
  if (total >= 70) return "bg-[#1a7a4c]";
  if (total >= 60) return "bg-[#2d9d6b]";
  if (total >= 50) return "bg-[#3db87d]";
  if (total >= 40) return "bg-[#c45c5c]";
  if (total >= 30) return "bg-[#b83030]";
  if (total >= 20) return "bg-[#a02020]";
  if (total > 0) return "bg-[#a02020]";
  return "bg-[#2d3a4d]";
}

type GridDay = {
  key: string;
  dayNum: number;
  total: number;
  levelClass: string;
};

function buildGridDays(data: ProteinData): GridDay[] {
  const sortedDates = Object.keys(data).sort();
  const firstDate = sortedDates[0];
  let startDate: Date;
  if (firstDate) {
    startDate = new Date(firstDate + "T00:00:00");
  } else {
    startDate = new Date();
    startDate.setDate(startDate.getDate() - 199);
  }
  const days: GridDay[] = [];
  for (let i = 0; i < 200; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const key = `${y}-${m}-${day}`;
    const entries = data[key] || [];
    const total = entries.reduce((s, e) => s + (e.grams || 0), 0);
    days.push({
      key,
      dayNum: i + 1,
      total,
      levelClass: getLevel(total),
    });
  }
  return days;
}

export default function ProteinChallenge() {
  const [data, setData] = useState<ProteinData>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tooltip, setTooltip] = useState<{
    text: string;
    x: number;
    y: number;
    visible: boolean;
  }>({ text: "", x: 0, y: 0, visible: false });

  const todayKey = getTodayKey();
  const entries = (data[todayKey] || []) as ProteinEntry[];
  const todayTotal = entries.reduce((sum, e) => sum + (e.grams || 0), 0);
  const gridDays = buildGridDays(data);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    const init = async () => {
      try {
        const initial = await getProteinData();
        setData(initial);
        unsub = subscribeProteinData((next) => setData(next));
      } catch (err) {
        console.error("Failed to load protein data:", err);
      } finally {
        setLoading(false);
      }
    };
    init();
    return () => {
      unsub?.();
    };
  }, []);

  const persistToFirestore = useCallback(async (newData: ProteinData) => {
    setData(newData);
    setSaving(true);
    try {
      await saveProteinData(newData);
    } catch (err) {
      console.error("Failed to save:", err);
    } finally {
      setSaving(false);
    }
  }, []);

  const handleAdd = useCallback(
    (grams: number, note: string) => {
      const key = getTodayKey();
      const next = { ...data };
      if (!next[key]) next[key] = [];
      (next[key] as ProteinEntry[]).push({
        grams,
        note: note.trim(),
      });
      persistToFirestore(next);
    },
    [data, persistToFirestore]
  );

  const handleDelete = useCallback(
    (index: number) => {
      const key = getTodayKey();
      const next = { ...data };
      const list = (next[key] || []).filter((_, i) => i !== index);
      if (list.length) next[key] = list;
      else delete next[key];
      persistToFirestore(next);
    },
    [data, persistToFirestore]
  );

  if (loading) {
    return (
      <div className="max-w-[900px] mx-auto px-6 py-8 pb-12">
        <div className="text-center text-[var(--color-text-muted)]">
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[900px] mx-auto px-6 py-8 pb-12">
      <header className="text-center mb-10">
        <h1 className="text-[1.85rem] font-bold tracking-tight bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-dim)] bg-clip-text text-transparent">
          200 Day Protein Challenge
        </h1>
        <p className="text-[var(--color-text-muted)] text-[0.95rem] mt-1.5">
          Track your daily protein • Multiple entries per day
        </p>
      </header>

      <section className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-6 mb-6">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
          <span className="font-semibold text-lg text-[var(--color-text)]">
            Today · {todayKey}
          </span>
          <span className="text-2xl font-bold text-[var(--color-accent)]">
            Total: {todayTotal}
            <span className="text-sm font-normal text-[var(--color-text-muted)]">
              g protein
            </span>
            {saving && (
              <span className="ml-2 text-sm font-normal text-[var(--color-text-muted)]">
                Saving…
              </span>
            )}
          </span>
        </div>
        <AddForm onAdd={handleAdd} disabled={saving} />
        <ul className="list-none">
          {entries.map((e, i) => (
            <li
              key={i}
              className="flex justify-between items-center py-2.5 px-3.5 bg-[var(--color-bg-input)] rounded-lg mb-2 text-[0.95rem]"
            >
              <span className="font-semibold text-[var(--color-accent)]">
                {e.grams}g
              </span>
              <span className="text-[var(--color-text-muted)] text-[0.85rem]">
                {e.note || "—"}
              </span>
              <button
                type="button"
                aria-label="Delete"
                onClick={() => handleDelete(i)}
                disabled={saving}
                className="bg-transparent border-none text-[var(--color-text-muted)] cursor-pointer p-1 text-base leading-none rounded hover:text-[#e06060] hover:bg-[rgba(224,96,96,0.15)] transition-colors disabled:opacity-50"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold mb-4 text-[var(--color-text)]">
          200 Days at a Glance
        </h2>
        <div className="flex flex-wrap gap-x-4 gap-y-2 mb-4 text-[0.8rem] text-[var(--color-text-muted)]">
          <LegendItem color="#0d5c3d" label="80g+" />
          <LegendItem color="#1a7a4c" label="70g" />
          <LegendItem color="#2d9d6b" label="60g" />
          <LegendItem color="#3db87d" label="50g" />
          <LegendItem color="#c45c5c" label="40g" />
          <LegendItem color="#b83030" label="30g" />
          <LegendItem color="#a02020" label="20g" />
          <LegendItem color="#2d3a4d" label="No data" />
        </div>
        <div className="grid grid-cols-[repeat(20,1fr)] gap-1 mb-4 max-[600px]:grid-cols-10">
          {gridDays.map((day) => (
            <div
              key={day.key}
              className={`aspect-square rounded-md border border-[var(--color-border)] cursor-pointer transition-all hover:scale-[1.08] hover:shadow-lg hover:z-10 flex items-center justify-center min-w-0 text-[0.55rem] font-semibold ${day.total > 0 ? day.levelClass + " text-white/95" : "bg-[#2d3a4d] hover:bg-[#3d4a5d] text-transparent"}`}
              onMouseEnter={(e) => {
                setTooltip({
                  text: `Day ${day.dayNum} · ${day.key}${day.total ? ` · ${day.total}g` : " · No data"}`,
                  x: e.pageX + 10,
                  y: e.pageY + 10,
                  visible: true,
                });
              }}
              onMouseMove={(e) => {
                setTooltip((t) =>
                  t.visible ? { ...t, x: e.pageX + 10, y: e.pageY + 10 } : t
                );
              }}
              onMouseLeave={() => {
                setTooltip((t) => ({ ...t, visible: false }));
              }}
            >
              {day.total > 0 && <span>{day.total}g</span>}
            </div>
          ))}
        </div>
      </section>

      <div
        className="fixed pointer-events-none z-[100] rounded-lg px-3 py-2 text-sm bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-xl transition-opacity"
        style={{
          left: tooltip.x,
          top: tooltip.y,
          opacity: tooltip.visible ? 1 : 0,
        }}
      >
        {tooltip.text}
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-3 h-3 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

function AddForm({
  onAdd,
  disabled,
}: {
  onAdd: (grams: number, note: string) => void;
  disabled?: boolean;
}) {
  const [grams, setGrams] = useState("");
  const [note, setNote] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const g = parseInt(grams, 10);
    if (!g || g < 1) return;
    onAdd(g, note);
    setGrams("");
    setNote("");
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-3 flex-wrap mb-4">
      <input
        type="number"
        placeholder="grams"
        min={1}
        max={500}
        value={grams}
        onChange={(e) => setGrams(e.target.value)}
        className="w-[100px] py-2.5 px-3.5 bg-[var(--color-bg-input)] border border-[var(--color-border)] rounded-[10px] text-[var(--color-text)] text-[0.95rem] font-[inherit] focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[rgba(0,217,165,0.2)]"
      />
      <input
        type="text"
        placeholder="e.g. Breakfast, Shake, Dinner"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="flex-1 min-w-[120px] py-2.5 px-3.5 bg-[var(--color-bg-input)] border border-[var(--color-border)] rounded-[10px] text-[var(--color-text)] font-[inherit] text-[0.95rem] placeholder:text-[var(--color-text-muted)]"
      />
      <button
        type="submit"
        disabled={disabled}
        className="py-2.5 px-5 bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-dim)] border-none rounded-[10px] text-[var(--color-bg-dark)] font-semibold cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-[0_4px_14px_rgba(0,217,165,0.35)] active:translate-y-0 disabled:opacity-50"
      >
        + Add
      </button>
    </form>
  );
}
