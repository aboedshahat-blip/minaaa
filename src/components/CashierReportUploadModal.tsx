import React, { useState, useRef } from 'react';
import { useConfirmAction } from '../contexts/ConfirmActionContext';
import { Movement, SystemSettings } from '../types';
import type {
  CashierEntryCandidateSet,
  CashierInvoiceEntry,
  CashierMatchResult,
} from '../lib/cashierParser';
import { getMovementService } from '../lib/serviceFees';
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  X,
  RefreshCw,
  ArrowRight,
  Receipt,
  FileCheck,
  Check,
} from 'lucide-react';

interface CashierReportUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  movements: Movement[];
  onBatchUpdateMovements: (updatedMovements: Movement[]) => Promise<boolean>;
  settings: SystemSettings;
}

export const CashierReportUploadModal: React.FC<CashierReportUploadModalProps> = ({
  isOpen,
  onClose,
  movements,
  onBatchUpdateMovements,
  settings,
}) => {
  const confirmAction = useConfirmAction();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const applyCashierMatchesRef = useRef<typeof import('../lib/cashierParser').applyCashierMatches | null>(null);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState('');
  const [parsedEntries, setParsedEntries] = useState<CashierInvoiceEntry[]>([]);
  const [matchResults, setMatchResults] = useState<CashierMatchResult[]>([]);
  const [updatedMovementsList, setUpdatedMovementsList] = useState<Movement[]>([]);
  const [unmatchedCount, setUnmatchedCount] = useState(0);
  const [unmatchedEntries, setUnmatchedEntries] = useState<CashierInvoiceEntry[]>([]);
  const [matchCandidates, setMatchCandidates] = useState<CashierEntryCandidateSet[]>([]);
  const [selectedMovementByReceipt, setSelectedMovementByReceipt] = useState<Record<string, string>>({});
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isImageMode, setIsImageMode] = useState(false);
  const [selectedMovementId, setSelectedMovementId] = useState('');
  const [manualReceiptNo, setManualReceiptNo] = useState('');
  const [manualAmount, setManualAmount] = useState<number | ''>('');
  const [manualCategory, setManualCategory] = useState('وارد حاويات');
  const [imageSearchTerm, setImageSearchTerm] = useState('');

  if (!isOpen) return null;

  const candidateReceiptCountByMovement = new Map<string, number>();
  matchCandidates.forEach(({ candidates, currentMovementId }) => {
    if (currentMovementId) return;
    candidates.filter((candidate) => candidate.routeMatch && candidate.descriptionMatch).forEach(({ movementId }) => {
      candidateReceiptCountByMovement.set(
        movementId,
        (candidateReceiptCountByMovement.get(movementId) || 0) + 1,
      );
    });
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsedEntries([]);
    setMatchResults([]);
    setUpdatedMovementsList([]);
    setUnmatchedCount(0);
    setUnmatchedEntries([]);
    setMatchCandidates([]);
    setSelectedMovementByReceipt({});
    setLoading(true);
    setFileName(file.name);

    const isImg = file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(file.name);

    if (isImg) {
      const url = URL.createObjectURL(file);
      setImagePreviewUrl(url);
      setIsImageMode(true);
      setLoading(false);
      return;
    }

    setIsImageMode(false);
    setImagePreviewUrl(null);

    try {
      // 1. Parse Cashier report
      const { parseUploadedCashierReport, getCashierEntryCandidates, applyCashierMatches } = await import('../lib/cashierParser');
      applyCashierMatchesRef.current = applyCashierMatches;
      const entries = await parseUploadedCashierReport(file);
      setParsedEntries(entries);

      if (entries.length === 0) {
        alert(
          'تمت قراءة الملف لكن لم يتم العثور على فواتير كاشير بالمسلسل المعتمد. يرجى التأكد من أن الملف هو تقرير فواتير الكاشير الصادر من الميناء.'
        );
        return;
      }

      // Suggest only when a receipt has one plausible movement. Repeated vehicle
      // pairs require the user to pick the correct customer before any update.
      const candidates = getCashierEntryCandidates(entries, movements);
      const initialSelections = Object.fromEntries(
        candidates
          .filter((candidateSet) => candidateSet.suggestedMovementId)
          .map((candidateSet) => [candidateSet.entry.receipt_no, candidateSet.suggestedMovementId]),
      );
      const preview = applyCashierMatches(
        entries,
        movements,
        initialSelections,
        settings.default_system_commission ?? 200,
      );
      setMatchCandidates(candidates);
      setSelectedMovementByReceipt(initialSelections);
      setMatchResults(preview.matchResults);
      setUpdatedMovementsList(preview.matchedMovements);
      setUnmatchedCount(preview.unmatchedEntries.length);
      setUnmatchedEntries(preview.unmatchedEntries);
    } catch (err: any) {
      console.error(err);
      alert(`خطأ أثناء قراءة تقرير الكاشير: ${err.message || 'يرجى مراجعة الملف وصيغته'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCandidateChange = (receiptNo: string, movementId: string) => {
    const apply = applyCashierMatchesRef.current;
    if (!apply) return;
    const nextSelections = { ...selectedMovementByReceipt, [receiptNo]: movementId };
    if (!movementId) delete nextSelections[receiptNo];
    const preview = apply(
      parsedEntries,
      movements,
      nextSelections,
      settings.default_system_commission ?? 200,
    );
    setSelectedMovementByReceipt(nextSelections);
    setMatchResults(preview.matchResults);
    setUpdatedMovementsList(preview.matchedMovements);
    setUnmatchedCount(preview.unmatchedEntries.length);
    setUnmatchedEntries(preview.unmatchedEntries);
  };

  const handleLinkFromImage = async () => {
    if (!selectedMovementId) {
      alert('يرجى اختيار الشاحنة / الحركة المراد ربط الفاتورة بها');
      return;
    }
    if (!manualAmount || Number(manualAmount) <= 0) {
      alert('يرجى إدخال مبلغ فاتورة الكاشير');
      return;
    }

    const selectedMovement = movements.find((movement) => movement.id === selectedMovementId);
    const invoiceService = getMovementService(manualCategory);
    const routeMatches = Boolean(invoiceService && getMovementService(undefined, selectedMovement?.container_path) === invoiceService);
    const descriptionMatches = Boolean(invoiceService && getMovementService(undefined, selectedMovement?.container_desc) === invoiceService);
    const sysComm = selectedMovement?.system_commission ?? settings.default_system_commission ?? 200;
    const nafezComm = selectedMovement?.nafez_commission ?? settings.default_nafez_commission ?? 0;
    const cashierVal = Number(manualAmount);
    const newTotal = cashierVal + sysComm + nafezComm;

    const updated = movements.map((m) => {
      if (m.id === selectedMovementId) {
        // Linking a cashier invoice marks that invoice amount as paid; system
        // and Nafez commissions remain outstanding until separately collected.
        const customerPaid = m.customer_paid_amount !== undefined
          ? Number(m.customer_paid_amount) || 0
          : Math.max(0, (Number(m.paid_amount) || 0) - (Number(m.cashier_invoice) || 0));
        const paid = customerPaid;
        return {
          ...m,
          cashier_receipt_no: manualReceiptNo || m.cashier_receipt_no,
          cashier_invoice: cashierVal,
          paid_amount: paid,
          customer_paid_amount: customerPaid,
          booking_category: manualCategory || m.booking_category,
          system_commission: m.system_commission ?? sysComm,
          nafez_commission: m.nafez_commission ?? nafezComm,
          total_amount: newTotal,
          remaining_amount: Math.max(0, newTotal - paid),
          payment_status: paid >= newTotal && newTotal > 0 ? ('paid' as const) : paid > 0 ? ('partial' as const) : ('unpaid' as const),
        };
      }
      return m;
    });

    const classificationWarning = routeMatches && descriptionMatches
      ? ''
      : 'تنبيه: تصنيف الفاتورة لا يطابق مسار الحاوية أو وصفها في الحركة، أو أن إحدى الخانتين غير محددة. ';
    if (!await confirmAction(`${classificationWarning}هل تريد ربط الفاتورة بالحركة التي اخترتها يدويًا؟ المبلغ: ${cashierVal.toLocaleString()} ج.م`, 'نعم، اربطها')) return;
    const synced = await onBatchUpdateMovements(updated);
    alert(synced
      ? 'تم ربط فاتورة الكاشير وحفظ التحديث في قاعدة البيانات.'
      : 'تم حفظ الربط على هذا الجهاز، لكن المزامنة السحابية لم تكتمل بعد. لا تعِد ربط الإيصال؛ ستُعاد المحاولة تلقائيًا.');
    setManualReceiptNo('');
    setManualAmount('');
    setSelectedMovementId('');
  };

  const handleApplyUpdates = async () => {
    if (matchResults.length === 0) {
      alert('اختر حركة واحدة على الأقل لربط الفاتورة بها');
      return;
    }

    const receiptCountByMovement = new Map<string, number>();
    Object.values(selectedMovementByReceipt).filter(Boolean).forEach((movementId) => {
      receiptCountByMovement.set(movementId, (receiptCountByMovement.get(movementId) || 0) + 1);
    });
    const multipleReceiptGroups = Array.from(receiptCountByMovement.entries()).filter(([, count]) => count > 1);
    if (multipleReceiptGroups.length > 0) {
      const descriptions = multipleReceiptGroups.map(([movementId, count]) => {
        const movement = movements.find(({ id }) => id === movementId);
        return `${movement?.customer_name || 'عميل غير محدد'} — الحركة ${movement?.seq ?? ''}: ${count} إيصالات`;
      }).join('\n');
      if (!await confirmAction(`تم اختيار أكثر من إيصال للحركة نفسها، وسيتم جمع مبالغها عليها:\n${descriptions}\nهل راجعت أرقام الإيصالات وتريد ربطها كلها؟`, 'نعم، اربط الإيصالات كلها')) return;
    }

    const manualClassificationOverrides = Object.entries(selectedMovementByReceipt).filter(([receiptNo, movementId]) => {
      if (!movementId) return false;
      const candidateSet = matchCandidates.find((item) => item.entry.receipt_no === receiptNo);
      const candidate = candidateSet?.candidates.find((item) => item.movementId === movementId);
      return Boolean(candidate && (!candidate.routeMatch || !candidate.descriptionMatch));
    }).length;
    if (manualClassificationOverrides > 0 && !await confirmAction(
      `تم اختيار ${manualClassificationOverrides} إيصال يدويًا رغم اختلاف أو نقص مسار الحاوية أو وصفها عن تصنيف الفاتورة. راجع الحركات المختارة جيدًا لتجنب ربط فاتورة بالحركة الخطأ. هل تريد المتابعة؟`,
      'نعم، راجعت وأريد المتابعة',
    )) return;

    if (!await confirmAction(`سيتم تحديث ${matchResults.length} حركة وربط ${Object.values(selectedMovementByReceipt).filter(Boolean).length} إيصال بالحركات والعملاء المحددين، بعد مطابقة اللوحات وتصنيف الفاتورة مع مسار الحاوية ووصفها. الإيصالات غير المختارة ستظل بدون ربط. هل تريد المتابعة؟`, 'نعم، احفظ الربط المحدد')) return;
    const synced = await onBatchUpdateMovements(updatedMovementsList);
    alert(synced
      ? `تم حفظ الربط الذي اخترته ومزامنة ${matchResults.length} حركة. يمكنك إعادة رفع التقرير وتغيير الحركة إذا احتجت تصحيح الربط.`
      : `تم حفظ الربط على هذا الجهاز، لكن المزامنة السحابية لم تكتمل بعد. لا تعِد رفع الإيصالات؛ ستُعاد المحاولة تلقائيًا.`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-l from-indigo-950 to-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg shadow-sm">
              <Receipt className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">
                رفع تقرير فواتير الكاشير وتحديث الشحنات وحسابات العملاء آلياً
              </h2>
              <p className="text-xs text-indigo-200">
                ارفع تقرير الكاشير المستلم من الميناء (PDF / Word / Excel) وسيقوم السيستم بمطابقة الشاحنات وتعبئة أرقام ومبالغ الفواتير تلقائياً
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Upload Dropzone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-indigo-300 hover:border-indigo-500 bg-indigo-50/40 hover:bg-indigo-50/70 rounded-2xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center gap-3"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf, .xlsx, .xls, .docx, .doc, .csv, .png, .jpg, .jpeg, .webp, image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
            <div className="bg-white p-3.5 rounded-full shadow-md text-indigo-600">
              {loading ? (
                <RefreshCw className="w-7 h-7 animate-spin" />
              ) : (
                <Upload className="w-7 h-7" />
              )}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">
                {loading
                  ? 'جاري قراءة تقرير الكاشير واستخراج الفواتير ومطابقة الشاحنات...'
                  : fileName
                  ? `تم اختيار الملف: ${fileName}`
                  : 'اضغط هنا لرفع تقرير فواتير الكاشير (PDF أو Excel أو Word أو صورة) أو اسحب الملف هنا'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                يدعم ملفات PDF وExcel وWord، وصور فواتير الكاشير (.png, .jpg) الصادرة من موانئ السخنة والإسكندرية وبورسعيد
              </p>
            </div>
          </div>

          {/* Image Mode UI if User Uploaded an Image */}
          {isImageMode && imagePreviewUrl && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <span className="bg-indigo-600 text-white text-xs font-bold px-2.5 py-1 rounded-md">
                    وضع ربط فاتورة من صورة 📷
                  </span>
                  <span className="text-xs text-slate-600 font-semibold">
                    معاينة الصورة وتحديد الشاحنة لتسجيل رقم ومبلغ الكاشير
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsImageMode(false);
                    setImagePreviewUrl(null);
                    setFileName('');
                  }}
                  className="text-xs text-rose-600 hover:text-rose-800 font-bold"
                >
                  إلغاء الصورة وتغيير الملف
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Image Preview Box */}
                <div className="border border-slate-300 rounded-xl overflow-hidden bg-black/5 flex flex-col items-center justify-center p-2 max-h-96">
                  <img
                    src={imagePreviewUrl}
                    alt="فاتورة الكاشير المرفوعة"
                    className="max-h-80 w-auto object-contain rounded shadow"
                  />
                  <span className="text-[11px] text-slate-500 mt-2">
                    {fileName} (معاينة صورة الفاتورة)
                  </span>
                </div>

                {/* Form to link to movement */}
                <div className="space-y-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Receipt className="w-4 h-4 text-emerald-600" />
                    <span>بيانات الفاتورة وتحديد الشاحنة / السائق:</span>
                  </h4>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      ابحث بالعميل أو السائق أو رقم الحاوية أو وصفها أو تاريخ الحركة:
                    </label>
                    <input
                      type="text"
                      value={imageSearchTerm}
                      onChange={(e) => setImageSearchTerm(e.target.value)}
                      placeholder="ابحث هنا لفلترة الشاحنات..."
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      اختر الشاحنة / الحركة المراد ربطها: *
                    </label>
                    <select
                      value={selectedMovementId}
                      onChange={(e) => {
                        const mId = e.target.value;
                        setSelectedMovementId(mId);
                        const found = movements.find((m) => m.id === mId);
                        if (found) {
                          if (found.cashier_receipt_no) setManualReceiptNo(found.cashier_receipt_no);
                          if (found.cashier_invoice) setManualAmount(found.cashier_invoice);
                        }
                      }}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-900"
                    >
                      <option value="">-- اضغط لاختيار الشاحنة --</option>
                      {movements
                        .filter((m) => {
                          if (!imageSearchTerm) return true;
                          const t = imageSearchTerm.toLowerCase();
                          return (
                            m.truck_no?.toLowerCase().includes(t) ||
                            m.trailer_no?.toLowerCase().includes(t) ||
                            m.driver_name?.toLowerCase().includes(t) ||
                            m.container_no?.toLowerCase().includes(t) ||
                            m.container_desc?.toLowerCase().includes(t) ||
                            m.container_path?.toLowerCase().includes(t) ||
                            m.customer_name?.toLowerCase().includes(t) ||
                            m.movement_date?.toLowerCase().includes(t)
                          );
                        })
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            [{m.seq}] {m.movement_date || 'بدون تاريخ'} | عميل: {m.customer_name || '-'} | سائق: {m.driver_name || '-'} | شاحنة: {m.truck_no} | حاوية: {m.container_no || '-'} | وصف: {m.container_desc || '-'} | مسار: {m.container_path || '-'}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        مسلسل فاتورة الكاشير:
                      </label>
                      <input
                        type="text"
                        value={manualReceiptNo}
                        onChange={(e) => setManualReceiptNo(e.target.value)}
                        placeholder="e.g. 0039-03-1/01-261020"
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-bold"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        مبلغ فاتورة الكاشير (ج.م): *
                      </label>
                      <input
                        type="number"
                        step="0.05"
                        value={manualAmount}
                        onChange={(e) => setManualAmount(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="e.g. 242.15"
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-black text-indigo-700 font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      تصنيف الحجز:
                    </label>
                    <select
                      value={manualCategory}
                      onChange={(e) => setManualCategory(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold"
                    >
                      <option value="وارد حاويات">وارد حاويات</option>
                      <option value="صادر حاويات">صادر حاويات</option>
                      <option value="تعتيق حاوية فارغة">تعتيق حاوية فارغة</option>
                      <option value="استلام حاوية فارغة">استلام حاوية فارغة</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={handleLinkFromImage}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl shadow transition flex items-center justify-center gap-2 text-xs mt-2"
                  >
                    <Check className="w-4 h-4" />
                    <span>حفظ وربط الفاتورة بهذه الشاحنة والعميل فوراً</span>
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* Results Analysis */}
          {parsedEntries.length > 0 && (
            <div className="space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <span className="text-[11px] text-slate-500 block font-semibold">
                    إجمالي الفواتير بالتقرير
                  </span>
                  <span className="text-xl font-black text-slate-800">
                    {parsedEntries.length} فاتورة
                  </span>
                </div>

                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                  <span className="text-[11px] text-emerald-700 block font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>تمت مطابقتها مع شحنات السيستم</span>
                  </span>
                  <span className="text-xl font-black text-emerald-800">
                    {matchResults.length} شحنة جاهزة للتحديث
                  </span>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <span className="text-[11px] text-amber-700 block font-semibold">
                    إيصالات لم تتم مطابقتها تلقائياً
                  </span>
                  <span className="text-xl font-black text-amber-800">
                    {unmatchedCount} فاتورة
                  </span>
                </div>
              </div>

              {matchCandidates.some((candidateSet) => candidateSet.candidates.length > 0) && (
                <div className="border border-indigo-200 rounded-xl overflow-hidden shadow-sm">
                  <div className="bg-indigo-50 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-black text-indigo-950">تأكيد العميل والحركة لكل إيصال</h3>
                      <p className="mt-1 text-[11px] text-indigo-800">الاقتراح التلقائي يشترط تطابق اللوحات وتصنيف الفاتورة مع مسار الحاوية ووصفها. أي اختلاف أو نقص يظهر للمراجعة اليدوية قبل الحفظ.</p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-indigo-800 border border-indigo-200">
                      {Object.values(selectedMovementByReceipt).filter(Boolean).length} إيصال محدد
                    </span>
                  </div>
                  <div className="overflow-x-auto max-h-72">
                    <table className="w-full text-xs text-right border-collapse">
                      <thead className="bg-slate-100 text-slate-700 sticky top-0 font-bold border-b border-slate-200">
                        <tr>
                          <th className="p-2">إيصال الكاشير</th>
                          <th className="p-2 text-center">أرقام المركبات</th>
                          <th className="p-2 text-center">تصنيف الفاتورة</th>
                          <th className="p-2 text-center">المبلغ</th>
                          <th className="p-2 min-w-80">اختر العميل والحركة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {matchCandidates.filter((candidateSet) => candidateSet.candidates.length > 0).map((candidateSet) => {
                          const { entry, candidates, currentMovementId } = candidateSet;
                          const selectedId = selectedMovementByReceipt[entry.receipt_no] || '';
                          const isReassigning = Boolean(currentMovementId && selectedId && currentMovementId !== selectedId);
                          return (
                            <tr key={entry.receipt_no} className="align-top hover:bg-slate-50">
                              <td className="p-2 font-mono font-bold text-slate-800 whitespace-nowrap">{entry.receipt_no}</td>
                              <td className="p-2 text-center font-mono font-bold text-indigo-800 whitespace-nowrap">
                                {[
                                  [entry.truck_letters, entry.truck_digits].filter(Boolean).join(' '),
                                  [entry.trailer_letters, entry.trailer_digits].filter(Boolean).join(' '),
                                ].filter(Boolean).join(' / ') || 'غير مقروء'}
                              </td>
                              <td className="p-2 text-center font-semibold text-slate-700 whitespace-nowrap">{entry.booking_category || 'غير مقروء'}</td>
                              <td className="p-2 text-center font-mono font-black whitespace-nowrap">{entry.amount.toLocaleString()} ج.م</td>
                              <td className="p-2">
                                <select
                                  value={selectedId}
                                  onChange={(event) => handleCandidateChange(entry.receipt_no, event.target.value)}
                                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
                                  aria-label={`اختيار العميل لإيصال ${entry.receipt_no}`}
                                >
                                  <option value="">اترك الإيصال بدون ربط</option>
                                  {candidates.map((candidate) => (
                                    <option key={candidate.movementId} value={candidate.movementId}>
                                      {candidate.customerName} — حركة {candidate.movementSeq} — {candidate.movementDate || 'بدون تاريخ'} — شاحنة {candidate.truckNo || '—'} / مقطورة {candidate.trailerNo || '—'} — حاوية {candidate.containerNo || '—'} — مسار {candidate.containerPath || 'غير محدد'} — وصف {candidate.containerDesc || 'غير محدد'} — {candidate.routeMatch && candidate.descriptionMatch ? 'مطابق للتصنيف' : 'مراجعة المسار/الوصف'}{candidate.isCurrentOwner ? ' — الربط الحالي' : ''}
                                    </option>
                                  ))}
                                </select>
                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
                                  {candidates.length > 1 && <span className="font-bold text-amber-700">أكثر من حركة بنفس المركبة؛ راجع العميل قبل الحفظ.</span>}
                                  {isReassigning && <span className="font-bold text-rose-700">سيُنقل الإيصال من العميل المرتبط حاليًا إلى الاختيار الجديد.</span>}
                                  {selectedId && (() => { const chosen = candidates.find((candidate) => candidate.movementId === selectedId); return chosen && (!chosen.routeMatch || !chosen.descriptionMatch) ? <span className="font-bold text-rose-700">اللوحات متطابقة لكن مسار الحاوية أو وصفها لا يطابق تصنيف الفاتورة. هذا اختيار يدوي ويحتاج تأكيدًا إضافيًا.</span> : null; })()}
                                  {candidates.length === 1 && !currentMovementId && candidates[0].routeMatch && candidates[0].descriptionMatch && (candidateReceiptCountByMovement.get(candidates[0].movementId) || 0) > 1 && <span className="font-bold text-amber-700">التصنيف مطابق، لكن عدة إيصالات مرشحة لنفس الحركة؛ راجع رقم الإيصال.</span>}
                                  {candidates.length === 1 && !currentMovementId && candidates[0].routeMatch && candidates[0].descriptionMatch && (candidateReceiptCountByMovement.get(candidates[0].movementId) || 0) === 1 && <span className="text-emerald-700">تطابقت اللوحات ومسار الحاوية ووصفها؛ الاقتراح جاهز للمراجعة.</span>}
                                  {candidates.length > 0 && !candidates.some((candidate) => candidate.routeMatch && candidate.descriptionMatch) && <span className="font-bold text-rose-700">لم يوجد تطابق في المسار والوصف؛ لم يتم الربط تلقائيًا.</span>}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Matched Details Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="bg-slate-900 text-white px-4 py-2.5 flex items-center justify-between">
                  <span className="text-xs font-bold flex items-center gap-1.5">
                    <FileCheck className="w-4 h-4 text-emerald-400" />
                    <span>
                      معاينة الشحنات التي سيتم تحديث فاتورة الكاشير الخاصة بها ({matchResults.length})
                    </span>
                  </span>
                  <span className="text-[11px] text-slate-300">
                    سيتم ملء خانة الكاشير وإعادة حساب إجمالي ومستحقات العميل
                  </span>
                </div>

                <div className="overflow-x-auto max-h-72">
                  <table className="w-full text-xs text-right border-collapse">
                    <thead className="bg-slate-100 text-slate-700 sticky top-0 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-2 text-center w-8">م</th>
                        <th className="p-2">رقم الشاحنة</th>
                        <th className="p-2">اسم السائق (العميل)</th>
                        <th className="p-2">رقم الحاوية</th>
                        <th className="p-2">وصف الحاوية</th>
                        <th className="p-2">مسار الحاوية</th>
                        <th className="p-2 text-center">مسلسل فاتورة الكاشير</th>
                        <th className="p-2 text-center">تصنيف الحجز</th>
                        <th className="p-2 text-center font-bold text-indigo-900">مبلغ الكاشير</th>
                        <th className="p-2 text-center font-bold text-slate-900">الإجمالي بعد العمولة</th>
                        <th className="p-2 text-center font-bold text-emerald-800">المدفوع</th>
                        <th className="p-2 text-center font-bold text-rose-800">المتبقي</th>
                        <th className="p-2 text-center">الحالة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {matchResults.map((item, idx) => (
                        <tr key={item.movementId} className="hover:bg-slate-50">
                          <td className="p-2 text-center font-bold text-slate-500 bg-slate-50">
                            {idx + 1}
                          </td>
                          <td className="p-2 font-bold text-slate-900 font-mono">
                            {item.truckNo}
                          </td>
                          <td className="p-2 font-semibold text-slate-800">
                            {item.driverName}
                          </td>
                          <td className="p-2 font-mono text-blue-800 font-bold">
                            {item.containerNo || '-'}
                          </td>
                          <td className="p-2 text-slate-700">{item.containerDesc || '-'}</td>
                          <td className="p-2 text-slate-700">{item.containerPath || '-'}</td>
                          <td className="p-2 text-center font-mono font-bold text-indigo-700">
                            <span className="bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded text-[11px]">
                              {item.cashierReceiptNo}
                            </span>
                          </td>
                          <td className="p-2 text-center text-slate-600">
                            {item.bookingCategory || 'وارد'}
                          </td>
                          <td className="p-2 text-center font-mono font-black text-indigo-900">
                            {item.newCashierInvoice.toLocaleString()} ج.م
                          </td>
                          <td className="p-2 text-center font-mono font-black text-slate-900 bg-blue-50/40">
                            {item.totalAmount.toLocaleString()} ج.م
                          </td>
                          <td className="p-2 text-center font-mono font-black text-emerald-800 bg-emerald-50/50">
                            {item.paidAmount.toLocaleString()} ج.م
                          </td>
                          <td className="p-2 text-center font-mono font-black text-rose-800 bg-rose-50/50">
                            {item.remainingAmount.toLocaleString()} ج.م
                          </td>
                          <td className="p-2 text-center">
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                              جاهز للتحديث ✓
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {unmatchedEntries.length > 0 && (
                <div className="border border-amber-200 rounded-xl overflow-hidden">
                  <div className="bg-amber-50 px-4 py-3 text-xs font-bold text-amber-900">
                    إيصالات لم يتم ربطها تلقائياً ({unmatchedEntries.length}) — لم نربطها بحركة بالتخمين
                  </div>
                  <div className="overflow-x-auto max-h-52">
                    <table className="w-full text-xs text-right">
                      <thead className="bg-amber-50/60 text-amber-900 sticky top-0">
                        <tr>
                          <th className="p-2">مسلسل الإيصال</th>
                          <th className="p-2">الحروف والأرقام المقروءة</th>
                          <th className="p-2 text-center">المبلغ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-amber-100 bg-white">
                        {unmatchedEntries.map((entry) => (
                          <tr key={entry.receipt_no}>
                            <td className="p-2 font-mono font-bold">{entry.receipt_no}</td>
                            <td className="p-2 font-mono">{[
                              [entry.truck_letters, entry.truck_digits].filter(Boolean).join(' '),
                              [entry.trailer_letters, entry.trailer_digits].filter(Boolean).join(' '),
                            ].filter(Boolean).join(' / ') || 'لم تُقرأ لوحة'}</td>
                            <td className="p-2 text-center font-bold">{entry.amount.toLocaleString()} ج.م</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {matchResults.length > 0 && (
              <span>
                سيتم حفظ التحديثات في قاعدة البيانات ومزامنتها على الفور مع أرصدة العملاء والديون.
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100 transition"
            >
              إلغاء
            </button>
            <button
              type="button"
              disabled={matchResults.length === 0}
              onClick={handleApplyUpdates}
              className="px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-md hover:shadow-lg transition flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>
                اعتماد وتحديث ({matchResults.length}) حركة تلقائياً في السيستم
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
