import { readFile, writeFile } from "node:fs/promises";

const path = "src/routes/chat.tsx";
const source = await readFile(path, "utf8");
const start = source.indexOf("  const send = async (override?: string) => {");
const end = source.indexOf("\n\n  const signOut = async () => {", start);

if (start < 0 || end < 0) {
  throw new Error("Could not locate the chat send function.");
}

let fn = source.slice(start, end);
if (!fn.includes("modeOverride")) {
  fn = fn.replace(
    "  const send = async (override?: string) => {",
    "  const send = async (override?: string, modeOverride?: ZeroMode) => {\n    const activeMode = modeOverride ?? __CURRENT_MODE__;",
  );
  fn = fn.replace(/\bmode\b/g, "activeMode");
  fn = fn.replace(/__CURRENT_MODE__/g, "mode");
}

const next = source.slice(0, start) + fn + source.slice(end);
const final = next.includes("void send(s.text);")
  ? next.replace("void send(s.text);", "void send(s.text, s.mode);")
  : next;

if (final !== source) await writeFile(path, final, "utf8");
