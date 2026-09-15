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
    "  const send = async (override?: string, modeOverride?: ZeroMode) => {\n    const activeMode = modeOverride ?? mode;",
  );
  fn = fn.replace(/\bmode\b/g, "activeMode");
  fn = fn.replace("modeOverride?: ZeroMode", "modeOverride?: ZeroMode");
}

const next = source.slice(0, start) + fn + source.slice(end);
const suggestionOld = "void send(s.text);";
const suggestionNew = "void send(s.text, s.mode);";
const final = next.includes(suggestionOld) ? next.replace(suggestionOld, suggestionNew) : next;

if (final !== source) await writeFile(path, final, "utf8");
