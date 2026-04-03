import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET;

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const FOLDER_PATTERN = /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/;

function getSupabaseConfig() {
  if (!SUPABASE_URL) {
    throw new Error("Missing environment variable: SUPABASE_URL");
  }
  if (!SUPABASE_KEY) {
    throw new Error("Missing environment variable: SUPABASE_KEY");
  }
  if (!SUPABASE_STORAGE_BUCKET) {
    throw new Error("Missing environment variable: SUPABASE_STORAGE_BUCKET");
  }
  return {
    client: createClient(SUPABASE_URL, SUPABASE_KEY),
    bucket: SUPABASE_STORAGE_BUCKET,
  };
}

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/tiff": "tiff",
};

export async function uploadBase64Image(
  base64String: string,
  folder: string
): Promise<{ filePath: string; publicUrl: string }> {
  if (!folder || !FOLDER_PATTERN.test(folder)) {
    throw new Error(
      "Invalid folder name. Must be non-empty, must not start or end with '/', and must contain only alphanumeric characters, underscores, and hyphens between slashes."
    );
  }

  const match = base64String.match(
    /^data:(image\/[a-zA-Z0-9+.-]+);base64,([A-Za-z0-9+/=]+)$/
  );
  if (!match) {
    throw new Error(
      "Invalid Base64 image string. Expected format: data:<mime>;base64,<data>"
    );
  }

  const mimeType = match[1];
  const base64Data = match[2];

  const ext = MIME_TO_EXT[mimeType];
  if (!ext) {
    throw new Error(`Unsupported image MIME type: ${mimeType}`);
  }

  const buffer = Buffer.from(base64Data, "base64");

  if (buffer.length === 0) {
    throw new Error("Decoded image buffer is empty.");
  }

  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `Image exceeds maximum allowed size of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`
    );
  }

  const filename = `${uuidv4()}.${ext}`;
  const storagePath = `${folder}/${filename}`;

  const { client: supabase, bucket } = getSupabaseConfig();

  const { error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (error) {
    throw new Error(`Supabase Storage upload failed: ${error.message}`);
  }

  const { data: urlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(storagePath);

  const filePath = `/${storagePath}`;

  return {
    filePath,
    publicUrl: urlData.publicUrl,
  };
}

const FILE_PATH_PATTERN = /^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\/[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/;

export function getPublicFileUrl(
  path: string | null | undefined
): { path: string; publicUrl: string } | null {
  if (!path || path.trim() === "") {
    return null;
  }

  const trimmed = path.trim();

  if (!FILE_PATH_PATTERN.test(trimmed)) {
    throw new Error(
      `Invalid file path format: "${trimmed}". Expected format: /{folder}/{filename}.{ext}`
    );
  }

  const storagePath = trimmed.slice(1);

  const { client: supabase, bucket } = getSupabaseConfig();

  const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);

  return {
    path: trimmed,
    publicUrl: data.publicUrl,
  };
}
