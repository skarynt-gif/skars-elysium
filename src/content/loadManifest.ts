import { validateManifest } from './validate.ts';
import type { ValidationResult } from './types.ts';

export class ContentLoadError extends Error {}

/**
 * Fetches and validates the manifest at runtime.
 *
 * `cache: 'no-cache'` makes the browser re-check the manifest on every visit,
 * so a newly added song appears right away, while audio and images (which
 * have unique filenames) stay cached long-term.
 */
export async function loadManifest(
  contentUrl: string,
  releaseTimeZone: string,
  timeoutMs = 15000,
): Promise<ValidationResult> {
  const manifestUrl = new URL(contentUrl, window.location.href).href;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(manifestUrl, { cache: 'no-cache', signal: controller.signal });
    if (!response.ok) {
      throw new ContentLoadError(`The garden's song list could not be loaded (HTTP ${response.status}).`);
    }
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new ContentLoadError("The garden's song list isn't valid JSON. Check for a missing comma or quote.");
    }
    return validateManifest(json, { manifestUrl, releaseTimeZone });
  } catch (err) {
    if (err instanceof ContentLoadError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ContentLoadError("The garden's song list took too long to load.");
    }
    throw new ContentLoadError("The garden's song list could not be reached. Check your connection.");
  } finally {
    window.clearTimeout(timer);
  }
}
