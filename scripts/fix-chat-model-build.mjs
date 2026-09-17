import { readFile, writeFile } from "node:fs/promises";

const path = "src/routes/chat.tsx";
const source = await readFile(path, "utf8");

const oldImport =
  'import { downloadImageAsPng, generateImage, generateModel, streamChat, type Msg } from "@/lib/ai-client";';
const newImport =
  'import { downloadImageAsPng, generateImage, streamChat, type Msg } from "@/lib/ai-client";\nimport { generateZeros3DModel } from "@/lib/zeros-3d-model";';

if (!source.includes(oldImport)) {
  if (source.includes("generateZeros3DModel")) process.exit(0);
  throw new Error("Could not locate the chat AI client import.");
}

const modelMarker = '      if (activeMode === "model") {';
const legacyModelMarker = '      if (mode === "model") {';
const start = source.indexOf(modelMarker) >= 0 ? source.indexOf(modelMarker) : source.indexOf(legacyModelMarker);

const activeStatusMarker = '\n      setStatus(\n        activeMode === "search"';
const legacyStatusMarker = '\n      setStatus(\n        mode === "search"';
const activeStatusEnd = source.indexOf(activeStatusMarker, start);
const legacyStatusEnd = source.indexOf(legacyStatusMarker, start);
const end = activeStatusEnd >= 0 ? activeStatusEnd : legacyStatusEnd;

if (start < 0 || end < 0) throw new Error("Could not locate the 3D model branch.");

// Build the replacement as plain string fragments rather than a template literal.
// This is deliberate: the generated chat source itself contains `${...}` expressions,
// which must never be evaluated by this build-time patch script.
const replacement = [
  '      if (activeMode === "model") {',
  '        setStatus("Zeros 3D engine is generating your model…");',
  '        const url = await generateZeros3DModel(prompt, (p) =>',
  '          setStatus(`Zeros 3D engine is generating your model… ${Math.round(p)}%`),',
  '        );',
  '        const msg: ChatMessage = {',
  '          id: assistantId,',
  '          role: "assistant",',
  '          content: `Generated a real **${prompt}** with Zeros\' 3D AI engine — native geometry, PBR materials, high-detail GLB. Spin it, inspect it, then grab the .glb. 🧊`,',
  '          mode: activeMode,',
  '          attachment: { kind: "model", url, source: "Zeros 3D AI" },',
  '        };',
  '        setMessages((prev) => [...prev, msg]);',
  '        void persist(msg);',
  '        return;',
  '      }',
  '',
].join("\n");

const next = source.slice(0, start) + replacement + source.slice(end);
const final = next.replace(oldImport, newImport);
await writeFile(path, final, "utf8");
