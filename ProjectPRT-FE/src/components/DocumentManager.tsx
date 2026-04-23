import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Upload, 
  FileSearch, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  X,
  FileText,
  Filter,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { AdminCaseView } from '../../types';
import { 
  searchDocumentsByNoPage, 
  uploadDocumentFile, 
  getCasesPage
} from '../services/api';

const PAGE_SIZE = 20;

export const DocumentManager: React.FC = () => {
  const [documents, setDocuments] = useState<AdminCaseView[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [appliedSearchQuery, setAppliedSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showMissingOnly, setShowMissingOnly] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalDocuments, setTotalDocuments] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocuments = async (page = currentPage, search = appliedSearchQuery, missingOnly = showMissingOnly) => {
    setLoading(true);
    setError(null);

    try {
      const result = search
        ? await searchDocumentsByNoPage(search, { page, limit: PAGE_SIZE, missingOnly })
        : await getCasesPage({ page, limit: PAGE_SIZE, missingOnly });

      setDocuments(result.items);
      setTotalDocuments(result.total);
      setTotalPages(result.total_pages);

      if (result.total_pages > 0 && page > result.total_pages) {
        setCurrentPage(result.total_pages);
        return;
      }

      setSelectedCaseId((prev) => (result.items.some((doc) => doc.id === prev) ? prev : null));
    } catch (err) {
      console.error("Failed to fetch documents:", err);
      setError("Failed to load documents");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments(currentPage, appliedSearchQuery, showMissingOnly);
  }, [currentPage, appliedSearchQuery, showMissingOnly]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextQuery = searchQuery.trim();

    if (currentPage !== 1) {
      setCurrentPage(1);
    }

    if (nextQuery !== appliedSearchQuery || currentPage !== 1) {
      setAppliedSearchQuery(nextQuery);
      return;
    }

    loadDocuments(1, nextQuery, showMissingOnly);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCaseId) return;

    setUploading(true);
    try {
      await uploadDocumentFile(selectedCaseId, file);
      setUploadSuccess("File uploaded successfully!");
      await loadDocuments(currentPage, appliedSearchQuery, showMissingOnly);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const startItem = totalDocuments === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endItem = totalDocuments === 0 ? 0 : Math.min(currentPage * PAGE_SIZE, totalDocuments);
  const hasActiveSearch = appliedSearchQuery.length > 0; // show data in table like showing 1-20 for PV-2604

  const resetFilters = () => {
    setSearchQuery(''); // clear text in search box
    setAppliedSearchQuery(''); // clear search really in use
    setShowMissingOnly(true); // reset to default filter "Show Missing Only"
    setCurrentPage(1); // payback to page 1
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fade-in text-slate-900 bg-slate-50 min-h-screen">
      <header>
        <h1 className="text-4xl font-black text-slate-800 tracking-tight">Document Manager</h1>
        <p className="text-slate-500 mt-2 font-medium">Manage PV, RV, JV documents and track missing uploads</p>
      </header>

      {/* Top Controls: Upload Box & Search Box */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Upload Box */}
        <div className="bg-white rounded-[2rem] p-8 shadow-xl border border-slate-100 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-bl-full opacity-50 -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
          <div className="relative z-10">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
                <Upload size={28} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-800">Upload Receipt</h2>
                <p className="text-sm text-slate-500 font-bold">Select a document below to upload</p>
              </div>
            </div>

            {selectedCaseId ? (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-2xl border border-blue-100">
                  <div className="flex items-center gap-3">
                    <FileText className="text-blue-600" size={20} />
                    <span className="font-bold text-blue-800">Selected ID: {selectedCaseId.substring(0, 8)}...</span>
                  </div>
                  <button 
                    onClick={() => setSelectedCaseId(null)}
                    className="p-1 hover:bg-blue-100 rounded-full transition-colors"
                  >
                    <X size={18} className="text-blue-600" />
                  </button>
                </div>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-lg shadow-lg hover:bg-slate-800 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3"
                >
                  {uploading ? (
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <FileSearch size={20} />
                      Choose File to Upload
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="h-28 border-2 border-dashed border-slate-200 rounded-3xl flex items-center justify-center text-slate-400 font-bold bg-slate-50/50 italic">
                First, click 'Upload' on a document in the table
              </div>
            )}
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              className="hidden" 
              accept="image/*, application/pdf"
            />
          </div>
        </div>

        {/* Search Box */}
        <div className="bg-white rounded-[2rem] p-8 shadow-xl border border-slate-100 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-50 rounded-bl-full opacity-50 -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
          <div className="relative z-10">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 bg-amber-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-amber-200">
                <Search size={28} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-800">Advanced Search</h2>
                <p className="text-sm text-slate-500 font-bold">Search and find any PV / RV / JV No.</p>
              </div>
            </div>

            <form onSubmit={handleSearch} className="space-y-4">
              <div className="relative">
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="EX: PV-2024-001..." 
                  className="w-full pl-14 pr-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 transition-all text-lg font-bold placeholder:text-slate-300"
                />
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={24} />
              </div>
              <button 
                type="submit"
                className="w-full py-4 bg-amber-500 text-white rounded-2xl font-black text-lg shadow-lg hover:bg-amber-600 transition-all active:scale-[0.98] flex items-center justify-center gap-3"
              >
                Search Documents
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Status Messages */}
      {uploadSuccess && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-2xl flex items-center gap-3 text-green-700 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 size={20} />
          <p className="font-bold">{uploadSuccess}</p>
          <button onClick={() => setUploadSuccess(null)} className="ml-auto"><X size={18} /></button>
        </div>
      )}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-700 animate-in fade-in slide-in-from-top-2">
          <AlertCircle size={20} />
          <p className="font-bold">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto"><X size={18} /></button>
        </div>
      )}

      {/* Document Table */}
      <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden min-h-[500px]">
        <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-3">
             <div className="w-2 h-8 bg-blue-600 rounded-full"></div>
             <h2 className="text-2xl font-black text-slate-800">Document Registry</h2>
          </div>
          <div className="flex gap-4">
             <button
               onClick={() => loadDocuments(currentPage, appliedSearchQuery, showMissingOnly)}
               className="p-3 text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
             >
               <Clock size={20} />
             </button>
             <button
                onClick={() => {
                  setCurrentPage(1);
                  setShowMissingOnly((prev) => !prev);
                }}
                className="flex items-center gap-2 px-6 py-2.5 bg-white border-2 border-slate-200 rounded-xl font-black text-sm hover:border-slate-300 transition-all"
              >
                <Filter size={16} />
                {showMissingOnly ? 'Missing only' : 'Show All'}
             </button>
          </div>
        </div>

        <div className="overflow-x-auto relative">
          {loading && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-50 flex items-center justify-center">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}

          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">Document No.</th>
                <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">Date</th>
                <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">ผู้ทำรายการ</th>
                <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100 text-right">Amount</th>
                <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100 text-center">Status</th>
                <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {documents.length > 0 ? (
                documents.map((doc) => (
                  <tr
                    key={doc.id}
                    onClick={() => setSelectedCaseId(doc.id)}
                    className={`cursor-pointer transition-all group hover:bg-slate-50/80 ${
                      selectedCaseId === doc.id
                        ? 'bg-blue-50/60 ring-1 ring-inset ring-blue-100'
                        : !doc.is_receipt_uploaded
                          ? 'bg-red-50/30'
                          : ''
                    }`}
                  >
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-3">
                         <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black ${!doc.is_receipt_uploaded ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
                           {doc.doc_no ? doc.doc_no.substring(0, 2) : 'PV'}
                         </div>
                         <span className="text-base font-black text-slate-800">{doc.doc_no || doc.case_no}</span>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-sm text-slate-500 font-bold">
                      {new Date(doc.created_at || doc.date).toLocaleDateString()}
                    </td>
                    <td className="px-8 py-6">
                      <span className="text-sm font-bold text-slate-700">{doc.requester_name || 'Staff User'}</span>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <span className="text-lg font-black text-slate-900">
                        {parseFloat(doc.requested_amount || 0).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-center">
                      <span className={`inline-flex items-center px-4 py-1.5 rounded-full text-xs font-black tracking-widest uppercase ${
                        doc.is_receipt_uploaded 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-red-500 text-white animate-pulse'
                      }`}>
                        {doc.is_receipt_uploaded ? 'Uploaded' : 'Missing File'}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-center">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCaseId(doc.id);
                        }}
                        className={`flex items-center gap-2 px-5 py-2 rounded-xl font-black text-xs transition-all ${
                          selectedCaseId === doc.id 
                            ? 'bg-blue-600 text-white shadow-lg' 
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        <Upload size={14} />
                        {selectedCaseId === doc.id ? 'Ready...' : 'Upload'}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-8 py-32 text-center text-slate-400">
                     <FileSearch size={64} className="mx-auto mb-4 opacity-20" />
                     <p className="text-xl font-black">{hasActiveSearch ? 'No matching records found' : 'No documents found'}</p>
                     <button onClick={resetFilters} className="text-blue-600 font-bold mt-2 hover:underline">Clear all filters</button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-4 border-t border-slate-100 bg-slate-50/70 px-8 py-5 md:flex-row md:items-center md:justify-between">
          <div className="text-sm font-bold text-slate-500">
            Showing {startItem}-{endItem} of {totalDocuments.toLocaleString()} documents
            {showMissingOnly ? ' with missing receipts' : ''}
            {hasActiveSearch ? ` for "${appliedSearchQuery}"` : ''}
          </div>

          <div className="flex items-center gap-3 self-end md:self-auto">
            <button
              onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
              disabled={currentPage <= 1 || loading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft size={16} />
              Prev
            </button>

            <div className="min-w-[120px] text-center text-sm font-black text-slate-700">
              Page {totalPages === 0 ? 0 : currentPage} / {totalPages}
            </div>

            <button
              onClick={() => setCurrentPage((page) => Math.min(page + 1, totalPages || 1))}
              disabled={currentPage >= totalPages || totalPages === 0 || loading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </div>
  );
};
