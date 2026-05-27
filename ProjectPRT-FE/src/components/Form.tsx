// src/components/Form.tsx
import React, { useState, useRef, useEffect } from 'react';
import { 
  Search, MoreHorizontal, Plus, Trash2, Download, Save, 
  Loader2, Upload, CheckCircle2, AlertCircle, Info, X
} from 'lucide-react';
import { PaymentVoucherTemplate, ReceiveVoucherTemplate, JournalVoucherTemplate, DocumentData } from './DocumentTemplates';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { createCase, submitCase, getCategories, getUsers, getBankAccounts, searchDocumentsByNo, createJV, uploadDocumentFile } from '../services/api'; // Import API
import { Category, User, BankAccount } from '../../types'; // Import Types

const INITIAL_DATA: DocumentData = {
  type: 'pv', 
  docNo: '',
  date: new Date().getDate().toString().padStart(2, '0'),
  month: new Date().toLocaleString('th-TH', { month: 'long' }),
  year: (new Date().getFullYear() + 543).toString(),
  name: '',
  position: '',
  bankAccount: '',
  makerName: '',
  department: '',
  subject: '',
  purpose: '',
  psNo: '',
  timestamp: '',
  items: [
    { id: '1', description: '', quantity: '', unit: '', price: '', refNo: '' }
  ]
};

const FORM_STORAGE_KEY = 'pending_form_data';

type NoticeType = 'success' | 'error' | 'warning' | 'info';

interface FormNotice {
  type: NoticeType;
  title: string;
  message: string;
}

interface FormFieldErrors {
  jvLinkedCases?: string;
  jvMainCase?: string;
  category?: string;
  bankAccount?: string;
  psFile?: string;
  items?: string;
}

interface SuccessSummary {
  title: string;
  docNo: string;
  status: string;
  description: string;
}

