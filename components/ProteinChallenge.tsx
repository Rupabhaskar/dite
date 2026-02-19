"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getTodayKey,
  getCachedProteinData,
  setCachedProteinData,
  type ProteinData,
  type ProteinEntry,
} from "@/lib/storage";
import {
  getProteinData,
  saveProteinData,
  subscribeProteinData,
} from "@/lib/firestore";

function getLevel(total: number): string {
  if (total >= 80) return "bg-[var(--color-level-80)]";
  if (total >= 70) return "bg-[var(--color-level-70)]";
  if (total >= 60) return "bg-[var(--color-level-60)]";
  if (total >= 50) return "bg-[var(--color-level-50)]";
  if (total >= 40) return "bg-[var(--color-level-40)]";
  if (total >= 30) return "bg-[var(--color-level-30)]";
  if (total >= 20) return "bg-[var(--color-level-20)]";
  if (total > 0) return "bg-[var(--color-level-low)]";
  return "bg-[var(--color-empty)]";
}

type GridDay = {
  key: string;
  dayNum: number;
  total: number;
  levelClass: string;
};

const NUTRITION_CACHE_KEY = "protein200_nutrition_rows";

type NutritionRowData = { id: string; food: string; calories: string; protein: string; fiber: string };

const DEFAULT_NUTRITION_ROWS: Omit<NutritionRowData, "id">[] = [
  { food: "Chicken (150 g)", calories: "250 kcal", protein: "46 g", fiber: "0 g" },
  { food: "Rice (50 g cooked)", calories: "65 kcal", protein: "1.3 g", fiber: "0.2 g" },
  { food: "Eggs (4)", calories: "280 kcal", protein: "24 g", fiber: "0 g" },
  { food: "Dosa (1)", calories: "120 kcal", protein: "3 g", fiber: "1 g" },
  { food: "Roti (3)", calories: "300 kcal", protein: "9 g", fiber: "6 g" },
  { food: "Groundnuts (50 g)", calories: "285 kcal", protein: "13 g", fiber: "4 g" },
  { food: "Soya Chunks (60 g)", calories: "≈ 205 kcal", protein: "≈ 31–32 g", fiber: "≈ 7–8 g" },
  { food: "Vegetables (ridge gourd 200 g)", calories: "34 kcal", protein: "1.6 g", fiber: "3 g" },
];

