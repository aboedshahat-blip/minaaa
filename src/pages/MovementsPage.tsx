import React, { useState, useMemo, useEffect } from 'react';
import { Berth, Customer, Movement } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { exportTemplateToExcel } from '../lib/excelUtils';
import {
  Search,
  Download,
  Printer,
  Trash2,
  Edit2,
  CheckCircle,
  Clock,
  Truck,
  RotateCcw,
  FileText,
  FileDown,
  Link2,
  Receipt,
  User,
  Percent,
  ArrowLeft,
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
import { SheetProcessingPage } from './SheetProcessingPage';
import { useConfirmAction } from '../contexts/ConfirmActionContext';

interface MovementsPageProps {
  movements: Movement[];
  customers: Customer[];
  berths: Berth[];
  settings: SystemSettings;
  currentMaxSeq: number;
  onImportMovements: (movements: Movement[], newCustomers?: Customer[]) => void;
  onEditMovement: (movement: Movement) => void;
  onDeleteMovement: (id: string) => void;
  onClearAllMovements?: () => void;
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
  currentMaxSeq,
  onImportMovements,
  onEditMovement,
  onDeleteMovement,
  onClearAllMovements,
  onOpenPaymentModal,
  onUndoLatestDeletion,
  canUndoLatestDeletion = false,
  onBatchUpdateMovements,
}) => {
  const confirmAction = useConfirmAction();
  const { canViewFinancials, isAdmin, canManagePayments } = useAuth();

  // Modals state
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isOfficialSheetModalOpen, setIsOfficialSheetModalOpen] = useState(false);
  const [isCashierModalOpen, setIsCashierModalOpen] = useState(false);
  const [isCashierReportModalOpen, setIsCashierReportModalOpen] = useState(false);
  const [linkingMovement, setLinkingMovement] = useState<Movement | null>(null);

  // Workflow Stages: 1 = Aggregation & Official PDF | 2 = Cashier Linking | 3 = Client Accounts & Discounts | all = Master Table
  const [activeStage, setActiveStage] = useState<'daily' | 'stage0_import' | 'stage1_manifest' | 'stage2_cashier' | 'stage3_clients' | 'all'>('daily');

  // Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBerth, setSelectedBerth] = useState('');
  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [entryDateFrom, setEntryDateFrom] = useState(new Date().toLocaleDateString('en-CA'));
  const [entryDateTo, setEntryDateTo] = useState(new Date().toLocaleDateString('en-CA'));
  const [entryTimeFrom, setEntryTimeFrom] = useState('');
  const [entryTimeTo, setEntryTimeTo] = useState('');
  const [dailyPage, setDailyPage] = useState(1);
  const dailyPageSize = 20;
  const [expandedMovementIds, setExpandedMovementIds] = useState<Set<string>>(new Set());
  const [selectedManifestBatch, setSelectedManifestBatch] = useState('latest');
  const [selectedManifestBatchIds, setSelectedManifestBatchIds] = useState<string[]>([]);
  const [manifestPrintScope, setManifestPrintScope] = useState<'selected' | 'all' | 'picked'>('selected');
  const [isExportingPickedPdf, setIsExportingPickedPdf] = useState(false);
  const [discountDrafts, setDiscountDrafts] = useState<Record<string, string>>({});

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
  const openManifestPrint = (scope: 'selected' | 'all' | 'picked') => {
    setManifestPrintScope(scope);
    setIsOfficialSheetModalOpen(true);
  };

  const runUndoLatestDeletion = async () => {
    if (!canUndoLatestDeletion || !onUndoLatestDeletion) return;
    const confirmed = await confirmAction('سيتم إرجاع البيانات كما كانت قبل آخر حذف، وقد تُستبدل أي تغييرات أُدخلت بعده. هل تريد التراجع؟', 'نعم، تراجع');
    if (!confirmed) return;
    try {
      await onUndoLatestDeletion();
      window.alert('تم التراجع عن آخر حذف واستعادة البيانات.');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'تعذر التراجع عن الحذف.');
    }
  };

  const getEntryDateTime = (movement: Movement) => {
    const date = new Date(movement.created_at);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const dashboardMovements = useMemo(() => movements.filter((m) => {
    const created = getEntryDateTime(m);
    const createdDate = created?.toLocaleDateString('en-CA');
    if (entryDateFrom && (!createdDate || createdDate < entryDateFrom)) return false;
    if (entryDateTo && (!createdDate || createdDate > entryDateTo)) return false;
    if (created && (entryDateFrom || entryDateTo || entryTimeFrom || entryTimeTo)) {
      const start = entryDateFrom ? new Date(`${entryDateFrom}T${entryTimeFrom || '00:00'}`).getTime() : Number.NEGATIVE_INFINITY;
      const end = entryDateTo ? new Date(`${entryDateTo}T${entryTimeTo || '23:59'}`).getTime() : Number.POSITIVE_INFINITY;
      if (created.getTime() < start || created.getTime() > end) return false;
    }
    if (searchTerm) {
      const term = searchTerm.toLocaleLowerCase();
      const fields = [m.truck_no, m.trailer_no, m.driver_name, m.container_no, m.declaration_no, m.customer_name, m.cashier_receipt_no];
      if (!fields.some((value) => value?.toLocaleLowerCase().includes(term))) return false;
    }
    if (canViewFinancials && selectedPaymentStatus && m.payment_status !== selectedPaymentStatus) return false;
    return true;
  }), [movements, entryDateFrom, entryDateTo, entryTimeFrom, entryTimeTo, searchTerm, selectedPaymentStatus, canViewFinancials]);

  const dashboardTotals = useMemo(() => dashboardMovements.reduce((totals, m) => {
    totals.due += Number(m.total_amount) || 0;
    totals.paid += Number(m.paid_amount) || 0;
    totals.remaining += Number(m.remaining_amount) || 0;
    if (m.payment_status === 'paid') totals.paidCount += 1;
    else if (m.payment_status === 'partial') totals.partialCount += 1;
    else totals.unpaidCount += 1;
    return totals;
  }, { due: 0, paid: 0, remaining: 0, paidCount: 0, partialCount: 0, unpaidCount: 0 }), [dashboardMovements]);
  const sortedDashboardMovements = useMemo(
    () => dashboardMovements.slice().sort((a, b) => (getEntryDateTime(b)?.getTime() || 0) - (getEntryDateTime(a)?.getTime() || 0)),
    [dashboardMovements],
  );
  const dailyPageCount = Math.max(1, Math.ceil(sortedDashboardMovements.length / dailyPageSize));
  const safeDailyPage = Math.min(dailyPage, dailyPageCount);
  const visibleDashboardMovements = sortedDashboardMovements.slice((safeDailyPage - 1) * dailyPageSize, safeDailyPage * dailyPageSize);

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
    selectedBerth,
    selectedPaymentStatus,
    startDate,
    endDate,
  ]);

  const pickedBatchMovements = useMemo(() => {
    const selectedIds = new Set(selectedManifestBatchIds);
    return filteredMovements
      .filter((movement) => selectedIds.has(getMovementBatch(movement).id))
      .sort((a, b) => (a.seq || 0) - (b.seq || 0));
  }, [filteredMovements, selectedManifestBatchIds]);

  const manifestMovements = useMemo(() => {
    if (selectedManifestBatch === 'all') return filteredMovements.slice().sort((a, b) => (a.seq || 0) - (b.seq || 0));
    if (selectedManifestBatch === 'picked') return pickedBatchMovements;
    const targetId = selectedManifestBatch === 'latest' ? latestBatchId : selectedManifestBatch;
    return filteredMovements
      .filter((movement) => getMovementBatch(movement).id === targetId)
      .sort((a, b) => (a.seq || 0) - (b.seq || 0));
  }, [filteredMovements, selectedManifestBatch, latestBatchId, pickedBatchMovements]);

  const toggleManifestBatchSelection = (batchId: string) => {
    setSelectedManifestBatchIds((current) => current.includes(batchId)
      ? current.filter((id) => id !== batchId)
      : [...current, batchId]);
  };

  const downloadPickedBatchesPdf = async () => {
    if (!pickedBatchMovements.length || isExportingPickedPdf) return;
    setIsExportingPickedPdf(true);
    try {
      const { exportMovementsToOfficialPdf } = await import('../lib/pdfExport');
      const title = `شيت تسجيل حجز الشاحنات — ${selectedManifestBatchIds.length} شيت محدد`;
      const berthName = selectedBerth
        ? berths.find((berth) => berth.id === selectedBerth || berth.name === selectedBerth)?.name
        : undefined;
      await exportMovementsToOfficialPdf(pickedBatchMovements, title, berthName);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'تعذر تجهيز ملف PDF.';
      alert(`تعذر تنزيل كشف الشيتات المحددة: ${message}`);
    } finally {
      setIsExportingPickedPdf(false);
    }
  };

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
  const handleDiscountChange = async (movementId: string, discountVal: number) => {
    if (!onBatchUpdateMovements) return;
    const disc = Math.max(0, discountVal || 0);
    const current = movements.find((movement) => movement.id === movementId)?.discount || 0;
    if (disc === current) { setDiscountDrafts((drafts) => ({ ...drafts, [movementId]: String(current) })); return; }
    if (!await confirmAction(`هل تريد تغيير الخصم لهذه الحركة إلى ${disc.toLocaleString()} ج.م؟`, 'نعم، احفظ الخصم')) {
      setDiscountDrafts((drafts) => ({ ...drafts, [movementId]: String(current) }));
      return;
    }
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
    setDiscountDrafts((drafts) => { const next = { ...drafts }; delete next[movementId]; return next; });
  };

  const handleApplyOverallDiscount = async (customerName: string) => {
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
    if (!await confirmAction(`سيتم توزيع خصم ${overallDiscount.toLocaleString()} ج.م على ${custMoves.length} حركة للعميل ${customerName}. هل تريد المتابعة؟`, 'نعم، طبّق الخصم')) return;

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

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedBerth('');
    setSelectedPaymentStatus('');
    setStartDate('');
    setEndDate('');
  };

  // Stage tab config
  const stageTabs = [
    { key: 'stage0_import' as const, label: 'إدخال البيانات' },
    { key: 'stage1_manifest' as const, label: 'كشوف الميناء' },
    { key: 'stage2_cashier' as const, label: 'فواتير الكاشير' },
    ...(canViewFinancials ? [{ key: 'stage3_clients' as const, label: 'حسابات العملاء' }] : []),
    { key: 'daily' as const, label: 'حركات اليوم' },
    { key: 'all' as const, label: 'سجل الحركات' },
  ];

  return (
    <div className="space-y-6">
      <nav className="no-print flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2" aria-label="أقسام الحركات">
        {stageTabs.map((tab) => (
          <button key={tab.key} onClick={() => setActiveStage(tab.key)} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition ${activeStage === tab.key ? 'bg-blue-700 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}>
            {tab.label}
          </button>
        ))}
      </nav>

      {activeStage === 'stage0_import' && (
        <SheetProcessingPage
          customers={customers}
          berths={berths}
          settings={settings}
          currentMaxSeq={currentMaxSeq}
          onImportMovements={(importedMovements, newCustomers) => {
            onImportMovements(importedMovements, newCustomers);
            setActiveStage('stage1_manifest');
          }}
        />
      )}

      {activeStage === 'daily' && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-xl font-black text-slate-900">حركات اليوم</h2><p className="mt-1 text-xs text-slate-500">أحدث الحركات أولًا. ابحث بالعميل أو السائق أو رقم المركبة.</p></div>
            {canUndoLatestDeletion && <button onClick={() => void runUndoLatestDeletion()} className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900"><RotateCcw className="h-4 w-4"/>تراجع عن آخر حذف</button>}
          </div>

          <div className={`grid grid-cols-2 gap-3 ${canViewFinancials ? 'lg:grid-cols-4' : 'lg:grid-cols-1'}`}>
            <div className="rounded-xl border border-blue-200 bg-white p-3"><span className="text-xs text-slate-500">عدد الحركات</span><strong className="mt-1 block text-2xl text-blue-800">{dashboardMovements.length}</strong></div>
            {canViewFinancials && <>
              <div className="rounded-xl border border-slate-200 bg-white p-3"><span className="text-xs text-slate-500">المستحق</span><strong className="mt-1 block text-lg text-slate-900">{dashboardTotals.due.toLocaleString()} ج.م</strong></div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><span className="text-xs text-emerald-700">المحصل</span><strong className="mt-1 block text-lg text-emerald-800">{dashboardTotals.paid.toLocaleString()} ج.م</strong></div>
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3"><span className="text-xs text-rose-700">المتبقي</span><strong className="mt-1 block text-lg text-rose-800">{dashboardTotals.remaining.toLocaleString()} ج.م</strong><span className="mt-1 block text-[11px] text-slate-500">{dashboardTotals.unpaidCount} لم يدفع · {dashboardTotals.partialCount} جزئي</span></div>
            </>}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
              <div className="relative"><Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400"/><input value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setDailyPage(1); }} placeholder="ابحث بالعميل، السائق، الشاحنة أو الحاوية" className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2 pe-9 ps-3 text-sm"/></div>
              <div className="flex gap-2">
                <button onClick={() => { const today = new Date().toLocaleDateString('en-CA'); setEntryDateFrom(today); setEntryDateTo(today); setEntryTimeFrom(''); setEntryTimeTo(''); setDailyPage(1); }} className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800">اليوم</button>
                <button onClick={() => { const to = new Date(); const from = new Date(); from.setDate(to.getDate() - 6); setEntryDateFrom(from.toLocaleDateString('en-CA')); setEntryDateTo(to.toLocaleDateString('en-CA')); setEntryTimeFrom(''); setEntryTimeTo(''); setDailyPage(1); }} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">آخر 7 أيام</button>
                <button onClick={() => { setEntryDateFrom(''); setEntryDateTo(''); setEntryTimeFrom(''); setEntryTimeTo(''); setDailyPage(1); }} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">كل الأيام</button>
              </div>
            </div>
            <details className="mt-3 border-t border-slate-100 pt-2">
              <summary className="cursor-pointer text-xs font-bold text-slate-600">تحديد فترة البحث بالتاريخ والوقت وحالة الدفع</summary>
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="text-xs font-semibold text-slate-600">من تاريخ<input type="date" value={entryDateFrom} onChange={(e) => { setEntryDateFrom(e.target.value); setDailyPage(1); }} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"/></label>
                  <label className="text-xs font-semibold text-slate-600">من وقت<input type="time" value={entryTimeFrom} onChange={(e) => { setEntryTimeFrom(e.target.value); setDailyPage(1); }} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"/></label>
                  <label className="text-xs font-semibold text-slate-600">إلى تاريخ<input type="date" value={entryDateTo} onChange={(e) => { setEntryDateTo(e.target.value); setDailyPage(1); }} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"/></label>
                  <label className="text-xs font-semibold text-slate-600">إلى وقت<input type="time" value={entryTimeTo} onChange={(e) => { setEntryTimeTo(e.target.value); setDailyPage(1); }} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"/></label>
                  {canViewFinancials && <label className="text-xs font-semibold text-slate-600">حالة الدفع<select value={selectedPaymentStatus} onChange={(e) => { setSelectedPaymentStatus(e.target.value); setDailyPage(1); }} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"><option value="">كل الحالات</option><option value="unpaid">لم يدفع</option><option value="partial">دفع جزئي</option><option value="paid">مدفوع</option></select></label>}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
                <span className="text-xs text-slate-600">الفترة: <b dir="ltr">{entryDateFrom || 'بلا بداية'}{entryTimeFrom ? ` ${entryTimeFrom}` : ''}</b> — <b dir="ltr">{entryDateTo || 'بلا نهاية'}{entryTimeTo ? ` ${entryTimeTo}` : ''}</b></span>
                <button onClick={() => { setEntryDateFrom(''); setEntryDateTo(''); setEntryTimeFrom(''); setEntryTimeTo(''); setSelectedPaymentStatus(''); setSearchTerm(''); setDailyPage(1); }} className="rounded-lg px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50">مسح البحث والفلاتر</button>
              </div></div>
            </details>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-black text-slate-800">الحركات ({dashboardMovements.length})</h3>
            {dashboardMovements.length > 0 && <span className="text-xs text-slate-500">عرض {((safeDailyPage - 1) * dailyPageSize) + 1}–{Math.min(safeDailyPage * dailyPageSize, dashboardMovements.length)}</span>}
          </div>
          <div className="space-y-2">
            {dashboardMovements.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">لا توجد حركات مطابقة. غيّر التاريخ أو امسح البحث.</div> : visibleDashboardMovements.map((m)=>{
              const expanded = expandedMovementIds.has(m.id);
              const created = getEntryDateTime(m);
              const statusLabel = m.payment_status === 'paid' ? 'مدفوع' : m.payment_status === 'partial' ? 'مدفوع جزئيًا' : 'لم يدفع';
              return <article key={m.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex min-w-0 items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-sm font-black text-blue-800">{m.seq}</span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-slate-900">{m.customer_name || m.driver_name || 'عميل عام'}</h3><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${m.payment_status==='paid'?'bg-emerald-100 text-emerald-700':m.payment_status==='partial'?'bg-amber-100 text-amber-700':'bg-rose-100 text-rose-700'}`}>{canViewFinancials?statusLabel:'حركة مسجلة'}</span></div><p className="mt-1 truncate text-sm text-slate-600">الشاحنة: {m.truck_no || '—'} <span className="px-1 text-slate-300">|</span> المقطورة: {m.trailer_no || '—'} <span className="px-1 text-slate-300">|</span> الحاوية: {m.container_no || '—'}</p><p className="mt-1 text-xs text-slate-500">السائق: {m.driver_name || '—'} · {created ? created.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : 'وقت غير مسجل'}{m.movement_date ? ` · تاريخ الحركة: ${m.movement_date}` : ''}</p></div></div>
                  <div className="flex flex-wrap items-center gap-2 md:justify-end">{canViewFinancials && <div className="me-2 text-sm"><span className="text-slate-500">المتبقي </span><strong className={Number(m.remaining_amount)>0?'text-rose-700':'text-emerald-700'}>{Number(m.remaining_amount||0).toLocaleString()} ج.م</strong></div>}{canManagePayments && Number(m.remaining_amount)>0 && <button onClick={()=>onOpenPaymentModal?.(m.customer_id)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">تسجيل تحصيل</button>}<button onClick={()=>onEditMovement(m)} className="rounded-lg border border-blue-200 p-2 text-blue-700" title="تعديل"><Edit2 className="h-4 w-4"/></button><button onClick={()=>setExpandedMovementIds((old)=>{const next=new Set(old);expanded?next.delete(m.id):next.add(m.id);return next;})} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">{expanded?'إخفاء التفاصيل':'تفاصيل الحركة'}{expanded?<ChevronUp className="h-4 w-4"/>:<ChevronDown className="h-4 w-4"/>}</button></div>
                </div>
                {expanded && <div className="grid grid-cols-2 gap-px border-t border-slate-200 bg-slate-200 sm:grid-cols-3 lg:grid-cols-5">{[["العميل",m.customer_name],['السائق',m.driver_name],['رقم الشاحنة',m.truck_no],['رقم المقطورة',m.trailer_no],['رقم الحاوية',m.container_no],['رقم الإقرار',m.declaration_no],['الرصيف',m.berth_name],['مسار الحاوية',m.container_path],['وصف الحاوية',m.container_desc],['تاريخ الحركة',m.movement_date],...(canViewFinancials?[["فاتورة الكاشير",`${Number(m.cashier_invoice||0).toLocaleString()} ج.م`],['إيصال الكاشير',m.cashier_receipt_no],['عمولة المنظومة',`${Number(m.system_commission||0).toLocaleString()} ج.م`],['عمولة نافذ',`${Number(m.nafez_commission||0).toLocaleString()} ج.م`],['الإجمالي',`${Number(m.total_amount||0).toLocaleString()} ج.م`],['المدفوع',`${Number(m.paid_amount||0).toLocaleString()} ج.م`],['المتبقي',`${Number(m.remaining_amount||0).toLocaleString()} ج.م`]]:[]),['ملاحظات',m.notes]].map(([label,value])=><div key={label} className="bg-white p-3"><span className="block text-[10px] text-slate-500">{label}</span><strong className="mt-1 block break-words text-xs text-slate-800">{value || '—'}</strong></div>)}</div>}
              </article>;
            })}
          </div>
          {dailyPageCount > 1 && <div className="flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <button onClick={() => setDailyPage((page) => Math.max(1, page - 1))} disabled={safeDailyPage <= 1} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-40">السابق</button>
            <span className="text-xs text-slate-600">صفحة {safeDailyPage} من {dailyPageCount}</span>
            <button onClick={() => setDailyPage((page) => Math.min(dailyPageCount, page + 1))} disabled={safeDailyPage >= dailyPageCount} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-40">التالي</button>
          </div>}
        </section>
      )}

      {/* ===== STAGE 1: تجميع الشيتات وكشف الميناء ===== */}
      {activeStage === 'stage1_manifest' && (
        <div className="space-y-4">
          {/* Stage 1 Header Banner */}
          <div className="bg-gradient-to-r from-rose-700 to-rose-600 text-white rounded-2xl p-5 shadow-md no-print">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <p className="text-rose-200 text-xs mb-1">قبل المحاسبة في الميناء</p>
                <h2 className="text-base font-black">إعداد كشوف الحركات للميناء</h2>
                <p className="text-xs text-rose-100 mt-1 leading-relaxed">
                  كل شيت ترفعه يُحفظ كدفعة مستقلة باسم الملف. يمكنك طباعة الدفعة الحالية وحدها أو طباعة جميع الدفعات السابقة معًا
                  <strong className="text-white"> (بدون عمولات أو مبالغ) </strong>
                  وخذه لتحاسب به في مكتب الكاشير.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  onClick={() => openManifestPrint('selected')}
                  className="bg-white text-rose-700 hover:bg-rose-50 text-xs font-black px-4 py-2.5 rounded-xl shadow transition flex items-center gap-1.5"
                >
                  <FileDown className="w-4 h-4" />
                  <span>طباعة الكشف المحدد</span>
                </button>
                <button onClick={() => openManifestPrint('all')} className="bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-3.5 py-2.5 rounded-xl transition flex items-center gap-1.5 border border-white/30">
                  <Printer className="w-4 h-4"/><span>طباعة جميع الكشوف</span>
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
                  <option value="latest">آخر شيت مرفوع</option><option value="picked">الشيتات المحددة ({selectedManifestBatchIds.length})</option><option value="all">كل الشيتات</option>
                  {importBatches.map((batch)=><option key={batch.id} value={batch.id}>{batch.name} ({batch.count} حركة)</option>)}
                </select>
                <button onClick={()=>openManifestPrint('selected')} disabled={!manifestMovements.length} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Printer className="inline h-3.5 w-3.5 ml-1"/>طباعة المعروض ({manifestMovements.length})</button>
                <button onClick={()=>openManifestPrint('all')} disabled={!filteredMovements.length} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Printer className="inline h-3.5 w-3.5 ml-1"/>طباعة الكل ({filteredMovements.length})</button>
              </div>
            </div>
            {importBatches.length > 0 && <>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {importBatches.map((batch)=>{
                  const isSelectedForView = (selectedManifestBatch==='latest' && batch.id===latestBatchId) || selectedManifestBatch===batch.id;
                  const isCheckedForCombine = selectedManifestBatchIds.includes(batch.id);
                  return <div key={batch.id} className={`flex items-stretch gap-2 rounded-xl border p-3 transition ${isSelectedForView?'border-blue-400 bg-blue-50 ring-1 ring-blue-200':'border-slate-200 bg-slate-50'}`}>
                    <label className="flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-2 text-[11px] font-bold text-slate-700 hover:bg-white" title="اختيار هذا الشيت للتجميع والطباعة">
                      <input type="checkbox" checked={isCheckedForCombine} onChange={()=>toggleManifestBatchSelection(batch.id)} className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500" />
                      ضم
                    </label>
                    <button onClick={()=>setSelectedManifestBatch(batch.id)} className="min-w-0 flex-1 text-right">
                      <span className="block truncate text-xs font-black text-slate-800">{batch.name}</span>
                      <span className="mt-1 flex justify-between gap-2 text-[11px] text-slate-500"><span>{batch.count} حركة</span><span>{Number.isNaN(new Date(batch.at).getTime())?'وقت غير مسجل':new Date(batch.at).toLocaleString('ar-EG')}</span></span>
                    </button>
                  </div>;
                })}
              </div>
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-100 bg-rose-50 p-3">
                <span className="me-auto text-xs font-bold text-slate-700">تم اختيار {selectedManifestBatchIds.length} شيت ({pickedBatchMovements.length} حركة)</span>
                <button onClick={()=>setSelectedManifestBatch('picked')} disabled={!selectedManifestBatchIds.length} className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-bold text-rose-800 disabled:opacity-50">عرض التجميع المحدد</button>
                <button onClick={()=>openManifestPrint('picked')} disabled={!pickedBatchMovements.length} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Printer className="inline h-3.5 w-3.5 ml-1"/>طباعة الشيتات المحددة ({pickedBatchMovements.length})</button>
                <button onClick={downloadPickedBatchesPdf} disabled={!pickedBatchMovements.length || isExportingPickedPdf} className="rounded-lg bg-indigo-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Download className="inline h-3.5 w-3.5 ml-1"/>{isExportingPickedPdf?'جاري تجهيز PDF...':'تنزيل PDF للمحدد'}</button>
                <button onClick={()=>setSelectedManifestBatchIds([])} disabled={!selectedManifestBatchIds.length} className="rounded-lg px-3 py-2 text-xs font-bold text-slate-600 hover:bg-white disabled:opacity-50">إلغاء التحديد</button>
              </div>
            </>}
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
                      <td className="p-2 border border-slate-100 text-center font-bold text-rose-800 bg-slate-50">{i + 1}</td>
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
                  بعد تنزيل الكشف وإنهاء المحاسبة في الميناء، انتقل إلى تسجيل فواتير الكاشير.
                </p>
                <button
                  onClick={() => setActiveStage('stage2_cashier')}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition"
                >
                  <span>الانتقال إلى فواتير الكاشير</span>
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
                <p className="text-emerald-200 text-xs mb-1">بعد المحاسبة في الميناء</p>
                <h2 className="text-base font-black">فواتير الكاشير ومطابقتها</h2>
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
                  تم ربط {filteredMovements.filter(m => m.cashier_receipt_no).length} إيصال. انتقل إلى حسابات العملاء لعرض الملخص.
                </p>
                <button
                  onClick={() => setActiveStage('stage3_clients')}
                  className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition"
                >
                  <span>الانتقال إلى حسابات العملاء</span>
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
                <p className="text-amber-100 text-xs mb-1">ملخص حسابات ومطالبات العملاء</p>
                <h2 className="text-base font-black">حسابات العملاء ومطالباتهم</h2>
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
                                value={discountDrafts[m.id] ?? String(m.discount || 0)}
                                onChange={(e) => setDiscountDrafts((drafts) => ({ ...drafts, [m.id]: e.target.value }))}
                                onBlur={(e) => void handleDiscountChange(m.id, Number(e.target.value))}
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
                <input type="text" placeholder="بحث باسم العميل أو السائق أو رقم الشاحنة والحاوية..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-lg pr-9 pl-3 py-2 text-xs" />
              </div>
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
          movements={manifestPrintScope === 'all' ? filteredMovements : manifestPrintScope === 'picked' ? pickedBatchMovements : manifestMovements}
          title={manifestPrintScope === 'all'
            ? 'شيت تسجيل حجز الشاحنات'
            : manifestPrintScope === 'picked'
            ? `شيت تسجيل حجز الشاحنات — ${selectedManifestBatchIds.length} شيت محدد`
            : `شيت تسجيل حجز الشاحنات — ${importBatches.find((batch) => batch.id === (selectedManifestBatch === 'latest' ? latestBatchId : selectedManifestBatch))?.name || 'الشيت المحدد'}`}
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
