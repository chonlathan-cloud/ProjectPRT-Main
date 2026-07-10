import React, { useState, useEffect } from 'react';
import { Search, MoreHorizontal, Wallet, TrendingUp, CreditCard, ChevronLeft, ChevronRight, Sun, Moon, FileText, Loader2, ChevronDown } from 'lucide-react';
import  { getDashboardData, DashboardData, getCaseAttachments } from '../services/api';
import AttachmentPreviewPanel from './AttachmentPreviewPanel';
import { openDocumentPreview } from '../utils/documentPreview';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend
} from 'recharts';

interface DashboardProps {
  isDarkMode: boolean;
  toggleTheme: () => void;
}

type DashboardTransaction = DashboardData['latestTransactions'][number];
// --- Initial Empty State (Ready for Backend) ---
const INITIAL_DATA: DashboardData = {
  summary: {
    expenses: 0,
    income: 0,
    balance: 0,
  },
  monthlyStats: [],
  activityStats: [],
  latestTransactions: []
};

export const Dashboard: React.FC<DashboardProps> = ({ isDarkMode, toggleTheme }) => {
  // State for data - initialized with empty structure
  const [data, setData] = useState<DashboardData>(INITIAL_DATA);
  const [loading, setLoading] = useState<boolean>(false);
  const [attachmentLoadingId, setAttachmentLoadingId] = useState<string | null>(null);
  const [attachmentUrlByTransactionId, setAttachmentUrlByTransactionId] = useState<Record<string, string | null>>({});
  const [attachmentErrorByTransactionId, setAttachmentErrorByTransactionId] = useState<Record<string, string>>({});
  
  // State for UI interaction
  const [activeCard, setActiveCard] = useState<'expenses' | 'income' | 'balance' | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(2025);
  const [selectedTransaction, setSelectedTransaction] = useState<DashboardTransaction | null>(null);
  const [selectedPieType, setSelectedPieType] = useState<'activity' | 'summary'>('activity');
  const [isPieDropdownOpen, setIsPieDropdownOpen] = useState(false);

  // Connect to Backend
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // use getDashboardData from api.ts replace "fetch" logic
        const data = await getDashboardData(selectedYear);
        setData(data);
      } catch (error) {
        console.error("Failed to fetch dashboard data", error);
        // Fallback to empty/initial data if failed
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedYear]);

  useEffect(() => {
    const nextSelectedTransaction =
      data.latestTransactions.find((item) => item.id === selectedTransaction?.id) ||
      data.latestTransactions.find((item) => item.has_attachment) ||
      data.latestTransactions[0] ||
      null;

    setSelectedTransaction(nextSelectedTransaction);
  }, [data.latestTransactions, selectedTransaction?.id]);

  useEffect(() => {
    setAttachmentLoadingId(null);
    setAttachmentUrlByTransactionId({});
    setAttachmentErrorByTransactionId({});
  }, [selectedYear]);

  const handlePrevYear = () => {
    setSelectedYear(prev => prev - 1);
  };

  const handleNextYear = () => {
    setSelectedYear(prev => prev + 1);
  };

  const openAttachment = (url: string, transaction: DashboardTransaction) => {
    openDocumentPreview({
      url,
      title: transaction.description,
      subtitle: transaction.name,
    });
  };

  const resolveTransactionAttachment = async (transaction: DashboardTransaction) => {
    setAttachmentLoadingId(transaction.id);
    setAttachmentErrorByTransactionId((prev) => {
      const next = { ...prev };
      delete next[transaction.id];
      return next;
    });

    try {
      const attachments = await getCaseAttachments(transaction.case_id);
      const preferredAttachment =
        attachments.find((attachment) => attachment.type === 'APPROVED_PDF') ||
        attachments.find((attachment) => attachment.type === 'RECEIPT') ||
        attachments[0] ||
        null;

      if (!preferredAttachment) {
        setAttachmentUrlByTransactionId((prev) => ({ ...prev, [transaction.id]: null }));
        setAttachmentErrorByTransactionId((prev) => ({ ...prev, [transaction.id]: 'รายการนี้ยังไม่มีไฟล์แนบ' }));
        return null;
      }

      setAttachmentUrlByTransactionId((prev) => ({ ...prev, [transaction.id]: preferredAttachment.url }));
      return preferredAttachment.url;
    } catch (error) {
      console.error('Failed to load dashboard attachment:', error);
      setAttachmentUrlByTransactionId((prev) => ({ ...prev, [transaction.id]: null }));
      setAttachmentErrorByTransactionId((prev) => ({ ...prev, [transaction.id]: 'ไม่สามารถโหลดเอกสารได้' }));
      return null;
    } finally {
      setAttachmentLoadingId(null);
    }
  };

  const handleViewFile = async (transaction: DashboardTransaction) => {
    setSelectedTransaction(transaction);

    const cachedUrl = attachmentUrlByTransactionId[transaction.id];
    if (cachedUrl) {
      openAttachment(cachedUrl, transaction);
      return;
    }

    const resolvedUrl = await resolveTransactionAttachment(transaction);
    if (resolvedUrl) {
      openAttachment(resolvedUrl, transaction);
    }
  };

  const handleLoadPreview = async (transaction: DashboardTransaction) => {
    setSelectedTransaction(transaction);

    if (attachmentUrlByTransactionId[transaction.id]) {
      return;
    }

    await resolveTransactionAttachment(transaction);
  };

  const selectedAttachmentUrl = selectedTransaction ? attachmentUrlByTransactionId[selectedTransaction.id] ?? null : null;
  const selectedAttachmentError = selectedTransaction ? attachmentErrorByTransactionId[selectedTransaction.id] ?? null : null;
  const isSelectedAttachmentLoading = selectedTransaction ? attachmentLoadingId === selectedTransaction.id : false;

  // Helper to determine card styling
  const getCardStyle = (cardType: 'expenses' | 'income' | 'balance') => {
    const isActive = activeCard === cardType;
    const baseStyle = "rounded-3xl p-6 relative overflow-hidden group hover:shadow-xl transition-all cursor-pointer border";
    
    if (isActive) {
      return `${baseStyle} bg-sky-200 border-sky-300 dark:bg-sky-900 dark:border-sky-500`;
    }
    return `${baseStyle} bg-white border-slate-100 dark:bg-slate-900 dark:border-slate-800`;
  };

  const summaryPieData = [
    { name: 'Income', value: data.summary.income, fill: '#10b981' },
    { name: 'Expenses', value: data.summary.expenses, fill: '#ef4444' },
    { name: 'Balance', value: Math.max(0, data.summary.balance), fill: '#3b82f6' }
  ].filter(item => item.value > 0);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <header className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-slate-800 dark:text-white">Dashboard</h1>
        <div className="flex gap-4">
          <button className="p-2 hover:bg-white rounded-full transition-colors dark:hover:bg-slate-700">
            <Search size={24} className="text-slate-600 dark:text-slate-300" />
          </button>
          <button 
            onClick={toggleTheme}
            className="p-2 hover:bg-white rounded-full transition-colors dark:hover:bg-slate-700"
          >
            {isDarkMode ? (
              <Sun size={24} className="text-slate-600 dark:text-slate-300" />
            ) : (
              <Moon size={24} className="text-slate-600 dark:text-slate-300" />
            )}
          </button>
          <button className="p-2 hover:bg-white rounded-full transition-colors">
            <MoreHorizontal size={24} className="text-slate-600 dark:text-slate-300" />
          </button>
        </div>
      </header>

      {/* Top Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card: Expenses */}
        <div 
          className={getCardStyle('expenses')}
          onClick={() => setActiveCard('expenses')}
        >
           <div className="flex justify-between items-start mb-4">
            <div className={`p-3 rounded-2xl shadow-sm ${activeCard === 'expenses' ? 'bg-white/50 dark:bg-slate-700/50' : 'bg-slate-100 dark:bg-slate-700'}`}>
               <Wallet className={activeCard === 'expenses' ? "text-blue-600 dark:text-blue-400" : "text-slate-600 dark:text-slate-400"} />
            </div>
            <button className={`${activeCard === 'expenses' ? 'text-slate-600 hover:bg-white/30' : 'text-slate-400 hover:bg-slate-50'} rounded-full p-1`}>
              <MoreHorizontal size={20} />
            </button>
          </div>
          <p className={`text-lg font-medium ${activeCard === 'expenses' ? 'text-slate-700 dark:text-slate-200' : 'text-slate-600 dark:text-slate-400'}`}>รายจ่าย</p>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-800 dark:text-white">{data.summary.expenses.toLocaleString()}</span>
            <span className="text-sm text-slate-600 dark:text-slate-400">บาท</span>
          </div>
        </div>

        {/* Card: Income */}
        <div 
          className={getCardStyle('income')}
          onClick={() => setActiveCard('income')}
        >
          <div className="flex justify-between items-start mb-4">
            <div className={`p-3 rounded-2xl ${activeCard === 'income' ? 'bg-white/50 dark:bg-slate-700/50' : 'bg-slate-100 dark:bg-slate-700'}`}>
               <TrendingUp className={activeCard === 'income' ? "text-blue-600 dark:text-blue-400" : "text-slate-600 dark:text-slate-400"} />
            </div>
            <button className={`${activeCard === 'income' ? 'text-slate-600 hover:bg-white/30' : 'text-slate-400 hover:bg-slate-50'} rounded-full p-1`}>
              <MoreHorizontal size={20} />
            </button>
          </div>
          <p className={`text-lg font-medium ${activeCard === 'income' ? 'text-slate-700 dark:text-slate-200' : 'text-slate-600 dark:text-slate-400'}`}>รายรับ</p>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-800 dark:text-white">{data.summary.income.toLocaleString()}</span>
            <span className="text-sm text-slate-500 dark:text-slate-400">บาท</span>
          </div>
        </div>

        {/* Card: Balance */}
        <div 
          className={getCardStyle('balance')}
          onClick={() => setActiveCard('balance')}
        >
          <div className="flex justify-between items-start mb-4">
            <div className={`p-3 rounded-2xl ${activeCard === 'balance' ? 'bg-white/50 dark:bg-slate-700/50' : 'bg-slate-100 dark:bg-slate-700'}`}>
               <CreditCard className={activeCard === 'balance' ? "text-blue-600 dark:text-blue-400" : "text-slate-600 dark:text-slate-400"} />
            </div>
            <button className={`${activeCard === 'balance' ? 'text-slate-600 hover:bg-white/30' : 'text-slate-400 hover:bg-slate-50'} rounded-full p-1`}>
              <MoreHorizontal size={20} />
            </button>
          </div>
          <p className={`text-lg font-medium ${activeCard === 'balance' ? 'text-slate-700 dark:text-slate-200' : 'text-slate-600 dark:text-slate-400'}`}>เงินคงเหลือ</p>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-800 dark:text-white">{data.summary.balance.toLocaleString()}</span>
            <span className="text-sm text-slate-500 dark:text-slate-400">บาท</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-sm border border-slate-100 dark:border-slate-800">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-xl font-bold text-slate-800 dark:text-white">Overview</h2>
            <div className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400">
              <ChevronLeft size={20} className="text-blue-400 cursor-pointer hover:scale-110 transition-transform" onClick={handlePrevYear} />
              <span className="min-w-[40px] text-center">{selectedYear}</span>
              <ChevronRight size={20} className="text-blue-400 cursor-pointer hover:scale-110 transition-transform" onClick={handleNextYear} />
            </div>
          </div>
          <div className="h-[300px] flex items-center justify-center text-slate-400 bg-slate-50 dark:bg-slate-950 rounded-xl">
             {data.monthlyStats.length > 0 ? (
               <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={data.monthlyStats}>
                   <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={isDarkMode ? '#334155' : '#f1f5f9'} />
                   <XAxis 
                     dataKey="name" 
                     axisLine={false} 
                     tickLine={false} 
                     tick={{ fontSize: 12, fill: isDarkMode ? '#94a3b8' : '#64748b', fontWeight: 500 }}
                     dy={10}
                   />
                   <YAxis 
                     axisLine={false} 
                     tickLine={false} 
                     tick={{ fontSize: 12, fill: isDarkMode ? '#94a3b8' : '#94a3b8' }}
                     tickFormatter={(val) => `${val / 1000}k`}
                   />
                   <Tooltip 
                     cursor={{ fill: isDarkMode ? '#1e293b' : '#f8fafc' }}
                     contentStyle={{ 
                       borderRadius: '12px', 
                       border: 'none', 
                       boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                       backgroundColor: isDarkMode ? '#1e293b' : '#fff',
                       color: isDarkMode ? '#fff' : '#000'
                     }}
                   />
                   <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={24}>
                     {data.monthlyStats.map((entry, index) => (
                       <Cell 
                         key={`cell-${index}`} 
                         fill={entry.highlight ? '#82b1ff' : '#e2e8f0'} 
                       />
                     ))}
                   </Bar>
                 </BarChart>
               </ResponsiveContainer>
             ) : (
                <p>Waiting for data...</p>
             )}
          </div>
        </div>

        {/* Activity / Summary Chart */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-sm border border-slate-100 dark:border-slate-800">
          <div className="flex justify-between items-center mb-8 relative">
            <div className="relative">
              <button
                onClick={() => setIsPieDropdownOpen(!isPieDropdownOpen)}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-white rounded-2xl border border-slate-100 dark:border-slate-800 font-bold text-sm transition-all duration-200 active:scale-95 shadow-sm"
              >
                <span>{selectedPieType === 'activity' ? 'Expense ratio' : 'Income, Expenses, Balance'}</span>
                <ChevronDown size={16} className={`text-slate-500 transition-transform duration-200 ${isPieDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isPieDropdownOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-10" 
                    onClick={() => setIsPieDropdownOpen(false)}
                  />
                  <div className="absolute left-0 mt-2 w-64 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-100 dark:border-slate-800/80 rounded-2xl shadow-xl py-2 z-20 animate-in fade-in slide-in-from-top-2 duration-200">
                    <button
                      onClick={() => {
                        setSelectedPieType('activity');
                        setIsPieDropdownOpen(false);
                      }}
                      className={`w-full text-left px-4 py-3 text-sm font-bold transition-colors flex items-center justify-between ${
                        selectedPieType === 'activity'
                          ? 'bg-blue-50/50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50/50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span>Expense ratio</span>
                      {selectedPieType === 'activity' && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                    </button>
                    <button
                      onClick={() => {
                        setSelectedPieType('summary');
                        setIsPieDropdownOpen(false);
                      }}
                      className={`w-full text-left px-4 py-3 text-sm font-bold transition-colors flex items-center justify-between ${
                        selectedPieType === 'summary'
                          ? 'bg-blue-50/50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50/50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span>Income, Expenses, Balance</span>
                      {selectedPieType === 'summary' && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                    </button>
                  </div>
                </>
              )}
            </div>
            <button className="text-slate-400"><MoreHorizontal size={20} /></button>
          </div>
          <div className="h-[300px] flex flex-col justify-center items-center">
             {selectedPieType === 'activity' ? (
               data.activityStats.length > 0 ? (
                 <ResponsiveContainer width="100%" height="100%">
                   <PieChart>
                     <Pie
                       data={data.activityStats}
                       cx="50%"
                       cy="50%"
                       innerRadius={60}
                       outerRadius={100}
                       paddingAngle={5}
                       dataKey="value"
                       stroke="none"
                     />
                     <Tooltip 
                       contentStyle={{ 
                         borderRadius: '12px', 
                         border: 'none', 
                         boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                         backgroundColor: isDarkMode ? '#1e293b' : '#fff',
                         color: isDarkMode ? '#fff' : '#000'
                       }}
                       formatter={(value: any) => [`${Number(value).toLocaleString()} บาท`]}
                     />
                   </PieChart>
                 </ResponsiveContainer>
               ) : (
                 <div className="flex items-center justify-center text-slate-400 h-full w-full bg-slate-50 dark:bg-slate-950 rounded-xl">
                   <p className="text-sm font-medium">No activity data</p>
                 </div>
               )
             ) : (
               summaryPieData.length > 0 ? (
                 <ResponsiveContainer width="100%" height="100%">
                   <PieChart>
                     <Pie
                       data={summaryPieData}
                       cx="50%"
                       cy="50%"
                       innerRadius={60}
                       outerRadius={100}
                       paddingAngle={5}
                       dataKey="value"
                       stroke="none"
                     >
                       {summaryPieData.map((entry, index) => (
                         <Cell key={`cell-${index}`} fill={entry.fill} />
                       ))}
                     </Pie>
                     <Tooltip 
                       contentStyle={{ 
                         borderRadius: '12px', 
                         border: 'none', 
                         boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                         backgroundColor: isDarkMode ? '#1e293b' : '#fff',
                         color: isDarkMode ? '#fff' : '#000'
                       }}
                       formatter={(value: any) => [`${Number(value).toLocaleString()} บาท`]}
                     />
                     <Legend 
                       verticalAlign="bottom" 
                       height={36}
                       iconType="circle"
                       content={({ payload }) => (
                         <div className="flex justify-center gap-4 flex-wrap mt-4 text-xs font-bold text-slate-500 dark:text-slate-400">
                           {payload?.map((entry: any, index: number) => (
                             <div key={`legend-${index}`} className="flex items-center gap-1.5">
                               <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                               <span>{entry.value}: {Number(entry.payload?.value).toLocaleString()} บาท</span>
                             </div>
                           ))}
                         </div>
                       )}
                     />
                   </PieChart>
                 </ResponsiveContainer>
               ) : (
                 <div className="flex items-center justify-center text-slate-400 h-full w-full bg-slate-50 dark:bg-slate-950 rounded-xl">
                   <p className="text-sm font-medium">No summary data</p>
                 </div>
               )
             )}
          </div>
        </div>
      </div>

      {/* Latest Items List */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-sm border border-slate-100 dark:border-slate-800">
        <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-6">Latest item</h2>
        <div className="space-y-6">
          {data.latestTransactions.length > 0 ? (
            data.latestTransactions.map((item) => (
              <div
                key={item.id}
                onClick={() => setSelectedTransaction(item)}
                className={`flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 group cursor-pointer ${
                  selectedTransaction?.id === item.id
                    ? 'border-blue-200 bg-blue-50/60 dark:border-blue-800 dark:bg-blue-900/20'
                    : 'border-transparent hover:border-slate-100 dark:hover:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-2xl flex items-center justify-center text-slate-500 dark:text-slate-400 font-bold group-hover:scale-105 transition-transform duration-300 shadow-sm">
                    {item.initial}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{item.name}</h4>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">{item.description}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="text-lg font-bold text-slate-800 dark:text-white">
                    {item.amount.toLocaleString()} <span className="text-sm font-medium text-slate-400">บาท</span>
                  </span>
                  {item.has_attachment ? (
                    <button
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      disabled={attachmentLoadingId === item.id}
                      onClick={async (e) => {
                        e.stopPropagation();
                        await handleViewFile(item);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors border border-blue-100/50 dark:border-blue-800/50"
                    >
                      {attachmentLoadingId === item.id ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>
                          <FileText size={14} />
                          View File
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 rounded-lg text-xs font-medium border border-slate-100 dark:border-slate-800">
                      <FileText size={14} className="opacity-50" />
                      No file
                    </div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-slate-400">
              No recent transactions
            </div>
          )}
        </div>

        {selectedTransaction && (
          <AttachmentPreviewPanel
            url={selectedAttachmentUrl}
            title={selectedTransaction.name}
            subtitle={selectedTransaction.description}
            actions={selectedTransaction.has_attachment ? (
              <button
                type="button"
                onClick={() => handleLoadPreview(selectedTransaction)}
                disabled={isSelectedAttachmentLoading}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {isSelectedAttachmentLoading ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Loading Preview
                  </>
                ) : selectedAttachmentUrl ? (
                  'Preview Ready'
                ) : (
                  'Load Preview'
                )}
              </button>
            ) : undefined}
            className="mt-8 overflow-hidden rounded-3xl border border-slate-100 bg-slate-50/70 shadow-sm dark:border-slate-800 dark:bg-slate-950/60"
            bodyClassName="flex h-[360px] items-center justify-center bg-slate-100 p-6 dark:bg-slate-950"
            emptyState={
              <div className="max-w-md text-center text-slate-500 dark:text-slate-400">
                <FileText size={48} className="mx-auto mb-4 opacity-30" />
                <p className="font-semibold text-slate-700 dark:text-slate-200">
                  {selectedTransaction.has_attachment ? 'กด Load Preview เพื่อดึงเอกสารล่าสุด' : 'รายการนี้ยังไม่มีไฟล์แนบ'}
                </p>
                <p className="mt-2 text-sm">
                  {selectedAttachmentError || (selectedTransaction.has_attachment
                    ? 'ระบบจะขอ signed URL เฉพาะตอนที่คุณต้องการดูไฟล์'
                    : 'หากมีไฟล์แล้ว ระบบจะแสดง preview ในส่วนนี้ได้')}
                </p>
              </div>
            }
          />
        )}
      </div>
    </div>
  );
};
