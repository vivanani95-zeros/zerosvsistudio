// Lovable's TanStack Start wrapper already provides TanStack Start, React,
// Tailwind, path aliases and the Cloudflare build integration. We only override
// the Nitro target so Git-integrated Cloudflare Pages always emits a Pages
// Functions-compatible artifact instead of depending on environment detection.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  nitro: {
    preset: "cloudflare-pages",
  },
});
