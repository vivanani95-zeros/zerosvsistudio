import { createFileRoute } from "@tanstack/react-router";
import { geminiKeys, GEMINI_TEXT_MODEL, manusKeys } from "@/lib/providers.server";

const MAX_PROMPT = 1800;
const MANUS_BASE = "https://api.manus.ai/v2";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const TASK_PREFIX = "zeros-manus-3d.";

type ManusMessage = {
  type?: string;
  assistant_message?: {
    content?: string;
    attachments?: Array<{
      type?: string;
      filename?: string;
      url?: string;
      content_type?: string;
    }>;
  };
  error_message?: { content?: string };
  status_update?: { agent_status?: string };
};

type ManusMessagesResponse = { messages?: ManusMessage[] };

type GeminiBrief = {
  optimizedPrompt?: string;
  assetType?: string;
  geometryRequirements?: string[];
  materialRequirements?: string[];
  productionRequirements?: string[];
};

function publicTaskId(keyIndex: number, id: string): string {
  return `${TASK_PREFIX}${keyIndex}.${id}`;
}

function internalTask(taskId: string): { keyIndex: number; id: string } | null {
  if (!taskId.startsWith(TASK_PREFIX)) return null;
  const rest = taskId.slice(TASK_PREFIX.length);
  const separator = rest.indexOf(".");
  if (separator <= 0) return null;
  const keyIndex = Number(rest.slice(0, separator));
  const id = rest.slice(separator + 1);
  if (!Number.isInteger(keyIndex) || keyIndex < 0 || !id) return null;
  return { keyIndex, id };
}

