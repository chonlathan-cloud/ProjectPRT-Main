import React, { useEffect, useRef, useState } from 'react';
import { Eraser, PenLine } from 'lucide-react';

interface SignaturePadProps {
  onSave: (dataUrl: string) => void;
}

const CANVAS_WIDTH = 520;
const CANVAS_HEIGHT = 180;

export const SignaturePad: React.FC<SignaturePadProps> = ({ onSave }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [hasStroke, setHasStroke] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = 2.6;
    context.strokeStyle = '#1e293b';
  }, []);

  const getCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) {
      return;
    }

    const point = getCanvasPoint(event);
    canvas.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineTo(point.x + 0.1, point.y + 0.1);
    context.stroke();
    setHasStroke(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) {
      return;
    }

    const point = getCanvasPoint(event);
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const stopDrawing = (event?: React.PointerEvent<HTMLCanvasElement>) => {
    if (event && canvasRef.current?.hasPointerCapture(event.pointerId)) {
      canvasRef.current.releasePointerCapture(event.pointerId);
    }
    drawingRef.current = false;
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    setHasStroke(false);
  };

  const handleUseSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasStroke) {
      return;
    }
    onSave(canvas.toDataURL('image/png'));
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-800">Signature Pad</p>
          <p className="text-xs text-slate-500">เซ็นด้วยเมาส์หรือ trackpad แล้วกดใช้งานลายเซ็น</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleClear}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50"
          >
            <Eraser className="h-4 w-4" />
            ล้าง
          </button>
          <button
            type="button"
            onClick={handleUseSignature}
            disabled={!hasStroke}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <PenLine className="h-4 w-4" />
            ใช้ลายเซ็นนี้
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-3">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDrawing}
          onPointerLeave={stopDrawing}
          className="h-[180px] w-full cursor-crosshair rounded-xl bg-transparent touch-none"
        />
      </div>
    </div>
  );
};

export default SignaturePad;
