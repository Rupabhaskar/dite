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
  getNutritionRows,
  saveNutritionRows,
  subscribeNutritionRows,
  type NutritionRowData as FirestoreNutritionRowData,
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
  totalCalories: number;
  totalFiber: number;
  levelClass: string;
};

const NUTRITION_CACHE_KEY = "protein200_nutrition_rows";

type NutritionRowData = FirestoreNutritionRowData;

/** For calculating intake: refGrams + numeric values per that amount */
export type FoodReference = { id: string; food: string; refGrams: number; calories: number; protein: number; fiber: number };

const DEFAULT_FOOD_REFERENCE: FoodReference[] = [
  { id: "chicken", food: "Chicken", refGrams: 150, calories: 250, protein: 46, fiber: 0 },
  { id: "rice", food: "Rice (cooked)", refGrams: 50, calories: 65, protein: 1.3, fiber: 0.2 },
  { id: "eggs", food: "Eggs (4)", refGrams: 200, calories: 280, protein: 24, fiber: 0 },
  { id: "dosa", food: "Dosa", refGrams: 80, calories: 120, protein: 3, fiber: 1 },
  { id: "roti", food: "Roti (3)", refGrams: 90, calories: 300, protein: 9, fiber: 6 },
  { id: "groundnuts", food: "Groundnuts", refGrams: 50, calories: 285, protein: 13, fiber: 4 },
  { id: "soya", food: "Soya Chunks", refGrams: 60, calories: 205, protein: 31.5, fiber: 7.5 },
  { id: "veg", food: "Vegetables (ridge gourd)", refGrams: 200, calories: 34, protein: 1.6, fiber: 3 },
];

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

function computeFromFood(ref: FoodReference, grams: number): { protein: number; calories: number; fiber: number } {
  const ratio = grams / ref.refGrams;
  return {
    protein: Math.round(ref.protein * ratio * 10) / 10,
    calories: Math.round(ref.calories * ratio),
    fiber: Math.round(ref.fiber * ratio * 10) / 10,
  };
}

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

/** Parse first number from strings like "250 kcal", "46 g", "≈ 31–32 g" */
function parseNutrientValue(s: string): number {
  if (!s || typeof s !== "string") return 0;
  const cleaned = s.replace(/≈/g, "").trim();
  const match = cleaned.match(/(\d+\.?\d*)/);
  if (match) return parseFloat(match[1]);
  return 0;
}

/** Convert custom table rows to FoodReference for the top dropdown + calculation */
function customRowsToFoodReferences(rows: NutritionRowData[]): FoodReference[] {
  return rows
    .filter((r) => r.food && (parseNutrientValue(r.protein) > 0 || parseNutrientValue(r.calories) > 0))
    .map((r) => ({
      id: r.id,
      food: r.food.trim(),
      refGrams: r.refGrams && r.refGrams > 0 ? r.refGrams : 100,
      calories: parseNutrientValue(r.calories),
      protein: parseNutrientValue(r.protein),
      fiber: parseNutrientValue(r.fiber),
    }));
}

function getAverageDailyProtein(data: ProteinData): number | null {
  const dates = Object.keys(data);
  if (dates.length === 0) return null;
  let total = 0;
  for (const key of dates) {
    const entries = data[key] || [];
    total += entries.reduce((s, e) => s + (e.grams || 0), 0);
  }
  return Math.round(total / dates.length);
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
    const totalCalories = entries.reduce((s, e) => s + (e.calories ?? 0), 0);
    const totalFiber = entries.reduce((s, e) => s + (e.fiber ?? 0), 0);
    days.push({
      key,
      dayNum: i + 1,
      total,
      totalCalories,
      totalFiber,
      levelClass: getLevel(total),
    });
  }
  return days;
}

