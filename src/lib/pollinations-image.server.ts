type PollinationsModel = {
  id?: string;
  name?: string;
  type?: string;
  model?: string;
  paid_only?: boolean;
  paidOnly?: boolean;
  outputModalities?: string[];
  inputModalities?: string[];
  modalities?: string[];
  capabilities?: string[] | Record<string, unknown>;
};

type ImageOptions = { width?: number; height?: number };

export type PollinationsImagePlan = {
  mode: "server" | "browser";
  image?: string;
  candidates?: Array<{ url: string; model: string }>;
  model?: string;
  endpoint?: string;
  modelsTried?: number;
};

const BASE = "https://gen.pollinations.ai";
const LEGACY_BASE = "https://image.pollinations.ai";
const REQUEST_TIMEOUT_MS = 18_000;
let catalogCache: { expiresAt: number; models: PollinationsModel[] } | null = null;

function authHeaders(): HeadersInit {
  const key = process.env.POLLINATIONS_API_KEY ?? process.env.POLLINATIONS_KEY;
  return key ? { Authorization: `Bearer ${key}` } : {};
}

function hasKey(): boolean {
  return Boolean(process.env.POLLINATIONS_API_KEY ?? process.env.POLLINATIONS_KEY);
}

function modelId(model: PollinationsModel): string {
  return String(model.id ?? model.model ?? model.name ?? "").trim();
}

function hasImageOutput(model: PollinationsModel): boolean {
  const values = [
    ...(model.outputModalities ?? []),
    ...(model.modalities ?? []),
    ...(Array.isArray(model.capabilities) ? model.capabilities : []),
  ].map((value) => String(value).toLowerCase());
  return model.type === "image" || values.some((value) => value.includes("image"));
}

function isPaidOnly(model: PollinationsModel): boolean {
  return model.paid_only === true || model.paidOnly === true;
}

function qualityRank(id: string): number {
  const normalized = id.toLowerCase();
  const preferred = [
    "flux",
    "zimage",
    "sana",
    "klein",
    "qwen-image",
    "seedream",
    "ideogram",
    "gptimage",
    "kontext",
    "turbo",
  ];
  const index = preferred.findIndex((name) => normalized === name || normalized.endsWith(`/${name}`));
  return index === -1 ? preferred.length : index;
}

function normalizeCatalog(payload: unknown): PollinationsModel[] {
  if (Array.isArray(payload)) return payload as PollinationsModel[];
  if (!payload || typeof payload !== "object") return [];
  const value = payload as Record<string, unknown>;
  for (const key of ["models", "data", "items"]) {
    if (Array.isArray(value[key])) return value[key] as PollinationsModel[];
  }
  return [];
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", ...authHeaders() },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function getCatalog(): Promise<PollinationsModel[]> {
  if (catalogCache && catalogCache.expiresAt > Date.now()) return catalogCache.models;

  try {
    const payload = await fetchJson(`${BASE}/image/models`);
    const models = normalizeCatalog(payload).filter((model) => {
      const id = modelId(model);
      return Boolean(id) && hasImageOutput(model) && !isPaidOnly(model);
    });
    if (models.length) {
      catalogCache = { expiresAt: Date.now() + 60_000, models };
      return models;
    }
  } catch {
    // Use stable aliases if the public catalog is temporarily unavailable.
  }

  const fallback = ["flux", "zimage", "sana", "klein", "qwen-image", "turbo"].map((id) => ({
    id,
    type: "image",
  } satisfies PollinationsModel));
  catalogCache = { expiresAt: Date.now() + 15_000, models: fallback };
  return fallback;
}

function buildLegacyUrl(prompt: string, model: string, width: number, height: number): string {
  const query = new URLSearchParams({
    model,
    width: String(width),
    height: String(height),
    nologo: "true",
    safe: "true",
    enhance: "true",
    referrer: "zeros-ai.pages.dev",
  });
  // Do not set private=true for anonymous requests: current Pollinations access
  // treats privacy/auth differently across legacy and unified surfaces.
  return `${LEGACY_BASE}/prompt/${encodeURIComponent(prompt)}?${query.toString()}`;
}

function buildUnifiedUrl(prompt: string, model: string, width: number, height: number): string {
  const query = new URLSearchParams({
    model,
    width: String(width),
    height: String(height),
    nologo: "true",
    safe: "true",
    referrer: "zeros-ai.pages.dev",
  });
  return `${BASE}/image/${encodeURIComponent(prompt)}?${query.toString()}`;
}

async function fetchImage(url: string): Promise<{ dataUrl: string; mimeType: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: authHeaders(), signal: controller.signal });
    const contentType = response.headers.get("content-type")?.split(";", 1)[0] ?? "";
    if (!response.ok || !contentType.startsWith("image/")) {
      let details = `HTTP ${response.status}`;
      try {
        const text = (await response.text()).slice(0, 180).replace(/\s+/g, " ");
        if (text) details += `: ${text}`;
      } catch {}
      throw new Error(details);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, bytes.length)));
    }
    return { dataUrl: `data:${contentType};base64,${btoa(binary)}`, mimeType: contentType };
  } finally {
    clearTimeout(timeout);
  }
}

export async function generatePollinationsImage(
  prompt: string,
  options: ImageOptions = {},
): Promise<PollinationsImagePlan> {
  const width = Math.min(1536, Math.max(512, Math.round(options.width ?? 1024)));
  const height = Math.min(1536, Math.max(512, Math.round(options.height ?? 1024)));
  const models = (await getCatalog()).sort((a, b) => qualityRank(modelId(a)) - qualityRank(modelId(b)));

  // If a server key exists, keep the secret on the server and use the unified API.
  // This path avoids exposing the key to the browser.
  if (hasKey()) {
    const errors: string[] = [];
    let tried = 0;
    for (const model of models) {
      const id = modelId(model);
      if (!id) continue;
      tried += 1;
      try {
        const result = await fetchImage(buildUnifiedUrl(prompt, id, width, height));
        return {
          mode: "server",
          image: result.dataUrl,
          model: id,
          endpoint: `${BASE}/image`,
          modelsTried: tried,
        };
      } catch (error) {
        errors.push(`${id}: ${error instanceof Error ? error.message : "request failed"}`);
      }
    }
    throw new Error(`Pollinations authenticated generation failed after ${tried} models. ${errors.slice(-5).join(" | ")}`);
  }

  // Anonymous generation must happen from the user's browser. If Cloudflare calls
  // Pollinations server-to-server, many users collapse onto the same proxy IP and
  // immediately hit Pollinations' anonymous one-request queue. Browser URLs preserve
  // the user's own IP/referrer and let the client move to the next model on failure.
  const candidates = models
    .map((model) => {
      const id = modelId(model);
      return id ? { url: buildLegacyUrl(prompt, id, width, height), model: id } : null;
    })
    .filter((value): value is { url: string; model: string } => Boolean(value));

  if (!candidates.length) throw new Error("Pollinations returned no eligible image models.");
  return { mode: "browser", candidates };
}
