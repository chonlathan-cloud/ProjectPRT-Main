import React, { useMemo } from 'react';
import { FileText, X } from 'lucide-react';

import AttachmentPreviewContent from './AttachmentPreviewContent';
import { readDocumentPreviewPayload } from '../utils/documentPreview';

interface DocumentPreviewPageProps {
  previewId: string;
}

export const DocumentPreviewPage: React.FC<DocumentPreviewPageProps> = ({ previewId }) => {
  const payload = useMemo(() => readDocumentPreviewPayload(previewId), [previewId]);

  if (!payload) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xl">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <FileText size={28} />
          </div>
          <h1 className="text-xl font-black text-slate-900">ไม่พบเอกสารสำหรับแสดงผล</h1>
          <p className="mt-2 text-sm text-slate-500">
            กรุณากลับไปที่หน้าระบบและเปิดเอกสารอีกครั้ง
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 text-slate-900">
      <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
            Document Preview
          </p>
          <h1 className="mt-1 truncate text-xl font-black text-slate-900">{payload.title}</h1>
          {payload.subtitle && (
            <p className="truncate text-sm font-medium text-slate-500">{payload.subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.close()}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white transition-colors hover:bg-slate-800"
          >
            <X size={14} />
            ปิดแท็บ
          </button>
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center overflow-auto p-6">
        <AttachmentPreviewContent
          url={payload.url}
          mimeType={payload.mimeType}
          iframeClassName="h-[calc(100vh-130px)] min-h-[760px] w-[min(100%,1100px)] rounded-lg bg-white shadow-xl"
          imageClassName="max-h-[calc(100vh-130px)] max-w-full rounded-lg bg-white object-contain shadow-xl"
        />
      </main>
    </div>
  );
};

export default DocumentPreviewPage;
