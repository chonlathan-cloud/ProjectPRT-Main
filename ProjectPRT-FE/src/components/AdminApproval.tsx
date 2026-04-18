// src/components/AdminApproval.tsx
import React, { useState, useEffect } from 'react';
import { getCases, approveCase, rejectCase } from '../services/api';
import { 
  CheckCircle, 
  XCircle, 
  FileText, 
  Calendar, 
  AlertCircle,
  Clock,
  Briefcase,
  Building2,
  CheckCircle2,
  FileUp,
  Signature,
  Eye,
  X,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
// สร้าง Interface ใหม่ให้ตรงกับข้อมูลที่ Backend ส่งมา (CaseAdminView)
interface AdminCaseView {
  id: string;
  case_no: string;
  doc_no?: string;
  requester_name: string;
  description: string;
  requested_amount: number;
  created_at: string;
  status: string;
  department?: string;
  ps_url?: string | null;
}

export const AdminApproval: React.FC = () => {
  const [cases, setCases] = useState<AdminCaseView[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCase, setSelectedCase] = useState<AdminCaseView | null>(null);
  const [userSignature, setUserSignature] = useState<string | null>(null);
  const [isSigned, setIsSigned] = useState(false);
  const [approvedList, setApprovedList] = useState<AdminCaseView[]>([]);

  useEffect(() => {
    const savedSig = localStorage.getItem('admin_signature');
    if (savedSig) setUserSignature(savedSig);
  }, []);

  const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setUserSignature(base64);
        localStorage.setItem('admin_signature', base64);
      };
      reader.readAsDataURL(file);
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

  const handleApprove = async (caseId: string) => {
    if (!isSigned) {
      alert('กรุณาลงนาม (Sign) ก่อนทำการอนุมัติ');
      return;
    }

    try {
      const response = await approveCase(caseId);
      const approvedItem = cases.find(c => c.id === caseId);
      if (approvedItem) {
        setApprovedList(prev => [...prev, { ...approvedItem, doc_no: response.doc_no }]);
      }
      
      setSelectedCase(null);
      setIsSigned(false);
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

  return (
    <div className="p-6 h-screen flex flex-col gap-6 overflow-hidden bg-slate-50">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-4">
          {selectedCase && (
            <button 
              onClick={() => { setSelectedCase(null); setIsSigned(false); }}
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
           <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-2 rounded-xl shadow-sm">
             <Signature size={18} className="text-indigo-500" />
             <label className="text-sm font-semibold text-slate-700 cursor-pointer hover:text-indigo-600">
               {userSignature ? 'เปลี่ยนลายเซ็น' : 'อัปโหลดลายเซ็น'}
               <input type="file" className="hidden" onChange={handleSignatureUpload} accept="image/*" />
             </label>
             {userSignature && (
               <div className="w-8 h-8 rounded border border-slate-100 overflow-hidden bg-slate-50">
                 <img src={userSignature} alt="sig" className="w-full h-full object-contain" />
               </div>
             )}
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

      <div className="flex flex-1 gap-6 overflow-hidden">
        {/* Left Column: Selected Case Preview (ONLY in Review Mode) */}
        {selectedCase && (
          <div className="flex-[2] flex flex-col gap-6 transition-all duration-500 animate-in slide-in-from-left-4">
            {/* Document Preview */}
            <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden flex flex-col relative group">
              <div className="bg-slate-800 p-3 flex items-center justify-between text-white">
                <span className="text-sm font-medium flex items-center gap-2">
                  <FileText className="w-4 h-4" /> Preview: {selectedCase.ps_url ? 'เอกสารแนบ' : 'ไม่มีไฟล์แนบ'}
                </span>
                {selectedCase.ps_url && (
                  <a href={selectedCase.ps_url} target="_blank" rel="noreferrer" className="p-1 hover:bg-slate-700 rounded">
                    <ExternalLink size={16} />
                  </a>
                )}
              </div>
              <div className="flex-1 overflow-auto bg-slate-100 flex items-center justify-center p-8 relative">
                {selectedCase.ps_url ? (
                  selectedCase.ps_url.toLowerCase().endsWith('.pdf') ? (
                    <iframe src={selectedCase.ps_url} className="w-full h-full rounded shadow-lg" title="pdf" />
                  ) : (
                    <img src={selectedCase.ps_url} alt="doc" className="max-w-full h-auto rounded-lg shadow-2xl" />
                  )
                ) : (
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
                )}

                {/* Signature Overlay */}
                {isSigned && userSignature && (
                  <div className="absolute bottom-20 right-20 animate-in zoom-in-75 duration-300 drop-shadow-xl">
                    <img src={userSignature} alt="signature" className="w-48 h-auto rotate-[-5deg] opacity-90" />
                    <div className="text-[10px] text-indigo-600 font-bold text-center mt-1 scale-75 border-t border-indigo-200">
                      Digitally Signed by {selectedCase.requester_name}
                    </div>
                  </div>
                )}
              </div>

              {/* Sign Button Overlay */}
              <div className="absolute bottom-8 right-8 flex flex-col items-end gap-3 transition-transform">
                {userSignature ? (
                  !isSigned ? (
                    <button
                      onClick={() => setIsSigned(true)}
                      className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 px-8 rounded-2xl shadow-2xl transition duration-300 active:scale-95 group/sigbtn animate-bounce"
                    >
                      <Signature className="w-6 h-6" />
                      <span className="text-lg">ลงนาม (E-Signature)</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleApprove(selectedCase.id)}
                      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 px-8 rounded-2xl shadow-2xl transition duration-300 active:scale-95 animate-in slide-in-from-right-4"
                    >
                      <CheckCircle2 className="w-6 h-6" />
                      <span className="text-lg">ยืนยันการอนุมัติ</span>
                    </button>
                  )
                ) : (
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xl text-center flex flex-col items-center gap-2 max-w-xs">
                    <Signature className="text-slate-300 w-8 h-8" />
                    <p className="text-xs text-slate-500">กรุณาอัปโหลดลายเซ็นดิจิทัลที่ปุ่ม "อัปโหลดลายเซ็น" ด้านบนก่อน</p>
                  </div>
                )}
              </div>
            </div>
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
                    onClick={() => setSelectedCase(item)}
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
               
               {/* Show Recently Approved at Bottom of Sidebar if space permits? 
                   Actually, let's just show a footer for the sidebar */}
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
                      <td colSpan={5} className="py-12 text-center text-slate-500">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                          <p>กำลังโหลดข้อมูล...</p>
                        </div>
                      </td>
                    </tr>
                  ) : cases.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-20 text-center text-slate-500">
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
                        onClick={() => setSelectedCase(item)}
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
                              onClick={(e) => { e.stopPropagation(); setSelectedCase(item); }}
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
  );
};

export default AdminApproval;