export const Form: React.FC = () => {
  // --- Load Persistent State ---
  const getSavedData = () => {
    const saved = localStorage.getItem(FORM_STORAGE_KEY);
    if (!saved) return null;
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.error("Failed to parse saved form data", e);
      return null;
    }
  };

  const savedState = getSavedData();

  const initialLinkedCases = savedState?.linkedCases || [];
  const initialLinkedCaseIds = initialLinkedCases.length > 0
    ? (savedState?.linkedCaseIds || initialLinkedCases.map((c: any) => c.id))
    : [];
  const initialMainCaseId = initialLinkedCases.length > 0 ? (savedState?.mainCaseId || '') : '';

  const [data, setData] = useState<DocumentData>(savedState?.data || INITIAL_DATA);
  const [isSaving, setIsSaving] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(savedState?.selectedCategoryId || '');
  const [transactionType, setTransactionType] = useState<'EXPENSE' | 'REVENUE'>(savedState?.transactionType || 'EXPENSE');
  
  // JV Consolidation States
  const [searchQuery, setSearchQuery] = useState('');
  const [linkedCaseIds, setLinkedCaseIds] = useState<string[]>(initialLinkedCaseIds);
  const [linkedCases, setLinkedCases] = useState<any[]>(initialLinkedCases);
  const [mainCaseId, setMainCaseId] = useState<string>(initialMainCaseId);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearchingDocs, setIsSearchingDocs] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>(savedState?.selectedBankAccountId || '');
  const psUploadRef = useRef<HTMLInputElement>(null);
  const [selectedPsFile, setSelectedPsFile] = useState<File | null>(null);
  const [psPreviewUrl, setPsPreviewUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState<FormNotice | null>(null);
  const [successSummary, setSuccessSummary] = useState<SuccessSummary | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FormFieldErrors>({});
  const jvSectionRef = useRef<HTMLDivElement>(null);
  const categoryFieldRef = useRef<HTMLDivElement>(null);
  const bankAccountFieldRef = useRef<HTMLDivElement>(null);
  const psUploadSectionRef = useRef<HTMLDivElement>(null);
  const itemsSectionRef = useRef<HTMLDivElement>(null);

  const showNotice = (type: NoticeType, title: string, message: string) => {
    setNotice({ type, title, message });
  };

  const buildFreshFormData = (docType: DocumentData['type']): DocumentData => {
    let storedName = '';
    let storedPosition = '';

    try {
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        const userObj = JSON.parse(storedUser);
        storedName = userObj.name || '';
        storedPosition = userObj.position || '';
      }
    } catch (error) {
      console.error('Failed to read user defaults', error);
    }

    return {
      ...INITIAL_DATA,
      type: docType,
      name: storedName,
      position: storedPosition,
    };
  };

  const resetFormForNewDocument = () => {
    const nextDocType = data.type;
    const nextTransactionType = nextDocType === 'rv' ? 'REVENUE' : 'EXPENSE';

    setData(buildFreshFormData(nextDocType));
    setTransactionType(nextTransactionType);
    setSelectedCategoryId('');
    setSelectedBankAccountId('');
    setSelectedPsFile(null);
    setLinkedCaseIds([]);
    setLinkedCases([]);
    setMainCaseId('');
    setSearchResults([]);
    setSearchQuery('');
    setFieldErrors({});
    setNotice(null);
    setSuccessSummary(null);
    localStorage.removeItem(FORM_STORAGE_KEY);
  };

  const clearFieldError = (field: keyof FormFieldErrors) => {
    setFieldErrors((prev) => {
      if (!prev[field]) {
        return prev;
      }

      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const focusFirstInvalidSection = (errors: FormFieldErrors) => {
    if (errors.jvLinkedCases || errors.jvMainCase) {
      jvSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (errors.category) {
      categoryFieldRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (errors.bankAccount) {
      bankAccountFieldRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (errors.psFile) {
      psUploadSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (errors.items) {
      itemsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Manage PS File Preview URL
  useEffect(() => {
    if (selectedPsFile) {
      const url = URL.createObjectURL(selectedPsFile);
      setPsPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPsPreviewUrl(null);
    }
  }, [selectedPsFile]);
  // 0. Sync State to LocalStorage
  useEffect(() => {
    const stateToSave = {
      data,
      selectedCategoryId,
      transactionType,
      linkedCaseIds,
      linkedCases,
      mainCaseId,
      selectedBankAccountId
    };
    localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(stateToSave));
  }, [data, selectedCategoryId, transactionType, linkedCaseIds, linkedCases, mainCaseId, selectedBankAccountId]);

  useEffect(() => {
    if (!notice || notice.type === 'error') {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setNotice(null);
    }, 4000);

    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  // 1. โหลดข้อมูลเมื่อเข้าหน้า Form
  useEffect(() => {
    // A. ดึง User จาก LocalStorage มาเป็น Default
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const userObj = JSON.parse(storedUser);
        if (userObj.name) {
          setData(prev => ({ ...prev, name: userObj.name }));
        }
      } catch (e) {
        console.error("Failed to parse user data", e);
      }
    }

    // B. ดึง Categories ตาม transactionType
    const fetchCats = async () => {
      try {
        const cats = await getCategories(transactionType);
        setCategories(cats);
      } catch (error) {
        console.error("Error fetching categories:", error);
      }
    };
    fetchCats();

    // C. ดึง Users และ Bank Accounts
    const fetchOtherData = async () => {
      try {
        const u = await getUsers();
        setUsers(u);
      } catch (error) {
        console.warn("⚠️ Warning: Could not fetch users (API not found or error)", error);
        // ไม่ต้อง throw error ปล่อยให้ทำงานต่อ
      }

      // 2. ดึง Bank Accounts (หัวใจสำคัญของ RV)
      try {
        const b = await getBankAccounts();
        console.log("✅ Bank Accounts fetched:", b); // เช็คใน Console ว่าข้อมูลมาไหม
        setBankAccounts(b);
      } catch (error) {
        console.error("❌ Error fetching bank accounts:", error);
      }
    };
    fetchOtherData();
  }, [transactionType]);

  useEffect(() => {
    if (transactionType === 'REVENUE' && categories.length > 0) {
      // เลือกตัวแรกใน List ให้เลยอัตโนมัติ
      setSelectedCategoryId(categories[0].id);
    }
  }, [categories, transactionType]);

  const handleInputChange = (field: keyof DocumentData, value: string) => {
    setData(prev => ({ ...prev, [field]: value }));
    if (field === 'purpose' || field === 'type') {
      clearFieldError('items');
    }
    // ย้าย Logic เช็ค type มาไว้ตรงนี้ เพราะ type อยู่ระดับ DocumentData ไม่ใช่ Item
    if (field === 'type') {
      if (value === 'rv'){
        setTransactionType('REVENUE'); // revenue
      } else {
        setTransactionType('EXPENSE'); // Expense
      }
      setSelectedCategoryId('');
      setSelectedBankAccountId('');
      // Reset JV state when switching into or out of JV
      if (value === 'jv' || data.type === 'jv') {
        clearJvState();
      }
    }
  };

  const handleItemChange = (id: string, field: string, value: string | number) => {
    setData(prev => ({
      ...prev,
      items: prev.items.map(item => 
        // เช็คว่า ID ตรงกันไหม ถ้าตรงให้สร้าง object ใหม่ที่อัปเดตค่า field นั้น
        item.id === id ? { ...item, [field]: value } : item
      )
    }));
    clearFieldError('items');
  };

  const addItem = () => {
    setData(prev => ({
      ...prev,
      items: [...prev.items, { 
        id: Date.now().toString(), 
        description: '', 
        quantity: '', 
        unit: '', 
        price: '',
        refNo: ''
      }]
    }));
    clearFieldError('items');
  };

  const removeItem = (id: string) => {
    if (data.items.length === 1) return;
    setData(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== id)
    }));
    clearFieldError('items');
  };

  const clearJvState = () => {
    setLinkedCaseIds([]);
    setLinkedCases([]);
    setMainCaseId('');
    setSearchResults([]);
    setSearchQuery('');
    setData(prev => ({ ...prev, items: [...INITIAL_DATA.items] }));
    clearFieldError('jvLinkedCases');
    clearFieldError('jvMainCase');
    clearFieldError('items');
  };

  const handleSaveToBackend = async (): Promise<string | null> => {
    setFieldErrors({});
    // ---------------------------------------------------------
    // 1. ตรวจสอบและจัดการ JV (Journal Voucher) เป็นอันดับแรก

    // ---------------------------------------------------------
    if (data.type === 'jv') {
        const validationErrors: FormFieldErrors = {};

        if (linkedCaseIds.length === 0) {
            validationErrors.jvLinkedCases = "กรุณาดึงข้อมูลเอกสาร (Pull) อย่างน้อย 1 รายการเพื่อทำ JV";
        }
        if (!mainCaseId) {
            validationErrors.jvMainCase = "กรุณาเลือกเคสหลัก (Main Case) ก่อนสร้าง JV";
        } else if (!linkedCaseIds.includes(mainCaseId)) {
            validationErrors.jvMainCase = "เคสหลักต้องอยู่ในรายการที่ดึง";
        }

        if (Object.keys(validationErrors).length > 0) {
            setFieldErrors(validationErrors);
            showNotice('warning', 'ข้อมูลยังไม่ครบ', 'กรุณาตรวจสอบส่วนรวมเอกสารสำหรับ JV ที่ถูกไฮไลต์');
            focusFirstInvalidSection(validationErrors);
            return null;
        }

        setIsSaving(true);
        try {
            // ใช้ Main Case ที่ผู้ใช้เลือก
            const mainId = mainCaseId;
            const others = linkedCaseIds.filter(id => id !== mainId);
            
            const jvPayload = {
                main_case_id: mainId,
                linked_case_ids: others,
                description: data.purpose || "Consolidated JV"
            };

            console.log("Creating JV with:", jvPayload);
            const res = await createJV(jvPayload); 
            
            const now = new Date().toLocaleString('th-TH');
            setData(prev => ({ 
              ...prev, 
              docNo: res.doc_no, 
              psNo: res.ps_no || prev.psNo, // Assuming createJV might return ps_no or it's not applicable
              timestamp: now 
            }));
            localStorage.removeItem(FORM_STORAGE_KEY); // Clear after success
            setSuccessSummary({
              title: 'สร้าง JV สำเร็จ',
              docNo: res.doc_no,
              status: 'สร้างเอกสารแล้ว',
              description: 'ระบบได้สร้างเอกสาร JV เรียบร้อยแล้ว คุณสามารถเริ่มเอกสารใหม่ต่อได้ทันที',
            });
            return res.doc_no;

        } catch (error: any) {
            console.error('JV Save failed:', error);
            const msg = error.response?.data?.detail || error.message;
            showNotice('error', 'สร้าง JV ไม่สำเร็จ', String(msg));
            return null;
        } finally {
            setIsSaving(false);
        }
    }

    // ---------------------------------------------------------
    // 2. Validation สำหรับ PV และ RV
    // ---------------------------------------------------------
    
    // ถ้าไม่ใช่ JV ต้องเลือกหมวดหมู่/ประเภทรายได้
    const validationErrors: FormFieldErrors = {};

    if (data.type !== 'jv' && !selectedCategoryId) {
      validationErrors.category = data.type === 'rv'
        ? "กรุณาเลือกประเภทรายได้ก่อนบันทึก"
        : "กรุณาเลือกหมวดหมู่บัญชี (Category) ก่อนบันทึก";
    }

    // เช็คบัญชีธนาคารสำหรับ RV (Income)
    if (transactionType === 'REVENUE' && !selectedBankAccountId) {
        validationErrors.bankAccount = "กรุณาเลือกบัญชีธนาคาร/เงินสด ที่รับเงินเข้า";
    }

    // PV ต้องมีไฟล์ ปส ที่ผู้ใช้อัปโหลดก่อนส่งอนุมัติ
    if (data.type === 'pv' && !selectedPsFile) {
      validationErrors.psFile = "กรุณาอัปโหลดใบ ปส ก่อนส่งอนุมัติ";
    }

    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      showNotice('warning', 'ข้อมูลยังไม่ครบ', 'กรุณาตรวจสอบฟิลด์ที่ถูกไฮไลต์ก่อนบันทึกเอกสาร');
      focusFirstInvalidSection(validationErrors);
      return null;
    }

    setIsSaving(true);
    try {
      // ---------------------------------------------------------
      // 3. Logic สร้าง PV/RV (Standard Flow)
      // ---------------------------------------------------------
      const totalAmount = data.items.reduce((sum, item) => {
        const p = Number(item.price) || 0;
        if (data.type === 'rv') {
          return sum + p;
        }
        const q = Number(item.quantity) || 0;
        return sum + (q * p);
      }, 0);

      if (totalAmount <= 0) {
        const itemError = { items: "กรุณากรอกราคา/จำนวนให้มากกว่า 0" };
        setFieldErrors(itemError);
        showNotice('warning', 'จำนวนเงินไม่ถูกต้อง', itemError.items);
        focusFirstInvalidSection(itemError);
        return null;
      }

      const itemsDescription = data.items
        .map(i => i.description)
        .filter(d => d.trim() !== '')
        .join(', ');
      
      let finalPurpose = data.purpose;
      if (itemsDescription) {
        finalPurpose = `${finalPurpose ? finalPurpose + ' : ' : ''}${itemsDescription}`;
      }
      
      if (!finalPurpose.trim()) finalPurpose = "ค่าใช้จ่ายทั่วไป";

      const casePayload: any = {
        category_id: selectedCategoryId,
        requested_amount: totalAmount,
        purpose: finalPurpose,
        department_id: data.department || null,
        cost_center_id: null,
        funding_type: 'OPERATING',
      };

      if (transactionType === 'REVENUE') {
        casePayload.deposit_account_id = selectedBankAccountId;
      }

      console.log("Creating Case with:", casePayload);

      const newCase = await createCase(casePayload);
      
      const psFileToUpload = data.type === 'pv' ? selectedPsFile : null;

      // Upload only the requester-provided PS attachment for PV.
      // Do not upload the generated PV PDF as AttachmentType.PS.
      if (psFileToUpload) {
        try {
          console.log(`Uploading PS file for Case ID: ${newCase.id}`);
          await uploadDocumentFile(newCase.id, psFileToUpload, 'PS');
        } catch (uploadError) {
          console.error('PS File upload failed:', uploadError);
          setFieldErrors({ psFile: "ไม่สามารถอัปโหลดไฟล์ ปส ได้ จึงยังไม่ส่งเอกสารเข้าอนุมัติ" });
          showNotice('error', 'อัปโหลดใบ ปส ไม่สำเร็จ', 'กรุณาลองใหม่อีกครั้งก่อนส่งเอกสารเข้าอนุมัติ');
          focusFirstInvalidSection({ psFile: "upload" });
          return null;
        }
      }

      const submitResult = await submitCase(newCase.id);

      const displayDocNo = submitResult.doc_no || newCase.case_no;
      const now = new Date().toLocaleString('th-TH');
      setData(prev => ({ ...prev, docNo: displayDocNo, timestamp: now }));
      localStorage.removeItem(FORM_STORAGE_KEY); // Clear after success

      if (data.type === 'pv') {
        setSelectedPsFile(null);
      }

      setSuccessSummary({
        title: 'บันทึกเอกสารสำเร็จ',
        docNo: displayDocNo,
        status: 'รออนุมัติ / Submitted',
        description: 'ระบบได้บันทึกเอกสารและส่งเข้ากระบวนการอนุมัติแล้ว พร้อมดาวน์โหลด PDF ให้เรียบร้อย',
      });
      return displayDocNo;

    } catch (error: any) {
      console.error('Save failed:', error);
      const msg = error.response?.data?.error?.message || error.message;
      showNotice('error', 'บันทึกเอกสารไม่สำเร็จ', String(msg));
      return null;
    } finally {
      setIsSaving(false);
    }
  };  


  // 3. Logic การค้นหาและดึงข้อมูลเอกสาร (Consolidation)
  const handleSearchDocs = async () => {
    if (!searchQuery.trim()) return;
    setIsSearchingDocs(true);
    try {
      const results = await searchDocumentsByNo(searchQuery);
      setSearchResults(results);
      if (results.length === 0) {
        showNotice('info', 'ไม่พบเอกสาร', 'ไม่พบเอกสารที่ตรงกับเลขที่ที่ระบุ');
      }
    } catch (error) {
      console.error("Search failed:", error);
      showNotice('error', 'ค้นหาไม่สำเร็จ', 'เกิดข้อผิดพลาดในการค้นหาเอกสาร');
    } finally {
      setIsSearchingDocs(false);
    }
  };

  const pullDocumentData = (doc: any) => {
    // doc คือ object ที่ได้จาก API search_cases (มี id, case_no, doc_no, etc.)
    
    const normalized = {
      id: doc.id,
      doc_no: doc.doc_no || doc.case_no,
      description: doc.description || doc.purpose || '',
      requested_amount: doc.requested_amount || 0
    };

    // เก็บ ID เข้า state
    setLinkedCaseIds(prev => {
        // ป้องกัน ID ซ้ำ
        if (prev.includes(doc.id)) return prev;
        return [...prev, doc.id];
    });
    setLinkedCases(prev => {
        if (prev.some((c: any) => c.id === normalized.id)) return prev;
        return [...prev, normalized];
    });
    // ตั้งเคสล่าสุดที่ดึงเป็น Main Case โดยอัตโนมัติ
    setMainCaseId(doc.id);

    // ส่วนแสดงผล (เหมือนเดิม)
    const pulledItem = {
      id: Date.now().toString(),
      description: normalized.description, // ใช้ description จาก API
      quantity: '1',
      unit: 'รายการ',
      price: normalized.requested_amount || '0',
      refNo: normalized.doc_no // โชว์เลขที่เอกสารอ้างอิง
    };

    setData(prev => ({
      ...prev,
      // ลบแถวว่างทิ้งแล้วเติมของใหม่
      items: [...prev.items.filter(i => i.description !== ''), pulledItem]
    }));
    clearFieldError('jvLinkedCases');
    clearFieldError('jvMainCase');
    clearFieldError('items');
    
    showNotice('success', 'ดึงข้อมูลเอกสารสำเร็จ', `${normalized.doc_no} ถูกเพิ่มเข้าในรายการแล้ว`);
  };

  const captureCurrentPdf = async () => {
    if (!printRef.current) return;

    await document.fonts.ready;

    const pdf = new jsPDF({
      orientation: 'p',
      unit: 'mm',
      format: 'a4'
    });

    const pdfWidth = 210;
    const pdfHeight = 297;

    // A4 width in pixels at 96 DPI = 794px
    const A4_WIDTH_PX = 794;
    const A4_HEIGHT_PX = 1123;

    const pages = printRef.current.querySelectorAll('.pdf-page');
    const elementsToCapture = pages.length > 0
      ? Array.from(pages) as HTMLElement[]
      : [printRef.current];

    for (let i = 0; i < elementsToCapture.length; i++) {
      const originalPage = elementsToCapture[i];
      const offscreen = document.createElement('div');
      offscreen.style.cssText = `
        position: fixed;
        left: -9999px;
        top: 0;
        width: ${A4_WIDTH_PX}px;
        z-index: -1;
        background: white;
      `;
      document.body.appendChild(offscreen);

      const clone = originalPage.cloneNode(true) as HTMLElement;
      clone.style.width = `${A4_WIDTH_PX}px`;
      clone.style.height = `${A4_HEIGHT_PX}px`;
      clone.style.transform = 'none';
      clone.style.overflow = 'hidden';
      clone.style.fontFamily = "'Sarabun', sans-serif";
      offscreen.appendChild(clone);

      await new Promise(resolve => setTimeout(resolve, 50));

      const canvas = await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
        width: A4_WIDTH_PX,
        height: A4_HEIGHT_PX,
        windowWidth: A4_WIDTH_PX,
        windowHeight: A4_HEIGHT_PX,
      });

      document.body.removeChild(offscreen);

      const imgData = canvas.toDataURL('image/png');

      if (i > 0) pdf.addPage();
      pdf.setPage(i + 1);
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
    }

    return pdf;
  };

  const generatePDF = async (action: 'submit' | 'download') => {
    const now = new Date().toLocaleString('th-TH');
    setData(prev => ({ ...prev, timestamp: now }));

    try {
      if (action === 'submit') {
        const savedDocNo = await handleSaveToBackend();
        if (!savedDocNo) return;

        setData(prev => ({ ...prev, docNo: savedDocNo, timestamp: now }));
        await new Promise(resolve => setTimeout(resolve, 200));

        const submittedPdf = await captureCurrentPdf();
        submittedPdf?.save(`${data.type}-${savedDocNo}.pdf`);
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 200));
      const pdf = await captureCurrentPdf();
      if (!pdf) return;

      const downloadDocNo = data.docNo || 'draft';
      pdf.save(`${data.type}-${downloadDocNo}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      showNotice('error', 'สร้าง PDF ไม่สำเร็จ', 'เกิดข้อผิดพลาดในการสร้าง PDF');
    }
  };

  const inputStyle = "w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all text-sm";
  const labelStyle = "block text-sm font-semibold text-gray-600 mb-2";
  const errorTextStyle = "mt-2 text-xs font-semibold text-red-600";
  const errorInputStyle = "border-red-300 bg-red-50 focus:ring-red-100";
  const noticeStyles: Record<NoticeType, { icon: React.ReactNode; panel: string; iconWrap: string; title: string }> = {
    success: {
      icon: <CheckCircle2 className="h-5 w-5" />,
      panel: 'border-emerald-200 bg-emerald-50 text-emerald-800',
      iconWrap: 'bg-emerald-100 text-emerald-600',
      title: 'text-emerald-900',
    },
    error: {
      icon: <AlertCircle className="h-5 w-5" />,
      panel: 'border-red-200 bg-red-50 text-red-800',
      iconWrap: 'bg-red-100 text-red-600',
      title: 'text-red-900',
    },
    warning: {
      icon: <AlertCircle className="h-5 w-5" />,
      panel: 'border-amber-200 bg-amber-50 text-amber-800',
      iconWrap: 'bg-amber-100 text-amber-600',
      title: 'text-amber-900',
    },
    info: {
      icon: <Info className="h-5 w-5" />,
      panel: 'border-sky-200 bg-sky-50 text-sky-800',
      iconWrap: 'bg-sky-100 text-sky-600',
      title: 'text-sky-900',
    },
  };

  return (
    <div className="h-full bg-gray-50/50 p-6 overflow-y-auto">
      {successSummary && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/35 p-6 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[2rem] border border-emerald-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-600">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-500">Success</p>
                <h3 className="mt-1 text-2xl font-black text-slate-900">{successSummary.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-500">{successSummary.description}</p>
              </div>
              <button
                type="button"
                onClick={() => setSuccessSummary(null)}
                className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">เลขที่อ้างอิง</p>
                <p className="mt-1 text-xl font-black text-slate-900">{successSummary.docNo}</p>
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">สถานะ</p>
                <p className="mt-1 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-700">
                  {successSummary.status}
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setSuccessSummary(null)}
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50"
              >
                ปิด
              </button>
              <button
                type="button"
                onClick={resetFormForNewDocument}
                className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white transition-colors hover:bg-emerald-700"
              >
                สร้างเอกสารใหม่
              </button>
            </div>
          </div>
        </div>
      )}

      {notice && (
        <div className="fixed right-6 top-6 z-50 w-full max-w-md">
          <div className={`rounded-2xl border shadow-xl backdrop-blur-sm ${noticeStyles[notice.type].panel}`}>
            <div className="flex items-start gap-3 p-4">
              <div className={`rounded-xl p-2 ${noticeStyles[notice.type].iconWrap}`}>
                {noticeStyles[notice.type].icon}
              </div>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-black ${noticeStyles[notice.type].title}`}>{notice.title}</p>
                <p className="mt-1 whitespace-pre-line text-sm leading-6">{notice.message}</p>
              </div>
              <button
                type="button"
                onClick={() => setNotice(null)}
                className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-white/60 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-[1600px] mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Form</h1>
          <div className="flex gap-2">
            <button className="p-2 hover:bg-gray-100 rounded-full">
              <Search className="w-5 h-5 text-gray-500" />
            </button>
            <button className="p-2 hover:bg-gray-100 rounded-full">
              <MoreHorizontal className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="flex gap-6 h-auto min-h-[calc(100vh-140px)]">
          {/* Left Side - Input Form */}
          <div className="w-5/12 bg-white rounded-3xl shadow-sm border border-gray-100 p-8 flex flex-col h-full">
            <h2 className="text-xl font-bold text-slate-800 mb-8">กรอกข้อมูลเอกสาร</h2>
            
            <div className="space-y-6 flex-1 overflow-y-auto pr-2 custom-scrollbar">
              
              {/* --- 1. Category Dropdown (เพิ่มใหม่ตาม Requirement) --- */}
              {/* --- 1.ลักษณะเอกสาร (Moved to Top) --- */}
              <div>
                <label className={labelStyle}>ลักษณะเอกสาร</label>
                <div className="relative">
                  <select 
                    className={`${inputStyle} appearance-none cursor-pointer`}
                    value={data.type}
                    onChange={(e) => handleInputChange('type', e.target.value)}
                  >
                    <option value="pv">ใบเบิกเงิน (Payment Voucher - PV)</option>
                    <option value="rv">ใบรับเงิน (Receive Voucher - RV)</option>
                    <option value="jv">ใบสำคัญรายวันทั่วไป (Journal Voucher - JV)</option>
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>
              </div>

              {/* --- 2. หมวดหมู่บัญชี / ประเภทรายได้ --- */}
            {data.type !== "jv" && (
              <div ref={categoryFieldRef}>
                <label className={labelStyle}>
                  {data.type === 'rv' ? 'ประเภทรายได้ (Revenue Type)' : 'หมวดหมู่บัญชี (Category)'} 
                  <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select 
                    className={`${inputStyle} appearance-none cursor-pointer border-blue-200 bg-blue-50 ${fieldErrors.category ? errorInputStyle : ''}`}
                    value={selectedCategoryId}
                    onChange={(e) => {
                      setSelectedCategoryId(e.target.value);
                      clearFieldError('category');
                    }}
                  >
                    <option value="">-- กรุณาเลือก --</option>
                    {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name_th}</option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>
                {fieldErrors.category && <p className={errorTextStyle}>{fieldErrors.category}</p>}
              </div>
            )}
              {/* --- 3. JV Document Consolidation Search (Show only for JV) --- */}
              {data.type === 'jv' && (
                <div
                  ref={jvSectionRef}
                  className={`p-5 rounded-2xl space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 ${fieldErrors.jvLinkedCases || fieldErrors.jvMainCase ? 'border border-red-200 bg-red-50/70' : 'border border-blue-100 bg-blue-50/50'}`}
                >
                  <label className="text-sm font-black text-blue-700 flex items-center gap-2">
                    <Search className="w-4 h-4" />
                    ดึงข้อมูลเอกสารเพื่อรวมใบเดียว (Consolidate)
                  </label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      className={`${inputStyle} bg-white border-blue-200`}
                      placeholder="กรอกเลขที่ ปส... (เช่น ปส.2567/001)"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearchDocs()}
                    />
                    <button 
                      onClick={handleSearchDocs}
                      disabled={isSearchingDocs}
                      className="px-6 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center shrink-0"
                    >
                      {isSearchingDocs ? <Loader2 className="w-4 h-4 animate-spin" /> : 'ค้นหา'}
                    </button>
                  </div>

                  {searchResults.length > 0 && (
                    <div className="space-y-2 mt-4 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                      {searchResults.map((res) => (
                        <div key={res.id || res.case_no || Math.random()} className="flex justify-between items-center p-3 bg-white border border-blue-100 rounded-xl shadow-sm hover:border-blue-300 transition-colors">
                          <div className="overflow-hidden">
                            <p className="text-xs font-black text-slate-800 truncate">{res.doc_no || res.case_no}</p>
                            <p className="text-[10px] text-slate-500 truncate">{res.purpose}</p>
                          </div>
                          <button 
                            onClick={() => pullDocumentData(res)}
                            className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-[10px] font-black hover:bg-blue-200 transition-colors shrink-0 ml-2"
                          >
                            ดึงข้อมูล (Pull)
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {linkedCases.length > 0 && (
                    <div className="space-y-2 mt-4">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-black text-slate-700">รายการที่ดึง</p>
                        <button
                          onClick={clearJvState}
                          className="text-[10px] font-black text-red-600 hover:text-red-700"
                        >
                          ล้างรายการ
                        </button>
                      </div>
                      {linkedCases.map((c: any) => (
                        <div key={c.id} className="flex justify-between items-center p-3 bg-white border border-blue-100 rounded-xl shadow-sm">
                          <div className="overflow-hidden">
                            <p className="text-xs font-black text-slate-800 truncate">{c.doc_no}</p>
                            <p className="text-[10px] text-slate-500 truncate">{c.description}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            {mainCaseId === c.id ? (
                              <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-md text-[10px] font-black">
                                เคสหลัก
                              </span>
                            ) : (
                              <button
                                onClick={() => {
                                  setMainCaseId(c.id);
                                  clearFieldError('jvMainCase');
                                }}
                                className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-md text-[10px] font-black hover:bg-emerald-200"
                              >
                                ตั้งเป็นเคสหลัก
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {(fieldErrors.jvLinkedCases || fieldErrors.jvMainCase) && (
                    <div className="rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-700">
                      {fieldErrors.jvLinkedCases || fieldErrors.jvMainCase}
                    </div>
                  )}
                </div>
              )}

              {/* Date Selection Block (เหมือนเดิม) */}
              <div className="grid grid-cols-1 gap-4">
                <div className="col-span-1">
                  <label className={labelStyle}>วันที่</label>
                  <div className="flex gap-2">
                     <div className="relative w-1/4">
                       <select
                        className={`${inputStyle} appearance-none cursor-pointer ${!data.date ? 'text-gray-400' : ''}`}
                        value={data.date}
                        onChange={(e) => handleInputChange('date', e.target.value)}
                       >
                         <option value="" disabled>วันที่</option>
                         {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                           <option key={d} value={d.toString().padStart(2, '0')} className="text-gray-900">{d}</option>
                         ))}
                       </select>
                     </div>
                     <div className="relative w-1/2">
                       <select
                        className={`${inputStyle} appearance-none cursor-pointer ${!data.month ? 'text-gray-400' : ''}`}
                        value={data.month}
                        onChange={(e) => handleInputChange('month', e.target.value)}
                       >
                         <option value="" disabled>เดือน</option>
                         {[
                           'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
                           'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
                         ].map(m => (
                           <option key={m} value={m} className="text-gray-900">{m}</option>
                         ))}
                       </select>
                     </div>
                     <div className="relative w-1/4">
                       <select
                        className={`${inputStyle} appearance-none cursor-pointer ${!data.year ? 'text-gray-400' : ''}`}
                        value={data.year}
                        onChange={(e) => handleInputChange('year', e.target.value)}
                       >
                         <option value="" disabled>ปี</option>
                         {Array.from({ length: 11 }, (_, i) => 2565 + i).map(y => (
                           <option key={y} value={y.toString()} className="text-gray-900">{y}</option>
                         ))}
                       </select>
                     </div>
                  </div>
                </div>
              </div>



               {/* Bank Account Dropdown for RV */}
               {data.type === 'rv' && (
                  <div ref={bankAccountFieldRef}>
                    <label className={labelStyle}>เลขที่บัญชีธนาคาร/เงินสด</label>
                    <div className="relative">
                      <select 
                        className={`${inputStyle} appearance-none cursor-pointer ${fieldErrors.bankAccount ? errorInputStyle : ''}`}
                        value={selectedBankAccountId} // ใช้ เป็น ID เป็น Value 
                        onChange={(e) => {
                          const id = e.target.value;
                          setSelectedBankAccountId(id);
                          clearFieldError('bankAccount');
                          // หา Object เพื่อเอาชื่อมาโชว์ใน Preview Template
                          const account = bankAccounts.find(b => b.id === id);
                          if (account) {
                            // Update display text for Template
                            const displayText = `${account.bank_name} - ${account.account_number}`;
                            handleInputChange('bankAccount', displayText); 
                          }
                        }}
                      >
                        <option value="">-- เลือกเลขที่บัญชี --</option>
                        {bankAccounts.map(b => (
                          <option key={b.id} value={b.id}>
                            {b.bank_name} - {b.account_number}
                          </option>
                        ))}
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    </div>
                    {fieldErrors.bankAccount && <p className={errorTextStyle}>{fieldErrors.bankAccount}</p>}
                  </div>
               )}

               {/* PS No for PV */}
               {data.type === 'pv' && (
                 <div className="space-y-4">
                   <div>
                     <label htmlFor="psNo" className={labelStyle}>เลขที่ ปส (ปส 03011007/...)</label>
                     <div className="flex items-center gap-2">
                       <span className="text-sm font-bold text-gray-500 shrink-0">ปส 03011007/</span>
                       <input 
                        id="psNo"
                        type="text" 
                        className={inputStyle}
                        value={data.psNo}
                        onChange={(e) => handleInputChange('psNo', e.target.value)}
                        placeholder="กรอกเลขที่ต่อท้าย"
                      />
                     </div>
                   </div>

                   {/* PS Upload Button */}
                   <div ref={psUploadSectionRef}>
                     <label className={labelStyle}>อัปโหลดใบ ปส</label>
                     <div className="flex flex-col gap-3">
                       <input 
                         type="file" 
                         className="hidden" 
                         ref={psUploadRef}
                         onChange={(e) => {
                           const file = e.target.files?.[0] || null;
                           if (file && (file.type !== 'application/pdf' || !file.name.toLowerCase().endsWith('.pdf'))) {
                             setSelectedPsFile(null);
                             setFieldErrors(prev => ({ ...prev, psFile: 'กรุณาอัปโหลดใบ ปส เป็นไฟล์ PDF เท่านั้น' }));
                             e.target.value = '';
                             return;
                           }
                           setSelectedPsFile(file);
                           clearFieldError('psFile');
                         }}
                         accept="application/pdf,.pdf"
                       />
                       <button 
                          onClick={() => psUploadRef.current?.click()}
                         className={`flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed text-sm font-medium transition-all ${fieldErrors.psFile ? 'border-red-300 bg-red-50 text-red-600 hover:bg-red-100' : 'border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
                       >
                         <Upload size={18} />
                         {selectedPsFile ? selectedPsFile.name : 'เลือกไฟล์ ปส (PDF)'}
                       </button>

                       {/* Preview Area - Handles all orientations and sizes */}
                       {psPreviewUrl && (
                         <div className="relative mt-2 p-2 border border-gray-100 rounded-2xl bg-gray-50 flex flex-col items-center justify-center animate-in fade-in duration-300">
                           {selectedPsFile?.type.startsWith('image/') ? (
                             <div className="w-full h-48 overflow-hidden rounded-xl flex items-center justify-center bg-white border border-gray-100">
                               <img 
                                 src={psPreviewUrl} 
                                 alt="PS Preview" 
                                 className="max-w-full max-h-full object-contain" // Ensures landscape/portrait fits well
                               />
                             </div>
                           ) : selectedPsFile?.type === 'application/pdf' ? (
                             <div className="flex flex-col items-center p-6 gap-2 bg-white w-full rounded-xl border border-gray-100">
                               <div className="p-4 bg-red-50 text-red-500 rounded-2xl">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                               </div>
                               <span className="text-xs font-bold text-gray-500">ไฟล์ PDF</span>
                               <span className="text-[10px] text-gray-400">{selectedPsFile.name}</span>
                             </div>
                           ) : (
                             <div className="p-4 text-xs text-gray-400 italic">ตัวอย่างไฟล์ยังไม่รองรับการแสดงผล</div>
                           )}
                           
                           {/* Remove Button */}
                           <button 
                             onClick={(e) => {
                               e.preventDefault();
                               e.stopPropagation();
                               setSelectedPsFile(null);
                               clearFieldError('psFile');
                             }}
                             className="absolute top-4 right-4 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-md transition-colors"
                             title="ลบไฟล์"
                           >
                             <Trash2 size={12} />
                           </button>
                         </div>
                       )}
                     </div>
                     {fieldErrors.psFile && <p className={errorTextStyle}>{fieldErrors.psFile}</p>}
                   </div>
                 </div>
               )}

              <div>
                <label htmlFor="name" className={labelStyle}>ข้าพเจ้า (ผู้ทำรายการ/ผู้รับเงิน)</label>
                <input 
                  id="name"
                  type="text" 
                  className={inputStyle}
                  value={data.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="กรอกชื่อ-นามสกุล"
                />
              </div>

               <div>
                <label htmlFor="position" className={labelStyle}>ตำแหน่ง</label>
                <input 
                  id="position"
                  type="text" 
                  className={inputStyle}
                  value={data.position}
                  onChange={(e) => handleInputChange('position', e.target.value)}
                  placeholder="กรอกตำแหน่ง"
                />
              </div>



              <div ref={itemsSectionRef}>
                <div className="flex justify-between items-center mb-4">
                   <label className={labelStyle}>รายการที่เบิก / ทำ</label>
                   <button onClick={addItem} className="text-blue-500 text-sm font-medium flex items-center hover:text-blue-600">
                     <Plus size={16} className="mr-1" /> เพิ่มรายการ
                   </button>
                </div>
                {fieldErrors.items && <p className={`${errorTextStyle} mb-3`}>{fieldErrors.items}</p>}
                
                <div className="space-y-3">
                  {data.items.map((item, index) => (
                    <div key={item.id} className={`p-4 rounded-xl group relative border transition-colors ${fieldErrors.items ? 'border-red-200 bg-red-50/60' : 'border-gray-100 bg-gray-50 hover:border-blue-100'}`}>
                       <div className="flex gap-3 items-start">
                          <div className="flex-1">
                             <div className="flex gap-3 mb-4">
                                <span className="text-xs text-gray-400 mt-3">{index + 1}.</span>
                                <div className="flex-1">
                                  <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase tracking-wider">รายการสินค้า / รายละเอียด</label>
                                  <input 
                                    type="text" 
                                    placeholder="กรอกชื่อรายการ"
                                    className={`${inputStyle} bg-white`}
                                    value={item.description}
                                    onChange={(e) => handleItemChange(item.id, 'description', e.target.value)}
                                  />
                                </div>
                             </div>
                             <div className="flex gap-3 pl-6">
                                <div className="w-24">
                                   <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase tracking-wider">จำนวน</label>
                                   <input 
                                    type="text" 
                                    className={`${inputStyle} bg-white`}
                                    value={item.quantity}
                                    onChange={(e) => handleItemChange(item.id, 'quantity', e.target.value)}
                                  />
                                </div>
                                <div className="w-24">
                                   <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase tracking-wider">ราคา (บาท)</label>
                                   <input 
                                    type="text" 
                                    className={`${inputStyle} bg-white`}
                                    value={item.price}
                                    onChange={(e) => handleItemChange(item.id, 'price', e.target.value)}
                                  />
                                </div>
                                 <div className="flex-1">
                                   <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase tracking-wider">
                                     {data.type === 'pv' ? 'หน่วยสินค้า' : 'เลขที่อ้างอิง'}
                                   </label>
                                   <input 
                                    type="text" 
                                    className={`${inputStyle} bg-white`}
                                    value={data.type === 'pv' ? item.unit : item.refNo}
                                    onChange={(e) => handleItemChange(item.id, data.type === 'pv' ? 'unit' : 'refNo', e.target.value)}
                                  />
                                </div>
                             </div>
                          </div>
                          <button 
                            onClick={() => removeItem(item.id)}
                            className="p-2 text-red-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors mt-6"
                          >
                            <Trash2 size={18} />
                          </button>
                       </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right Side - Preview */}
          <div className="w-7/12 flex flex-col gap-6">
              <div className="flex-1 bg-gray-100 rounded-3xl overflow-hidden shadow-inner p-8 flex items-start justify-center overflow-y-auto">
                <div className="transform scale-90 origin-top shadow-xl bg-white" style={{ 
                  WebkitFontSmoothing: 'antialiased',
                  MozOsxFontSmoothing: 'grayscale',
                  backfaceVisibility: 'hidden'
                }}>
                  {data.type === 'pv' && <PaymentVoucherTemplate ref={printRef} data={data} />}
                  {data.type === 'rv' && <ReceiveVoucherTemplate ref={printRef} data={data} />}
                  {data.type === 'jv' && <JournalVoucherTemplate ref={printRef} data={data} />}
                </div>
              </div>

             <div className="flex justify-between gap-4">
                <button 
                  onClick={() => generatePDF('submit')}
                  disabled={isSaving}
                  className="flex-1 bg-white border border-gray-200 text-gray-700 py-4 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50"
                >
                  {isSaving ? (
                    <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                  ) : (
                    <Save size={20} />
                  )}
                  บันทึกเอกสาร & ส่งอนุมัติ
                </button>
                <button 
                  onClick={() => generatePDF('download')}
                  disabled={isSaving}
                  className="flex-1 bg-[#0099FF] text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-blue-600 transition-colors shadow-sm shadow-blue-200 disabled:opacity-50"
                >
                  <Download size={20} />
                  ดาวน์โหลด PDF
                </button>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};