/** Uses the same Gemini credentials already used by Zeros chat. */
async function optimize3DBrief(prompt: string): Promise<string> {
  const key = geminiKeys()[0];
  if (!key) return prompt;

  const schema = {
    type: "object",
    properties: {
      optimizedPrompt: { type: "string" },
      assetType: { type: "string" },
      geometryRequirements: { type: "array", items: { type: "string" } },
      materialRequirements: { type: "array", items: { type: "string" } },
      productionRequirements: { type: "array", items: { type: "string" } },
    },
    required: ["optimizedPrompt", "assetType", "geometryRequirements", "materialRequirements", "productionRequirements"],
    additionalProperties: false,
  };

  const system = [
    "You are Zeros' senior cinematic 3D art director.",
    "Convert the user's request into a precise brief for an agent that will actually build and export a real 3D GLB asset.",
    "Do not propose Three.js primitives, SVG, 2D tricks, fake geometry, or an image pretending to be 3D.",
    "Specify complete object identity, silhouette, proportions, functional components, topology, surface detail, materials, UV expectations, and production requirements.",
    "The final asset must be a genuine editable polygon mesh with real geometry and materials, suitable for a game/VFX pipeline.",
    "Keep the requested subject as the hero asset and avoid unrelated scene dressing.",
  ].join(" ");

  try {
    const res = await fetch(`${GEMINI_BASE}/models/${encodeURIComponent(GEMINI_TEXT_MODEL)}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt.slice(0, MAX_PROMPT) }] }],
        generationConfig: { temperature: 0.35, responseMimeType: "application/json", responseSchema: schema },
      }),
    });
    if (!res.ok) return prompt;

    const payload = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return prompt;

    const brief = JSON.parse(text) as GeminiBrief;
    return [
      brief.optimizedPrompt,
      brief.assetType ? `Asset type: ${brief.assetType}` : "",
      brief.geometryRequirements?.length ? `Geometry: ${brief.geometryRequirements.join("; ")}` : "",
      brief.materialRequirements?.length ? `Materials: ${brief.materialRequirements.join("; ")}` : "",
      brief.productionRequirements?.length ? `Production: ${brief.productionRequirements.join("; ")}` : "",
    ].filter(Boolean).join(" | ").slice(0, MAX_PROMPT);
  } catch {
    return prompt;
  }
}

function sculptPrompt(brief: string): string {
  return [
    "You are Zeros' production 3D asset sculptor.",
    "Create the requested asset as a REAL 3D model and export the finished asset as a GLB file.",
    "Use your available coding, desktop, and 3D tools internally. If Blender or another real 3D DCC is available, use it to build the actual mesh and export GLB.",
    "Do NOT use Three.js, HTML canvas, SVG, screenshots, a texture pretending to be geometry, or browser primitives as the final asset.",
    "The deliverable must contain actual polygon geometry, normals, UVs where appropriate, and real materials.",
    "Build the whole requested object, not merely the front view or a blockout.",
    "Use clean topology, sensible edge flow, non-zero thickness, watertight/manifold geometry where appropriate, realistic proportions, and production-quality surface detail.",
    "Use physically based materials with packed/embedded textures when supported. Keep the GLB self-contained.",
    "Apply transforms, recalculate normals, remove hidden construction objects, remove duplicate/degenerate geometry, and validate the GLB before finishing.",
    "If a high-poly sculpt is created, produce a clean usable final mesh and preserve detail through appropriate subdivision/normal/material workflows.",
    "Do not return only Python code or instructions. Actually execute the work and attach the resulting .glb file.",
    "Name the final file zeros-3d-model.glb.",
    `Production brief:\n${brief}`,
  ].join("\n\n");
}

async function createManus3DTask(prompt: string): Promise<{ id: string; keyIndex: number } | null> {
  const keys = manusKeys();
  for (let keyIndex = 0; keyIndex < keys.length; keyIndex++) {
    const key = keys[keyIndex]!;
    try {
      const res = await fetch(`${MANUS_BASE}/task.create`, {
        method: "POST",
        headers: { "x-manus-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Zeros 3D Production Asset",
          message: { content: sculptPrompt(prompt) },
          agent_profile: "max",
          interactive_mode: false,
          hide_in_task_list: true,
        }),
      });
      if (!res.ok) continue;
      const json = (await res.json().catch(() => ({}))) as { task_id?: string };
      if (json.task_id) return { id: json.task_id, keyIndex };
    } catch {
      // Try the next existing Manus key.
    }
  }
  return null;
}

async function listMessages(key: string, id: string): Promise<ManusMessage[]> {
  const res = await fetch(
    `${MANUS_BASE}/task.listMessages?task_id=${encodeURIComponent(id)}&order=asc&limit=100`,
    { headers: { "x-manus-api-key": key } },
  ).catch(() => null);
  if (!res?.ok) return [];
  const json = (await res.json().catch(() => ({}))) as ManusMessagesResponse;
  return json.messages ?? [];
}

function findGlb(messages: ManusMessage[]): { url: string; filename: string } | null {
  for (const message of messages) {
    for (const file of message.assistant_message?.attachments ?? []) {
      const filename = file.filename ?? "";
      const mime = file.content_type ?? "";
      if (file.url && (filename.toLowerCase().endsWith(".glb") || mime === "model/gltf-binary")) {
        return { url: file.url, filename: filename || "zeros-3d-model.glb" };
      }
    }
  }
  return null;
}

function statusFromMessages(messages: ManusMessage[]): { status: string; error?: string } {
  const error = messages.find((m) => m.type === "error_message")?.error_message?.content;
  if (error) return { status: "failed", error };
  const last = messages
    .filter((m) => m.type === "status_update")
    .at(-1)?.status_update?.agent_status?.toLowerCase() ?? "";
  if (["finished", "stopped"].includes(last)) return { status: "completed" };
  if (["failed", "error"].includes(last)) return { status: "failed" };
  return { status: "running" };
}

export const Route = createFileRoute("/api/model")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { prompt } = (await request.json()) as { prompt?: string };
          const cleanPrompt = prompt?.trim();
          if (!cleanPrompt) return Response.json({ error: "Prompt required" }, { status: 400 });

          if (!manusKeys().length) {
            return Response.json(
              { error: "3D generation needs the existing MANUS_API_KEYS already used by Zeros chat. No ZEROS_3D_* setting is required." },
              { status: 503 },
            );
          }

          const brief = await optimize3DBrief(cleanPrompt);
          const task = await createManus3DTask(brief);
          if (!task) {
            return Response.json({ error: "The existing Zeros Manus provider could not start the 3D sculpting task." }, { status: 502 });
          }

          return Response.json({
            taskId: publicTaskId(task.keyIndex, task.id),
            artDirector: geminiKeys().length > 0,
            sculptor: "manus",
            generation: "real-3d-glb",
          });
        } catch (error) {
          return Response.json({ error: error instanceof Error ? error.message : "3D sculpting could not start." }, { status: 500 });
        }
      },

      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const taskId = url.searchParams.get("id") ?? "";
          const parsed = internalTask(taskId);
          if (!parsed) return Response.json({ error: "Invalid Zeros 3D task id" }, { status: 400 });

          const key = manusKeys()[parsed.keyIndex];
          if (!key) return Response.json({ error: "The Manus provider key for this 3D task is no longer available." }, { status: 503 });

          const messages = await listMessages(key, parsed.id);
          const state = statusFromMessages(messages);
          const glb = findGlb(messages);

          if (url.searchParams.get("file") === "1") {
            if (!glb) return Response.json({ error: "The Manus sculptor has not attached the finished GLB yet." }, { status: 409 });
            const file = await fetch(glb.url);
            if (!file.ok || !file.body) return Response.json({ error: `Generated GLB could not be fetched (HTTP ${file.status}).` }, { status: 502 });
            const headers = new Headers(file.headers);
            headers.set("Content-Type", "model/gltf-binary");
            headers.set("Content-Disposition", `inline; filename="${glb.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}"`);
            headers.set("Cache-Control", "private, max-age=3600");
            return new Response(file.body, { status: 200, headers });
          }

          if (glb) {
            return Response.json({ status: "success", progress: 100, phase: "complete", generation: "real-3d-glb", url: `/api/model?id=${encodeURIComponent(taskId)}&file=1` });
          }

          if (state.status === "failed") {
            return Response.json({ status: "failed", progress: 0, phase: "sculpting", error: state.error || "Manus 3D sculpting failed." });
          }

          return Response.json({ status: "in_progress", progress: 50, phase: "sculpting", taskId });
        } catch (error) {
          return Response.json({ error: error instanceof Error ? error.message : "3D status check failed." }, { status: 500 });
        }
      },
    },
  },
});
