import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import type { ProteinData } from "./storage";

const COLLECTION = "proteinChallenge";
const DOC_ID = "200day";
const NUTRITION_DOC_ID = "nutritionRows";

export type NutritionRowData = {
  id: string;
  food: string;
  calories: string;
  protein: string;
  fiber: string;
  refGrams?: number;
};

export async function getProteinData(): Promise<ProteinData> {
  const ref = doc(db, COLLECTION, DOC_ID);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return {};
  const raw = snapshot.data();
  const entries = raw?.entries;
  if (entries && typeof entries === "object" && !Array.isArray(entries)) {
    return entries as ProteinData;
  }
  return {};
}

export async function saveProteinData(data: ProteinData): Promise<void> {
  const ref = doc(db, COLLECTION, DOC_ID);
  await setDoc(ref, {
    entries: data,
    updatedAt: new Date().toISOString(),
  });
}

export function subscribeProteinData(
  callback: (data: ProteinData) => void
): Unsubscribe {
  const ref = doc(db, COLLECTION, DOC_ID);
  return onSnapshot(
    ref,
    (snapshot) => {
      if (!snapshot.exists()) {
        callback({});
        return;
      }
      const raw = snapshot.data();
      const entries = raw?.entries;
      if (entries && typeof entries === "object" && !Array.isArray(entries)) {
        callback(entries as ProteinData);
      } else {
        callback({});
      }
    },
    (err) => {
      console.error("Firestore subscribe error:", err);
      callback({});
    }
  );
}

export async function getNutritionRows(): Promise<NutritionRowData[]> {
  const ref = doc(db, COLLECTION, NUTRITION_DOC_ID);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return [];
  const raw = snapshot.data();
  const rows = raw?.rows;
  if (!Array.isArray(rows)) return [];
  return rows.filter(
    (r: unknown): r is NutritionRowData =>
      r != null &&
      typeof r === "object" &&
      typeof (r as NutritionRowData).id === "string" &&
      typeof (r as NutritionRowData).food === "string"
  );
}

export async function saveNutritionRows(rows: NutritionRowData[]): Promise<void> {
  const ref = doc(db, COLLECTION, NUTRITION_DOC_ID);
  await setDoc(ref, {
    rows,
    updatedAt: new Date().toISOString(),
  });
}

export function subscribeNutritionRows(
  callback: (rows: NutritionRowData[]) => void
): Unsubscribe {
  const ref = doc(db, COLLECTION, NUTRITION_DOC_ID);
  return onSnapshot(
    ref,
    (snapshot) => {
      if (!snapshot.exists()) {
        callback([]);
        return;
      }
      const raw = snapshot.data();
      const rows = raw?.rows;
      if (!Array.isArray(rows)) {
        callback([]);
        return;
      }
      const valid = rows.filter(
        (r: unknown): r is NutritionRowData =>
          r != null &&
          typeof r === "object" &&
          typeof (r as NutritionRowData).id === "string" &&
          typeof (r as NutritionRowData).food === "string"
      );
      callback(valid);
    },
    (err) => {
      console.error("Firestore nutrition subscribe error:", err);
      callback([]);
    }
  );
}
