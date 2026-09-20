import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(".");
const sourceDir = resolve(root, "Background");
const targetDir = resolve(root, "public/mai");

mkdirSync(targetDir, { recursive: true });

const assets = [
  ["IronMan.jpg", "IronMan.jpg"],
  ["SpiderMan.jpg", "SpiderMan.jpg"],
  ["Thor.jpg", "Thor.jpg"],
  ["Mai.jpg", "MAI.jpg"],
];

for (const [source, target] of assets) {
  const from = resolve(sourceDir, source);
  if (!existsSync(from)) {
    throw new Error(`MAI asset missing: Background/${source}`);
  }
  copyFileSync(from, resolve(targetDir, target));
}

console.log("Prepared isolated MAI assets.");
