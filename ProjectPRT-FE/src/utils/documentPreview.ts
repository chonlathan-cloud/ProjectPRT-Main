export interface DocumentPreviewPayload {
  url: string;
  title: string;
  mimeType?: string | null;
  subtitle?: string | null;
}

const PREVIEW_STORAGE_PREFIX = 'prt_document_preview:';

export const getDocumentPreviewStorageKey = (previewId: string) =>
  `${PREVIEW_STORAGE_PREFIX}${previewId}`;

export const readDocumentPreviewPayload = (previewId: string) => {
  try {
    const rawPayload = localStorage.getItem(getDocumentPreviewStorageKey(previewId));
    return rawPayload ? (JSON.parse(rawPayload) as DocumentPreviewPayload) : null;
  } catch (error) {
    console.error('Failed to read document preview payload:', error);
    return null;
  }
};

export const openDocumentPreview = (payload: DocumentPreviewPayload) => {
  if (!payload.url) {
    return;
  }

  const previewId = crypto.randomUUID();
  localStorage.setItem(getDocumentPreviewStorageKey(previewId), JSON.stringify(payload));

  const previewUrl = new URL(window.location.href);
  previewUrl.search = '';
  previewUrl.hash = '';
  previewUrl.searchParams.set('documentPreview', previewId);

  const newWindow = window.open(previewUrl.toString(), '_blank', 'noopener,noreferrer');
  if (!newWindow) {
    window.alert('ไม่สามารถเปิดแท็บใหม่ได้ กรุณาอนุญาต popup สำหรับเว็บไซต์นี้');
  }
};
