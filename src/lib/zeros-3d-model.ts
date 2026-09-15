export type Zeros3DJobStatus = {
  status?: string;
  progress?: number;
  url?: string | null;
  taskId?: string;
  phase?: string;
  error?: string;
};

/**
 * Zeros' self-hosted 3D inference client.
 * No Meshy/Tripo/etc. API key is used here. The Cloudflare route talks to
 * ZEROS_3D_ENGINE_URL, which is expected to be a GPU service running the
 * open-source TRELLIS text-to-3D weights.
 */
export async function generateZeros3DModel(
  prompt: string,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const create = await fetch("/api/model", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });

  const created = (await create.json().catch(() => ({}))) as Zeros3DJobStatus;
  if (!create.ok || !created.taskId) {
    throw new Error(created.error || "Zeros 3D engine could not start the generation job.");
  }

  let taskId = created.taskId;
  const started = Date.now();

  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 2500));

    const res = await fetch(`/api/model?id=${encodeURIComponent(taskId)}`);
    const json = (await res.json().catch(() => ({}))) as Zeros3DJobStatus;

    if (!res.ok || json.error) {
      throw new Error(json.error || "Zeros 3D engine status check failed.");
    }

    if (json.taskId) taskId = json.taskId;
    onProgress?.(Math.max(0, Math.min(100, json.progress ?? 0)));

    if (json.status === "success" && json.url) return json.url;
    if (["failed", "cancelled", "canceled", "expired", "unknown"].includes(json.status ?? "")) {
      throw new Error(`Zeros 3D generation ${json.status}.`);
    }

    if (Date.now() - started > 20 * 60 * 1000) {
      throw new Error("Zeros 3D generation timed out. Please try again.");
    }
  }
}
