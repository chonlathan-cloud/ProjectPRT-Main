import React, { useState, useEffect } from 'react';
import { AdminCaseView, SignaturePlacement } from '../../types';
import { getCases, approveCase, rejectCase } from '../services/api';
import AttachmentPreviewPanel from './AttachmentPreviewPanel';
import SignaturePad from './SignaturePad';
import DraggableSignatureOverlay from './DraggableSignatureOverlay';
import {
  createTransparentSignatureDataUrl,
  getDefaultSignatureCleanupThreshold,
} from '../utils/signatureProcessing';
import { 
  CheckCircle, 
  XCircle, 
  ExternalLink,
  FileText,
  Calendar, 
  AlertCircle,
  Clock,
  Briefcase,
  Building2,
  CheckCircle2,
  Signature,
  PenLine,
  Eye,
  X,
  ShieldCheck
} from 'lucide-react';

interface ApprovedCaseView extends AdminCaseView {
  approvedPdfUrl?: string | null;
}

interface ApprovedPreviewState {
  caseId: string;
  url: string;
  docNo?: string | null;
}

const PDF_PREVIEW_PAPER_BOUNDS = {
  left: 0.105,
  top: 0.095,
  width: 0.79,
  height: 0.84,
};

const APPROVER_SIGNATURE_SNAP: SignaturePlacement = {
  x: 0.6,
  y: 0.87,
  width: 0.18,
};

const formatApprovalTimestampUtc = (date: Date) => {
  const isoText = date.toISOString().replace('T', ' ');
  return `Approved at: ${isoText.slice(0, 19)} UTC`;
};

