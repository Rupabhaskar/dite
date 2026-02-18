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
