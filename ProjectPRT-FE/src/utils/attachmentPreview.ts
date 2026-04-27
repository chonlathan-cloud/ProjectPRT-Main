export type AttachmentPreviewKind = 'pdf' | 'image' | 'unknown';

export const getAttachmentPathname = (url?: string | null) => {
  if (!url) return '';

  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return url.split('?')[0].toLowerCase();
  }
};

export const normalizeMimeType = (mimeType?: string | null) => {
  if (!mimeType) return '';
  return mimeType.split(';')[0].trim().toLowerCase();
};

export const getAttachmentPreviewKind = (
  url?: string | null,
  mimeType?: string | null
): AttachmentPreviewKind => {
  const normalizedMimeType = normalizeMimeType(mimeType);

  if (normalizedMimeType.includes('pdf')) {
    return 'pdf';
  }

  if (normalizedMimeType.startsWith('image/')) {
    return 'image';
  }

  const pathname = getAttachmentPathname(url);

  if (pathname.endsWith('.pdf')) {
    return 'pdf';
  }

  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(pathname)) {
    return 'image';
  }

  return 'unknown';
};
