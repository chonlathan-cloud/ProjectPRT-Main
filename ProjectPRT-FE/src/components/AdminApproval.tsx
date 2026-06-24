import React, { useEffect, useState } from 'react';

import { AdminCaseView } from '../../types';
import { approveCase, getCases, rejectCase } from '../services/api';
import AttachmentPreviewPanel from './AttachmentPreviewPanel';
import { openDocumentPreview } from '../utils/documentPreview';
import {
  AlertCircle,
  Briefcase,
  Building2,
  Calendar,
  CheckCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  FileText,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';

interface ApprovedCaseView extends AdminCaseView {
  approvedPdfUrl?: string | null;
}

interface ApprovedPreviewState {
  caseId: string;
  url: string;
  docNo?: string | null;
}

interface ApprovalConfirmState {
  caseId: string;
  displayDocNo: string;
  requesterName: string;
  requestedAmount: number;
}

interface FeedbackState {
  type: 'success' | 'error';
  message: string;
}

const getErrorMessage = (error: unknown, fallback: string) => {
  const responseDetail = (error as {
    response?: { data?: { detail?: unknown } };
  })?.response?.data?.detail;

  if (typeof responseDetail === 'string' && responseDetail.trim()) {
    return responseDetail;
  }

  if (
    responseDetail &&
    typeof responseDetail === 'object' &&
    'message' in responseDetail &&
    typeof responseDetail.message === 'string'
  ) {
    return responseDetail.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
};

export const AdminApproval: React.FC = () => {
  const [cases, setCases] = useState<AdminCaseView[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCase, setSelectedCase] = useState<AdminCaseView | null>(null);
  const [approvedList, setApprovedList] = useState<ApprovedCaseView[]>([]);
  const [latestApprovedPdfUrl, setLatestApprovedPdfUrl] = useState<string | null>(null);
  const [latestApprovedDocNo, setLatestApprovedDocNo] = useState<string | null>(null);
  const [approvedPreview, setApprovedPreview] = useState<ApprovedPreviewState | null>(null);
  const [approvalConfirm, setApprovalConfirm] = useState<ApprovalConfirmState | null>(null);
  const [submittingCaseId, setSubmittingCaseId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  const loadPendingCases = async (showLoadingState = true) => {
    if (showLoadingState) {
      setLoading(true);
    }

    try {
      const data = await getCases('SUBMITTED');
      setCases(data);
    } catch (error) {
      console.error('Failed to fetch cases:', error);
      setFeedback({
        type: 'error',
        message: getErrorMessage(error, 'ไม่สามารถโหลดรายการรออนุมัติได้'),
      });
    } finally {
      if (showLoadingState) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadPendingCases();
  }, []);

  const handleSelectCase = (item: AdminCaseView) => {
    setSelectedCase(item);

    if (approvedPreview?.caseId !== item.id) {
      setApprovedPreview(null);
    }
  };

  const requestApprove = (caseId: string) => {
    const caseToApprove = cases.find((item) => item.id === caseId) ?? selectedCase;
    if (!caseToApprove) {
      return;
    }

    setApprovalConfirm({
      caseId,
      displayDocNo: caseToApprove.doc_no || caseToApprove.case_no || caseId,
      requesterName: caseToApprove.requester_name || 'Unknown',
      requestedAmount: caseToApprove.requested_amount,
    });
  };

  const handleApprove = async (caseId: string) => {
    const caseToApprove = cases.find((item) => item.id === caseId) ?? selectedCase;
    setApprovalConfirm(null);
    setSubmittingCaseId(caseId);
    setFeedback(null);

    try {
      const response = await approveCase(caseId);
      const approvedPdfUrl = response.audit_details?.approved_pdf_url || null;

      if (caseToApprove) {
        const nextApprovedCase: ApprovedCaseView = {
          ...caseToApprove,
          doc_no: response.doc_no || caseToApprove.doc_no,
          approved_pdf_url: approvedPdfUrl,
          approvedPdfUrl,
        };

        setApprovedList((prev) => [
          nextApprovedCase,
          ...prev.filter((item) => item.id !== caseId),
        ]);
      }

      setLatestApprovedPdfUrl(approvedPdfUrl);
      setLatestApprovedDocNo(
        response.doc_no || caseToApprove?.doc_no || caseToApprove?.case_no || null
      );

      if (caseToApprove && approvedPdfUrl) {
        const updatedSelectedCase: AdminCaseView = {
          ...caseToApprove,
          doc_no: response.doc_no || caseToApprove.doc_no,
          approved_pdf_url: approvedPdfUrl,
        };
        setSelectedCase(updatedSelectedCase);
        setApprovedPreview({
          caseId,
          url: approvedPdfUrl,
          docNo: response.doc_no || caseToApprove.doc_no || caseToApprove.case_no,
        });
      } else if (selectedCase?.id === caseId) {
        setSelectedCase(null);
        setApprovedPreview(null);
      }

      setFeedback({
        type: 'success',
        message: response.message || 'อนุมัติรายการเรียบร้อยแล้ว',
      });

      await loadPendingCases(false);
    } catch (error) {
      console.error('Failed to approve case:', error);
      setFeedback({
        type: 'error',
        message: getErrorMessage(error, 'เกิดข้อผิดพลาดในการอนุมัติ'),
      });
    } finally {
      setSubmittingCaseId(null);
    }
  };

  const handleReject = async (caseId: string) => {
    const reason = window.prompt('กรุณาระบุเหตุผลที่ไม่อนุมัติ:');
    if (reason === null) {
      return;
    }

    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setFeedback({
        type: 'error',
        message: 'กรุณาระบุเหตุผลในการปฏิเสธ',
      });
      return;
    }

    setSubmittingCaseId(caseId);
    setFeedback(null);

    try {
      await rejectCase(caseId, trimmedReason);

      if (selectedCase?.id === caseId) {
        setSelectedCase(null);
        setApprovedPreview(null);
      }

      setFeedback({
        type: 'success',
        message: 'ปฏิเสธรายการเรียบร้อยแล้ว',
      });

      await loadPendingCases(false);
    } catch (error) {
      console.error('Failed to reject case:', error);
      setFeedback({
        type: 'error',
        message: getErrorMessage(error, 'เกิดข้อผิดพลาดในการปฏิเสธรายการ'),
      });
    } finally {
      setSubmittingCaseId(null);
    }
  };

  const isShowingApprovedPreview = Boolean(
    selectedCase?.id &&
      approvedPreview?.caseId === selectedCase.id &&
      approvedPreview?.url
  );
  const previewUrl = isShowingApprovedPreview
    ? approvedPreview?.url ?? null
    : selectedCase?.approved_pdf_url ?? selectedCase?.ps_url ?? null;
  const previewMimeType = isShowingApprovedPreview
    ? 'application/pdf'
    : selectedCase?.approved_pdf_url ? 'application/pdf' : selectedCase?.mime_type;
  const previewTitle = isShowingApprovedPreview
    ? approvedPreview?.docNo || selectedCase?.doc_no || selectedCase?.case_no
    : selectedCase?.doc_no || selectedCase?.case_no;
  const previewEyebrow = isShowingApprovedPreview
    ? 'Approved PDF Preview'
    : 'Document Preview';
  const isSubmittingSelectedCase = Boolean(
    selectedCase && submittingCaseId === selectedCase.id
  );
  const previewActions = isShowingApprovedPreview ? null : (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => selectedCase && requestApprove(selectedCase.id)}
        disabled={!selectedCase || isSubmittingSelectedCase}
        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
      >
        <CheckCircle2 className="h-4 w-4" />
        {isSubmittingSelectedCase ? 'กำลังอนุมัติ...' : 'อนุมัติรายการ'}
      </button>
      <button
        type="button"
        onClick={() => selectedCase && void handleReject(selectedCase.id)}
        disabled={!selectedCase || isSubmittingSelectedCase}
        className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2 text-xs font-black text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-rose-100 disabled:text-rose-300"
      >
        <XCircle className="h-4 w-4" />
        ปฏิเสธ
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-6 pb-10">
      <div className="flex flex-col gap-6">
        {approvalConfirm && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/35 p-6 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-[2rem] border border-emerald-200 bg-white p-6 shadow-2xl">
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-600">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-500">
                    Confirm Approval
                  </p>
                  <h3 className="mt-1 text-2xl font-black text-slate-900">
                    ยืนยันการอนุมัติเอกสาร
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-slate-500">
                    ระบบจะประทับตราอนุมัติด้วยชื่อผู้ใช้งานและเวลาจากระบบทันทีหลังยืนยันรายการนี้
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setApprovalConfirm(null)}
                  className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-6 grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                    เลขที่เอกสาร
                  </p>
                  <p className="mt-1 text-xl font-black text-slate-900">
                    {approvalConfirm.displayDocNo}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                    ผู้ส่งคำขอ
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-900">
                    {approvalConfirm.requesterName}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                    จำนวนเงิน
                  </p>
                  <p className="mt-1 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-700">
                    {approvalConfirm.requestedAmount.toLocaleString()} THB
                  </p>
                </div>
              </div>

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setApprovalConfirm(null)}
                  className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={() => void handleApprove(approvalConfirm.caseId)}
                  className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white transition-colors hover:bg-emerald-700"
                >
                  ยืนยันอนุมัติ
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex shrink-0 flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="flex items-center gap-4">
            {selectedCase && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCase(null);
                  setApprovedPreview(null);
                }}
                className="rounded-full p-2 transition-colors hover:bg-slate-200"
              >
                <X className="h-6 w-6 text-slate-600" />
              </button>
            )}
            <div>
              <h2 className="text-3xl font-bold text-slate-800">
                {selectedCase
                  ? `รีวิวเอกสาร: ${selectedCase.doc_no || selectedCase.case_no}`
                  : 'รายการรออนุมัติ'}
              </h2>
              <div className="mt-1 flex items-center gap-2 text-slate-500">
                <Clock size={18} />
                <p>ตรวจสอบและอนุมัติคำขอเบิกจ่าย (Admin Approval)</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50 px-5 py-3 shadow-sm">
              <div className="rounded-full bg-amber-100 p-2 text-amber-600">
                <AlertCircle size={20} />
              </div>
              <div>
                <div className="text-2xl font-bold text-amber-700">{cases.length}</div>
                <div className="text-sm font-medium text-amber-600">
                  รายการรอดำเนินการ
                </div>
              </div>
            </div>
          </div>
        </div>

        {feedback && (
          <div
            className={`shrink-0 rounded-2xl border px-5 py-4 shadow-sm ${
              feedback.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-rose-200 bg-rose-50 text-rose-700'
            }`}
          >
            <div className="flex items-center gap-3">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <AlertCircle className="h-5 w-5" />
              )}
              <p className="text-sm font-semibold">{feedback.message}</p>
            </div>
          </div>
        )}

        {latestApprovedPdfUrl && (
          <div className="shrink-0 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-bold text-emerald-700">
                  อนุมัติเอกสารเรียบร้อยแล้ว
                </p>
                <p className="text-sm text-emerald-600">
                  {latestApprovedDocNo
                    ? `${latestApprovedDocNo} พร้อม Approved PDF`
                    : 'พร้อม Approved PDF'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => openDocumentPreview({
                  url: latestApprovedPdfUrl,
                  title: latestApprovedDocNo || 'Approved PDF',
                  mimeType: 'application/pdf',
                })}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-emerald-700"
              >
                <ExternalLink size={16} />
                เปิดเอกสารที่อนุมัติแล้ว
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-1 gap-6">
          {selectedCase && (
            <div className="animate-in slide-in-from-left-4 flex flex-[2] flex-col gap-6 transition-all duration-500">
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
                  <div className="flex flex-col items-center gap-4 text-center text-slate-400">
                    <Eye size={64} className="opacity-20" />
                    <p className="text-lg font-medium">
                      กำลังแสดงรายละเอียดเพื่อตรวจสอบ...
                    </p>
                    <div className="mx-auto w-full max-w-md rounded-xl border border-slate-200 bg-white p-6">
                      <h4 className="mb-4 border-b pb-2 font-bold text-slate-800">
                        รายละเอียดคำขอ
                      </h4>
                      <div className="space-y-3 text-left">
                        <div className="flex justify-between">
                          <span className="text-slate-500">ผู้ส่ง:</span>
                          <b>{selectedCase.requester_name}</b>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">แผนก:</span>
                          <b>{selectedCase.department}</b>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">จำนวน:</span>
                          <b className="text-indigo-600">
                            {selectedCase.requested_amount.toLocaleString()} THB
                          </b>
                        </div>
                        <div className="pt-2">
                          <span className="text-xs font-bold uppercase text-slate-500">
                            เหตุผล:
                          </span>
                          <p className="mt-1 rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700">
                            {selectedCase.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                }
              />
            </div>
          )}

          <div
            className={`flex flex-col transition-all duration-500 ${
              selectedCase
                ? 'animate-in slide-in-from-right-4 flex-1 border-l border-slate-200 bg-white/50'
                : 'flex-[3]'
            }`}
          >
            {selectedCase ? (
              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="border-b border-slate-200 bg-slate-50/50 p-4">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-slate-600">
                    <Clock className="h-4 w-4 text-amber-500" />
                    รายการที่เหลือ ({cases.length})
                  </h3>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {cases.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleSelectCase(item)}
                      className={`flex cursor-pointer flex-col gap-2 rounded-xl border p-4 transition-all ${
                        selectedCase.id === item.id
                          ? 'border-indigo-400 bg-white shadow-md ring-2 ring-indigo-50'
                          : 'border-slate-200 bg-white/40 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-mono font-bold ${
                            selectedCase.id === item.id
                              ? 'bg-indigo-100 text-indigo-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {item.doc_no || item.case_no}
                        </span>
                        <span className="text-xs font-bold text-slate-700">
                          {item.requested_amount.toLocaleString()}{' '}
                          <span className="text-[10px] text-slate-400">THB</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold">
                          {(item.requester_name || 'U')[0]}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-slate-900">
                            {item.requester_name}
                          </p>
                          <p className="truncate text-[8px] text-slate-500">
                            {item.department}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {approvedList.length > 0 && (
                  <div className="border-t border-slate-200 bg-emerald-50/50">
                    <div className="border-b border-emerald-100 p-4">
                      <h3 className="flex items-center gap-2 text-sm font-bold text-emerald-700">
                        <ShieldCheck className="h-4 w-4 text-emerald-500" />
                        อนุมัติแล้ววันนี้ ({approvedList.length})
                      </h3>
                    </div>
                    <div className="max-h-48 space-y-2 overflow-y-auto p-4">
                      {approvedList.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between rounded-lg border border-emerald-100 bg-white p-3"
                        >
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            <div>
                              <span className="text-[10px] font-mono font-bold text-emerald-700">
                                {item.doc_no || item.case_no}
                              </span>
                              <p className="text-[9px] text-slate-500">
                                {item.requester_name}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {item.approvedPdfUrl && (
                              <button
                                type="button"
                                onClick={() => openDocumentPreview({
                                  url: item.approvedPdfUrl!,
                                  title: item.doc_no || item.case_no,
                                  mimeType: 'application/pdf',
                                  subtitle: item.requester_name,
                                })}
                                className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2.5 py-1 text-[10px] font-bold text-emerald-700 transition-colors hover:bg-emerald-50"
                              >
                                <ExternalLink size={12} />
                                เปิด PDF
                              </button>
                            )}
                            <span className="text-xs font-bold text-emerald-600">
                              {item.requested_amount.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="border-t border-slate-200 bg-slate-50/50 p-4 text-center text-[10px] text-slate-400">
                  Financial Dashboard • PRT Project
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="h-0 min-h-0 flex-1 overflow-x-auto overflow-y-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 z-10 border-b border-slate-100 bg-slate-50">
                      <tr>
                        <th className="w-[180px] px-6 py-4 text-left text-sm font-semibold text-slate-500">
                          <div className="flex items-center gap-2">
                            <FileText size={16} />
                            หมายเลขเอกสาร
                          </div>
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-slate-500">
                          <div className="flex items-center gap-2">
                            <Building2 size={16} />
                            ผู้ทำรายการ
                          </div>
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-slate-500">
                          รายละเอียด
                        </th>
                        <th className="w-[150px] px-6 py-4 text-right text-sm font-semibold text-slate-500">
                          <div className="flex items-center justify-end gap-2">
                            <span className="font-bold text-indigo-500">$</span>
                            จำนวนเงิน
                          </div>
                        </th>
                        <th className="w-[120px] px-6 py-4 text-center text-sm font-semibold text-slate-500">
                          <div className="flex items-center justify-center gap-2">
                            <Calendar size={16} className="text-indigo-500" />
                            วันที่
                          </div>
                        </th>
                        <th className="w-[240px] px-6 py-4 text-center text-sm font-semibold text-slate-500">
                          การจัดการ
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {loading ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-500">
                            <div className="flex flex-col items-center justify-center gap-3">
                              <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
                              <p>กำลังโหลดข้อมูล...</p>
                            </div>
                          </td>
                        </tr>
                      ) : cases.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-20 text-center text-slate-500">
                            <div className="flex flex-col items-center gap-4">
                              <div className="rounded-full bg-slate-100 p-4">
                                <CheckCircle className="h-12 w-12 text-slate-300" />
                              </div>
                              <div>
                                <p className="text-lg font-semibold text-slate-900">
                                  ไม่มีรายการรอดำเนินการ
                                </p>
                                <p className="text-slate-500">
                                  ข้อมูลที่รออนุมัติทั้งหมดถูกจัดการเรียบร้อยแล้ว
                                </p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        cases.map((item) => {
                          const isSubmittingThisRow = submittingCaseId === item.id;

                          return (
                            <tr
                              key={item.id}
                              onClick={() => handleSelectCase(item)}
                              className={`group cursor-pointer transition-colors hover:bg-slate-50/80 ${
                                selectedCase?.id === item.id ? 'bg-indigo-50/50' : ''
                              }`}
                            >
                              <td className="whitespace-nowrap px-6 py-5">
                                <div className="inline-block rounded-lg bg-indigo-50 px-3 py-1 font-mono font-semibold text-indigo-600">
                                  {item.doc_no || item.case_no}
                                </div>
                              </td>

                              <td className="whitespace-nowrap px-6 py-5">
                                <div className="flex items-center gap-3">
                                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-100 font-bold text-slate-600 transition-colors group-hover:bg-indigo-100 group-hover:text-indigo-600">
                                    {(item.requester_name || 'U')[0]}
                                  </div>
                                  <div>
                                    <p className="text-sm font-bold text-slate-900">
                                      {item.requester_name || 'Unknown'}
                                    </p>
                                    <p className="flex items-center gap-1 text-xs text-slate-500">
                                      <Briefcase className="h-3 w-3" />
                                      {item.department || 'ไม่ระบุแผนก'}
                                    </p>
                                  </div>
                                </div>
                              </td>

                              <td className="px-6 py-5">
                                <p className="line-clamp-2 text-sm text-slate-600">
                                  {item.description}
                                </p>
                              </td>

                              <td className="whitespace-nowrap px-6 py-5 text-right">
                                <div className="flex items-baseline justify-end gap-1">
                                  <span className="text-lg font-bold tracking-tight text-slate-900">
                                    {item.requested_amount.toLocaleString(undefined, {
                                      minimumFractionDigits: 2,
                                    })}
                                  </span>
                                  <span className="text-xs font-medium uppercase text-slate-400">
                                    THB
                                  </span>
                                </div>
                              </td>

                              <td className="whitespace-nowrap px-6 py-5 text-center">
                                <div className="text-xs font-bold text-slate-900">
                                  {new Date(item.created_at).toLocaleDateString('th-TH', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: '2-digit',
                                  })}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {new Date(item.created_at).toLocaleTimeString('th-TH', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </div>
                              </td>

                              <td className="whitespace-nowrap px-6 py-5 text-center">
                                <div className="flex items-center justify-center gap-3">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      requestApprove(item.id);
                                    }}
                                    disabled={isSubmittingThisRow}
                                    className="group/btn flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-2 font-semibold text-white shadow-lg shadow-emerald-500/20 transition duration-200 hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-emerald-300 disabled:shadow-none"
                                  >
                                    <CheckCircle2 className="h-4 w-4" />
                                    <span>
                                      {isSubmittingThisRow ? 'กำลังดำเนินการ...' : 'อนุมัติ'}
                                    </span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void handleReject(item.id);
                                    }}
                                    disabled={isSubmittingThisRow}
                                    className="group/btn flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-6 py-2 font-semibold text-rose-500 transition duration-200 hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-rose-100 disabled:text-rose-300"
                                  >
                                    <XCircle className="h-4 w-4" />
                                    <span>ปฏิเสธ</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-6 py-4">
                  <p className="text-center text-xs text-slate-400">
                    &copy; {new Date().getFullYear()} Financial Dashboard System •
                    PRT Project
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
