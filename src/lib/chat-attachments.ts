import type { ParticleSculptSpec } from "@/lib/particle-model";
import { clampParticleSpec } from "@/lib/particle-model";
import { particleSpecToGlb } from "@/lib/particle-glb";
import type { WebProject } from "@/lib/web-project";
import type { SongSpec } from "@/lib/song";
import {
  fetchChatJson,
  signedChatAssetUrl,
  uploadChatAsset,
  uploadChatJson,
} from "@/lib/chat-assets";

export type ChatAttachment =
  | { kind: "image"; src: string; storagePath?: string }
  | {
      kind: "model";
      source?: string;
      prompt?: string;
      spec?: ParticleSculptSpec;
      storagePath?: string;
      glbPath?: string;
    }
  | { kind: "web"; project: WebProject; storagePath?: string }
  | { kind: "song"; spec: SongSpec; storagePath?: string };

/** Upload model spec + GLB into the same KerisAccounts bucket as images. */
export async function persistModelAssets(
  userId: string,
  conversationId: string,
  spec: ParticleSculptSpec,
): Promise<{ storagePath?: string; glbPath?: string }> {
  try {
    const clamped = clampParticleSpec(spec);
    const jsonAsset = await uploadChatJson(userId, conversationId, clamped, "keris-model-spec.json");
    const glb = particleSpecToGlb(clamped);
    const glbAsset = await uploadChatAsset(userId, conversationId, glb, "keris-model.glb");
    return { storagePath: jsonAsset.storagePath, glbPath: glbAsset.storagePath };
  } catch (e) {
    console.error("[Keris] model asset upload failed:", e);
    return {};
  }
}

/** Upload website project JSON into KerisAccounts. */
export async function persistWebAssets(
  userId: string,
  conversationId: string,
  project: WebProject,
): Promise<{ storagePath?: string }> {
  try {
    const asset = await uploadChatJson(userId, conversationId, project, "keris-website.json");
    return { storagePath: asset.storagePath };
  } catch (e) {
    console.error("[Keris] website asset upload failed:", e);
    return {};
  }
}

/** Upload rendered song WAV into KerisAccounts. */
export async function persistSongAssets(
  userId: string,
  conversationId: string,
  blob: Blob,
  title: string,
): Promise<{ storagePath?: string }> {
  try {
    const asset = await uploadChatAsset(
      userId,
      conversationId,
      blob,
      `${title || "keris-song"}.wav`,
    );
    return { storagePath: asset.storagePath };
  } catch (e) {
    console.error("[Keris] song asset upload failed:", e);
    return {};
  }
}

/** Rehydrate attachment blobs/specs from the shared bucket (cross-device). */
export async function hydrateAttachment(
  attachment: ChatAttachment | null,
  messageId: string,
): Promise<{ attachment: ChatAttachment | null; songUrl?: string }> {
  if (!attachment) return { attachment: null };
  try {
    if (attachment.kind === "image" && attachment.storagePath) {
      const url = await signedChatAssetUrl(attachment.storagePath);
      return { attachment: { ...attachment, src: url } };
    }
    if (attachment.kind === "song" && attachment.storagePath) {
      const url = await signedChatAssetUrl(attachment.storagePath);
      return { attachment, songUrl: url };
    }
    if (attachment.kind === "model") {
      if (!attachment.spec && attachment.storagePath) {
        const remote = await fetchChatJson<ParticleSculptSpec>(attachment.storagePath);
        return { attachment: { ...attachment, spec: remote } };
      }
      return { attachment };
    }
    if (attachment.kind === "web") {
      const hasFiles = attachment.project && Object.keys(attachment.project.files ?? {}).length > 0;
      if (!hasFiles && attachment.storagePath) {
        const remote = await fetchChatJson<WebProject>(attachment.storagePath);
        return { attachment: { ...attachment, project: remote } };
      }
      return { attachment };
    }
  } catch (e) {
    console.error("[Keris] chat asset restore failed:", messageId, e);
  }
  return { attachment };
}
