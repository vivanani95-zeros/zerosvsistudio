import { supabase } from "@/integrations/supabase/client";

/** Same bucket used for images, songs, 3D GLBs, and website archives. */
export const CHAT_ASSET_BUCKET = "ZerosMessages";

export type StoredAsset = { storagePath: string; mimeType: string; name: string };

export async function uploadChatAsset(
  userId: string,
  conversationId: string,
  blob: Blob,
  name: string,
): Promise<StoredAsset> {
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${userId}/${conversationId}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from(CHAT_ASSET_BUCKET).upload(path, blob, {
    contentType: blob.type || "application/octet-stream",
    upsert: false,
    cacheControl: "31536000",
  });
  if (error) throw error;
  return {
    storagePath: path,
    mimeType: blob.type || "application/octet-stream",
    name: safeName,
  };
}

/** Upload any serializable payload (model spec, web project) as JSON into the chat bucket. */
export async function uploadChatJson(
  userId: string,
  conversationId: string,
  data: unknown,
  name: string,
): Promise<StoredAsset> {
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  return uploadChatAsset(userId, conversationId, blob, name.endsWith(".json") ? name : `${name}.json`);
}

export async function signedChatAssetUrl(storagePath: string, expiresIn = 3600 * 24 * 7): Promise<string> {
  const { data, error } = await supabase.storage
    .from(CHAT_ASSET_BUCKET)
    .createSignedUrl(storagePath, expiresIn);
  if (error || !data?.signedUrl) throw error ?? new Error("Could not create asset URL.");
  return data.signedUrl;
}

/** Fetch a JSON asset previously stored in the chat bucket. */
export async function fetchChatJson<T = unknown>(storagePath: string): Promise<T> {
  const url = await signedChatAssetUrl(storagePath);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Asset fetch failed (${res.status})`);
  return (await res.json()) as T;
}

export async function deleteChatAssets(paths: string[]): Promise<void> {
  const clean = [...new Set(paths.filter(Boolean))];
  if (!clean.length) return;
  for (let i = 0; i < clean.length; i += 1000) {
    const { error } = await supabase.storage.from(CHAT_ASSET_BUCKET).remove(clean.slice(i, i + 1000));
    if (error) throw error;
  }
}
