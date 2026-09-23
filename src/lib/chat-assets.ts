import { supabase } from "@/integrations/supabase/client";

export const CHAT_ASSET_BUCKET = "ZerosMessages";

export type StoredAsset = { storagePath: string; mimeType: string; name: string };

export async function uploadChatAsset(userId: string, conversationId: string, blob: Blob, name: string): Promise<StoredAsset> {
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = userId + "/" + conversationId + "/" + crypto.randomUUID() + "-" + safeName;
  const { error } = await supabase.storage.from(CHAT_ASSET_BUCKET).upload(path, blob, {
    contentType: blob.type || "application/octet-stream", upsert: false, cacheControl: "31536000",
  });
  if (error) throw error;
  return { storagePath: path, mimeType: blob.type || "application/octet-stream", name: safeName };
}

export async function signedChatAssetUrl(storagePath: string, expiresIn = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from(CHAT_ASSET_BUCKET).createSignedUrl(storagePath, expiresIn);
  if (error || !data?.signedUrl) throw error ?? new Error("Could not create asset URL.");
  return data.signedUrl;
}

export async function deleteChatAssets(paths: string[]): Promise<void> {
  const clean = [...new Set(paths.filter(Boolean))];
  if (!clean.length) return;
  for (let i = 0; i < clean.length; i += 1000) {
    const { error } = await supabase.storage.from(CHAT_ASSET_BUCKET).remove(clean.slice(i, i + 1000));
    if (error) throw error;
  }
}
