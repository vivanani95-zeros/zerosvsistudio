type FirebaseCompat = {
  initializeApp: (config: Record<string, string>) => unknown;
  apps: Array<{ options?: Record<string, string> }>;
  auth: {
    (): {
      signInWithPopup: (provider: unknown) => Promise<any>;
      signOut: () => Promise<void>;
    };
    GoogleAuthProvider: {
      new (): { setCustomParameters: (params: Record<string, string>) => void };
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
  apiKey: "AIzaSyCehxkuBZ-PAgAOuI22jzY6bG5AeueT-3c",
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
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-zeros-firebase="${src}"]`,
    );

    if (existing) {
      if (window.firebase) return resolve();
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error(`Could not load Firebase SDK: ${src}`)),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.zerosFirebase = src;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error(`Could not load Firebase SDK: ${src}`));
    document.head.appendChild(script);
  });
}

async function getFirebase(): Promise<FirebaseCompat> {
  if (typeof window === "undefined") {
    throw new Error("Firebase authentication is browser-only.");
  }

  if (!ready) {
    ready = (async () => {
      await loadScript(
        "https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js",
      );
      await loadScript(
        "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth-compat.js",
      );

      const firebase = window.firebase;
      if (!firebase) {
        throw new Error("Firebase SDK did not initialize in the browser.");
      }

      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      } else {
        const existingOptions = firebase.apps[0]?.options;
        if (
          existingOptions?.projectId &&
          existingOptions.projectId !== firebaseConfig.projectId
        ) {
          throw new Error(
            `Firebase project mismatch: expected ${firebaseConfig.projectId}, got ${existingOptions.projectId}.`,
          );
        }
      }

      return firebase;
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
  const googleIdToken =
    firebase.auth.GoogleAuthProvider.credentialFromResult?.(result)?.idToken ??
    null;

  return { result, googleIdToken };
}

export async function signOutFirebase() {
  if (typeof window === "undefined" || !window.firebase) return;
  await window.firebase.auth().signOut();
}