function getStoredNutritionRows(): NutritionRowData[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(NUTRITION_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setStoredNutritionRows(rows: NutritionRowData[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(NUTRITION_CACHE_KEY, JSON.stringify(rows));
  } catch {
    // ignore
  }
}

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
  const [loading, setLoading] = useState(false);
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
    const cached = getCachedProteinData();
    if (cached && Object.keys(cached).length > 0) setData(cached);

    let unsub: (() => void) | undefined;
    const init = async () => {
      try {
        const serverData = await getProteinData();
        setData(serverData);
        setCachedProteinData(serverData);
        unsub = subscribeProteinData((next) => {
          setData(next);
          setCachedProteinData(next);
        });
      } catch (err) {
        console.error("Failed to load protein data:", err);
      }
    };
    init();
    return () => {
      unsub?.();
    };
  }, []);

  const persistToFirestore = useCallback(async (newData: ProteinData) => {
    setData(newData);
    setCachedProteinData(newData);
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

  return (
    <div className="max-w-[900px] mx-auto px-6 py-8 pb-12">
      <header className="text-center mb-10">
        <h1 className="text-[1.85rem] font-bold tracking-tight text-[var(--color-accent)]">
          200 Day Protein Challenge
        </h1>
        <p className="text-[var(--color-text-muted)] text-[0.95rem] mt-1.5">
          Track your daily protein • Multiple entries per day
        </p>
        <div className="mt-4 px-4 py-3 rounded-xl bg-[var(--color-bg-input)] border border-[var(--color-border)] text-left max-w-xl mx-auto">
          <p className="text-[var(--color-text)] text-sm font-medium">
            Stay consistent. Protein keeps you full, preserves muscle, and supports weight loss. One day at a time.
          </p>
        </div>
      </header>

      <section className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-6 mb-6 shadow-sm">
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
                className="bg-transparent border-none text-[var(--color-text-muted)] cursor-pointer p-1 text-base leading-none rounded hover:text-[var(--color-delete-hover)] hover:bg-[var(--color-delete-bg)] transition-colors disabled:opacity-50"
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
          <LegendItem color="var(--color-level-80)" label="80g+ very good" />
          <LegendItem color="var(--color-level-70)" label="70g" />
          <LegendItem color="var(--color-level-60)" label="60g good" />
          <LegendItem color="var(--color-level-50)" label="50g" />
          <LegendItem color="var(--color-level-40)" label="40g normal" />
          <LegendItem color="var(--color-level-30)" label="30g" />
          <LegendItem color="var(--color-level-20)" label="20g" />
          <LegendItem color="var(--color-level-low)" label="&lt;20g risk" />
          <LegendItem color="var(--color-empty)" label="No data" />
        </div>
        <div className="grid grid-cols-[repeat(20,1fr)] gap-1 mb-4 max-[600px]:grid-cols-10">
          {gridDays.map((day) => (
            <div
              key={day.key}
              className={`aspect-square rounded-md border border-[var(--color-border)] cursor-pointer transition-all hover:scale-[1.08] hover:shadow-lg hover:z-10 flex items-center justify-center min-w-0 text-[0.55rem] font-semibold ${day.total > 0 ? day.levelClass + " text-white" : "bg-[var(--color-empty)] hover:bg-[var(--color-empty-hover)] text-transparent"}`}
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

      <EditableNutritionTable />

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

function EditableNutritionTable() {
  const [customRows, setCustomRows] = useState<NutritionRowData[]>([]);

  useEffect(() => {
    setCustomRows(getStoredNutritionRows());
  }, []);

  const addRow = useCallback((row: Omit<NutritionRowData, "id">) => {
    const newRow: NutritionRowData = {
      ...row,
      id: "n-" + Date.now(),
    };
    setCustomRows((prev) => {
      const next = [...prev, newRow];
      setStoredNutritionRows(next);
      return next;
    });
  }, []);

  const removeRow = useCallback((id: string) => {
    setCustomRows((prev) => {
      const next = prev.filter((r) => r.id !== id);
      setStoredNutritionRows(next);
      return next;
    });
  }, []);

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold mb-4 text-[var(--color-text)]">
        Nutrition reference
      </h2>
      <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-sm">
        <table className="w-full min-w-[320px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-input)]">
              <th className="px-4 py-3 font-semibold text-[var(--color-text)]">Food</th>
              <th className="px-4 py-3 font-semibold text-[var(--color-text)]">Calories</th>
              <th className="px-4 py-3 font-semibold text-[var(--color-text)]">Protein</th>
              <th className="px-4 py-3 font-semibold text-[var(--color-text)]">Fiber</th>
              <th className="px-4 py-3 w-12" aria-label="Actions"></th>
            </tr>
          </thead>
          <tbody>
            {DEFAULT_NUTRITION_ROWS.map((r, i) => (
              <NutritionRow key={"def-" + i} food={r.food} calories={r.calories} protein={r.protein} fiber={r.fiber} />
            ))}
            {customRows.map((r) => (
              <NutritionRow
                key={r.id}
                food={r.food}
                calories={r.calories}
                protein={r.protein}
                fiber={r.fiber}
                onDelete={() => removeRow(r.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
      <NutritionRowAddForm onAdd={addRow} />
    </section>
  );
}

function NutritionRowAddForm({ onAdd }: { onAdd: (row: Omit<NutritionRowData, "id">) => void }) {
  const [food, setFood] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [fiber, setFiber] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const f = food.trim();
    if (!f) return;
    onAdd({
      food: f,
      calories: calories.trim() || "—",
      protein: protein.trim() || "—",
      fiber: fiber.trim() || "—",
    });
    setFood("");
    setCalories("");
    setProtein("");
    setFiber("");
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-wrap items-end gap-3">
      <input
        type="text"
        placeholder="Food (e.g. Paneer 100 g)"
        value={food}
        onChange={(e) => setFood(e.target.value)}
        className="flex-1 min-w-[140px] py-2 px-3 bg-[var(--color-bg-input)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
      />
      <input
        type="text"
        placeholder="Calories"
        value={calories}
        onChange={(e) => setCalories(e.target.value)}
        className="w-24 py-2 px-3 bg-[var(--color-bg-input)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
      />
      <input
        type="text"
        placeholder="Protein"
        value={protein}
        onChange={(e) => setProtein(e.target.value)}
        className="w-24 py-2 px-3 bg-[var(--color-bg-input)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
      />
      <input
        type="text"
        placeholder="Fiber"
        value={fiber}
        onChange={(e) => setFiber(e.target.value)}
        className="w-20 py-2 px-3 bg-[var(--color-bg-input)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
      />
      <button
        type="submit"
        className="py-2 px-4 bg-[var(--color-accent)] text-white text-sm font-semibold rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors"
      >
        + Add row
      </button>
    </form>
  );
}

function NutritionRow({
  food,
  calories,
  protein,
  fiber,
  onDelete,
}: {
  food: string;
  calories: string;
  protein: string;
  fiber: string;
  onDelete?: () => void;
}) {
  return (
    <tr className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-bg-input)]/50">
      <td className="px-4 py-3 text-[var(--color-text)]">{food}</td>
      <td className="px-4 py-3 text-[var(--color-text-muted)]">{calories}</td>
      <td className="px-4 py-3 text-[var(--color-accent)] font-medium">{protein}</td>
      <td className="px-4 py-3 text-[var(--color-text-muted)]">{fiber}</td>
      <td className="px-4 py-3 w-12">
        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            aria-label="Remove row"
            className="text-[var(--color-text-muted)] hover:text-[var(--color-delete-hover)] hover:bg-[var(--color-delete-bg)] rounded p-1 transition-colors"
          >
            ×
          </button>
        ) : null}
      </td>
    </tr>
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
        className="w-[100px] py-2.5 px-3.5 bg-[var(--color-bg-input)] border border-[var(--color-border)] rounded-[10px] text-[var(--color-text)] text-[0.95rem] font-[inherit] focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-ring)]"
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
        className="py-2.5 px-5 bg-[var(--color-accent)] border-none rounded-[10px] text-white font-semibold cursor-pointer transition-all hover:bg-[var(--color-accent-hover)] hover:-translate-y-0.5 hover:shadow-[0_4px_14px_var(--color-accent-shadow)] active:translate-y-0 disabled:opacity-50"
      >
        + Add
      </button>
    </form>
  );
}
