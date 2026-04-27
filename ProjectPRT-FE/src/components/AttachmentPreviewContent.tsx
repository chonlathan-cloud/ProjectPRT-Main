import React from 'react';
import { FileText } from 'lucide-react';

import { useAttachmentPreview } from '../hooks/useAttachmentPreview';

interface AttachmentPreviewContentProps {
  url?: string | null;
  mimeType?: string | null;
  emptyState?: React.ReactNode;
  imageClassName?: string;
  iframeClassName?: string;
}

export const AttachmentPreviewContent: React.FC<AttachmentPreviewContentProps> = ({
  url,
  mimeType,
  emptyState,
  imageClassName = 'max-w-full h-auto rounded-lg shadow-2xl',
  iframeClassName = 'w-full min-h-[780px] h-[78vh] rounded shadow-lg bg-white dark:bg-slate-900',
}) => {
  const { error, isLoading, pdfObjectUrl, previewKind } = useAttachmentPreview({
    url,
    mimeType,
  });

  if (!url) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        {emptyState || (
          <div className="max-w-md text-center text-slate-500 dark:text-slate-400">
            <p className="font-semibold text-slate-700 dark:text-slate-200">ไม่มีไฟล์แนบสำหรับรายการนี้</p>
          </div>
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-slate-400 h-full w-full">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p>กำลังโหลดเอกสาร...</p>
      </div>
    );
  }

  if (previewKind === 'pdf') {
    const pdfSrc = pdfObjectUrl || url;

    if (pdfSrc) {
      return <iframe src={pdfSrc} className={iframeClassName} title="pdf-preview" />;
    }

    return (
      <div className="flex items-center justify-center h-full w-full">
        <div className="max-w-md text-center text-slate-500 dark:text-slate-400">
          <p className="font-semibold text-slate-700 dark:text-slate-200">แสดงตัวอย่าง PDF ไม่สำเร็จ</p>
          <p className="mt-2 text-sm">{error || 'กรุณาลองเปิดเอกสารในแท็บใหม่'}</p>
        </div>
      </div>
    );
  }

  if (previewKind === 'image') {
    return <img src={url} alt="attachment-preview" className={imageClassName} />;
  }

  return (
    <div className="flex items-center justify-center h-full w-full">
      <div className="max-w-md text-center text-slate-500 dark:text-slate-400">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-200/70 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
          <FileText size={28} />
        </div>
        <p className="font-semibold text-slate-700 dark:text-slate-200">ยังไม่รองรับตัวอย่างไฟล์ชนิดนี้</p>
        <p className="mt-2 text-sm">{error || 'กรุณาเปิดเอกสารในแท็บใหม่เพื่อตรวจสอบไฟล์ต้นฉบับ'}</p>
      </div>
    </div>
  );
};

export default AttachmentPreviewContent;
