/** Public URL for a stored file. R2 public base in production, API-served in development. */
export function fileUrl(storageKey: string) {
  const base = process.env['R2_PUBLIC_BASE_URL'];
  return base ? `${base.replace(/\/$/, '')}/${storageKey}` : `/api/v1/uploads/files/${storageKey}`;
}
