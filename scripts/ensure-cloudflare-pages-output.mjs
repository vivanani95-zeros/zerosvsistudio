import { access, cp, mkdir, rm } from "node:fs/promises";

const candidates = ["dist", ".output/public"];
const destination = "dist";

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const distExists = await exists("dist");
const outputExists = await exists(".output/public");

if (!distExists && !outputExists) {
  throw new Error(
    `Cloudflare Pages build output was not produced. Expected one of: ${candidates.join(", ")}`,
  );
}

if (!distExists && outputExists) {
  await mkdir(destination, { recursive: true });
  await cp(".output/public", destination, { recursive: true, force: true });
}

// Keep the Pages artifact deterministic when Nitro changes its preset output
// directory between releases. Cloudflare Pages is configured to publish ./dist.
if (!(await exists("dist"))) {
  throw new Error("Cloudflare Pages output directory ./dist is missing after normalization.");
}

console.log("Cloudflare Pages output ready: ./dist");
