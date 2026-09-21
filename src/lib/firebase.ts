import { getApp, getApps, initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  getAuth,
  signInWithPopup,
  signOut,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCehxkuBZ-PAgAOuI22jZ6YbG5AeueT-3c",
  authDomain: "zeros-ai-by-vsistudio.firebaseapp.com",
  projectId: "zeros-ai-by-vsistudio",
  storageBucket: "zeros-ai-by-vsistudio.firebasestorage.app",
  messagingSenderId: "313914394831",
  appId: "1:313914394831:web:e5e120b769ceba802fcfba",
  measurementId: "G-0ZC22YQB7T",
};

const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
const firebaseAuth = getAuth(firebaseApp);

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  const result = await signInWithPopup(firebaseAuth, provider);
  // Always obtain the current Firebase-issued ID token from the signed-in user.
  // This avoids relying on the short-lived OAuth credential returned by the popup.
  const googleIdToken = await result.user.getIdToken(true);

  if (!googleIdToken) {
    throw new Error("Firebase Google sign-in completed without an ID token.");
  }

  return { result, googleIdToken };
}

export async function signOutFirebase() {
  await signOut(firebaseAuth);
}
