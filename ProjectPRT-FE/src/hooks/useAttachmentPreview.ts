import { useEffect, useMemo, useState } from 'react';

import {
  getAttachmentPreviewKind,
  normalizeMimeType,
} from '../utils/attachmentPreview';

interface UseAttachmentPreviewOptions {
  url?: string | null;
  mimeType?: string | null;
}

export const useAttachmentPreview = ({ url, mimeType }: UseAttachmentPreviewOptions) => {
  const normalizedMimeType = useMemo(() => normalizeMimeType(mimeType), [mimeType]);
  const [resolvedMimeType, setResolvedMimeType] = useState<string | null>(normalizedMimeType || null);
  const [pdfObjectUrl, setPdfObjectUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewKind = useMemo(
    () => getAttachmentPreviewKind(url, resolvedMimeType || normalizedMimeType),
    [normalizedMimeType, resolvedMimeType, url]
  );

  const isCrossOrigin = useMemo(() => {
    if (!url || typeof window === 'undefined') {
      return false;
    }

    try {
      return new URL(url, window.location.href).origin !== window.location.origin;
    } catch {
      return false;
    }
  }, [url]);

  useEffect(() => {
    let objectUrl: string | null = null;
    let isCancelled = false;

    setResolvedMimeType(normalizedMimeType || null);
    setPdfObjectUrl(null);
    setError(null);
    setIsLoading(false);

    if (!url) {
      return;
    }

    const initialPreviewKind = getAttachmentPreviewKind(url, normalizedMimeType);
    if (initialPreviewKind === 'image') {
      return;
    }

    // Cross-origin signed URLs can be embedded directly in iframe/img,
    // but browser fetch() requires the storage origin to explicitly allow CORS.
    if (isCrossOrigin) {
      return;
    }

    const inspectAttachment = async () => {
      setIsLoading(true);

      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch attachment: ${response.statusText}`);
        }

        const responseMimeType = normalizeMimeType(response.headers.get('content-type'));
        if (!isCancelled && responseMimeType) {
          setResolvedMimeType(responseMimeType);
        }

        const detectedPreviewKind = getAttachmentPreviewKind(
          url,
          responseMimeType || normalizedMimeType
        );

        if (detectedPreviewKind !== 'pdf') {
          await response.body?.cancel?.();
          return;
        }

        const blob = await response.blob();
        if (isCancelled) {
          return;
        }

        objectUrl = URL.createObjectURL(blob);
        setPdfObjectUrl(objectUrl);
      } catch (previewError) {
        if (isCancelled) {
          return;
        }

        console.error('Error resolving attachment preview:', previewError);
        setError('ไม่สามารถแสดงตัวอย่างไฟล์ได้ แต่ยังเปิดเอกสารในแท็บใหม่ได้');
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    inspectAttachment();

    return () => {
      isCancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [isCrossOrigin, normalizedMimeType, url]);

  return {
    error,
    isCrossOrigin,
    isLoading,
    pdfObjectUrl,
    previewKind,
    resolvedMimeType,
  };
};
