import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

import { getCaseAttachmentContent } from '../services/api';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfCanvasPreviewProps {
  caseId: string;
  attachmentType?: 'QUOTE' | 'RECEIPT' | 'OTHER' | 'PS' | 'SIGNATURE';
  overlayContent?: React.ReactNode;
}

interface RenderedPageSize {
  width: number;
  height: number;
}

export const PdfCanvasPreview: React.FC<PdfCanvasPreviewProps> = ({
  caseId,
  attachmentType = 'PS',
  overlayContent,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [documentProxy, setDocumentProxy] = useState<PDFDocumentProxy | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [pageSize, setPageSize] = useState<RenderedPageSize>({ width: 0, height: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const loadPdfBytes = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const arrayBuffer = await getCaseAttachmentContent(caseId, attachmentType);
        if (isCancelled) {
          return;
        }
        setPdfBytes(new Uint8Array(arrayBuffer));
      } catch (loadError) {
        if (isCancelled) {
          return;
        }
        console.error('Failed to load PDF preview bytes:', loadError);
        setError('ไม่สามารถโหลดไฟล์ PDF สำหรับ preview ได้');
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    loadPdfBytes();

    return () => {
      isCancelled = true;
    };
  }, [attachmentType, caseId]);

  useEffect(() => {
    let isCancelled = false;

    const loadDocument = async () => {
      if (!pdfBytes) {
        setDocumentProxy(null);
        return;
      }

      try {
        const task = getDocument({ data: pdfBytes });
        const pdfDocument = await task.promise;
        if (isCancelled) {
          pdfDocument.destroy();
          return;
        }
        setDocumentProxy(pdfDocument);
      } catch (documentError) {
        if (isCancelled) {
          return;
        }
        console.error('Failed to parse PDF preview:', documentError);
        setError('ไม่สามารถอ่านไฟล์ PDF เพื่อแสดง preview ได้');
      }
    };

    loadDocument();

    return () => {
      isCancelled = true;
    };
  }, [pdfBytes]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? 0;
      setContainerWidth(nextWidth);
    });

    observer.observe(element);
    setContainerWidth(element.clientWidth);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let renderTask: { cancel?: () => void; promise?: Promise<unknown> } | null = null;

    const renderPage = async () => {
      if (!documentProxy || !canvasRef.current || !containerWidth) {
        return;
      }

      const page = await documentProxy.getPage(1);
      const baseViewport = page.getViewport({ scale: 1 });
      const horizontalPadding = 32;
      const availableWidth = Math.max(containerWidth - horizontalPadding, 280);
      const scale = availableWidth / baseViewport.width;
      const viewport = page.getViewport({ scale });
      const devicePixelRatio = window.devicePixelRatio || 1;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) {
        return;
      }

      canvas.width = Math.floor(viewport.width * devicePixelRatio);
      canvas.height = Math.floor(viewport.height * devicePixelRatio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      setPageSize({ width: viewport.width, height: viewport.height });

      renderTask = page.render({
        canvasContext: context,
        viewport,
        transform: devicePixelRatio !== 1 ? [devicePixelRatio, 0, 0, devicePixelRatio, 0, 0] : undefined,
      });

      await renderTask.promise;
    };

    renderPage().catch((renderError) => {
      if (renderError?.name === 'RenderingCancelledException') {
        return;
      }
      console.error('Failed to render PDF preview page:', renderError);
      setError('ไม่สามารถ render preview ของหน้าเอกสารได้');
    });

    return () => {
      renderTask?.cancel?.();
    };
  }, [containerWidth, documentProxy]);

  const pageStyle = useMemo(
    () => ({
      width: pageSize.width ? `${pageSize.width}px` : '100%',
      height: pageSize.height ? `${pageSize.height}px` : 'auto',
    }),
    [pageSize.height, pageSize.width]
  );

  if (isLoading) {
    return (
      <div className="flex min-h-[780px] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          <p>กำลังโหลดเอกสาร...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[780px] items-center justify-center">
        <div className="max-w-md text-center text-slate-500">
          <p className="font-semibold text-slate-700">แสดงตัวอย่าง PDF ไม่สำเร็จ</p>
          <p className="mt-2 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex w-full justify-center">
      <div
        className="relative rounded bg-white shadow-lg ring-1 ring-slate-200"
        style={pageStyle}
      >
        <canvas ref={canvasRef} className="block rounded bg-white" />
        {pageSize.width > 0 && pageSize.height > 0 && overlayContent}
      </div>
    </div>
  );
};

export default PdfCanvasPreview;
