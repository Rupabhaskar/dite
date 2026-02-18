import { initializeApp, type FirebaseApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, type Analytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "AIzaSyArmPbEJnu5nR6LJHqOKDBpv7fai2HW_0k",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "halfsareesnapu.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "halfsareesnapu",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "halfsareesnapu.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "1035303629622",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "1:1035303629622:web:bfa9fb25dec09620e37997",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? "G-G4SMN3384G",
};

const app: FirebaseApp = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export function getAnalyticsSafe(): Analytics | null {
  if (typeof window === "undefined") return null;
  try {
    return getAnalytics(app);
  } catch {
    return null;
  }
}
