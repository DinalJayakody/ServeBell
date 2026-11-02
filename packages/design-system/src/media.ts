/**
 * Media URLs from the API may be relative in development (local storage).
 * The host app registers a resolver once; Avatar/Thumb resolve automatically.
 */
let resolver: (url: string) => string = (u) => u;

export function setMediaResolver(fn: (url: string) => string) {
  resolver = fn;
}

export function resolveMedia(url: string | null | undefined) {
  return url ? resolver(url) : null;
}
