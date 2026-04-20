import React, { useEffect, useRef } from 'react';
import { CornerDownRight } from 'lucide-react';

import { SignaturePlacement } from '../../types';

interface SignatureOverlayBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface DraggableSignatureOverlayProps {
  bounds: SignatureOverlayBounds;
  placement: SignaturePlacement;
  signatureDataUrl: string;
  signedAt?: string | null;
  positionLabel: string;
  sizeLabel: string;
  onChange: (placement: SignaturePlacement) => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const DraggableSignatureOverlay: React.FC<DraggableSignatureOverlayProps> = ({
  bounds,
  placement,
  signatureDataUrl,
  signedAt,
  positionLabel,
  sizeLabel,
  onChange,
}) => {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const resizeHandleRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const overlayElement = overlayRef.current;
    const resizeHandle = resizeHandleRef.current;
    if (!overlayElement || !resizeHandle) {
      return;
    }

    let dragOffsetX = 0;
    let dragOffsetY = 0;

    const handlePointerMove = (event: PointerEvent) => {
      const parent = overlayElement.parentElement;
      if (!parent) {
        return;
      }

      const parentRect = parent.getBoundingClientRect();
      const paperLeft = parentRect.width * bounds.left;
      const paperTop = parentRect.height * bounds.top;
      const paperWidth = parentRect.width * bounds.width;
      const paperHeight = parentRect.height * bounds.height;
      const overlayWidth = paperWidth * placement.width;
      const overlayHeight = overlayElement.getBoundingClientRect().height;

      const maxLeft = Math.max(paperWidth - overlayWidth, 0);
      const maxTop = Math.max(paperHeight - overlayHeight, 0);
      const nextLeft = clamp(event.clientX - parentRect.left - dragOffsetX - paperLeft, 0, maxLeft);
      const nextTop = clamp(event.clientY - parentRect.top - dragOffsetY - paperTop, 0, maxTop);

      onChange({
        ...placement,
        x: paperWidth > 0 ? nextLeft / paperWidth : placement.x,
        y: paperHeight > 0 ? nextTop / paperHeight : placement.y,
      });
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (resizeHandle.contains(event.target as Node)) {
        return;
      }

      const overlayRect = overlayElement.getBoundingClientRect();
      dragOffsetX = event.clientX - overlayRect.left;
      dragOffsetY = event.clientY - overlayRect.top;

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    };

    const handleResizePointerDown = (event: PointerEvent) => {
      event.stopPropagation();
      const parent = overlayElement.parentElement;
      if (!parent) {
        return;
      }

      const parentRect = parent.getBoundingClientRect();
      const paperWidth = parentRect.width * bounds.width;
      const startX = event.clientX;
      const startWidth = placement.width;

      const handleResizeMove = (moveEvent: PointerEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const nextWidth = clamp(
          startWidth + (paperWidth > 0 ? deltaX / paperWidth : 0),
          0.12,
          Math.max(0.14, 0.96 - placement.x)
        );

        onChange({
          ...placement,
          width: nextWidth,
        });
      };

      const handleResizeUp = () => {
        window.removeEventListener('pointermove', handleResizeMove);
        window.removeEventListener('pointerup', handleResizeUp);
      };

      window.addEventListener('pointermove', handleResizeMove);
      window.addEventListener('pointerup', handleResizeUp);
    };

    overlayElement.addEventListener('pointerdown', handlePointerDown);
    resizeHandle.addEventListener('pointerdown', handleResizePointerDown);
    return () => {
      overlayElement.removeEventListener('pointerdown', handlePointerDown);
      resizeHandle.removeEventListener('pointerdown', handleResizePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [bounds.height, bounds.left, bounds.top, bounds.width, onChange, placement]);

  return (
    <div
      ref={overlayRef}
      className="absolute z-20 cursor-move select-none"
      style={{
        left: `${(bounds.left + (placement.x * bounds.width)) * 100}%`,
        top: `${(bounds.top + (placement.y * bounds.height)) * 100}%`,
        width: `${(placement.width * bounds.width) * 100}%`,
      }}
    >
      <div className="pointer-events-none absolute -top-7 left-0 flex items-center gap-1 text-[9px] font-bold text-indigo-600">
        <span className="rounded-full bg-white/90 px-2 py-1 shadow-sm ring-1 ring-indigo-100">{positionLabel}</span>
        <span className="rounded-full bg-white/90 px-2 py-1 shadow-sm ring-1 ring-indigo-100">{sizeLabel}</span>
      </div>
      <div className="relative border border-dashed border-indigo-300/80 bg-transparent px-0.5 py-0.5 shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
        <img src={signatureDataUrl} alt="signature" className="w-full h-auto object-contain" />
        <div className="mt-0.5 text-center text-[8px] font-medium text-slate-500">
          {signedAt || 'Approved at: pending'}
        </div>
      </div>
      <button
        ref={resizeHandleRef}
        type="button"
        className="absolute -bottom-3 -right-3 flex h-7 w-7 items-center justify-center rounded-full border border-indigo-200 bg-white text-indigo-500 shadow-md"
      >
        <CornerDownRight className="h-4 w-4" />
      </button>
    </div>
  );
};

export default DraggableSignatureOverlay;
