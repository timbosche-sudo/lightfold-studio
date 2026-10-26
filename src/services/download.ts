/**
 * Trigger a file download. Works in iPad Safari (iOS 13+), which shows its
 * download prompt for anchor downloads of Blob URLs.
 */
export interface DownloadHandle {
  url: string;
  filename: string;
}

export function downloadBlob(data: BlobPart, filename: string, type = 'application/octet-stream'): DownloadHandle {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Kept alive so the UI can offer a manual "download again" link, which
  // Safari needs if it blocked the programmatic click after an async build.
  setTimeout(() => URL.revokeObjectURL(url), 10 * 60_000);
  return { url, filename };
}

export function slugify(name: string): string {
  return (
    name
      .trim()
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'Untitled'
  );
}
