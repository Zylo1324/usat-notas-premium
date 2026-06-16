"use client";

import { FirebaseApp, getApps, initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { doc, getFirestore, serverTimestamp, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

export const firebaseEnabled = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
);

let app: FirebaseApp | null = null;

function getFirebaseApp() {
  if (!firebaseEnabled) return null;
  if (!app) {
    app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  }
  return app;
}

export async function saveSessionSnapshot(payload: {
  studentCode: string;
  courseCount: number;
  capturedAt?: string;
}) {
  const activeApp = getFirebaseApp();
  if (!activeApp) {
    return { enabled: false };
  }

  const auth = getAuth(activeApp);
  const credential = await signInAnonymously(auth);
  const db = getFirestore(activeApp);
  await setDoc(
    doc(db, "usatSessions", credential.user.uid),
    {
      studentCode: payload.studentCode,
      courseCount: payload.courseCount,
      capturedAt: payload.capturedAt || null,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
  return { enabled: true, uid: credential.user.uid };
}
