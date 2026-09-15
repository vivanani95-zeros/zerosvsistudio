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

// The image build patch runs first and renames references to `mode` inside
// send() to `activeMode`. Accept both source shapes so the two build patches
// remain order-safe and future chat refactors do not break deployment.
const start =
  source.indexOf('      if (activeMode === "model") {') >= 0
    ? source.indexOf('      if (activeMode === "model") {')
    : source.indexOf('      if (mode === "model") {');
const end = source.indexOf('\n      setStatus(\n        activeMode === "search"', start) >= 0
  ? source.indexOf('\n      setStatus(\n        activeMode === "search"', start)
  : source.indexOf('\n      setStatus(\n        mode === "search"', start);

if (start < 0 || end < 0) throw new Error("Could not locate the 3D model branch.");

// This script itself uses a template literal to write source code that also
// contains template literals. Escape every `${...}` belonging to the generated
// chat source so Node does not evaluate it while running the build patch.
const replacement = `      if (activeMode === "model") {
        setStatus("Zeros 3D engine is generating your model…");
        const url = await generateZeros3DModel(prompt, (p) =>
          setStatus(\`Zeros 3D engine is generating your model… \${Math.round(p)}%\`),
        );
        const msg: ChatMessage = {
          id: assistantId,
          role: "assistant",
          content: \`Generated a real **\${prompt}** with Zeros' self-hosted 3D AI engine — native geometry, PBR materials, high-detail GLB. Spin it, inspect it, then grab the .glb. 🧊\`,
          mode: activeMode,
          attachment: { kind: "model", url, source: "Zeros 3D AI" },
        };
        setMessages((prev) => [...prev, msg]);
        void persist(msg);
        return;
      }
`;

const next = source.slice(0, start) + replacement + source.slice(end);
const final = next.replace(oldImport, newImport);
await writeFile(path, final, "utf8");
