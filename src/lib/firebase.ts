type FirebaseCompat = {
  initializeApp: (config: Record<string, string>) => unknown;
  apps: unknown[];
  auth: {
    (): {
      signInWithPopup: (provider: unknown) => Promise<any>;
      signOut: () => Promise<void>;
    };
    GoogleAuthProvider: new () => {
      setCustomParameters: (params: Record<string, string>) => void;
      credentialFromResult?: (result: any) => { idToken?: string } | null;
    };
  };
};

declare global {
  interface Window {
    firebase?: FirebaseCompat;
  }
}

const firebaseConfig = {
  apiKey: "AIzaSyCehxkuBZ-PAgAOuI22jz6YbG5AeueT-3c",
  authDomain: "zeros-ai-by-vsistudio.firebaseapp.com",
  projectId: "zeros-ai-by-vsistudio",
  storageBucket: "zeros-ai-by-vsistudio.firebasestorage.app",
  messagingSenderId: "313914394831",
  appId: "1:313914394831:web:e5e120b769ceba802fcfba",
  measurementId: "G-0ZC22YQB7T",
};

let ready: Promise<FirebaseCompat> | null = null;

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      if (window.firebase) resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Could not load Firebase SDK: ${src}`));
    document.head.appendChild(script);
  });
}

async function getFirebase(): Promise<FirebaseCompat> {
  if (typeof window === "undefined") throw new Error("Firebase authentication is browser-only.");
  if (window.firebase) return window.firebase;
  if (!ready) {
    ready = (async () => {
      await loadScript("https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js");
      await loadScript("https://www.gstatic.com/firebasejs/12.19.0/firebase-auth-compat.js");
      if (!window.firebase) throw new Error("Firebase SDK did not initialize.");
      if (!window.firebase.apps.length) window.firebase.initializeApp(firebaseConfig);
      return window.firebase;
    })();
  }
  return ready;
}

export async function signInWithGoogle() {
  const firebase = await getFirebase();
  const auth = firebase.auth();
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const result = await auth.signInWithPopup(provider);
  const googleIdToken = firebase.auth.GoogleAuthProvider.credentialFromResult?.(result)?.idToken ?? null;
  return { result, googleIdToken };
}

export async function signOutFirebase() {
  if (typeof window === "undefined" || !window.firebase) return;
  await window.firebase.auth().signOut();
}
