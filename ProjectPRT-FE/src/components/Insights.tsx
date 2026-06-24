import React, { useState, useEffect, useRef } from 'react';
import { Search, Filter, MoreHorizontal, TrendingUp, ChevronDown, Loader2 } from 'lucide-react';
import { getUsers, getInsights, getCategories, getCaseAttachments, InsightsData, CaseAttachmentFile } from '../services/api';
import { User, Category } from '../../types';
import { openDocumentPreview } from '../utils/documentPreview';

const MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];
// 1. เพิ่มตัวแปร YEAR และ Helper
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];
const ATTACHMENT_TYPE_LABELS: Record<CaseAttachmentFile['type'], string> = {
  QUOTE: 'ใบเสนอราคา',
  RECEIPT: 'ใบเสร็จ',
  PS: 'ใบ ปส',
  SIGNATURE: 'ลายเซ็น',
  OTHER: 'เอกสารอื่น',
  APPROVED_PDF: 'เอกสารอนุมัติแล้ว',
};

const INITIAL_INSIGHTS: InsightsData = {
  summary: {
    normal_count: 0,
    normal_amount: 0,
    pending_count: 0,
    pending_amount: 0,
    approved_count: 0,
    approved_amount: 0,
  },
  transactions: []
};

export const Insights: React.FC = () => {
  const [insights, setInsights] = useState<InsightsData>(INITIAL_INSIGHTS);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1); // 1-12
  const [selectedYear, setSelectedYear] = useState<number>(CURRENT_YEAR);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [activeAttachmentCaseId, setActiveAttachmentCaseId] = useState<string | null>(null);
  const [attachmentLoadingCaseId, setAttachmentLoadingCaseId] = useState<string | null>(null);
  const [attachmentsByCaseId, setAttachmentsByCaseId] = useState<Record<string, CaseAttachmentFile[]>>({});
  const [attachmentMessageByCaseId, setAttachmentMessageByCaseId] = useState<Record<string, string>>({});
  const attachmentMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const fetchOtherData = async () => {
      try {
        const [userRes, catRes] = await Promise.allSettled([
          getUsers(),
          getCategories()
        ]);
        if (userRes.status === 'fulfilled') setUsers(userRes.value);
        if (catRes.status === 'fulfilled') setCategories(catRes.value);
      } catch (error) {
        console.error("Failed to fetch initial data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchOtherData();
  }, []);

  useEffect(() => {
    const fetchInsightsData = async () => {
      setDataLoading(true);
      try {
        // ส่งเป็น year, month (number), username, categoryId
        const result = await getInsights(selectedUserId, selectedMonth, selectedYear, selectedCategoryId);
        if (result) {
          setInsights(result);
        }
      } catch (error) {
        console.error("Failed to fetch insights data:", error);
      } finally {
        setDataLoading(false);
      }
    };
    fetchInsightsData();
  }, [selectedUserId, selectedMonth, selectedYear, selectedCategoryId]); // Dependency เปลี่ยน

  useEffect(() => {
    if (!activeAttachmentCaseId) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (attachmentMenuRef.current && !attachmentMenuRef.current.contains(event.target as Node)) {
        setActiveAttachmentCaseId(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveAttachmentCaseId(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [activeAttachmentCaseId]);

  const getCreatorName = (requesterId: string) => {
    const user = users.find(u => u.requester_id === requesterId);
    return user ? user.name : 'Unknown User';
  };

  const formatCurrency = (amount: number) => {
    return `${amount.toLocaleString()} THB`;
  };

  const getAttachmentFileName = (fileName: string) => fileName.replace(/^\d{14}_/, '');

  const openAttachment = (attachment: CaseAttachmentFile) => {
    openDocumentPreview({
      url: attachment.url,
      title: getAttachmentFileName(attachment.file_name),
      subtitle: ATTACHMENT_TYPE_LABELS[attachment.type] || attachment.type,
      mimeType: attachment.type === 'APPROVED_PDF' ? 'application/pdf' : undefined,
    });
  };

  const handleDocumentClick = async (caseId: string) => {
    const isCurrentMenuOpen =
      activeAttachmentCaseId === caseId && (attachmentsByCaseId[caseId]?.length ?? 0) > 1;

    if (isCurrentMenuOpen) {
      setActiveAttachmentCaseId(null);
      return;
    }

    setAttachmentLoadingCaseId(caseId);
    setActiveAttachmentCaseId(caseId);
    setAttachmentMessageByCaseId((prev) => {
      const next = { ...prev };
      delete next[caseId];
      return next;
    });

    try {
      const attachments = await getCaseAttachments(caseId);
      setAttachmentsByCaseId((prev) => ({ ...prev, [caseId]: attachments }));

      if (attachments.length === 0) {
        setAttachmentMessageByCaseId((prev) => ({ ...prev, [caseId]: 'ไม่มีเอกสาร' }));
        return;
      }

      if (attachments.length === 1) {
        setActiveAttachmentCaseId(null);
        openAttachment(attachments[0]);
      }
    } catch (error) {
      console.error('Failed to load case attachments:', error);
      setAttachmentsByCaseId((prev) => ({ ...prev, [caseId]: [] }));
      setAttachmentMessageByCaseId((prev) => ({ ...prev, [caseId]: 'ไม่สามารถโหลดเอกสารได้' }));
    } finally {
      setAttachmentLoadingCaseId(null);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 animate-fade-in text-slate-900">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Insights</h1>
          <p className="text-slate-500 mt-1">รายการสืบค้นและวิเคราะห์ข้อมูลจาก Backend</p>
        </div>
        
        <div className="flex flex-wrap gap-3">
          <div className="relative">
            <select 
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="pl-4 pr-10 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white text-sm font-medium text-slate-700 appearance-none cursor-pointer"
            >
              <option value="">ผู้ทำรายการทั้งหมด</option>
              {users.map(u => (
                <option key={u.requester_id} value={u.requester_id}>{u.name}</option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>

          <div className="relative">
            <select 
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              className="pl-4 pr-10 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white text-sm font-medium text-slate-700 appearance-none cursor-pointer"
            >
              <option value="">หมวดหมู่ทั้งหมด</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name_th}</option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>

          <div className="relative">
            <select 
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="pl-4 pr-10 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white text-sm font-medium text-slate-700 appearance-none cursor-pointer"
            >
              {MONTHS.map((m, idx) => (
                <option key={m} value={idx + 1}>{m}</option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
          <div className="relative">
            <select 
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="pl-4 pr-10 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white text-sm font-medium text-slate-700 appearance-none cursor-pointer"
            >
              {YEARS.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>    
          
          <button className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors bg-white">
            <Filter className="w-5 h-5 text-slate-600" />
          </button>
        </div>
      </header>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="relative overflow-hidden bg-white border border-blue-50 rounded-2xl p-6 shadow-sm group hover:shadow-md transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-bl-full opacity-50 -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
          <div className="relative">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                <TrendingUp size={20} />
              </div>
              <span className="font-bold text-slate-600">รายการปกติ</span>
            </div>
            <div className="flex justify-between items-end">
              <p className="text-sm font-bold text-blue-500">{insights.summary.normal_count.toLocaleString()} รายการ</p>
              <p className="text-3xl font-black text-slate-800">{formatCurrency(insights.summary.normal_amount)}</p>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden bg-white border border-sky-50 rounded-2xl p-6 shadow-sm group hover:shadow-md transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-sky-50 rounded-bl-full opacity-50 -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
          <div className="relative">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-sky-100 rounded-lg text-sky-600">
                <Filter size={20} />
              </div>
              <span className="font-bold text-slate-600">รอดำเนินการ</span>
            </div>
            <div className="flex justify-between items-end">
              <p className="text-sm font-bold text-sky-500">{insights.summary.pending_count.toLocaleString()} รายการ</p>
              <p className="text-3xl font-black text-slate-800">{formatCurrency(insights.summary.pending_amount)}</p>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden bg-blue-600 rounded-2xl p-6 text-white shadow-lg shadow-blue-100 group transition-all">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110"></div>
          <div className="relative">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-white/20 rounded-lg">
                <Search size={20} className="text-white" />
              </div>
              <span className="font-bold opacity-90">อนุมัติแล้ว</span>
            </div>
            <div className="flex justify-between items-end text-white">
              <p className="text-sm font-bold text-blue-100">{insights.summary.approved_count.toLocaleString()} รายการ</p>
              <p className="text-3xl font-black">{formatCurrency(insights.summary.approved_amount)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden min-h-[400px]">
        <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
          <h2 className="font-bold text-slate-800">รายการปส ทั้งหมด {selectedMonth && `ประจำเดือน${selectedMonth}`}</h2>
          <div className="flex gap-2">
             <button className="px-4 py-1.5 text-xs font-bold text-blue-600 border border-blue-100 rounded-lg hover:bg-blue-50 transition-colors">Export CSV</button>
             <button className="text-slate-400 hover:text-slate-600 transition-colors p-1"><MoreHorizontal size={20} /></button>
          </div>
        </div>
        
        <div className="overflow-x-auto relative">
          {dataLoading && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-10 flex items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-xs font-bold text-blue-600 animate-pulse">กำลังโหลดข้อมูล...</p>
              </div>
            </div>
          )}
          
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-100">เลขที่ใบ ปส</th>
                <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-100">วันเดือนปี</th>
                <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-100">ชื่อผู้ทำรายการ</th>
                <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-100">จำนวนเงิน</th>
                <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-100">วัตถุประสงค์</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {insights.transactions.length > 0 ? (
                insights.transactions.map((item) => (
                  <tr key={item.id} className="hover:bg-blue-50/30 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="relative inline-flex flex-col gap-2" ref={activeAttachmentCaseId === item.id ? attachmentMenuRef : null}>
                        <button
                          type="button"
                          onClick={() => handleDocumentClick(item.id)}
                          disabled={attachmentLoadingCaseId === item.id || item.doc_no === '-'}
                          className="inline-flex items-center gap-1 text-sm font-bold text-blue-700 hover:text-blue-900 disabled:text-slate-400 disabled:cursor-not-allowed"
                        >
                          <span>{item.doc_no}</span>
                          {attachmentLoadingCaseId === item.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : item.doc_no !== '-' ? (
                            <ChevronDown size={14} className={activeAttachmentCaseId === item.id ? 'rotate-180 transition-transform' : 'transition-transform'} />
                          ) : null}
                        </button>

                        {activeAttachmentCaseId === item.id && (
                          <>
                            {attachmentMessageByCaseId[item.id] && (
                              <div className="absolute top-full left-0 z-20 mt-1 min-w-48 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-500 shadow-lg">
                                {attachmentMessageByCaseId[item.id]}
                              </div>
                            )}

                            {(attachmentsByCaseId[item.id]?.length ?? 0) > 1 && (
                              <div className="absolute top-full left-0 z-20 mt-1 min-w-72 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                                <div className="border-b border-slate-100 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                                  เลือกเอกสาร
                                </div>
                                <div className="max-h-64 overflow-y-auto py-1">
                                  {attachmentsByCaseId[item.id].map((attachment) => (
                                    <button
                                      key={attachment.id}
                                      type="button"
                                      onClick={() => {
                                        openAttachment(attachment);
                                        setActiveAttachmentCaseId(null);
                                      }}
                                      className="flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2 text-left hover:bg-slate-50"
                                    >
                                      <div className="min-w-0">
                                        <p className="text-xs font-black text-blue-600">
                                          {ATTACHMENT_TYPE_LABELS[attachment.type] || attachment.type}
                                        </p>
                                        <p className="truncate text-sm font-medium text-slate-700">
                                          {getAttachmentFileName(attachment.file_name)}
                                        </p>
                                      </div>
                                      <span className="shrink-0 text-xs font-semibold text-slate-400">
                                        เปิด
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500 font-bold">{item.date}</td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-slate-700">{getCreatorName(item.creator_id)}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-slate-700">
                        {item.amount?.toLocaleString() || '0'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 max-w-sm font-medium">
                      {item.purpose}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-3 text-slate-400">
                      <Search size={48} strokeWidth={1} />
                      <p className="text-sm font-medium">ไม่พบข้อมูลในเงื่อนไขที่เลือก</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination placeholder */}
        <div className="p-6 border-t border-slate-50 flex items-center justify-between text-sm text-slate-500 font-medium bg-slate-50/10">
          <p>Showing {insights.transactions.length} entries</p>
          <div className="flex gap-2">
            <button className="px-4 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-colors">Previous</button>
            <button className="px-4 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-colors">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
};
