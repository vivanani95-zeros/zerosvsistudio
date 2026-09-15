import { readFile, writeFile } from "node:fs/promises";

const path = "src/routes/chat.tsx";
const source = await readFile(path, "utf8");

if (source.includes("Meshy 6 is generating your model")) process.exit(0);

const oldImport =
  'import { downloadImageAsPng, generateImage, generateModel, streamChat, type Msg } from "@/lib/ai-client";';
const newImport =
  'import { downloadImageAsPng, generateImage, streamChat, type Msg } from "@/lib/ai-client";\nimport { generateMeshyModel } from "@/lib/meshy-model";';

if (!source.includes(oldImport)) throw new Error("Could not locate the chat AI client import.");

const start = source.indexOf('      if (mode === "model") {');
const end = source.indexOf('\n      setStatus(\n        mode === "search"', start);
if (start < 0 || end < 0) throw new Error("Could not locate the 3D model branch.");

const replacement = `      if (mode === "model") {
        setStatus("Meshy 6 is generating your model…");
        const url = await generateMeshyModel(prompt, (p) =>
          setStatus(` + "`" + `Meshy 6 is generating your model… ${Math.round(p)}%` + "`" + `),
        );
        const msg: ChatMessage = {
          id: assistantId,
          role: "assistant",
          content: ` + "`" + `Generated a real **${prompt}** with Meshy 6 — high-detail geometry, PBR materials, and a production GLB. Spin it, inspect it, then grab the .glb. 🧊` + "`" + `,
          mode,
          attachment: { kind: "model", url, source: "Meshy 6" },
        };
        setMessages((prev) => [...prev, msg]);
        void persist(msg);
        return;
      }
`;

const next = source.slice(0, start) + replacement + source.slice(end);
const final = next.replace(oldImport, newImport);
await writeFile(path, final, "utf8");
