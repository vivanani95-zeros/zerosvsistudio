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
  pricing?: Record<string, unknown>;
  price?: number | string;
  cost?: number | string;
};

type ImageOptions = {
  width?: number;
  height?: number;
};

type ImageResult = {
  dataUrl: string;
  mimeType: string;
  model: string;
  endpoint: string;
  modelsTried: number;
};

const BASE = "https://gen.pollinations.ai";
const LEGACY_BASE = "https://image.pollinations.ai";
const CATALOG_TTL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 18_000;

let catalogCache: { expiresAt: number; models: PollinationsModel[] } | null = null;

function modelId(model: PollinationsModel): string {
  return String(model.id ?? model.model ?? model.name ?? "").trim();
}

function hasImageOutput(model: PollinationsModel): boolean {
  const values = [
    ...(model.outputModalities ?? []),
    ...(model.modalities ?? []),
    ...(model.inputModalities ?? []),
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

async function fetchJsonWithTimeout(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        ...authHeaders(),
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Model catalog HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function getCatalog(): Promise<PollinationsModel[]> {
  if (catalogCache && catalogCache.expiresAt > Date.now()) return catalogCache.models;

  try {
    const payload = await fetchJsonWithTimeout(`${BASE}/image/models`);
    const models = normalizeCatalog(payload).filter((model) => {
      const id = modelId(model);
      return Boolean(id) && hasImageOutput(model) && !isPaidOnly(model);
    });

    if (models.length) {
      catalogCache = { expiresAt: Date.now() + CATALOG_TTL_MS, models };
      return models;
    }
  } catch {
    // Fall through to the documented stable aliases below.
  }

  const fallback = ["flux", "zimage", "sana", "klein", "qwen-image"].map((id) => ({
    id,
    type: "image",
  } satisfies PollinationsModel));
  catalogCache = { expiresAt: Date.now() + 15_000, models: fallback };
  return fallback;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  }
  return btoa(binary);
}

async function fetchImage(url: string, headers: HeadersInit): Promise<{ dataUrl: string; mimeType: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    const contentType = response.headers.get("content-type")?.split(";", 1)[0] ?? "";
    if (!response.ok || !contentType.startsWith("image/")) {
      let details = `HTTP ${response.status}`;
      try {
        const text = (await response.text()).slice(0, 220).replace(/\s+/g, " ");
        if (text) details += `: ${text}`;
      } catch {
        // Ignore non-text error bodies.
      }
      throw new Error(details);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length) throw new Error("Empty image response");
    return {
      dataUrl: `data:${contentType};base64,${bytesToBase64(bytes)}`,
      mimeType: contentType,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function authHeaders(): HeadersInit {
  const key = process.env.POLLINATIONS_API_KEY ?? process.env.POLLINATIONS_KEY;
  return key ? { Authorization: `Bearer ${key}` } : {};
}

function buildUnifiedUrl(prompt: string, model: string, width: number, height: number): string {
  const query = new URLSearchParams({
    model,
    width: String(width),
    height: String(height),
    nologo: "true",
    private: "true",
    safe: "true",
  });
  return `${BASE}/image/${encodeURIComponent(prompt)}?${query.toString()}`;
}

function buildLegacyUrl(prompt: string, model: string, width: number, height: number): string {
  const query = new URLSearchParams({
    model,
    width: String(width),
    height: String(height),
    nologo: "true",
    private: "true",
    safe: "true",
  });
  return `${LEGACY_BASE}/prompt/${encodeURIComponent(prompt)}?${query.toString()}`;
}

export async function generatePollinationsImage(prompt: string, options: ImageOptions = {}): Promise<ImageResult> {
  const width = Math.min(1536, Math.max(512, Math.round(options.width ?? 1024)));
  const height = Math.min(1536, Math.max(512, Math.round(options.height ?? 1024)));
  const models = await getCatalog();
  const ordered = [...models].sort((a, b) => qualityRank(modelId(a)) - qualityRank(modelId(b)));
  const attempts: string[] = [];
  let modelsTried = 0;

  for (const model of ordered) {
    const id = modelId(model);
    if (!id) continue;
    modelsTried += 1;

    const endpoints = [
      { url: buildUnifiedUrl(prompt, id, width, height), label: `${BASE}/image` },
      { url: buildLegacyUrl(prompt, id, width, height), label: `${LEGACY_BASE}/prompt` },
    ];

    for (const endpoint of endpoints) {
      try {
        const image = await fetchImage(endpoint.url, authHeaders());
        return { ...image, model: id, endpoint: endpoint.label, modelsTried };
      } catch (error) {
        attempts.push(`${id}: ${error instanceof Error ? error.message : "request failed"}`);
      }
    }
  }

  const summary = attempts.slice(-8).join(" | ");
  throw new Error(
    `Pollinations image generation failed after trying ${modelsTried} eligible image models.${summary ? ` ${summary}` : ""}`,
  );
}
