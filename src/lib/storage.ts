import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { supabaseAdmin } from './supabase.js';

export type ImageFolder = 'dishes' | 'chefs' | 'ingredients';

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const ALLOWED: Record<string, { ext: string; matches: (b: Buffer) => boolean }> = {
  'image/jpeg': { ext: 'jpg', matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': {
    ext: 'png',
    matches: (b) =>
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  'image/webp': {
    ext: 'webp',
    matches: (b) =>
      b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
};

export interface UploadedFile {
  fieldname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Returns an error message, or null if the file is an acceptable image. */
export function validateImage(file: UploadedFile): string | null {
  const rule = ALLOWED[file.mimetype];
  if (!rule) return 'Image must be JPEG, PNG or WebP';
  if (file.size > MAX_IMAGE_BYTES) return 'Image must be 2 MB or smaller';
  if (!rule.matches(file.buffer)) return 'File content does not match its image type';
  return null;
}

/** Uploads a (validated) image and returns its public URL. */
export async function uploadImage(folder: ImageFolder, file: UploadedFile): Promise<string> {
  const rule = ALLOWED[file.mimetype];
  if (!rule) throw new Error('uploadImage called with unvalidated file');
  const path = `${folder}/${randomUUID()}.${rule.ext}`;
  const bucket = supabaseAdmin.storage.from(env.STORAGE_BUCKET);
  const { error } = await bucket.upload(path, file.buffer, {
    contentType: file.mimetype,
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw new Error(`Image upload failed: ${error.message}`);
  return bucket.getPublicUrl(path).data.publicUrl;
}

const publicPrefix = () =>
  `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/${env.STORAGE_BUCKET}/`;

/** Storage path for a URL in our bucket, or null for external URLs (e.g. seed placeholders). */
export function storagePathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const prefix = publicPrefix();
  return url.startsWith(prefix) ? decodeURIComponent(url.slice(prefix.length)) : null;
}

/** Best-effort delete; only touches objects inside our bucket. Never throws. */
export async function deleteImageByUrl(url: string | null | undefined): Promise<void> {
  const path = storagePathFromUrl(url);
  if (!path) return;
  const { error } = await supabaseAdmin.storage.from(env.STORAGE_BUCKET).remove([path]);
  if (error) console.warn(`[storage] failed to delete ${path}: ${error.message}`);
}

/** Pick the uploaded file for a given form field from multer's `.any()` result. */
export function fileFor(files: unknown, field: string): UploadedFile | undefined {
  if (!Array.isArray(files)) return undefined;
  const f = (files as UploadedFile[]).find((x) => x.fieldname === field && x.size > 0);
  return f;
}

/**
 * Runs a DB write with an optional image change:
 *  - new file  -> upload first, pass its URL to `save`; delete it again if `save` throws
 *  - remove    -> pass `null`
 *  - otherwise -> pass `undefined` (leave column unchanged)
 * After a successful save, the replaced/removed image is deleted from storage.
 */
export async function saveWithImage<T>(
  opts: { folder: ImageFolder; file?: UploadedFile; remove?: boolean; currentUrl?: string | null },
  save: (imageUrl: string | null | undefined) => Promise<T>,
): Promise<T> {
  const uploaded = opts.file ? await uploadImage(opts.folder, opts.file) : undefined;
  const imageUrl = uploaded ?? (opts.remove ? null : undefined);
  let result: T;
  try {
    result = await save(imageUrl);
  } catch (e) {
    if (uploaded) await deleteImageByUrl(uploaded);
    throw e;
  }
  if (imageUrl !== undefined && opts.currentUrl && opts.currentUrl !== imageUrl) {
    await deleteImageByUrl(opts.currentUrl);
  }
  return result;
}
