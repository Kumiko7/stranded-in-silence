/**
 * Which audio files actually exist.
 *
 * `assets/` is Vite's public directory, so anything under `assets/audio/` is
 * served at `/audio/...` untouched. The glob below is enumerated at build time
 * and its loaders are never called - we only want the key list, so that a sound
 * composer can drop a file in and have it replace the synthesised version with
 * no code or config change.
 */
const MODULES = import.meta.glob('/assets/audio/**/*.{ogg,mp3,wav,webm,m4a,flac}');

const PREFIX = '/assets/audio/';
const PRESENT = new Set(Object.keys(MODULES).map((path) => path.slice(PREFIX.length)));

/** Playable URL for a registry path (`sfx/door_open.ogg`), or null if absent. */
export function fileUrl(relative: string): string | null {
  return PRESENT.has(relative) ? `/audio/${relative}` : null;
}

/** The first of a registry's candidate files that is actually there. */
export function firstPresent(files: readonly string[]): string | null {
  for (const file of files) {
    const url = fileUrl(file);
    if (url) return url;
  }
  return null;
}
