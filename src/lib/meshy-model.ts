export async function generateMeshyModel(
  prompt: string,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const create = await fetch("/api/model", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });

  const created = (await create.json().catch(() => ({}))) as {
    taskId?: string;
    error?: string;
  };

  if (!create.ok || !created.taskId) {
    throw new Error(created.error || "Meshy 6 could not start the 3D generation job.");
  }

  let taskId = created.taskId;
  const started = Date.now();

  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const res = await fetch(`/api/model?id=${encodeURIComponent(taskId)}`);
    const json = (await res.json().catch(() => ({}))) as {
      status?: string;
      progress?: number;
      url?: string | null;
      taskId?: string;
      error?: string;
    };

    if (!res.ok || json.error) {
      throw new Error(json.error || "Meshy 6 status check failed.");
    }

    if (json.taskId) taskId = json.taskId;
    onProgress?.(Math.max(0, Math.min(100, json.progress ?? 0)));

    if (json.status === "success" && json.url) return json.url;
    if (["failed", "cancelled", "canceled", "expired", "unknown"].includes(json.status ?? "")) {
      throw new Error(`Meshy 6 job ${json.status}.`);
    }

    if (Date.now() - started > 15 * 60 * 1000) {
      throw new Error("Meshy 6 generation timed out. Please try again.");
    }
  }
}
