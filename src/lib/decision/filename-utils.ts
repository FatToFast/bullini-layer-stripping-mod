/**
 * Filename utilities for benchmark storage.
 * Ensures consistent, filesystem-safe naming across save/load operations.
 */

/**
 * Slugify a value for use in filenames.
 * Preserves Korean characters while converting other special chars to hyphens.
 * Mirrors the logic in article-benchmark.ts for consistency.
 */
export function slugifyFilename(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/**
 * Encode a filename for URL transmission.
 * Use this when passing filenames through query params.
 */
export function encodeFilename(filename: string): string {
  return encodeURIComponent(filename);
}

/**
 * Decode a filename from URL transmission.
 * Use this when receiving filenames through query params.
 */
export function decodeFilename(encoded: string): string {
  return decodeURIComponent(encoded);
}

/**
 * Validate that a filename is filesystem-safe.
 * Allows alphanumeric, Korean, dots, underscores, and hyphens.
 */
export function isValidFilename(filename: string): boolean {
  return /^[a-zA-Z0-9가-힣._-]+$/.test(filename);
}
