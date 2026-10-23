import React, { useState, useMemo, useEffect } from 'react';
import { Berth, Customer, Movement } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { exportTemplateToExcel, downloadEmptyTemplate } from '../lib/excelUtils';
import {
  Search,
  Filter,
  Download,
  Printer,
  Plus,
  Trash2,
  Edit2,
  FileSpreadsheet,
  CheckCircle,
  Clock,
  DollarSign,
  Truck,
  RotateCcw,
  FileText,
  FileDown,
  Link2,
  Receipt,
  User,
  Percent,
  ArrowLeft,
  ArrowRight,
  Layers,
  Sparkles,
  CalendarDays,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { DriverInvoiceModal } from '../components/DriverInvoiceModal';
import { CashierLinkingModal } from '../components/CashierLinkingModal';
import { CashierReportUploadModal } from '../components/CashierReportUploadModal';
import { OfficialSheetPrintModal } from '../components/OfficialSheetPrintModal';
import { SystemSettings } from '../types';

interface MovementsPageProps {
  movements: Movement[];
  customers: Customer[];
  berths: Berth[];
  settings?: SystemSettings;
  onOpenAddModal: () => void;
  onOpenUploadModal: () => void;
  onEditMovement: (movement: Movement) => void;
  onDeleteMovement: (id: string) => void;
  onClearAllMovements?: () => void;
  onTogglePaid: (movement: Movement) => void;
  onOpenPaymentModal?: (customerId?: string) => void;
  onUndoLatestDeletion?: () => Promise<void>;
  canUndoLatestDeletion?: boolean;
  onBatchUpdateMovements?: (updatedMovements: Movement[]) => void;
}

const getMovementBatch = (movement: Movement) => {
  if (movement.import_batch_id) {
    return {
      id: movement.import_batch_id,
      name: movement.import_batch_name || 'دفعة شيت',
      at: movement.import_batch_at || movement.created_at,
    };
  }
  const source = movement.notes?.match(/مستورد(?: ومصفى)? من (?:شيت|ملف):\s*(.+)$/)?.[1]?.trim();
  if (source) {
    return {
      id: `legacy-${movement.created_at?.slice(0, 10) || movement.movement_date || 'unknown'}-${source}`,
      name: `${source} — شيت سابق`,
      at: movement.created_at,
    };
  }
  return { id: 'legacy-unassigned', name: 'حركات سابقة بدون شيت محدد', at: movement.created_at };
};

export const MovementsPage: React.FC<MovementsPageProps> = ({
  movements,
  customers,
  berths,
  settings,
  onOpenAddModal,
  onOpenUploadModal,
  onEditMovement,
  onDeleteMovement,
  onClearAllMovements,
  onTogglePaid,
  onOpenPaymentModal,
  onUndoLatestDeletion,
  canUndoLatestDeletion = false,
  onBatchUpdateMovements,
}) => {
  const { canViewFinancials, isAdmin, canManagePayments } = useAuth();

  // Modals state
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isOfficialSheetModalOpen, setIsOfficialSheetModalOpen] = useState(false);
  const [isCashierModalOpen, setIsCashierModalOpen] = useState(false);
  const [isCashierReportModalOpen, setIsCashierReportModalOpen] = useState(false);
  const [linkingMovement, setLinkingMovement] = useState<Movement | null>(null);

  // Workflow Stages: 1 = Aggregation & Official PDF | 2 = Cashier Linking | 3 = Client Accounts & Discounts | all = Master Table
  const [activeStage, setActiveStage] = useState<'daily' | 'stage1_manifest' | 'stage2_cashier' | 'stage3_clients' | 'all'>('daily');

  // Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [selectedBerth, setSelectedBerth] = useState('');
  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [entryDate, setEntryDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [entryTimeFrom, setEntryTimeFrom] = useState('');
  const [entryTimeTo, setEntryTimeTo] = useState('');
  const [expandedMovementIds, setExpandedMovementIds] = useState<Set<string>>(new Set());
  const [selectedManifestBatch, setSelectedManifestBatch] = useState('latest');
  const [manifestPrintScope, setManifestPrintScope] = useState<'selected' | 'all'>('selected');

  const importBatches = useMemo(() => {
    const batches = new Map<string, { id: string; name: string; at: string; count: number }>();
    movements.forEach((movement) => {
      const batch = getMovementBatch(movement);
      const existing = batches.get(batch.id);
      if (existing) {
        existing.count += 1;
        if (new Date(batch.at).getTime() > new Date(existing.at).getTime()) existing.at = batch.at;
      } else {
        batches.set(batch.id, { ...batch, count: 1 });
      }
    });
    return Array.from(batches.values()).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [movements]);
  const latestBatchId = (importBatches.find((batch) => batch.id !== 'legacy-unassigned') || importBatches[0])?.id || '';
  useEffect(() => {
    if (latestBatchId) setSelectedManifestBatch('latest');
  }, [latestBatchId]);
  const openManifestPrint = (scope: 'selected' | 'all') => {
    setManifestPrintScope(scope);
    setIsOfficialSheetModalOpen(true);
  };

  const runUndoLatestDeletion = async () => {
    if (!canUndoLatestDeletion || !onUndoLatestDeletion) return;
    const confirmed = window.confirm('سيتم إرجاع البيانات كما كانت قبل آخر حذف، وقد تُستبدل أي تغييرات أُدخلت بعده. هل تريد التراجع؟');
    if (!confirmed) return;
    try {
      await onUndoLatestDeletion();
      window.alert('تم التراجع عن آخر حذف واستعادة البيانات.');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'تعذر التراجع عن الحذف.');
    }
  };

  useEffect(() => {
    if (activeStage !== 'daily' || !canUndoLatestDeletion) return;
    const handleUndoShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.matches('input, textarea, select, [contenteditable="true"]');
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !isTyping) {
        event.preventDefault();
        void runUndoLatestDeletion();
      }
    };
    window.addEventListener('keydown', handleUndoShortcut);
    return () => window.removeEventListener('keydown', handleUndoShortcut);
  }, [activeStage, canUndoLatestDeletion, onUndoLatestDeletion]);

  const getEntryDateTime = (movement: Movement) => {
    const date = new Date(movement.created_at);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const dashboardMovements = useMemo(() => movements.filter((m) => {
    const created = getEntryDateTime(m);
    if (entryDate && (!created || created.toLocaleDateString('en-CA') !== entryDate)) return false;
    if (entryTimeFrom && (!created || created.toTimeString().slice(0, 5) < entryTimeFrom)) return false;
    if (entryTimeTo && (!created || created.toTimeString().slice(0, 5) > entryTimeTo)) return false;
    if (searchTerm) {
      const term = searchTerm.toLocaleLowerCase();
      const fields = [m.truck_no, m.trailer_no, m.driver_name, m.container_no, m.declaration_no, m.customer_name, m.cashier_receipt_no];
      if (!fields.some((value) => value?.toLocaleLowerCase().includes(term))) return false;
    }
    if (selectedCustomer && m.customer_id !== selectedCustomer && m.customer_name !== selectedCustomer) return false;
    if (canViewFinancials && selectedPaymentStatus && m.payment_status !== selectedPaymentStatus) return false;
    return true;
  }), [movements, entryDate, entryTimeFrom, entryTimeTo, searchTerm, selectedCustomer, selectedPaymentStatus, canViewFinancials]);

  const dashboardTotals = useMemo(() => dashboardMovements.reduce((totals, m) => {
    totals.due += Number(m.total_amount) || 0;
    totals.paid += Number(m.paid_amount) || 0;
    totals.remaining += Number(m.remaining_amount) || 0;
    if (m.payment_status === 'paid') totals.paidCount += 1;
    else if (m.payment_status === 'partial') totals.partialCount += 1;
    else totals.unpaidCount += 1;
    return totals;
  }, { due: 0, paid: 0, remaining: 0, paidCount: 0, partialCount: 0, unpaidCount: 0 }), [dashboardMovements]);

  // Filtered movements
  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      // Search text in truck, trailer, driver, container, declaration
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchSearch =
          m.truck_no?.toLowerCase().includes(term) ||
          m.trailer_no?.toLowerCase().includes(term) ||
          m.driver_name?.toLowerCase().includes(term) ||
          m.container_no?.toLowerCase().includes(term) ||
          m.declaration_no?.toLowerCase().includes(term) ||
          m.customer_name?.toLowerCase().includes(term);
        if (!matchSearch) return false;
      }

      // Customer filter
      if (selectedCustomer && m.customer_id !== selectedCustomer && m.customer_name !== selectedCustomer) {
        return false;
      }

      // Berth filter
      if (selectedBerth && m.berth_id !== selectedBerth && m.berth_name !== selectedBerth) {
        return false;
      }

      // Payment status filter
      if (selectedPaymentStatus && m.payment_status !== selectedPaymentStatus) {
        return false;
      }

      // Date range filter
      if (startDate && m.movement_date < startDate) return false;
      if (endDate && m.movement_date > endDate) return false;

      return true;
    });
  }, [
    movements,
    searchTerm,
    selectedCustomer,
    selectedBerth,
    selectedPaymentStatus,
    startDate,
    endDate,
  ]);

  const manifestMovements = useMemo(() => {
    if (selectedManifestBatch === 'all') return filteredMovements;
    const targetId = selectedManifestBatch === 'latest' ? latestBatchId : selectedManifestBatch;
    return filteredMovements.filter((movement) => getMovementBatch(movement).id === targetId);
  }, [filteredMovements, selectedManifestBatch, latestBatchId]);

  // Group movements by Customer / Driver for Stage 3 (Multi-truck consolidation)
  const customerGroups = useMemo(() => {
    const map = new Map<string, Movement[]>();
    filteredMovements.forEach((m) => {
      const key = (m.driver_name || m.customer_name || 'عميل عام').trim();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    });

    return Array.from(map.entries()).map(([name, moves]) => {
      const cashierTotal = moves.reduce((s, m) => s + (Number(m.cashier_invoice) || 0), 0);
      const systemCommTotal = moves.reduce((s, m) => s + (Number(m.system_commission) || 0), 0);
      const nafezCommTotal = moves.reduce((s, m) => s + (Number(m.nafez_commission) || 0), 0);
      const discountTotal = moves.reduce((s, m) => s + (Number(m.discount) || 0), 0);
      const totalAmount = moves.reduce((s, m) => s + (Number(m.total_amount) || 0), 0);
      const paidTotal = moves.reduce((s, m) => s + (Number(m.paid_amount) || 0), 0);
      const remainingTotal = moves.reduce((s, m) => s + (Number(m.remaining_amount) || 0), 0);
      const truckPlates = Array.from(new Set(moves.map((m) => m.truck_no).filter(Boolean))).join(' ، ');

      return {
        name,
        moves,
        truckCount: moves.length,
        truckPlates,
        cashierTotal,
        systemCommTotal,
        nafezCommTotal,
        discountTotal,
        totalAmount,
        paidTotal,
        remainingTotal,
      };
    });
  }, [filteredMovements]);

  // Discount Handlers
  const handleDiscountChange = (movementId: string, discountVal: number) => {
    if (!onBatchUpdateMovements) return;
    const disc = Math.max(0, discountVal || 0);
    const updated = movements.map((m) => {
      if (m.id === movementId) {
        const cashier = Number(m.cashier_invoice) || 0;
        const sysComm = Number(m.system_commission) || 0;
        const nafez = Number(m.nafez_commission) || 0;
        const total = Math.max(0, cashier + sysComm + nafez - disc);
        const paid = Number(m.paid_amount) || 0;
        const remaining = Math.max(0, total - paid);
        return {
          ...m,
          discount: disc,
          total_amount: total,
          remaining_amount: remaining,
          payment_status: (paid >= total && total > 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid') as any,
        };
      }
      return m;
    });
    onBatchUpdateMovements(updated);
  };

  const handleApplyOverallDiscount = (customerName: string) => {
    if (!onBatchUpdateMovements) return;
    const custMoves = movements.filter((m) => (m.driver_name || m.customer_name) === customerName);
    if (custMoves.length === 0) return;

    const inputVal = prompt(`أدخل إجمالي مبلغ الخصم المراد تطبيقه على العميل [${customerName}] (بالجنيه):`);
    if (inputVal === null) return;
    const overallDiscount = Number(inputVal);
    if (isNaN(overallDiscount) || overallDiscount < 0) {
      alert('يرجى إدخال مبلغ خصم صحيح');
      return;
    }

    const perMoveDiscount = Math.round((overallDiscount / custMoves.length) * 100) / 100;
    const updated = movements.map((m) => {
      if ((m.driver_name || m.customer_name) === customerName) {
        const cashier = Number(m.cashier_invoice) || 0;
        const sysComm = Number(m.system_commission) || 0;
        const nafez = Number(m.nafez_commission) || 0;
        const total = Math.max(0, cashier + sysComm + nafez - perMoveDiscount);
        const paid = Number(m.paid_amount) || 0;
        const remaining = Math.max(0, total - paid);
        return {
          ...m,
          discount: perMoveDiscount,
          total_amount: total,
          remaining_amount: remaining,
          payment_status: (paid >= total && total > 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid') as any,
        };
      }
      return m;
    });
    onBatchUpdateMovements(updated);
    alert(`✓ تم بنجاح تطبيق خصم إجمالي ${overallDiscount} ج.م على ${custMoves.length} شحنة للعميل!`);
  };

  const handleDownloadCustomerPdf = async (group: any) => {
    const { exportCustomerStatementPdf } = await import('../lib/pdfExport');
    await exportCustomerStatementPdf(group.name, group.moves, group);
  };

  // Subtotals (المجموع الفرعي)
  const subtotals = useMemo(() => {
    let cashierTotal = 0;
    let systemCommTotal = 0;
    let nafezCommTotal = 0;
    let discountTotal = 0;
    let grandTotal = 0;
    let paidTotal = 0;
    let remainingTotal = 0;

    for (const m of filteredMovements) {
      cashierTotal += Number(m.cashier_invoice) || 0;
      systemCommTotal += Number(m.system_commission) || 0;
      nafezCommTotal += Number(m.nafez_commission) || 0;
      discountTotal += Number(m.discount) || 0;
      grandTotal += Number(m.total_amount) || 0;
      paidTotal += Number(m.paid_amount) || 0;
      remainingTotal += Number(m.remaining_amount) || 0;
    }

    return {
      count: filteredMovements.length,
      cashierTotal,
      systemCommTotal,
      nafezCommTotal,
      discountTotal,
      grandTotal,
      paidTotal,
      remainingTotal,
    };
  }, [filteredMovements]);

  const handleExportExcel = () => {
    exportTemplateToExcel(filteredMovements, `كشف_حركات_الميناء_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportPdf = async () => {
    const selectedBerthObj = berths.find((b) => b.id === selectedBerth || b.name === selectedBerth);
    const { exportMovementsToOfficialPdf } = await import('../lib/pdfExport');
    await exportMovementsToOfficialPdf(
      filteredMovements,
      'كشف حركات الشاحنات والحاويات (الاسطمبة الرسمية)',
      selectedBerthObj?.name
    );
  };

  const handlePrint = () => {
    window.print();
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedCustomer('');
    setSelectedBerth('');
    setSelectedPaymentStatus('');
    setStartDate('');
    setEndDate('');
  };

  // Stage tab config
  const stageTabs = [
    {
      key: 'daily' as const,
      icon: '📊',
      label: 'لوحة اليوم',
      sublabel: 'ملخص الحركات والتحصيل والبحث بالوقت',
      color: 'blue',
      bg: 'bg-blue-600',
      hoverBg: 'hover:bg-blue-700',
      activeBorder: 'border-blue-500',
      activeText: 'text-blue-700',
      activeBg: 'bg-blue-50',
    },
    {
      key: 'stage1_manifest' as const,
      icon: '1️⃣',
      label: 'تجميع الشيتات وكشف الميناء',
      sublabel: 'رفع الشيتات ← طباعة كشف PDF للمكتب',
      color: 'rose',
      bg: 'bg-rose-600',
      hoverBg: 'hover:bg-rose-700',
      activeBorder: 'border-rose-500',
      activeText: 'text-rose-700',
      activeBg: 'bg-rose-50',
    },
    {
      key: 'stage2_cashier' as const,
      icon: '2️⃣',
      label: 'تسجيل فواتير الكاشير',
      sublabel: 'بعد المحاسبة ← رفع فاتورة الكاشير أو ربط يدوي',
      color: 'emerald',
      bg: 'bg-emerald-600',
      hoverBg: 'hover:bg-emerald-700',
      activeBorder: 'border-emerald-500',
      activeText: 'text-emerald-700',
      activeBg: 'bg-emerald-50',
    },
    ...(canViewFinancials
      ? [
          {
            key: 'stage3_clients' as const,
            icon: '3️⃣',
            label: 'حسابات ومطالبات العملاء',
            sublabel: 'تجميع الشحنات لكل عميل ← خصم ← PDF العميل',
            color: 'amber',
            bg: 'bg-amber-600',
            hoverBg: 'hover:bg-amber-700',
            activeBorder: 'border-amber-500',
            activeText: 'text-amber-700',
            activeBg: 'bg-amber-50',
          },
        ]
      : []),
    {
      key: 'all' as const,
      icon: '📋',
      label: 'جدول السيد (الكل)',
      sublabel: 'جميع البيانات والأعمدة المالية',
      color: 'slate',
      bg: 'bg-slate-700',
      hoverBg: 'hover:bg-slate-800',
      activeBorder: 'border-slate-500',
      activeText: 'text-slate-700',
      activeBg: 'bg-slate-50',
    },
  ];

  return (
    <div className="space-y-6">
      {/* ===== STAGE SELECTOR CARDS ===== */}
      <div className="no-print">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {stageTabs.map((tab) => {
            const isActive = activeStage === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveStage(tab.key)}
                className={`text-right p-4 rounded-2xl border-2 transition-all shadow-sm hover:shadow-md ${
                  isActive
                    ? `${tab.activeBorder} ${tab.activeBg} shadow-md`
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl leading-none mt-0.5">{tab.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-black leading-snug ${isActive ? tab.activeText : 'text-slate-800'}`}>
                      {tab.label}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{tab.sublabel}</p>
                    {isActive && (
                      <span className={`inline-block mt-2 text-[10px] font-black px-2 py-0.5 rounded-full text-white ${tab.bg}`}>
                        الوضع النشط
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {activeStage === 'daily' && (
        <section className="space-y-4">
          <div className="rounded-2xl bg-gradient-to-l from-slate-950 via-blue-950 to-blue-800 p-5 text-white shadow-lg">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div><p className="text-xs text-blue-200">متابعة التشغيل والتحصيل</p><h2 className="mt-1 text-xl font-black">لوحة الحركات اليومية</h2><p className="mt-1 text-xs text-blue-100">الحركات معروضة حسب وقت إدخالها للنظام، ويمكنك البحث بالتاريخ والساعة.</p></div>
              <div className="flex flex-wrap gap-2">
                {canUndoLatestDeletion && <button onClick={()=>void runUndoLatestDeletion()} className="inline-flex items-center gap-2 rounded-xl bg-amber-300 px-4 py-2.5 text-sm font-bold text-slate-950"><RotateCcw className="h-4 w-4"/>تراجع عن آخر حذف (Ctrl+Z)</button>}
                <button onClick={onOpenAddModal} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-blue-900"><Plus className="h-4 w-4"/>تسجيل حركة</button>
                <button onClick={onOpenUploadModal} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white"><FileSpreadsheet className="h-4 w-4"/>رفع شيت</button>
                {canViewFinancials && <button onClick={() => setActiveStage('stage2_cashier')} className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-slate-950"><Receipt className="h-4 w-4"/>فواتير الكاشير</button>}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-xl border border-blue-200 bg-white p-4"><span className="text-xs text-slate-500">عدد الحركات</span><strong className="mt-1 block text-2xl text-blue-800">{dashboardMovements.length}</strong></div>
            {canViewFinancials && <>
              <div className="rounded-xl border border-slate-200 bg-white p-4"><span className="text-xs text-slate-500">إجمالي المستحق</span><strong className="mt-1 block text-xl text-slate-900">{dashboardTotals.due.toLocaleString()} ج.م</strong></div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><span className="text-xs text-emerald-700">المحصل</span><strong className="mt-1 block text-xl text-emerald-800">{dashboardTotals.paid.toLocaleString()} ج.م</strong></div>
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4"><span className="text-xs text-rose-700">المتبقي</span><strong className="mt-1 block text-xl text-rose-800">{dashboardTotals.remaining.toLocaleString()} ج.م</strong></div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><span className="text-xs text-amber-700">مدفوع جزئي</span><strong className="mt-1 block text-xl text-amber-800">{dashboardTotals.partialCount} حركة</strong></div>
              <div className="rounded-xl border border-rose-200 bg-white p-4"><span className="text-xs text-rose-700">لم يدفع</span><strong className="mt-1 block text-xl text-rose-800">{dashboardTotals.unpaidCount} حركة</strong></div>
            </>}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 font-bold text-slate-800"><Filter className="h-4 w-4 text-blue-600"/>بحث وتصفية</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6">
              <div className="relative lg:col-span-2"><Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400"/><input value={searchTerm} onChange={(e)=>setSearchTerm(e.target.value)} placeholder="اسم العميل، السائق، الشاحنة، الحاوية..." className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2 pe-9 ps-3 text-sm"/></div>
              <label className="relative"><CalendarDays className="absolute right-3 top-2.5 h-4 w-4 text-slate-400"/><input type="date" value={entryDate} onChange={(e)=>setEntryDate(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2 pe-9 ps-2 text-sm" title="تاريخ الإدخال"/></label>
              <input type="time" aria-label="من الساعة" value={entryTimeFrom} onChange={(e)=>setEntryTimeFrom(e.target.value)} className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm"/>
              <input type="time" aria-label="إلى الساعة" value={entryTimeTo} onChange={(e)=>setEntryTimeTo(e.target.value)} className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm"/>
              <select value={selectedCustomer} onChange={(e)=>setSelectedCustomer(e.target.value)} className="rounded-lg border border-slate-300 bg-slate-50 px-2 py-2 text-sm"><option value="">كل العملاء</option>{customers.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
              {canViewFinancials && <select value={selectedPaymentStatus} onChange={(e)=>setSelectedPaymentStatus(e.target.value)} className="rounded-lg border border-slate-300 bg-slate-50 px-2 py-2 text-sm"><option value="">كل حالات الدفع</option><option value="unpaid">لم يدفع</option><option value="partial">دفع جزئي</option><option value="paid">مدفوع</option></select>}
              <button onClick={()=>{setEntryDate('');setEntryTimeFrom('');setEntryTimeTo('');setSearchTerm('');setSelectedCustomer('');setSelectedPaymentStatus('');}} className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200">عرض كل الأيام ومسح البحث</button>
            </div>
            <p className="mt-2 text-xs text-slate-500">توقيت الإدخال: التوقيت المحلي للجهاز. تاريخ الحركة التشغيلي يظهر في تفاصيل كل حركة.</p>
          </div>

          <div className="space-y-3">
            {dashboardMovements.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">لا توجد حركات مطابقة للفلاتر المحددة.</div> : dashboardMovements.slice().sort((a,b)=>(getEntryDateTime(b)?.getTime()||0)-(getEntryDateTime(a)?.getTime()||0)).map((m)=>{
              const expanded = expandedMovementIds.has(m.id);
              const created = getEntryDateTime(m);
              const statusLabel = m.payment_status === 'paid' ? 'مدفوع' : m.payment_status === 'partial' ? 'مدفوع جزئيًا' : 'لم يدفع';
              return <article key={m.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex min-w-0 items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 font-black text-blue-800">{m.seq}</span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-slate-900">{m.driver_name || m.customer_name || 'عميل عام'}</h3><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${m.payment_status==='paid'?'bg-emerald-100 text-emerald-700':m.payment_status==='partial'?'bg-amber-100 text-amber-700':'bg-rose-100 text-rose-700'}`}>{canViewFinancials?statusLabel:'حركة مسجلة'}</span></div><p className="mt-1 truncate text-sm text-slate-600">شاحنة: {m.truck_no || '—'} <span className="px-1 text-slate-300">|</span> مقطورة: {m.trailer_no || '—'} <span className="px-1 text-slate-300">|</span> حاوية: {m.container_no || '—'}</p><p className="mt-1 text-xs text-slate-500">وقت الإدخال: {created ? created.toLocaleString('ar-EG') : 'غير مسجل'}{m.movement_date ? ` — تاريخ الحركة: ${m.movement_date}` : ''}</p></div></div>
                  <div className="flex flex-wrap items-center gap-2 md:justify-end">{canViewFinancials && <div className="me-2 text-sm"><span className="text-slate-500">المتبقي </span><strong className={Number(m.remaining_amount)>0?'text-rose-700':'text-emerald-700'}>{Number(m.remaining_amount||0).toLocaleString()} ج.م</strong></div>}{canManagePayments && Number(m.remaining_amount)>0 && <button onClick={()=>onOpenPaymentModal?.(m.customer_id)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">تسجيل تحصيل</button>}<button onClick={()=>onEditMovement(m)} className="rounded-lg border border-blue-200 p-2 text-blue-700" title="تعديل"><Edit2 className="h-4 w-4"/></button><button onClick={()=>setExpandedMovementIds((old)=>{const next=new Set(old);expanded?next.delete(m.id):next.add(m.id);return next;})} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">{expanded?'إخفاء التفاصيل':'تفاصيل الحركة'}{expanded?<ChevronUp className="h-4 w-4"/>:<ChevronDown className="h-4 w-4"/>}</button></div>
                </div>
                {expanded && <div className="grid grid-cols-2 gap-px border-t border-slate-200 bg-slate-200 sm:grid-cols-3 lg:grid-cols-5">{[["العميل",m.customer_name],['السائق',m.driver_name],['رقم الشاحنة',m.truck_no],['رقم المقطورة',m.trailer_no],['رقم الحاوية',m.container_no],['رقم الإقرار',m.declaration_no],['الرصيف',m.berth_name],['مسار الحاوية',m.container_path],['وصف الحاوية',m.container_desc],['تاريخ الحركة',m.movement_date],...(canViewFinancials?[["فاتورة الكاشير",`${Number(m.cashier_invoice||0).toLocaleString()} ج.م`],['إيصال الكاشير',m.cashier_receipt_no],['عمولة المنظومة',`${Number(m.system_commission||0).toLocaleString()} ج.م`],['عمولة نافذ',`${Number(m.nafez_commission||0).toLocaleString()} ج.م`],['الإجمالي',`${Number(m.total_amount||0).toLocaleString()} ج.م`],['المدفوع',`${Number(m.paid_amount||0).toLocaleString()} ج.م`],['المتبقي',`${Number(m.remaining_amount||0).toLocaleString()} ج.م`]]:[]),['ملاحظات',m.notes]].map(([label,value])=><div key={label} className="bg-white p-3"><span className="block text-[10px] text-slate-500">{label}</span><strong className="mt-1 block break-words text-xs text-slate-800">{value || '—'}</strong></div>)}</div>}
              </article>;
            })}
          </div>
        </section>
      )}

      {/* ===== STAGE 1: تجميع الشيتات وكشف الميناء ===== */}
      {activeStage === 'stage1_manifest' && (
        <div className="space-y-4">
          {/* Stage 1 Header Banner */}
          <div className="bg-gradient-to-r from-rose-700 to-rose-600 text-white rounded-2xl p-5 shadow-md no-print">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-white/20 text-white text-[11px] font-black px-2.5 py-0.5 rounded-full">
                    المرحلة الأولى
                  </span>
                  <span className="text-rose-200 text-xs">قبل المحاسبة في الميناء</span>
                </div>
                <h2 className="text-base font-black">تجميع الشيتات وطباعة كشف الميناء الرسمي</h2>
                <p className="text-xs text-rose-100 mt-1 leading-relaxed">
                  كل شيت ترفعه يُحفظ كدفعة مستقلة باسم الملف. يمكنك طباعة الدفعة الحالية وحدها أو طباعة جميع الدفعات السابقة معًا
                  <strong className="text-white"> (بدون عمولات أو مبالغ) </strong>
                  وخذه لتحاسب به في مكتب الكاشير.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  onClick={onOpenAddModal}
                  className="bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-3.5 py-2.5 rounded-xl transition flex items-center gap-1.5 border border-white/30"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة حركة يدوية</span>
                </button>
                <button
                  onClick={onOpenUploadModal}
                  className="bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-3.5 py-2.5 rounded-xl transition flex items-center gap-1.5 border border-white/30"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>رفع شيت وتجميعه</span>
                </button>
                <button
                  onClick={() => openManifestPrint('selected')}
                  className="bg-white text-rose-700 hover:bg-rose-50 text-xs font-black px-4 py-2.5 rounded-xl shadow transition flex items-center gap-1.5"
                >
                  <FileDown className="w-4 h-4" />
                  <span>طباعة الدفعة المحددة</span>
                </button>
                <button onClick={() => openManifestPrint('all')} className="bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-3.5 py-2.5 rounded-xl transition flex items-center gap-1.5 border border-white/30">
                  <Printer className="w-4 h-4"/><span>طباعة كل الدفعات</span>
                </button>
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 no-print">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 absolute right-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="بحث برقم الشاحنة، المقطورة، الحاوية، السائق..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg pr-9 pl-3 py-2 text-xs"
                />
              </div>
              <select
                value={selectedBerth}
                onChange={(e) => setSelectedBerth(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-700"
              >
                <option value="">جميع الأرصفة</option>
                {berths.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <button
                onClick={handleResetFilters}
                className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold py-2 px-3 rounded-lg flex items-center gap-1 transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>إلغاء الفلاتر</span>
              </button>
              <span className="text-xs text-slate-500 font-semibold mr-auto">
                {manifestMovements.length} حركة في الدفعة المحددة
              </span>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 no-print space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div><h3 className="text-sm font-black text-slate-900">دفعات الشيتات</h3><p className="mt-1 text-xs text-slate-500">كل ملف مرفوع محفوظ كمجموعة مستقلة. الافتراضي هو آخر شيت تم رفعه.</p></div>
              <div className="flex flex-wrap gap-2">
                <select value={selectedManifestBatch} onChange={(e)=>setSelectedManifestBatch(e.target.value)} className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">
                  <option value="latest">آخر شيت مرفوع</option><option value="all">كل الشيتات</option>
                  {importBatches.map((batch)=><option key={batch.id} value={batch.id}>{batch.name} ({batch.count} حركة)</option>)}
                </select>
                <button onClick={()=>openManifestPrint('selected')} disabled={!manifestMovements.length} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Printer className="inline h-3.5 w-3.5 ml-1"/>طباعة المعروض ({manifestMovements.length})</button>
                <button onClick={()=>openManifestPrint('all')} disabled={!filteredMovements.length} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Printer className="inline h-3.5 w-3.5 ml-1"/>طباعة الكل ({filteredMovements.length})</button>
              </div>
            </div>
            {importBatches.length > 0 && <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">{importBatches.map((batch)=><button key={batch.id} onClick={()=>setSelectedManifestBatch(batch.id)} className={`rounded-xl border p-3 text-right transition ${((selectedManifestBatch==='latest'&&batch.id===latestBatchId)||selectedManifestBatch===batch.id)?'border-blue-400 bg-blue-50 ring-1 ring-blue-200':'border-slate-200 bg-slate-50 hover:border-slate-300'}`}><span className="block truncate text-xs font-black text-slate-800">{batch.name}</span><span className="mt-1 flex justify-between text-[11px] text-slate-500"><span>{batch.count} حركة</span><span>{Number.isNaN(new Date(batch.at).getTime())?'وقت غير مسجل':new Date(batch.at).toLocaleString('ar-EG')}</span></span></button>)}</div>}
          </div>

          {/* Clean 12-Column Table (NO financials) */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between no-print">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Truck className="w-4 h-4 text-rose-600" />
                كشف الحركات المجمع — الاسطمبة الرسمية للمكتب
                <span className="text-[10px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-bold">
                  بدون مبالغ مالية
                </span>
              </h3>
              <button
              onClick={() => openManifestPrint('selected')}
                className="bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>تنزيل PDF</span>
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-xs text-right border-collapse">
                <thead className="bg-rose-800 text-white font-bold">
                  <tr>
                    <th className="p-2.5 border border-rose-700 text-center w-10">م</th>
                    <th className="p-2.5 border border-rose-700 whitespace-nowrap">رقم الشاحنة</th>
                    <th className="p-2.5 border border-rose-700 text-center whitespace-nowrap">وزن الشاحنة<span className="block text-[9px] font-normal opacity-70">من واقع الرخصة</span></th>
                    <th className="p-2.5 border border-rose-700 text-center whitespace-nowrap">محاور الشاحنة</th>
                    <th className="p-2.5 border border-rose-700 whitespace-nowrap">رقم المقطورة</th>
                    <th className="p-2.5 border border-rose-700 text-center whitespace-nowrap">وزن المقطورة<span className="block text-[9px] font-normal opacity-70">من واقع الرخصة</span></th>
                    <th className="p-2.5 border border-rose-700 text-center whitespace-nowrap">محاور المقطورة</th>
                    <th className="p-2.5 border border-rose-700 min-w-[130px]">اسم السائق</th>
                    <th className="p-2.5 border border-rose-700 whitespace-nowrap">رقم الاقرار</th>
                    <th className="p-2.5 border border-rose-700 whitespace-nowrap">رقم الحاوية</th>
                    <th className="p-2.5 border border-rose-700 min-w-[130px]">وصف الحاوية</th>
                    <th className="p-2.5 border border-rose-700 min-w-[130px]">مسار الحاوية</th>
                    <th className="p-2.5 border border-rose-700 text-center w-16 no-print">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {manifestMovements.length > 0 ? manifestMovements.map((m, i) => (
                    <tr key={m.id} className="hover:bg-rose-50/30 transition">
                      <td className="p-2 border border-slate-100 text-center font-bold text-rose-800 bg-slate-50">{m.seq || i + 1}</td>
                      <td className="p-2 border border-slate-100 font-bold text-slate-900 whitespace-nowrap">
                        {m.truck_no}
                        {m.customer_name && <span className="block text-[10px] font-normal text-slate-500">{m.customer_name}</span>}
                      </td>
                      <td className="p-2 border border-slate-100 text-center font-mono">{m.truck_weight ?? 7.5}</td>
                      <td className="p-2 border border-slate-100 text-center font-mono">{m.truck_axles ?? 20}</td>
                      <td className="p-2 border border-slate-100 font-medium whitespace-nowrap">{m.trailer_no || '-'}</td>
                      <td className="p-2 border border-slate-100 text-center font-mono">{m.trailer_weight ?? 11.5}</td>
                      <td className="p-2 border border-slate-100 text-center font-mono">{m.trailer_axles ?? 30}</td>
                      <td className="p-2 border border-slate-100 text-slate-800">{m.driver_name || '-'}</td>
                      <td className="p-2 border border-slate-100 font-mono text-slate-700 whitespace-nowrap">{m.declaration_no || '-'}</td>
                      <td className="p-2 border border-slate-100 font-mono font-bold text-blue-800 whitespace-nowrap">{m.container_no || '-'}</td>
                      <td className="p-2 border border-slate-100 text-slate-600">{m.container_desc || '-'}</td>
                      <td className="p-2 border border-slate-100 text-slate-600">{m.container_path || '-'}</td>
                      <td className="p-2 border border-slate-100 text-center no-print">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => onEditMovement(m)} className="p-1 text-blue-600 hover:bg-blue-50 rounded" title="تعديل"><Edit2 className="w-3 h-3" /></button>
                          <button onClick={() => onDeleteMovement(m.id)} className="p-1 text-rose-500 hover:bg-rose-50 rounded" title="حذف"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={13} className="p-8 text-center text-slate-400">لا توجد حركات مسجلة. ارفع شيت أو أضف حركة يدوية.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {/* Next Step Banner */}
            {manifestMovements.length > 0 && (
              <div className="bg-rose-50 border-t border-rose-200 p-3 flex items-center justify-between no-print">
                <p className="text-xs text-rose-700 font-semibold">
                  ✅ بعد تنزيل الكشف وإنهاء المحاسبة في الميناء، انتقل للمرحلة التالية لتسجيل فاتورة الكاشير
                </p>
                <button
                  onClick={() => setActiveStage('stage2_cashier')}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition"
                >
                  <span>المرحلة 2: تسجيل الكاشير</span>
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== STAGE 2: تسجيل فواتير الكاشير ===== */}
      {activeStage === 'stage2_cashier' && (
        <div className="space-y-4">
          {/* Stage 2 Header Banner */}
          <div className="bg-gradient-to-r from-emerald-700 to-emerald-600 text-white rounded-2xl p-5 shadow-md no-print">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-white/20 text-white text-[11px] font-black px-2.5 py-0.5 rounded-full">
                    المرحلة الثانية
                  </span>
                  <span className="text-emerald-200 text-xs">بعد المحاسبة في الميناء</span>
                </div>
                <h2 className="text-base font-black">تسجيل وربط فواتير الكاشير</h2>
                <p className="text-xs text-emerald-100 mt-1 leading-relaxed">
                  ارفع تقرير الكاشير الصادر من الميناء (PDF / Excel / Word / صورة) أو ادخل رقم الإيصال والمبلغ يدوياً.
                  سيقوم السيستم بمطابقة كل شاحنة وتسجيل المبلغ تلقائياً.
                </p>
              </div>
              {canViewFinancials && onBatchUpdateMovements && (
                <div className="flex flex-wrap gap-2 shrink-0">
                  <button
                    onClick={() => setIsCashierReportModalOpen(true)}
                    className="bg-white text-emerald-700 hover:bg-emerald-50 text-xs font-black px-4 py-2.5 rounded-xl shadow transition flex items-center gap-1.5"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>رفع تقرير الكاشير آلياً</span>
                  </button>
                  <button
                    onClick={() => { setLinkingMovement(null); setIsCashierModalOpen(true); }}
                    className="bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-3.5 py-2.5 rounded-xl transition flex items-center gap-1.5 border border-white/30"
                  >
                    <Link2 className="w-4 h-4" />
                    <span>ربط يدوي لإيصال</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 no-print">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 absolute right-3 top-2.5 text-slate-400" />
                <input type="text" placeholder="بحث برقم الشاحنة أو الإيصال..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-lg pr-9 pl-3 py-2 text-xs" />
              </div>
              {canViewFinancials && (
                <select value={selectedPaymentStatus} onChange={(e) => setSelectedPaymentStatus(e.target.value)} className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-700">
                  <option value="">حالة السداد (الكل)</option>
                  <option value="unpaid">غير مربوط بكاشير</option>
                  <option value="partial">جزئي</option>
                  <option value="paid">مكتمل</option>
                </select>
              )}
              <button onClick={handleResetFilters} className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold py-2 px-3 rounded-lg flex items-center gap-1 transition">
                <RotateCcw className="w-3.5 h-3.5" /><span>إلغاء الفلاتر</span>
              </button>
              {canViewFinancials && (
                <div className="mr-auto flex items-center gap-3 text-xs font-semibold text-slate-600">
                  <span className="text-emerald-700">مربوط: {filteredMovements.filter(m => m.cashier_receipt_no).length}</span>
                  <span className="text-rose-600">غير مربوط: {filteredMovements.filter(m => !m.cashier_receipt_no).length}</span>
                </div>
              )}
            </div>
          </div>

          {/* Cashier Reconciliation Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between no-print">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-600" />
                جدول مطابقة فواتير الكاشير
              </h3>
              {canViewFinancials && (
                <div className="flex items-center gap-4 text-xs font-bold">
                  <span className="text-slate-600">إجمالي الكاشير: <span className="text-emerald-700">{subtotals.cashierTotal.toLocaleString()} ج.م</span></span>
                  <span className="text-slate-600">إجمالي المستحق: <span className="text-slate-900">{subtotals.grandTotal.toLocaleString()} ج.م</span></span>
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-xs text-right border-collapse">
                <thead className="bg-emerald-800 text-white font-bold">
                  <tr>
                    <th className="p-2.5 border border-emerald-700 text-center w-10">م</th>
                    <th className="p-2.5 border border-emerald-700 whitespace-nowrap">رقم الشاحنة</th>
                    <th className="p-2.5 border border-emerald-700 whitespace-nowrap">المقطورة</th>
                    <th className="p-2.5 border border-emerald-700">اسم السائق</th>
                    <th className="p-2.5 border border-emerald-700 whitespace-nowrap">رقم الحاوية</th>
                    {canViewFinancials && (
                      <>
                        <th className="p-2.5 border border-emerald-700 text-center whitespace-nowrap">رقم إيصال الكاشير</th>
                        <th className="p-2.5 border border-emerald-700 text-center whitespace-nowrap">مبلغ الكاشير</th>
                        <th className="p-2.5 border border-emerald-700 text-center whitespace-nowrap">عمولة المنظومة</th>
                        <th className="p-2.5 border border-emerald-700 text-center whitespace-nowrap">نافذ</th>
                        <th className="p-2.5 border border-emerald-700 text-center whitespace-nowrap">الإجمالي المستحق</th>
                        <th className="p-2.5 border border-emerald-700 text-center whitespace-nowrap">الحالة</th>
                      </>
                    )}
                    <th className="p-2.5 border border-emerald-700 text-center w-20 no-print">ربط / تعديل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredMovements.length > 0 ? filteredMovements.map((m, i) => (
                    <tr key={m.id} className={`transition ${m.cashier_receipt_no ? 'bg-emerald-50/30 hover:bg-emerald-50/60' : 'hover:bg-amber-50/40'}`}>
                      <td className="p-2 border border-slate-100 text-center font-bold text-emerald-800 bg-slate-50">{m.seq || i + 1}</td>
                      <td className="p-2 border border-slate-100 font-bold text-slate-900 whitespace-nowrap">{m.truck_no}</td>
                      <td className="p-2 border border-slate-100 text-slate-700 whitespace-nowrap">{m.trailer_no || '-'}</td>
                      <td className="p-2 border border-slate-100 text-slate-800">{m.driver_name || '-'}</td>
                      <td className="p-2 border border-slate-100 font-mono font-bold text-blue-800 whitespace-nowrap">{m.container_no || '-'}</td>
                      {canViewFinancials && (
                        <>
                          <td className="p-2 border border-slate-100 text-center">
                            {m.cashier_receipt_no ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-mono bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200">
                                <CheckCircle className="w-3 h-3" />#{m.cashier_receipt_no}
                              </span>
                            ) : (
                              <span className="text-[11px] text-amber-600 font-semibold flex items-center justify-center gap-1">
                                <Clock className="w-3 h-3" />لم يُربط
                              </span>
                            )}
                          </td>
                          <td className="p-2 border border-slate-100 text-center font-mono font-bold">{(m.cashier_invoice || 0).toLocaleString()} ج</td>
                          <td className="p-2 border border-slate-100 text-center font-mono text-blue-700">{(m.system_commission ?? settings?.default_system_commission ?? 200).toLocaleString()} ج</td>
                          <td className="p-2 border border-slate-100 text-center font-mono text-indigo-700">{(m.nafez_commission || 0).toLocaleString()} ج</td>
                          <td className="p-2 border border-slate-100 text-center font-mono font-black text-slate-900">{(m.total_amount || 0).toLocaleString()} ج</td>
                          <td className="p-2 border border-slate-100 text-center whitespace-nowrap">
                            {m.payment_status === 'paid' && <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" />خالص</span>}
                            {m.payment_status === 'partial' && <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">جزئي</span>}
                            {(!m.payment_status || m.payment_status === 'unpaid') && <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full"><Clock className="w-3 h-3" />متبقي</span>}
                          </td>
                        </>
                      )}
                      <td className="p-2 border border-slate-100 text-center no-print">
                        <div className="flex items-center justify-center gap-1">
                          {canViewFinancials && (
                            <button onClick={() => { setLinkingMovement(m); setIsCashierModalOpen(true); }} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg" title="ربط إيصال كاشير">
                              <Link2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button onClick={() => onEditMovement(m)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg" title="تعديل">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={canViewFinancials ? 12 : 7} className="p-8 text-center text-slate-400">لا توجد حركات. ابدأ بالمرحلة الأولى لرفع وتجميع الشيتات.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {/* Next Step Banner */}
            {filteredMovements.filter(m => m.cashier_receipt_no).length > 0 && canViewFinancials && (
              <div className="bg-emerald-50 border-t border-emerald-200 p-3 flex items-center justify-between no-print">
                <p className="text-xs text-emerald-700 font-semibold">
                  ✅ تم ربط {filteredMovements.filter(m => m.cashier_receipt_no).length} إيصال. انتقل للمرحلة التالية لعرض ملخص حسابات كل عميل
                </p>
                <button
                  onClick={() => setActiveStage('stage3_clients')}
                  className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition"
                >
                  <span>المرحلة 3: حسابات العملاء</span>
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== STAGE 3: حسابات ومطالبات العملاء ===== */}
      {activeStage === 'stage3_clients' && canViewFinancials && (
        <div className="space-y-4">
          {/* Stage 3 Header Banner */}
          <div className="bg-gradient-to-r from-amber-600 to-amber-500 text-white rounded-2xl p-5 shadow-md no-print">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-white/20 text-white text-[11px] font-black px-2.5 py-0.5 rounded-full">المرحلة الثالثة</span>
                  <span className="text-amber-100 text-xs">ملخص حسابات ومطالبات كل عميل</span>
                </div>
                <h2 className="text-base font-black">حسابات ومطالبات العملاء المجمعة</h2>
                <p className="text-xs text-amber-100 mt-1 leading-relaxed">
                  كل عميل/سائق له بطاقة تجمع جميع شحناته وشاحناته في مكان واحد.
                  يمكنك تطبيق خصم وتنزيل مطالبة PDF للعميل مباشرةً.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <div className="relative">
                  <Search className="w-4 h-4 absolute right-3 top-2.5 text-amber-200" />
                  <input
                    type="text"
                    placeholder="بحث باسم العميل أو السائق..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="bg-white/20 placeholder-amber-200 text-white text-xs border border-white/30 rounded-xl pr-9 pl-3 py-2 focus:outline-none focus:ring-2 focus:ring-white/40 min-w-[200px]"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Financial Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 no-print">
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-500 block">عدد العملاء</span>
              <span className="text-xl font-black text-slate-800">{customerGroups.length} عميل</span>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-500 block">إجمالي الكاشير</span>
              <span className="text-lg font-bold text-slate-900">{subtotals.cashierTotal.toLocaleString()} ج.م</span>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50 shadow-sm">
              <span className="text-[11px] font-semibold text-emerald-700 block">إجمالي المستحق</span>
              <span className="text-lg font-black text-emerald-900">{subtotals.grandTotal.toLocaleString()} ج.م</span>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-rose-200 bg-rose-50/50 shadow-sm">
              <span className="text-[11px] font-semibold text-rose-700 block">المتبقي (المديونية)</span>
              <span className="text-lg font-black text-rose-900">{subtotals.remainingTotal.toLocaleString()} ج.م</span>
            </div>
          </div>

          {/* Customer Cards */}
          {customerGroups.length > 0 ? (
            <div className="space-y-4">
              {customerGroups.map((group) => (
                <div key={group.name} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  {/* Customer Card Header */}
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 text-white px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="bg-amber-500 rounded-full w-10 h-10 flex items-center justify-center shrink-0">
                        <User className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-white">{group.name}</h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {group.truckCount} شحنة — {group.truckPlates}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleApplyOverallDiscount(group.name)}
                        className="bg-amber-500 hover:bg-amber-400 text-white text-[11px] font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 transition"
                        title="تطبيق خصم إجمالي موزع على كل الشحنات"
                      >
                        <Percent className="w-3.5 h-3.5" />
                        <span>تطبيق خصم إجمالي</span>
                      </button>
                      <button
                        onClick={() => handleDownloadCustomerPdf(group)}
                        className="bg-white text-slate-800 hover:bg-amber-50 text-[11px] font-black px-3 py-2 rounded-xl flex items-center gap-1.5 transition shadow"
                        title="تنزيل مطالبة PDF للعميل بكل شحناته وعمولاته وخصومه"
                      >
                        <FileDown className="w-3.5 h-3.5 text-amber-600" />
                        <span>تنزيل PDF للعميل</span>
                      </button>
                    </div>
                  </div>

                  {/* Customer Shipments Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-right border-collapse min-w-[700px]">
                      <thead className="bg-slate-100 text-slate-700">
                        <tr>
                          <th className="p-2.5 border border-slate-200 text-center w-8">م</th>
                          <th className="p-2.5 border border-slate-200 whitespace-nowrap">الشاحنة / المقطورة</th>
                          <th className="p-2.5 border border-slate-200 whitespace-nowrap">رقم الحاوية</th>
                          <th className="p-2.5 border border-slate-200 whitespace-nowrap">رقم الكاشير</th>
                          <th className="p-2.5 border border-slate-200 text-center whitespace-nowrap">مبلغ الكاشير</th>
                          <th className="p-2.5 border border-slate-200 text-center whitespace-nowrap">عمولة</th>
                          <th className="p-2.5 border border-slate-200 text-center whitespace-nowrap">نافذ</th>
                          <th className="p-2.5 border border-slate-200 text-center whitespace-nowrap">خصم</th>
                          <th className="p-2.5 border border-slate-200 text-center whitespace-nowrap font-black">الإجمالي</th>
                          <th className="p-2.5 border border-slate-200 text-center whitespace-nowrap">الحالة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {group.moves.map((m, i) => (
                          <tr key={m.id} className="hover:bg-amber-50/30 transition">
                            <td className="p-2 border border-slate-100 text-center font-bold text-amber-800 bg-slate-50">{i + 1}</td>
                            <td className="p-2 border border-slate-100">
                              <span className="font-bold text-slate-900 block">{m.truck_no}</span>
                              {m.trailer_no && <span className="text-[10px] text-slate-500">{m.trailer_no}</span>}
                            </td>
                            <td className="p-2 border border-slate-100 font-mono font-bold text-blue-800 whitespace-nowrap">{m.container_no || '-'}</td>
                            <td className="p-2 border border-slate-100 text-center">
                              {m.cashier_receipt_no ? (
                                <span className="text-[10px] font-mono bg-emerald-50 text-emerald-800 px-1.5 py-0.5 rounded border border-emerald-200">#{m.cashier_receipt_no}</span>
                              ) : (
                                <span className="text-[10px] text-amber-600">لم يُربط</span>
                              )}
                            </td>
                            <td className="p-2 border border-slate-100 text-center font-mono font-semibold">{(m.cashier_invoice || 0).toLocaleString()}</td>
                            <td className="p-2 border border-slate-100 text-center font-mono text-blue-700">{(m.system_commission ?? settings?.default_system_commission ?? 200).toLocaleString()}</td>
                            <td className="p-2 border border-slate-100 text-center font-mono text-indigo-700">{(m.nafez_commission || 0).toLocaleString()}</td>
                            <td className="p-2 border border-slate-100 text-center">
                              <input
                                type="number"
                                min="0"
                                value={m.discount || 0}
                                onChange={(e) => handleDiscountChange(m.id, Number(e.target.value))}
                                className="w-16 text-center border border-amber-300 rounded-lg py-1 text-[11px] font-bold bg-amber-50 focus:ring-1 focus:ring-amber-400 text-amber-800"
                                placeholder="0"
                              />
                            </td>
                            <td className="p-2 border border-slate-100 text-center font-mono font-black text-slate-900 bg-slate-50">{(m.total_amount || 0).toLocaleString()}</td>
                            <td className="p-2 border border-slate-100 text-center whitespace-nowrap">
                              {m.payment_status === 'paid' && <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" />خالص</span>}
                              {m.payment_status === 'partial' && <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">جزئي</span>}
                              {(!m.payment_status || m.payment_status === 'unpaid') && <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded-full"><Clock className="w-3 h-3" />متبقي</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      {/* Customer Totals Footer */}
                      <tfoot className="bg-amber-50 font-black text-amber-900 text-xs">
                        <tr>
                          <td colSpan={4} className="p-2.5 border border-amber-200 text-right">
                            إجمالي {group.name} ({group.truckCount} شحنة)
                          </td>
                          <td className="p-2.5 border border-amber-200 text-center font-mono">{group.cashierTotal.toLocaleString()} ج</td>
                          <td className="p-2.5 border border-amber-200 text-center font-mono text-blue-800">{group.systemCommTotal.toLocaleString()} ج</td>
                          <td className="p-2.5 border border-amber-200 text-center font-mono text-indigo-800">{group.nafezCommTotal.toLocaleString()} ج</td>
                          <td className="p-2.5 border border-amber-200 text-center font-mono text-rose-700">-{group.discountTotal.toLocaleString()} ج</td>
                          <td className="p-2.5 border border-amber-200 text-center font-mono text-emerald-900 text-sm">{group.totalAmount.toLocaleString()} ج</td>
                          <td className="p-2.5 border border-amber-200 text-center">
                            {group.remainingTotal === 0 && group.totalAmount > 0
                              ? <span className="text-emerald-700 font-bold">✅ خالص</span>
                              : <span className="text-rose-700">متبقي: {group.remainingTotal.toLocaleString()} ج</span>
                            }
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
              <Layers className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm font-semibold">لا توجد حركات مسجلة.</p>
              <p className="text-slate-400 text-xs mt-1">ارفع الشيتات في المرحلة الأولى أولاً.</p>
              <button onClick={() => setActiveStage('stage1_manifest')} className="mt-4 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition">
                الذهاب للمرحلة 1
              </button>
            </div>
          )}
        </div>
      )}

      {/* ===== ALL: جدول السيد الكامل ===== */}
      {activeStage === 'all' && (
        <div className="space-y-4">
          {/* Master Table Controls */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 no-print">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3 mb-3">
              <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-slate-600" />
                جدول السيد — جميع الأعمدة والبيانات ({movements.length} حركة)
              </h2>
              <div className="flex flex-wrap gap-2">
                <button onClick={onOpenAddModal} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1.5 transition"><Plus className="w-4 h-4" /><span>إضافة يدوية</span></button>
                <button onClick={onOpenUploadModal} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1.5 transition"><FileSpreadsheet className="w-4 h-4" /><span>رفع شيت</span></button>
                <button onClick={() => setIsOfficialSheetModalOpen(true)} className="bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1.5 transition"><Printer className="w-4 h-4" /><span>طباعة كشف الميناء</span></button>
                <button onClick={handleExportExcel} className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1.5 transition"><Download className="w-4 h-4" /><span>Excel</span></button>
                {canViewFinancials && onBatchUpdateMovements && (
                  <button onClick={() => setIsCashierReportModalOpen(true)} className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1.5 transition"><Receipt className="w-4 h-4" /><span>رفع تقرير كاشير</span></button>
                )}
                {canViewFinancials && (
                  <button onClick={() => { setLinkingMovement(null); setIsCashierModalOpen(true); }} className="bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1.5 transition"><Link2 className="w-4 h-4" /><span>ربط يدوي</span></button>
                )}
                {canViewFinancials && filteredMovements.length > 0 && (
                  <button onClick={() => setIsInvoiceModalOpen(true)} className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1.5 transition"><FileText className="w-4 h-4" /><span>فاتورة ({filteredMovements.length})</span></button>
                )}
                {isAdmin && movements.length > 0 && onClearAllMovements && (
                  <button onClick={onClearAllMovements} className="bg-slate-600 hover:bg-slate-700 text-white text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1.5 transition"><Trash2 className="w-4 h-4" /><span>مسح وتصفير</span></button>
                )}
              </div>
            </div>
            {/* Filter Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-2">
              <div className="md:col-span-2 relative">
                <Search className="w-4 h-4 absolute right-3 top-2.5 text-slate-400" />
                <input type="text" placeholder="بحث برقم الشاحنة، السائق، الحاوية..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-lg pr-9 pl-3 py-2 text-xs" />
              </div>
              <select value={selectedCustomer} onChange={(e) => setSelectedCustomer(e.target.value)} className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-700">
                <option value="">جميع العملاء</option>
                {customers.map((c) => <option key={c.id} value={c.id}>[{c.code}] {c.name}</option>)}
              </select>
              <select value={selectedBerth} onChange={(e) => setSelectedBerth(e.target.value)} className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-700">
                <option value="">جميع الأرصفة</option>
                {berths.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              {canViewFinancials && (
                <select value={selectedPaymentStatus} onChange={(e) => setSelectedPaymentStatus(e.target.value)} className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-700">
                  <option value="">حالة السداد (الكل)</option>
                  <option value="unpaid">غير مدفوع</option>
                  <option value="partial">جزئي</option>
                  <option value="paid">مدفوع</option>
                </select>
              )}
              <button onClick={handleResetFilters} className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold py-2 px-2.5 rounded-lg flex items-center justify-center gap-1 transition">
                <RotateCcw className="w-3.5 h-3.5" /><span>إلغاء الفلاتر</span>
              </button>
            </div>
          </div>

          {/* Financial Summary Bar */}
          {canViewFinancials && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 no-print">
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm"><span className="text-[11px] font-semibold text-slate-500 block">عدد الحركات</span><span className="text-xl font-black text-slate-800">{subtotals.count} حركة</span></div>
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm"><span className="text-[11px] font-semibold text-slate-500 block">فواتير الكاشير</span><span className="text-lg font-bold text-slate-900">{subtotals.cashierTotal.toLocaleString()} ج.م</span></div>
              <div className="bg-blue-50 p-3.5 rounded-xl border border-blue-200 shadow-sm"><span className="text-[11px] font-semibold text-blue-700 block">عمولة المنظومة</span><span className="text-lg font-bold text-blue-900">{subtotals.systemCommTotal.toLocaleString()} ج.م</span></div>
              <div className="bg-indigo-50 p-3.5 rounded-xl border border-indigo-200 shadow-sm"><span className="text-[11px] font-semibold text-indigo-700 block">عمولة نافذ</span><span className="text-lg font-bold text-indigo-900">{subtotals.nafezCommTotal.toLocaleString()} ج.م</span></div>
              <div className="bg-emerald-50 p-3.5 rounded-xl border border-emerald-200 shadow-sm"><span className="text-[11px] font-semibold text-emerald-700 block">إجمالي المستحق</span><span className="text-lg font-black text-emerald-900">{subtotals.grandTotal.toLocaleString()} ج.م</span></div>
              <div className="bg-rose-50 p-3.5 rounded-xl border border-rose-200 shadow-sm"><span className="text-[11px] font-semibold text-rose-700 block">المتبقي (المديونية)</span><span className="text-lg font-black text-rose-900">{subtotals.remainingTotal.toLocaleString()} ج.م</span></div>
            </div>
          )}

          {/* Full Master Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="hidden print:block p-4 text-center border-b border-black">
              <h1 className="text-xl font-bold">كشف حركات الشاحنات والحاويات - ميناء التفريغ والشحن</h1>
              <p className="text-xs text-gray-600 mt-1">تاريخ الطباعة: {new Date().toLocaleDateString('ar-EG')}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-xs text-right border-collapse">
                <thead className="bg-slate-900 text-white font-bold select-none">
                  <tr>
                    <th className="p-2.5 border border-slate-700 text-center w-12">م</th>
                    <th className="p-2.5 border border-slate-700 whitespace-nowrap">رقم الشاحنة</th>
                    <th className="p-2.5 border border-slate-700 text-center whitespace-nowrap">وزن الشاحنة<span className="block text-[10px] font-normal text-slate-400">من واقع الرخصة</span></th>
                    <th className="p-2.5 border border-slate-700 text-center whitespace-nowrap">محاور الشاحنة</th>
                    <th className="p-2.5 border border-slate-700 whitespace-nowrap">رقم المقطورة</th>
                    <th className="p-2.5 border border-slate-700 text-center whitespace-nowrap">وزن المقطورة<span className="block text-[10px] font-normal text-slate-400">من واقع الرخصة</span></th>
                    <th className="p-2.5 border border-slate-700 text-center whitespace-nowrap">محاور المقطورة</th>
                    <th className="p-2.5 border border-slate-700 whitespace-nowrap min-w-[140px]">اسم السائق</th>
                    <th className="p-2.5 border border-slate-700 whitespace-nowrap">رقم الاقرار</th>
                    <th className="p-2.5 border border-slate-700 whitespace-nowrap">رقم الحاوية</th>
                    <th className="p-2.5 border border-slate-700 whitespace-nowrap min-w-[150px]">وصف الحاوية</th>
                    <th className="p-2.5 border border-slate-700 whitespace-nowrap min-w-[140px]">مسار الحاوية</th>
                    <th className="p-2.5 border border-slate-700 whitespace-nowrap">وقت الإدخال</th>
                    {canViewFinancials && (
                      <>
                        <th className="p-2.5 border border-slate-700 text-center whitespace-nowrap bg-blue-950 no-print">فاتورة كاشير</th>
                        <th className="p-2.5 border border-slate-700 text-center whitespace-nowrap bg-blue-950 no-print">عمولة المنظومة</th>
                        <th className="p-2.5 border border-slate-700 text-center whitespace-nowrap bg-blue-950 no-print">نافذ</th>
                        <th className="p-2.5 border border-slate-700 text-center whitespace-nowrap bg-blue-950 no-print">الإجمالي</th>
                        <th className="p-2.5 border border-slate-700 text-center whitespace-nowrap bg-blue-950 no-print">الحالة والمتبقي</th>
                      </>
                    )}
                    <th className="p-2.5 border border-slate-700 text-center w-20 no-print">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {filteredMovements.length > 0 ? filteredMovements.map((m, index) => (
                    <tr key={m.id} className="hover:bg-blue-50/40 transition">
                      <td className="p-2 border border-slate-200 text-center font-bold text-blue-900 bg-slate-50/50">{m.seq || index + 1}</td>
                      <td className="p-2 border border-slate-200 font-bold text-slate-900 whitespace-nowrap">
                        {m.truck_no}
                        {m.customer_name && <span className="block text-[10px] font-normal text-slate-500">{m.customer_name}</span>}
                      </td>
                      <td className="p-2 border border-slate-200 text-center font-mono font-semibold">{m.truck_weight ?? 7.5}</td>
                      <td className="p-2 border border-slate-200 text-center font-mono font-semibold">{m.truck_axles ?? 20}</td>
                      <td className="p-2 border border-slate-200 font-medium whitespace-nowrap">{m.trailer_no || '-'}</td>
                      <td className="p-2 border border-slate-200 text-center font-mono font-semibold">{m.trailer_weight ?? 11.5}</td>
                      <td className="p-2 border border-slate-200 text-center font-mono font-semibold">{m.trailer_axles ?? 30}</td>
                      <td className="p-2 border border-slate-200 text-slate-800">{m.driver_name || '-'}</td>
                      <td className="p-2 border border-slate-200 font-mono text-slate-700 whitespace-nowrap">{m.declaration_no || '-'}</td>
                      <td className="p-2 border border-slate-200 font-mono font-bold text-blue-800 whitespace-nowrap">{m.container_no || '-'}</td>
                      <td className="p-2 border border-slate-200 text-slate-600">{m.container_desc || '-'}</td>
                      <td className="p-2 border border-slate-200 text-slate-600">{m.container_path || '-'}</td>
                      <td className="p-2 border border-slate-200 text-slate-600 whitespace-nowrap">{getEntryDateTime(m)?.toLocaleString('ar-EG') || 'غير مسجل'}</td>
                      {canViewFinancials && (
                        <>
                          <td className="p-2 border border-slate-200 text-center font-mono font-bold no-print">
                            <div>{(m.cashier_invoice || 0).toLocaleString()}</div>
                            {m.cashier_receipt_no ? (
                              <span className="inline-block mt-0.5 text-[9.5px] font-mono bg-indigo-50 text-indigo-800 px-1.5 py-0.5 rounded border border-indigo-200">#{m.cashier_receipt_no}</span>
                            ) : (
                              <span className="inline-block mt-0.5 text-[9px] text-slate-400">غير مربوط</span>
                            )}
                          </td>
                          <td className="p-2 border border-slate-200 text-center font-mono font-bold text-blue-700 no-print">{(m.system_commission ?? settings?.default_system_commission ?? 200).toLocaleString()}</td>
                          <td className="p-2 border border-slate-200 text-center font-mono font-bold text-indigo-700 no-print">{(m.nafez_commission || 0).toLocaleString()}</td>
                          <td className="p-2 border border-slate-200 text-center font-mono font-black text-slate-900 bg-slate-50 no-print">{(m.total_amount || 0).toLocaleString()}</td>
                          <td className="p-2 border border-slate-200 text-center whitespace-nowrap no-print">
                            {m.payment_status === 'paid' && <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" />خالص</span>}
                            {m.payment_status === 'partial' && <span className="inline-flex flex-col items-center text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full"><span>جزئي (متبقي {m.remaining_amount} ج)</span></span>}
                            {m.payment_status === 'unpaid' && <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full"><Clock className="w-3 h-3" />متبقي كامل</span>}
                          </td>
                        </>
                      )}
                      <td className="p-2 border border-slate-200 text-center no-print whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          {canViewFinancials && (
                            <button onClick={() => { setLinkingMovement(m); setIsCashierModalOpen(true); }} className="p-1 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded" title="ربط وتحديث فاتورة الكاشير">
                              <Link2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button onClick={() => onEditMovement(m)} className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded" title="تعديل الحركة"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => onDeleteMovement(m.id)} className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded" title="حذف الحركة"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={canViewFinancials ? 18 : 13} className="p-8 text-center text-slate-400 text-sm">لا توجد حركات شاحنات مسجلة مطابقة لخيارات البحث الحالية.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Driver Invoice Modal */}
      {isInvoiceModalOpen && (
        <DriverInvoiceModal
          isOpen={isInvoiceModalOpen}
          onClose={() => setIsInvoiceModalOpen(false)}
          movements={filteredMovements}
          initialDriverName={
            searchTerm.trim() ||
            (filteredMovements.length > 0 ? filteredMovements[0].driver_name : undefined)
          }
          defaultPlaceName={
            selectedBerth
              ? berths.find((b) => b.id === selectedBerth || b.name === selectedBerth)?.name || 'رصيف الميناء'
              : 'محطة تشغيل وتفريغ الحاويات والشاحنات - إدارة الحركة'
          }
        />
      )}

      {/* Official Clean Manifest Print Modal (NO COMMISSIONS, NO TOTALS) */}
      {isOfficialSheetModalOpen && (
        <OfficialSheetPrintModal
          isOpen={isOfficialSheetModalOpen}
          onClose={() => setIsOfficialSheetModalOpen(false)}
          movements={manifestPrintScope === 'all' ? filteredMovements : manifestMovements}
          title={manifestPrintScope === 'all'
            ? 'كشف جميع دفعات الحركات المجمع (الاسطمبة الرسمية)'
            : `كشف دفعة: ${importBatches.find((batch) => batch.id === (selectedManifestBatch === 'latest' ? latestBatchId : selectedManifestBatch))?.name || 'الشيت المحدد'}`}
          berthName={
            selectedBerth
              ? berths.find((b) => b.id === selectedBerth || b.name === selectedBerth)?.name
              : undefined
          }
        />
      )}

      {/* Cashier Linking Modal */}
      {isCashierModalOpen && (
        <CashierLinkingModal
          isOpen={isCashierModalOpen}
          onClose={() => {
            setIsCashierModalOpen(false);
            setLinkingMovement(null);
          }}
          movements={movements}
          onSaveMovement={(m) => onEditMovement(m as Movement)}
          initialMovement={linkingMovement}
        />
      )}

      {/* Cashier Automated Report Matching Modal */}
      {isCashierReportModalOpen && onBatchUpdateMovements && (
        <CashierReportUploadModal
          isOpen={isCashierReportModalOpen}
          onClose={() => setIsCashierReportModalOpen(false)}
          movements={movements}
          onBatchUpdateMovements={onBatchUpdateMovements}
          settings={
            settings || {
              default_system_commission: 200,
              default_nafez_commission: 0,
              default_truck_axles: 20,
              default_truck_weight: 7.5,
              default_trailer_axles: 30,
              default_trailer_weight: 11.5,
              supabase_url: '',
              supabase_anon_key: '',
              admin_pin: '',
            }
          }
        />
      )}
    </div>
  );
};
