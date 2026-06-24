import React from 'react';
import { ExternalLink, FileText, Image as ImageIcon } from 'lucide-react';

import AttachmentPreviewContent from './AttachmentPreviewContent';
import { getAttachmentPreviewKind } from '../utils/attachmentPreview';
import { openDocumentPreview } from '../utils/documentPreview';

interface AttachmentPreviewPanelProps {
  url?: string | null;
  mimeType?: string | null;
  title: string;
  subtitle?: string;
  eyebrow?: string;
  emptyState?: React.ReactNode;
  actions?: React.ReactNode;
  overlayContent?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  showOpenButton?: boolean;
}

const getPreviewBadge = (url?: string | null, mimeType?: string | null) => {
  const previewKind = getAttachmentPreviewKind(url, mimeType);

  if (!url) {
    return {
      icon: FileText,
      label: 'No Attachment',
    };
  }

  if (previewKind === 'pdf') {
    return {
      icon: FileText,
      label: 'PDF',
    };
  }

  if (previewKind === 'image') {
    return {
      icon: ImageIcon,
      label: 'Image',
    };
  }

  return {
    icon: FileText,
    label: 'File',
  };
};

export const AttachmentPreviewPanel: React.FC<AttachmentPreviewPanelProps> = ({
  url,
  mimeType,
  title,
  subtitle,
  eyebrow = 'Attachment Preview',
  emptyState,
  actions,
  overlayContent,
  className = 'overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900',
  bodyClassName = 'h-[600px] bg-slate-100 p-6 dark:bg-slate-950 overflow-y-auto',
  showOpenButton = true,
}) => {
  const badge = getPreviewBadge(url, mimeType);
  const BadgeIcon = badge.icon;

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 bg-slate-50/70 px-6 py-4 dark:border-slate-800 dark:bg-slate-950/70">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">{eyebrow}</p>
          <h2 className="mt-1 truncate text-xl font-black text-slate-800 dark:text-white">{title}</h2>
          {subtitle && <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            <BadgeIcon size={14} />
            {badge.label}
          </div>
          {actions}
          {showOpenButton && url && (
            <button
              type="button"
              onClick={() => openDocumentPreview({ url, title, mimeType, subtitle })}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <ExternalLink size={14} />
              เปิดเอกสาร
            </button>
          )}
        </div>
      </div>

      <div className={`relative ${bodyClassName}`}>
        <AttachmentPreviewContent
          url={url}
          mimeType={mimeType}
          emptyState={emptyState}
        />
        {overlayContent}
      </div>
    </div>
  );
};

export default AttachmentPreviewPanel;