export const AdminApproval: React.FC = () => {
  const [cases, setCases] = useState<AdminCaseView[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCase, setSelectedCase] = useState<AdminCaseView | null>(null);
  const [userSignature, setUserSignature] = useState<string | null>(null);
  const [signatureSource, setSignatureSource] = useState<string | null>(null);
  const [signatureCleanupThreshold, setSignatureCleanupThreshold] = useState(getDefaultSignatureCleanupThreshold());
  const [isProcessingSignature, setIsProcessingSignature] = useState(false);
  const [isSignaturePadOpen, setIsSignaturePadOpen] = useState(false);
  const [isSigned, setIsSigned] = useState(false);
  const [signedAt, setSignedAt] = useState<string | null>(null);
  const [approvedList, setApprovedList] = useState<ApprovedCaseView[]>([]);
  const [latestApprovedPdfUrl, setLatestApprovedPdfUrl] = useState<string | null>(null);
  const [latestApprovedDocNo, setLatestApprovedDocNo] = useState<string | null>(null);
  const [approvedPreview, setApprovedPreview] = useState<ApprovedPreviewState | null>(null);

  useEffect(() => {
    const savedSig = localStorage.getItem('admin_signature');
    const savedSource = localStorage.getItem('admin_signature_source');
    if (savedSig) setUserSignature(savedSig);
    if (savedSource) setSignatureSource(savedSource);
  }, []);

  // ✅ FIX #2: รีเซ็ต isSigned เมื่อเปลี่ยน case
  useEffect(() => {
    setIsSigned(false);
    setSignedAt(null);
  }, [selectedCase?.id]);

  const applySignature = (signatureDataUrl: string, sourceDataUrl?: string) => {
    setUserSignature(signatureDataUrl);
    setSignatureSource(sourceDataUrl || signatureDataUrl);
    localStorage.setItem('admin_signature', signatureDataUrl);
    localStorage.setItem('admin_signature_source', sourceDataUrl || signatureDataUrl);
    setIsSigned(false);
    setSignedAt(null);
  };

  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        setIsProcessingSignature(true);
        const reader = new FileReader();
        const fileDataUrl = await new Promise<string>((resolve, reject) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('Failed to read signature file'));
          reader.readAsDataURL(file);
        });
        const transparentSignature = await createTransparentSignatureDataUrl(fileDataUrl, {
          backgroundThreshold: signatureCleanupThreshold,
        });
        applySignature(transparentSignature, fileDataUrl);
      } catch (error) {
        console.error('Failed to process signature upload:', error);
        alert('ไม่สามารถประมวลผลลายเซ็นได้ กรุณาลองใช้ไฟล์ภาพที่พื้นหลังเรียบกว่านี้');
      } finally {
        setIsProcessingSignature(false);
        e.target.value = '';
      }
    }
  };

  const handleSignaturePadSave = async (signatureDataUrl: string) => {
    try {
      setIsProcessingSignature(true);
      const transparentSignature = await createTransparentSignatureDataUrl(signatureDataUrl, {
        backgroundThreshold: signatureCleanupThreshold,
      });
      applySignature(transparentSignature, signatureDataUrl);
      setIsSignaturePadOpen(false);
    } catch (error) {
      console.error('Failed to save signature from pad:', error);
      alert('ไม่สามารถบันทึกลายเซ็นจาก Signature Pad ได้');
    } finally {
      setIsProcessingSignature(false);
    }
  };

  const loadPendingCases = async () => {
    try {
      setLoading(true);
      const data = await getCases('SUBMITTED');
      setCases(data as any); 
    } catch (error) {
      console.error("Failed to fetch cases:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPendingCases();
  }, []);

  // ✅ FIX #4: จับเวลาตอนกดลงนาม
  const handleSign = () => {
    if (!userSignature) {
      alert('กรุณาอัปโหลดลายเซ็นหรือใช้ Signature Pad ก่อน');
      return;
    }
    setIsSigned(true);
    setSignedAt(formatApprovalTimestampUtc(new Date()));
  };

  const handleApprove = async (caseId: string) => {
    if (!isSigned) {
      alert('กรุณาลงนาม (Sign) ก่อนทำการอนุมัติ');
      return;
    }

    if (!userSignature) {
      alert('ไม่พบข้อมูลลายเซ็น กรุณาอัปโหลดลายเซ็นอีกครั้ง');
      return;
    }

    try {
      const response = await approveCase(caseId, userSignature, APPROVER_SIGNATURE_SNAP);
      const approvedItem = cases.find(c => c.id === caseId);
      const approvedPdfUrl = response.audit_details?.approved_pdf_url || null;
      if (approvedItem) {
        setApprovedList(prev => [
          {
            ...approvedItem,
            doc_no: response.doc_no,
            approvedPdfUrl,
          },
          ...prev,
        ]);
      }

      setLatestApprovedPdfUrl(approvedPdfUrl);
      setLatestApprovedDocNo(response.doc_no || approvedItem?.doc_no || approvedItem?.case_no || null);
      if (approvedItem && approvedPdfUrl) {
        setSelectedCase({
          ...approvedItem,
          doc_no: response.doc_no || approvedItem.doc_no,
        });
        setApprovedPreview({
          caseId: caseId,
          url: approvedPdfUrl,
          docNo: response.doc_no || approvedItem.doc_no || approvedItem.case_no,
        });
      } else {
        setApprovedPreview(null);
        setSelectedCase(null);
      }
      setIsSigned(false);
      setSignedAt(null);
      loadPendingCases();
    } catch (error) {
      console.error(error);
      alert('เกิดข้อผิดพลาดในการอนุมัติ');
    }
  };

  const handleReject = async (id: string) => {
    const reason = prompt('กรุณาระบุเหตุผลที่ไม่อนุมัติ (ถ้ามี):');
    if (reason === null) return;
    try {
      await rejectCase(id, reason);
      alert('ดำเนินการยกเลิกเรียบร้อย ❌');
      loadPendingCases();
    } catch (error) {
      alert('เกิดข้อผิดพลาดในการยกเลิก');
    }
  };

  const handleReprocessSignature = async () => {
    if (!signatureSource) {
      return;
    }

    try {
      setIsProcessingSignature(true);
      const transparentSignature = await createTransparentSignatureDataUrl(signatureSource, {
        backgroundThreshold: signatureCleanupThreshold,
      });
      applySignature(transparentSignature, signatureSource);
    } catch (error) {
      console.error('Failed to reprocess signature:', error);
      alert('ไม่สามารถปรับความสะอาดของลายเซ็นได้');
    } finally {
      setIsProcessingSignature(false);
    }
  };

  const isShowingApprovedPreview = Boolean(
    selectedCase?.id &&
    approvedPreview?.caseId === selectedCase.id &&
    approvedPreview?.url
  );

  const previewUrl = isShowingApprovedPreview ? approvedPreview?.url ?? null : selectedCase?.ps_url ?? null;
  const previewMimeType = isShowingApprovedPreview ? 'application/pdf' : selectedCase?.mime_type;
  const previewTitle = isShowingApprovedPreview
    ? approvedPreview?.docNo || selectedCase?.doc_no || selectedCase?.case_no
    : selectedCase?.doc_no || selectedCase?.case_no;
  const previewEyebrow = isShowingApprovedPreview ? 'Approved PDF Preview' : 'Document Preview';
  const previewActions = isShowingApprovedPreview ? null : (
    <div className="flex flex-wrap items-center gap-2">
          {userSignature ? (
        <>
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-[11px] font-bold text-indigo-700">
            ตำแหน่งลายเซ็นถูกล็อกไว้ที่ช่องผู้อนุมัติล่างขวา โดยไฟล์จริงยึด backend slot
          </div>
          {!isSigned ? (
            <button
              onClick={handleSign}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white transition-colors hover:bg-slate-800"
            >
              <Signature className="h-4 w-4" />
              ลงนาม (E-Signature)
            </button>
          ) : (
            <button
              onClick={() => selectedCase && handleApprove(selectedCase.id)}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white transition-colors hover:bg-emerald-700"
            >
              <CheckCircle2 className="h-4 w-4" />
              ยืนยันการอนุมัติ
            </button>
          )}
        </>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
          อัปโหลดลายเซ็นก่อนจึงจะลงนามได้
        </div>
      )}
    </div>
  );
  const previewOverlayContent = isShowingApprovedPreview ? null : (
    <>
      {userSignature && (
        <DraggableSignatureOverlay
          bounds={PDF_PREVIEW_PAPER_BOUNDS}
          placement={APPROVER_SIGNATURE_SNAP}
          signatureDataUrl={userSignature}
          signedAt={signedAt}
          positionLabel="ช่องผู้อนุมัติล่างขวา"
          sizeLabel="Locked"
          readOnly
          onChange={() => undefined}
        />
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-6 pb-10">
      <div className="flex flex-col gap-6">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-4">
          {selectedCase && (
            <button 
              onClick={() => { setSelectedCase(null); setApprovedPreview(null); setIsSigned(false); setSignedAt(null); }}
              className="p-2 hover:bg-slate-200 rounded-full transition-colors"
            >
              <X className="w-6 h-6 text-slate-600" />
            </button>
          )}
          <div>
            <h2 className="text-3xl font-bold text-slate-800">
              {selectedCase ? `รีวิวเอกสาร: ${selectedCase.doc_no || selectedCase.case_no}` : 'รายการรออนุมัติ'}
            </h2>
            <div className="flex items-center gap-2 text-slate-500 mt-1">
              <Clock size={18} />
              <p>ตรวจสอบและอนุมัติคำขอเบิกจ่าย (Admin Approval)</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
           {/* Manage Signature */}
           <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
             <Signature size={18} className="text-indigo-500" />
             <div>
               <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Signature</p>
               <div className="mt-1 flex items-center gap-2">
                 <label className="cursor-pointer rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50">
                   {userSignature ? 'เปลี่ยนลายเซ็น' : 'อัปโหลดลายเซ็น'}
                   <input type="file" className="hidden" onChange={handleSignatureUpload} accept="image/*" />
                 </label>
                 <button
                   type="button"
                   onClick={() => setIsSignaturePadOpen(true)}
                   className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 transition-colors hover:bg-indigo-100"
                 >
                   <PenLine className="h-4 w-4" />
                   Signature Pad
                 </button>
               </div>
               <p className="mt-1 text-[11px] text-slate-500">
                 preview ใช้เพื่อดูคร่าว ๆ ของ owner slot ส่วนไฟล์ approved PDF จะยึดตำแหน่ง fixed slot ฝั่ง backend
               </p>
               <div className="mt-2 flex items-center gap-2">
                 <label className="text-[11px] font-semibold text-slate-600">
                   Threshold {signatureCleanupThreshold}
                 </label>
                 <input
                   type="range"
                   min={180}
                   max={252}
                   step={2}
                   value={signatureCleanupThreshold}
                   onChange={(event) => setSignatureCleanupThreshold(Number(event.target.value))}
                   className="w-28 accent-indigo-600"
                 />
                 <button
                   type="button"
                   onClick={handleReprocessSignature}
                   disabled={!signatureSource || isProcessingSignature}
                   className="rounded-xl border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                 >
                   ปรับความสะอาด
                 </button>
               </div>
             </div>
             <div className="flex min-w-[76px] flex-col items-center gap-1 rounded-xl border border-slate-100 bg-slate-50 px-2 py-2">
               {userSignature ? (
                 <img src={userSignature} alt="sig" className="h-10 w-16 object-contain" />
               ) : (
                 <div className="flex h-10 w-16 items-center justify-center text-[10px] font-semibold text-slate-400">
                   No Sig
                 </div>
               )}
               <span className="text-[10px] font-semibold text-slate-500">
                 {isProcessingSignature ? 'กำลังเตรียม...' : userSignature ? 'พร้อมใช้งาน' : 'ยังไม่มี'}
               </span>
             </div>
           </div>

          <div className="bg-amber-50 border border-amber-100 rounded-xl px-5 py-3 flex items-center gap-3 shadow-sm">
            <div className="p-2 bg-amber-100 rounded-full text-amber-600">
              <AlertCircle size={20} />
            </div>
            <div>
              <div className="text-2xl font-bold text-amber-700">{cases.length}</div>
              <div className="text-sm font-medium text-amber-600">รายการรอดำเนินการ</div>
            </div>
          </div>
        </div>
      </div>

      {isSignaturePadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-6 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">Signature Pad</p>
                <h3 className="text-xl font-black text-slate-900">สร้างลายเซ็นดิจิทัล</h3>
                <p className="text-sm text-slate-500">เซ็นลงบนแผ่นด้านล่าง แล้วระบบจะเก็บเป็น PNG โปร่งใสให้อัตโนมัติ</p>
              </div>
              <button
                type="button"
                onClick={() => setIsSignaturePadOpen(false)}
                className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <SignaturePad onSave={handleSignaturePadSave} />
          </div>
        </div>
      )}

      {latestApprovedPdfUrl && (
        <div className="shrink-0 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-bold text-emerald-700">อนุมัติเอกสารเรียบร้อยแล้ว</p>
              <p className="text-sm text-emerald-600">
                {latestApprovedDocNo ? `${latestApprovedDocNo} พร้อมเอกสาร signed PDF` : 'พร้อมเอกสาร signed PDF'}
              </p>
            </div>
            <a
              href={latestApprovedPdfUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-emerald-700"
            >
              <ExternalLink size={16} />
              เปิดเอกสารที่อนุมัติแล้ว
            </a>
          </div>
        </div>
      )}

      <div className="flex flex-1 gap-6">
        {/* Left Column: Selected Case Preview (ONLY in Review Mode) */}
        {selectedCase && (
          <div className="flex-[2] flex flex-col gap-6 transition-all duration-500 animate-in slide-in-from-left-4">
            {/* Document Preview */}
            <AttachmentPreviewPanel
              url={previewUrl}
              mimeType={previewMimeType}
              title={previewTitle}
              subtitle={`${selectedCase.requester_name} • ${selectedCase.requested_amount.toLocaleString()} THB`}
              eyebrow={previewEyebrow}
              actions={previewActions}
              className="flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
              bodyClassName="flex min-h-[820px] items-start justify-center overflow-auto bg-slate-100 p-8"
              emptyState={
                <div className="text-slate-400 flex flex-col items-center gap-4 text-center">
                  <Eye size={64} className="opacity-20" />
                  <p className="font-medium text-lg">กำลังแสดงรายละเอียดเพื่อตรวจสอบ...</p>
                  <div className="p-6 bg-white rounded-xl border border-slate-200 w-full max-w-md mx-auto">
                     <h4 className="font-bold text-slate-800 mb-4 border-b pb-2">รายละเอียดคำขอ</h4>
                     <div className="space-y-3 text-left">
                       <div className="flex justify-between"><span className="text-slate-500">ผู้ส่ง:</span> <b>{selectedCase.requester_name}</b></div>
                       <div className="flex justify-between"><span className="text-slate-500">แผนก:</span> <b>{selectedCase.department}</b></div>
                       <div className="flex justify-between"><span className="text-slate-500">จำนวน:</span> <b className="text-indigo-600">{selectedCase.requested_amount.toLocaleString()} THB</b></div>
                       <div className="pt-2"><span className="text-slate-500 text-xs uppercase font-bold">เหตุผล:</span> <p className="mt-1 text-sm text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-100">{selectedCase.description}</p></div>
                     </div>
                  </div>
                </div>
              }
              overlayContent={previewOverlayContent}
            />
          </div>
        )}

        {/* Right Column: Main Table OR Sidebar View */}
        <div className={`transition-all duration-500 flex flex-col ${selectedCase ? 'flex-1 border-l border-slate-200 bg-white/50 animate-in slide-in-from-right-4' : 'flex-[3]'}`}>
          {selectedCase ? (
            /* Compact Sidebar List of Pending Cases (Review Mode) */
            <div className="flex-1 flex flex-col overflow-hidden">
               <div className="p-4 border-b border-slate-200 bg-slate-50/50">
                 <h3 className="text-sm font-bold text-slate-600 flex items-center gap-2">
                   <Clock className="w-4 h-4 text-amber-500" /> รายการที่เหลือ ({cases.length})
                 </h3>
               </div>
               <div className="flex-1 overflow-y-auto p-4 space-y-3">
                 {cases.map((item) => (
                   <div 
                    key={item.id}
                    onClick={() => {
                      setSelectedCase(item);
                      if (approvedPreview?.caseId !== item.id) {
                        setApprovedPreview(null);
                      }
                    }}
                    className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col gap-2 ${selectedCase.id === item.id ? 'bg-white border-indigo-400 shadow-md ring-2 ring-indigo-50' : 'bg-white/40 border-slate-200 hover:border-slate-300'}`}
                   >
                     <div className="flex justify-between items-start">
                       <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${selectedCase.id === item.id ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                         {item.doc_no || item.case_no}
                       </span>
                       <span className="text-xs font-bold text-slate-700">{item.requested_amount.toLocaleString()} <span className="text-[10px] text-slate-400">THB</span></span>
                     </div>
                     <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold">
                          {(item.requester_name || 'U')[0]}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate">{item.requester_name}</p>
                          <p className="text-[8px] text-slate-500 truncate">{item.department}</p>
                        </div>
                     </div>
                   </div>
                 ))}
               </div>

               {/* ✅ FIX #5: แสดงรายการที่อนุมัติแล้ว */}
               {approvedList.length > 0 && (
                 <div className="border-t border-slate-200 bg-emerald-50/50">
                   <div className="p-4 border-b border-emerald-100">
                     <h3 className="text-sm font-bold text-emerald-700 flex items-center gap-2">
                       <ShieldCheck className="w-4 h-4 text-emerald-500" /> อนุมัติแล้ววันนี้ ({approvedList.length})
                     </h3>
                   </div>
                   <div className="max-h-48 overflow-y-auto p-4 space-y-2">
                     {approvedList.map((item) => (
                       <div key={item.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-emerald-100">
                         <div className="flex items-center gap-2">
                           <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                           <div>
                             <span className="text-[10px] font-mono font-bold text-emerald-700">{item.doc_no || item.case_no}</span>
                             <p className="text-[9px] text-slate-500">{item.requester_name}</p>
                           </div>
                         </div>
                         <div className="flex items-center gap-3">
                           {item.approvedPdfUrl && (
                             <a
                               href={item.approvedPdfUrl}
                               target="_blank"
                               rel="noreferrer"
                               className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2.5 py-1 text-[10px] font-bold text-emerald-700 transition-colors hover:bg-emerald-50"
                             >
                               <ExternalLink size={12} />
                               เปิด PDF
                             </a>
                           )}
                           <span className="text-xs font-bold text-emerald-600">{item.requested_amount.toLocaleString()}</span>
                         </div>
                       </div>
                     ))}
                   </div>
                 </div>
               )}
               
               <div className="p-4 border-t border-slate-200 bg-slate-50/50 text-[10px] text-slate-400 text-center">
                 Financial Dashboard • PRT Project
               </div>
            </div>
          ) : (
            /* Main Table View (Initial State) */
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col flex-1">
            <div className="overflow-x-auto flex-1 h-0 min-h-0 overflow-y-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
                  <tr>
                    <th className="py-4 px-6 text-left text-sm font-semibold text-slate-500 w-[180px]">
                      <div className="flex items-center gap-2">
                        <FileText size={16} />
                        หมายเลขเอกสาร
                      </div>
                    </th>
                    <th className="py-4 px-6 text-left text-sm font-semibold text-slate-500">
                      <div className="flex items-center gap-2">
                        <Building2 size={16} />
                        ผู้ทำรายการ
                      </div>
                    </th>
                    <th className="py-4 px-6 text-left text-sm font-semibold text-slate-500">รายละเอียด</th>
                    <th className="py-4 px-6 text-right text-sm font-semibold text-slate-500 w-[150px]">
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-indigo-500 font-bold">$</span>
                        จำนวนเงิน
                      </div>
                    </th>
                    <th className="py-4 px-6 text-center text-sm font-semibold text-slate-500 w-[120px]">
                      <div className="flex items-center justify-center gap-2">
                        <Calendar size={16} className="text-indigo-500" />
                        วันที่
                      </div>
                    </th>
                    <th className="py-4 px-6 text-center text-sm font-semibold text-slate-500 w-[240px]">
                      การจัดการ
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                          <p>กำลังโหลดข้อมูล...</p>
                        </div>
                      </td>
                    </tr>
                  ) : cases.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-20 text-center text-slate-500">
                        <div className="flex flex-col items-center gap-4">
                          <div className="bg-slate-100 p-4 rounded-full">
                            <CheckCircle className="w-12 h-12 text-slate-300" />
                          </div>
                          <div>
                            <p className="text-lg font-semibold text-slate-900">ไม่มีรายการรอดำเนินการ</p>
                            <p className="text-slate-500">ข้อมูลที่รออนุมัติทั้งหมดถูกจัดการเรียบร้อยแล้ว</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    cases.map((item) => (
                      <tr 
                        key={item.id} 
                        onClick={() => {
                          setSelectedCase(item);
                          if (approvedPreview?.caseId !== item.id) {
                            setApprovedPreview(null);
                          }
                        }}
                        className={`hover:bg-slate-50/80 transition-colors group cursor-pointer ${selectedCase?.id === item.id ? 'bg-indigo-50/50' : ''}`}
                      >
                        <td className="py-5 px-6 whitespace-nowrap">
                          <div className="font-mono text-indigo-600 font-semibold bg-indigo-50 px-3 py-1 rounded-lg inline-block">
                            {item.doc_no || item.case_no}
                          </div>
                        </td>
                        
                        <td className="py-5 px-6 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold border border-slate-200 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                              {(item.requester_name || 'U')[0]}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-900">{item.requester_name || 'Unknown'}</p>
                              <p className="text-xs text-slate-500 flex items-center gap-1">
                                <Briefcase className="w-3 h-3" />
                                {item.department || 'ไม่ระบุแผนก'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-5 px-6">
                          <p className="text-sm text-slate-600 line-clamp-2">{item.description}</p>
                        </td>
                        <td className="py-5 px-6 whitespace-nowrap text-right">
                          <div className="flex items-baseline justify-end gap-1">
                            <span className="text-lg font-bold text-slate-900 tracking-tight">
                              {item.requested_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                            <span className="text-xs text-slate-400 font-medium uppercase">THB</span>
                          </div>
                        </td>
                        
                        <td className="py-5 px-6 whitespace-nowrap text-center">
                          <div className="text-xs text-slate-900 font-bold">
                            {new Date(item.created_at).toLocaleDateString('th-TH', { 
                              day: '2-digit', 
                              month: '2-digit', 
                              year: '2-digit' 
                            })}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {new Date(item.created_at).toLocaleTimeString('th-TH', { 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </div>
                        </td>
                        
                        <td className="py-5 px-6 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center gap-3">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedCase(item);
                                if (approvedPreview?.caseId !== item.id) {
                                  setApprovedPreview(null);
                                }
                              }}
                              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-2 px-6 rounded-xl transition duration-200 shadow-lg shadow-emerald-500/20 active:scale-95 group/btn"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              <span>อนุมัติ</span>
                            </button>

                            <button
                              onClick={(e) => { e.stopPropagation(); handleReject(item.id); }}
                              className="flex items-center gap-2 bg-white hover:bg-rose-50 text-rose-500 border border-rose-200 font-semibold py-2 px-6 rounded-xl transition duration-200 active:scale-95 group/btn"
                            >
                              <XCircle className="w-4 h-4" />
                              <span>ปฏิเสธ</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            
            <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 shrink-0">
              <p className="text-xs text-slate-400 text-center">
                &copy; {new Date().getFullYear()} Financial Dashboard System &bull; PRT Project
              </p>
            </div>
          </div>
        )}
      </div>
      </div>
      </div>
    </div>
  );
};

export default AdminApproval;
