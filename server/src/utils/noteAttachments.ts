import type { PoolClient } from "pg";
import {
  uploadBase64Image,
  deleteStorageFile,
  getSupabaseConfig,
  MAX_FILE_SIZE_BYTES,
} from "./uploadBase64Image.js";

export interface AttachmentInput {
  fileName?: string;
  mimeType?: string;
  base64Data?: string;
}

export interface UploadedAttachment {
  fileName: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  publicUrl: string;
}

function sanitizeFileName(name: string | undefined): string {
  if (!name) return "attachment";
  return name.trim().slice(0, 255) || "attachment";
}

function approximateBase64Size(base64Data: string): number {
  const padding = base64Data.endsWith("==") ? 2 : base64Data.endsWith("=") ? 1 : 0;
  return Math.floor((base64Data.length * 3) / 4) - padding;
}

export async function uploadNoteAttachments(
  attachments: AttachmentInput[] | undefined | null,
  folder: string,
): Promise<UploadedAttachment[]> {
  if (!attachments || !Array.isArray(attachments) || attachments.length === 0) {
    return [];
  }

  const uploaded: UploadedAttachment[] = [];

  try {
    for (const att of attachments) {
      if (!att || !att.base64Data) continue;

      const dataUrl = att.base64Data.startsWith("data:")
        ? att.base64Data
        : `data:${att.mimeType || "application/octet-stream"};base64,${att.base64Data}`;

      const match = dataUrl.match(/^data:([a-zA-Z0-9+.\/-]+);base64,([A-Za-z0-9+/=]+)$/);
      if (match) {
        const rawSize = approximateBase64Size(match[2]);
        if (rawSize > MAX_FILE_SIZE_BYTES) {
          throw new Error(
            `Attachment "${sanitizeFileName(att.fileName)}" exceeds the 10MB size limit.`,
          );
        }
      }

      const result = await uploadBase64Image(dataUrl, folder);
      uploaded.push({
        fileName: sanitizeFileName(att.fileName),
        storagePath: result.filePath,
        mimeType: result.mimeType,
        sizeBytes: result.sizeBytes,
        publicUrl: result.publicUrl,
      });
    }

    return uploaded;
  } catch (err) {
    await Promise.all(
      uploaded.map((u) => deleteStorageFile(u.storagePath)),
    );
    throw err;
  }
}

export async function rollbackUploadedAttachments(
  uploaded: UploadedAttachment[],
): Promise<void> {
  if (!uploaded || uploaded.length === 0) return;
  await Promise.all(uploaded.map((u) => deleteStorageFile(u.storagePath)));
}

export async function insertNoteAttachmentRows(
  client: PoolClient,
  tableName: string,
  noteId: number,
  uploaded: UploadedAttachment[],
  uploadedBy: string | number | null,
): Promise<void> {
  for (const att of uploaded) {
    await client.query(
      `INSERT INTO ${tableName} (note_id, file_name, storage_path, mime_type, size_bytes, uploaded_at, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6)`,
      [noteId, att.fileName, att.storagePath, att.mimeType, att.sizeBytes, uploadedBy],
    );
  }
}

export function buildAttachmentPublicUrl(storagePath: string | null | undefined): string | null {
  if (!storagePath || !storagePath.trim()) return null;
  try {
    const { client: supabase, bucket } = getSupabaseConfig();
    const cleaned = storagePath.startsWith("/") ? storagePath.slice(1) : storagePath;
    const { data } = supabase.storage.from(bucket).getPublicUrl(cleaned);
    return data.publicUrl;
  } catch {
    return null;
  }
}