export default function ProteinChallenge() {
  const [data, setData] = useState<ProteinData>({});
  const [customNutritionRows, setCustomNutritionRows] = useState<NutritionRowData[]>([]);
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
  const todayCalories = entries.reduce((sum, e) => sum + (e.calories ?? 0), 0);
  const todayFiber = entries.reduce((sum, e) => sum + (e.fiber ?? 0), 0);
  const gridDays = buildGridDays(data);
  const avgDailyProtein = getAverageDailyProtein(data);

  useEffect(() => {
    const cached = getStoredNutritionRows();
    if (cached.length > 0) setCustomNutritionRows(cached);

    let unsubNut: (() => void) | undefined;
    const loadNutrition = async () => {
      try {
        const rows = await getNutritionRows();
        setCustomNutritionRows(rows);
        setStoredNutritionRows(rows);
        unsubNut = subscribeNutritionRows((next) => {
          setCustomNutritionRows(next);
          setStoredNutritionRows(next);
        });
      } catch (err) {
        console.error("Failed to load nutrition rows:", err);
      }
    };
    loadNutrition();
    return () => {
      unsubNut?.();
    };
  }, []);

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

  const foodOptions = [...DEFAULT_FOOD_REFERENCE, ...customRowsToFoodReferences(customNutritionRows)];

  const handleAddFromTable = useCallback(
    (foodId: string, foodGrams: number) => {
      const ref = foodOptions.find((f) => f.id === foodId);
      if (!ref || foodGrams <= 0) return;
      const { protein, calories, fiber } = computeFromFood(ref, foodGrams);
      const key = getTodayKey();
      const next = { ...data };
      if (!next[key]) next[key] = [];
      (next[key] as ProteinEntry[]).push({
        grams: protein,
        note: `${ref.food} ${foodGrams}g`,
        calories,
        fiber,
      });
      persistToFirestore(next);
    },
    [data, persistToFirestore, foodOptions]
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
      <div className="flex flex-wrap justify-between items-start gap-4 mb-10">
        <header className="text-center flex-1 min-w-0">
          <h1 className="text-[1.85rem] font-bold tracking-tight text-[var(--color-accent)]">
            200 Day Protein Challenge
          </h1>
          <p className="text-[var(--color-text-muted)] text-[0.95rem] mt-1.5">
            Track your daily protein • Multiple entries per day
          </p>

        </header>
        <div className="shrink-0 text-right">
          <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Daily average</div>
          <div className="text-2xl font-bold text-[var(--color-accent)]">
            {avgDailyProtein != null ? `${avgDailyProtein}g` : "—"}
          </div>
          <div className="text-xs text-[var(--color-text-muted)]">per day logged</div>
        </div>
      </div>

      <section className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-6 mb-6 shadow-sm">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
          <span className="font-semibold text-lg text-[var(--color-text)]">
            Today · {todayKey}
          </span>
          <div className="flex flex-wrap items-baseline gap-4">
            <span className="text-2xl font-bold text-[var(--color-accent)]">
              Total: {todayTotal}
              <span className="text-sm font-normal text-[var(--color-text-muted)]"> g protein</span>
            </span>
            {todayCalories > 0 && (
              <span className="text-sm text-[var(--color-text-muted)]">
                {todayCalories} kcal
              </span>
            )}
            {todayFiber > 0 && (
              <span className="text-sm text-[var(--color-text-muted)]">
                {todayFiber}g fiber
              </span>
            )}
            {saving && (
              <span className="text-sm text-[var(--color-text-muted)]">Saving…</span>
            )}
          </div>
        </div>
        <AddForm
          onAddFromTable={handleAddFromTable}
          foodOptions={foodOptions}
          disabled={saving}
        />
        <ul className="list-none">
          {entries.map((e, i) => (
            <li
              key={i}
              className="flex justify-between items-center py-2.5 px-3.5 bg-[var(--color-bg-input)] rounded-lg mb-2 text-[0.95rem] gap-2 flex-wrap"
              title={
                e.calories != null && e.fiber != null
                  ? `${e.grams}g protein · ${e.calories} kcal · ${e.fiber}g fiber`
                  : undefined
              }
            >
              <span className="font-medium text-[var(--color-text)]">
                {e.note || "—"}
              </span>
              <span className="text-[var(--color-text-muted)] text-[0.85rem]">
                <span className="text-[var(--color-accent)] font-semibold">{e.grams}g</span> protein
                {e.calories != null && ` · ${e.calories} kcal`}
                {e.fiber != null && ` · ${e.fiber}g fiber`}
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
                const parts = [`Day ${day.dayNum} · ${day.key}`];
                if (day.total > 0) {
                  parts.push(`${day.total}g protein`);
                  if (day.totalCalories > 0) parts.push(`${day.totalCalories} kcal`);
                  if (day.totalFiber > 0) parts.push(`${day.totalFiber}g fiber`);
                } else {
                  parts.push("No data");
                }
                setTooltip({
                  text: parts.join(" · "),
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

      <EditableNutritionTable
        customRows={customNutritionRows}
        onAddRow={async (row) => {
          const newRow: NutritionRowData = { ...row, id: "n-" + Date.now() };
          const next = [...customNutritionRows, newRow];
          setCustomNutritionRows(next);
          setStoredNutritionRows(next);
          try {
            await saveNutritionRows(next);
          } catch (err) {
            console.error("Failed to save nutrition row:", err);
          }
        }}
        onRemoveRow={async (id) => {
          const next = customNutritionRows.filter((r) => r.id !== id);
          setCustomNutritionRows(next);
          setStoredNutritionRows(next);
          try {
            await saveNutritionRows(next);
          } catch (err) {
            console.error("Failed to remove nutrition row:", err);
          }
        }}
      />

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

function EditableNutritionTable({
  customRows,
  onAddRow,
  onRemoveRow,
}: {
  customRows: NutritionRowData[];
  onAddRow: (row: Omit<NutritionRowData, "id">) => void;
  onRemoveRow: (id: string) => void;
}) {
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
                onDelete={() => onRemoveRow(r.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
      <NutritionRowAddForm onAdd={onAddRow} />
    </section>
  );
}

function NutritionRowAddForm({ onAdd }: { onAdd: (row: Omit<NutritionRowData, "id">) => void }) {
  const [food, setFood] = useState("");
  const [refGrams, setRefGrams] = useState("100");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [fiber, setFiber] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const f = food.trim();
    if (!f) return;
    const ref = refGrams.trim() ? parseFloat(refGrams.replace(",", ".")) : 100;
    onAdd({
      food: f,
      refGrams: ref > 0 ? ref : 100,
      calories: calories.trim() || "—",
      protein: protein.trim() || "—",
      fiber: fiber.trim() || "—",
    });
    setFood("");
    setRefGrams("100");
    setCalories("");
    setProtein("");
    setFiber("");
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-wrap items-end gap-3">
      <input
        type="text"
        placeholder="Food (e.g. Paneer)"
        value={food}
        onChange={(e) => setFood(e.target.value)}
        className="flex-1 min-w-[120px] py-2 px-3 bg-[var(--color-bg-input)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
      />
      <input
        type="number"
        placeholder="Ref (g)"
        title="Reference grams: calories/protein/fiber below are for this amount"
        min={1}
        step={1}
        value={refGrams}
        onChange={(e) => setRefGrams(e.target.value)}
        className="w-16 py-2 px-3 bg-[var(--color-bg-input)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
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
        placeholder="Protein (g)"
        value={protein}
        onChange={(e) => setProtein(e.target.value)}
        className="w-24 py-2 px-3 bg-[var(--color-bg-input)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
      />
      <input
        type="text"
        placeholder="Fiber (g)"
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
      <p className="w-full text-[var(--color-text-muted)] text-xs mt-1">
        New foods appear in the &quot;Select food&quot; dropdown above for logging intake.
      </p>
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
  onAddFromTable,
  foodOptions,
  disabled,
}: {
  onAddFromTable: (foodId: string, foodGrams: number) => void;
  foodOptions: FoodReference[];
  disabled?: boolean;
}) {
  const [foodId, setFoodId] = useState("");
  const [foodGrams, setFoodGrams] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!foodId) return;
    const g = parseFloat(String(foodGrams).replace(",", "."));
    if (!g || g <= 0) return;
    onAddFromTable(foodId, g);
    setFoodGrams("");
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-3 flex-wrap items-end mb-4">
      <label className="sr-only" htmlFor="food-select">Food</label>
      <select
        id="food-select"
        value={foodId}
        onChange={(e) => setFoodId(e.target.value)}
        required
        className="py-2.5 px-3.5 bg-[var(--color-bg-input)] border border-[var(--color-border)] rounded-[10px] text-[var(--color-text)] text-[0.95rem] font-[inherit] focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-ring)] min-w-[180px]"
      >
        <option value="">Select food</option>
        {foodOptions.map((f) => (
          <option key={f.id} value={f.id}>
            {f.food} (ref: {f.refGrams}g)
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="food-grams">Amount eaten (g)</label>
      <input
        id="food-grams"
        type="number"
        placeholder="Amount eaten (g)"
        min={0.1}
        step={0.1}
        value={foodGrams}
        onChange={(e) => setFoodGrams(e.target.value)}
        className="w-32 py-2.5 px-3.5 bg-[var(--color-bg-input)] border border-[var(--color-border)] rounded-[10px] text-[var(--color-text)] text-[0.95rem] font-[inherit] focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-ring)]"
      />
      <button
        type="submit"
        disabled={disabled || !foodId}
        className="py-2.5 px-5 bg-[var(--color-accent)] border-none rounded-[10px] text-white font-semibold cursor-pointer transition-all hover:bg-[var(--color-accent-hover)] hover:-translate-y-0.5 hover:shadow-[0_4px_14px_var(--color-accent-shadow)] active:translate-y-0 disabled:opacity-50"
      >
        + Add
      </button>
      <p className="w-full text-[var(--color-text-muted)] text-xs mt-1">
        Protein, calories and fiber are calculated from the amount you enter.
      </p>
    </form>
  );
}
