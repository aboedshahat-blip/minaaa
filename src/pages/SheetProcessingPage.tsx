import React, { useState, useRef, useMemo } from 'react';
import { Berth, Customer, Movement, SystemSettings } from '../types';
import { parseUploadedSheet, exportTemplateToExcel, downloadEmptyTemplate } from '../lib/excelUtils';
import { useAuth } from '../contexts/AuthContext';
import { OfficialSheetPrintModal } from '../components/OfficialSheetPrintModal';
import { normalizeCustomerName, summarizeImportedCustomers } from '../lib/customerName';
import {
  FileSpreadsheet,
  Upload,
  Download,
  CheckCircle2,
  Trash2,
  Check,
  Eye,
  Plus,
  Printer,
  RefreshCw,
  FileDown,
} from 'lucide-react';

interface SheetProcessingPageProps {
  customers: Customer[];
  berths: Berth[];
  settings: SystemSettings;
  currentMaxSeq: number;
  onImportMovements: (movements: Movement[], newCustomers?: Customer[]) => void;
}

export const SheetProcessingPage: React.FC<SheetProcessingPageProps> = ({
  customers,
  berths,
  settings,
  currentMaxSeq,
  onImportMovements,
}) => {
  const { canViewFinancials } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState('');
  const [fileType, setFileType] = useState<'excel' | 'word' | 'pdf' | ''>('');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Partial<Movement>[]>([]);
  const [selectedBerthId, setSelectedBerthId] = useState<string>(berths[0]?.id || '');
  const [defaultCashier, setDefaultCashier] = useState<number>(0);
  const [applyCommission, setApplyCommission] = useState(true);
  const [isOfficialSheetModalOpen, setIsOfficialSheetModalOpen] = useState(false);
  const customerMatchSummary = useMemo(
    () => summarizeImportedCustomers(rows, customers),
    [rows, customers],
  );

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setFileName(file.name);
    try {
      const res = await parseUploadedSheet(file);
      setRows(res.rows);
      if (res.needsDriverReview) {
        alert('تمت قراءة الملف. راجع أسماء السائقين في الجدول قبل إضافتها، لأن وضوح النص في ملف PDF قد يؤثر على القراءة.');
      }
      if (res.fileType) {
        setFileType(res.fileType as any);
      }
      if (res.rows.length === 0) {
        alert('تمت قراءة الملف لكن لم يتم العثور على أسطر بيانات قابلة للتفريغ. يرجى مراجعة محتوى الملف.');
      }
    } catch (err: any) {
      console.error(err);
      alert(`خطأ أثناء قراءة وتفريغ الملف: ${err.message || 'يرجى التأكد من أن الملف سليم بصيغة Excel أو Word أو PDF'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRowCell = (index: number, field: keyof Movement, value: any) => {
    const updated = [...rows];
    updated[index] = { ...updated[index], [field]: value };
    setRows(updated);
  };

  const handleRemoveRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index));
  };

  const handleSaveToSystem = () => {
    if (rows.length === 0) {
      alert('لا توجد بيانات للاستيراد');
      return;
    }

    const targetBerth = berths.find((b) => b.id === selectedBerthId);

    const now = new Date().toISOString().split('T')[0];
    const defaultSysComm = settings.default_system_commission ?? 200;
    const defaultNafezComm = settings.default_nafez_commission ?? 0;

    let seqCounter = currentMaxSeq;
    const newCustomersMap = new Map<string, Customer>();
    let customerSeq = customers.length;

    const finalizedMovements: Movement[] = rows.map((r) => {
      seqCounter += 1;
      const cashier = r.cashier_invoice || defaultCashier || 0;
      // Smart Driver = Customer mapping
      const cleanDriver = (r.driver_name || '').trim();
      let rowCustomer: Customer | undefined;

      const normalizedDriver = normalizeCustomerName(cleanDriver);
      if (normalizedDriver) {
        const existing = customers.find((c) => normalizeCustomerName(c.name) === normalizedDriver) ||
          newCustomersMap.get(normalizedDriver);

        if (existing) {
          rowCustomer = existing;
        } else {
          customerSeq += 1;
          const newCust: Customer = {
            id: `c-drv-${Date.now()}-${customerSeq}`,
            code: `DRV-${customerSeq}`,
            name: cleanDriver,
            phone: '',
            trucks: [
              {
                truck_no: r.truck_no || '',
                trailer_no: r.trailer_no || '',
                driver_name: cleanDriver,
              },
            ],
            created_at: new Date().toISOString(),
            notes: 'تم إنشاؤه تلقائياً كعميل/سائق من كشف الحركات',
            system_commission: defaultSysComm,
            nafez_commission: defaultNafezComm,
          };
          newCustomersMap.set(normalizedDriver, newCust);
          rowCustomer = newCust;
        }
      }

      const systemCommission = applyCommission
        ? (rowCustomer?.system_commission ?? defaultSysComm)
        : 0;
      const nafezCommission = applyCommission
        ? (rowCustomer?.nafez_commission ?? defaultNafezComm)
        : 0;
      const total = cashier + systemCommission + nafezCommission;

      return {
        id: `m-imp-${Date.now()}-${seqCounter}`,
        seq: seqCounter,
        movement_date: r.movement_date || now,
        berth_id: targetBerth?.id || berths[0]?.id || '',
        berth_name: targetBerth?.name || berths[0]?.name || 'رصيف 1',
        customer_id: rowCustomer?.id || '',
        customer_code: rowCustomer?.code || '',
        customer_name: rowCustomer?.name || cleanDriver || 'عميل عام',
        truck_no: r.truck_no || 'غير محدد',
        truck_weight: r.truck_weight ?? 7.5,
        truck_axles: r.truck_axles ?? 20,
        trailer_no: r.trailer_no || '',
        trailer_weight: r.trailer_weight ?? 11.5,
        trailer_axles: r.trailer_axles ?? 30,
        driver_name: cleanDriver || '',
        declaration_no: r.declaration_no || '',
        container_no: r.container_no || '',
        container_desc: r.container_desc || '',
        container_path: r.container_path || '',
        cashier_invoice: cashier,
        system_commission: systemCommission,
        nafez_commission: nafezCommission,
        total_amount: total,
        payment_status: 'unpaid',
        paid_amount: 0,
        remaining_amount: total,
        created_at: new Date().toISOString(),
        notes: `مستورد ومصفى من ملف: ${fileName}`,
      };
    });

    const newCustomersList = Array.from(newCustomersMap.values());
    onImportMovements(finalizedMovements, newCustomersList);

    const custMsg = newCustomersList.length > 0 ? ` وتم تكويد ${newCustomersList.length} عميل (سائق) جديد تلقائياً` : '';
    alert(`تم بنجاح إضافة وتصفية ${finalizedMovements.length} حركة شاحنة وحفظها في المنظومة!${custMsg}`);
    setRows([]);
    setFileName('');
  };

  const previewMovements: Movement[] = useMemo(() => {
    const targetBerth = berths.find((b) => b.id === selectedBerthId);
    return rows.map((r, i) => ({
      ...r,
      id: `temp-${i}`,
      seq: i + 1,
      movement_date: r.movement_date || new Date().toISOString().split('T')[0],
      berth_id: targetBerth?.id || '',
      berth_name: targetBerth?.name || 'رصيف الميناء',
      customer_name: r.driver_name || '',
      truck_no: r.truck_no || '',
      truck_weight: r.truck_weight ?? 7.5,
      truck_axles: r.truck_axles ?? 20,
      trailer_no: r.trailer_no || '',
      trailer_weight: r.trailer_weight ?? 11.5,
      trailer_axles: r.trailer_axles ?? 30,
      driver_name: r.driver_name || '',
      declaration_no: r.declaration_no || '',
      container_no: r.container_no || '',
      container_desc: r.container_desc || '',
      container_path: r.container_path || '',
      cashier_invoice: 0,
      system_commission: 0,
      nafez_commission: 0,
      total_amount: 0,
      payment_status: 'unpaid',
      paid_amount: 0,
      remaining_amount: 0,
      created_at: '',
    }));
  }, [rows, selectedBerthId, berths]);

  const handleExportProcessedPdf = async () => {
    if (rows.length === 0) return;
    setIsOfficialSheetModalOpen(true);
  };

  const handleExportProcessedSheet = () => {
    if (rows.length === 0) return;
    const tempMovements: Movement[] = rows.map((r, i) => ({
      ...r,
      id: `temp-${i}`,
      seq: i + 1,
      movement_date: new Date().toISOString().split('T')[0],
      berth_name: '',
      customer_name: '',
      truck_no: r.truck_no || '',
      truck_weight: r.truck_weight ?? 7.5,
      truck_axles: r.truck_axles ?? 20,
      trailer_no: r.trailer_no || '',
      trailer_weight: r.trailer_weight ?? 11.5,
      trailer_axles: r.trailer_axles ?? 30,
      driver_name: r.driver_name || '',
      declaration_no: r.declaration_no || '',
      container_no: r.container_no || '',
      container_desc: r.container_desc || '',
      container_path: r.container_path || '',
      cashier_invoice: 0,
      system_commission: 200,
      nafez_commission: 0,
      total_amount: 200,
      payment_status: 'unpaid',
      paid_amount: 0,
      remaining_amount: 200,
      created_at: '',
    }));
    exportTemplateToExcel(tempMovements, `الاسطمبة_المصفاة_${fileName || 'بيانات'}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
              <span>معالج وتفريغ المستندات والشيتات (Excel / Word / PDF)</span>
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              ارفع أي ملف إكسيل، مستند وورد (Word .docx)، أو ملف بي دي إف (PDF) وسيقوم السيستم بتفريغ البيانات آلياً في الاسطمبة الرسمية
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadEmptyTemplate(100)}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3.5 py-2 rounded-lg transition flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>تحميل الاسطمبة الفارغة الرسمية (100 صف)</span>
            </button>
          </div>
        </div>

        {/* Format Badges */}
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold text-slate-700">الصيغ المدعومة للتفريغ:</span>
          <span className="bg-emerald-100 text-emerald-800 font-bold px-2.5 py-1 rounded-md border border-emerald-300">
            📊 Excel (.xlsx, .xls, .csv)
          </span>
          <span className="bg-blue-100 text-blue-800 font-bold px-2.5 py-1 rounded-md border border-blue-300">
            📄 Word (.docx, .doc)
          </span>
          <span className="bg-rose-100 text-rose-800 font-bold px-2.5 py-1 rounded-md border border-rose-300">
            📑 PDF (.pdf)
          </span>
        </div>

        {/* Upload Zone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className="mt-4 border-2 border-dashed border-emerald-300 hover:border-emerald-500 bg-emerald-50/40 hover:bg-emerald-50/70 rounded-2xl p-8 text-center cursor-pointer transition flex flex-col items-center justify-center gap-3"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx, .xls, .csv, .docx, .doc, .pdf"
            onChange={handleFileUpload}
            className="hidden"
          />
          <div className="bg-white p-4 rounded-full shadow-md text-emerald-600">
            {loading ? <RefreshCw className="w-8 h-8 animate-spin" /> : <Upload className="w-8 h-8" />}
          </div>
          <div>
            <p className="text-base font-bold text-slate-800">
              {loading
                ? 'جاري قراءة وتفريغ محتويات الملف واستخلاص الاسطمبة...'
                : fileName
                ? `الملف المختار: ${fileName} ${fileType ? `(${fileType.toUpperCase()})` : ''}`
                : 'اضغط هنا لرفع الملف (Excel أو Word أو PDF) أو اسحب الملف وأفلته هنا'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              يتعرف البرنامج تلقائياً على جداول الوورد، ملفات PDF، وكشوف الإكسيل، ويطابق أرقام الشاحنات، المقطورات، الحاويات، السائقين، والإقرارات
            </p>
          </div>
        </div>
      </div>

      {/* Processed Results */}
      {rows.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>البيانات بعد التصفية والتجهيز ({rows.length} حركة شاحنة مستخلصة)</span>
              </h2>
              <p className="text-xs text-slate-500">
                يمكنك مراجعة وتعديل أي خانة قبل الحفظ أو تصديرها فوراً
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setIsOfficialSheetModalOpen(true)}
                className="bg-rose-700 hover:bg-rose-800 text-white text-xs font-black px-4 py-2.5 rounded-xl shadow-md transition flex items-center gap-2 border border-rose-600/30"
                title="معاينة وطباعة وتنزيل الكشف المجمع الرسمي لتقديمه للمكتب والمحاسبة (خالٍ تماماً من أي عمولات أو خدمات أو مبالغ)"
              >
                <Printer className="w-4 h-4" />
                <span>1️⃣ معاينة وطباعة / تنزيل كشف المكتب (بدون عمولات)</span>
              </button>

              <button
                onClick={handleExportProcessedSheet}
                className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-3.5 py-2 rounded-lg shadow-sm transition flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>تصدير إلى Excel بالاسطمبة</span>
              </button>

              <button
                onClick={handleSaveToSystem}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-sm transition flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>حفظ في السيستم واعتماد الحركات</span>
              </button>
            </div>
          </div>

          {/* Batch Settings Bar */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <span className="block text-xs font-bold text-slate-800 mb-1">ربط العميل تلقائيًا بالاسم</span>
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-900">
                موجود: {customerMatchSummary.existingCount} — جديد: {customerMatchSummary.newCount}
                {customerMatchSummary.rowsWithoutName > 0 ? ` — بدون اسم: ${customerMatchSummary.rowsWithoutName}` : ''}
                <span className="mt-1 block text-[10px]">يربط الاسم بسجله إن وُجد، أو يسجل عميلًا جديدًا مرة واحدة.</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                الرصيف
              </label>
              <select
                value={selectedBerthId}
                onChange={(e) => setSelectedBerthId(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold"
              >
                {berths.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>

            {canViewFinancials && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    فاتورة كاشير افتراضية
                  </label>
                  <input
                    type="number"
                    value={defaultCashier || ''}
                    onChange={(e) => setDefaultCashier(Number(e.target.value))}
                    placeholder="0"
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold"
                  />
                </div>

                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={applyCommission}
                      onChange={(e) => setApplyCommission(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                    />
                    <span>إضافة عمولة المنظومة ({settings.default_system_commission} ج.م)</span>
                  </label>
                </div>
              </>
            )}
          </div>

          {/* Editable Live Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-xs text-right border-collapse">
                <thead className="bg-slate-900 text-white font-bold sticky top-0">
                  <tr>
                    <th className="p-2 border border-slate-700 text-center w-10">م</th>
                    <th className="p-2 border border-slate-700 whitespace-nowrap">رقم الشاحنة</th>
                    <th className="p-2 border border-slate-700 whitespace-nowrap text-center">وزن الشاحنة</th>
                    <th className="p-2 border border-slate-700 whitespace-nowrap text-center">محاور الشاحنة</th>
                    <th className="p-2 border border-slate-700 whitespace-nowrap">رقم المقطورة</th>
                    <th className="p-2 border border-slate-700 whitespace-nowrap text-center">وزن المقطورة</th>
                    <th className="p-2 border border-slate-700 whitespace-nowrap text-center">محاور المقطورة</th>
                    <th className="p-2 border border-slate-700 whitespace-nowrap">اسم السائق</th>
                    <th className="p-2 border border-slate-700 whitespace-nowrap">رقم الاقرار</th>
                    <th className="p-2 border border-slate-700 whitespace-nowrap">رقم الحاوية</th>
                    <th className="p-2 border border-slate-700 whitespace-nowrap">وصف الحاوية</th>
                    <th className="p-2 border border-slate-700 whitespace-nowrap">مسار الحاوية</th>
                    <th className="p-2 border border-slate-700 text-center w-10">حذف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {rows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-1 border border-slate-200 text-center font-bold text-blue-900 bg-slate-50">
                        {idx + 1}
                      </td>
                      <td className="p-1 border border-slate-200">
                        <input
                          type="text"
                          value={row.truck_no || ''}
                          onChange={(e) => handleUpdateRowCell(idx, 'truck_no', e.target.value)}
                          className="w-full bg-transparent px-1.5 py-1 text-xs font-semibold focus:bg-white focus:ring-1 focus:ring-blue-500 rounded"
                        />
                      </td>
                      <td className="p-1 border border-slate-200 text-center">
                        <input
                          type="number"
                          step="0.1"
                          value={row.truck_weight ?? 7.5}
                          onChange={(e) => handleUpdateRowCell(idx, 'truck_weight', Number(e.target.value))}
                          className="w-16 bg-transparent px-1.5 py-1 text-xs text-center focus:bg-white focus:ring-1 focus:ring-blue-500 rounded font-mono"
                        />
                      </td>
                      <td className="p-1 border border-slate-200 text-center">
                        <input
                          type="number"
                          value={row.truck_axles ?? 20}
                          onChange={(e) => handleUpdateRowCell(idx, 'truck_axles', Number(e.target.value))}
                          className="w-14 bg-transparent px-1.5 py-1 text-xs text-center focus:bg-white focus:ring-1 focus:ring-blue-500 rounded font-mono"
                        />
                      </td>
                      <td className="p-1 border border-slate-200">
                        <input
                          type="text"
                          value={row.trailer_no || ''}
                          onChange={(e) => handleUpdateRowCell(idx, 'trailer_no', e.target.value)}
                          className="w-full bg-transparent px-1.5 py-1 text-xs focus:bg-white focus:ring-1 focus:ring-blue-500 rounded"
                        />
                      </td>
                      <td className="p-1 border border-slate-200 text-center">
                        <input
                          type="number"
                          step="0.1"
                          value={row.trailer_weight ?? 11.5}
                          onChange={(e) => handleUpdateRowCell(idx, 'trailer_weight', Number(e.target.value))}
                          className="w-16 bg-transparent px-1.5 py-1 text-xs text-center focus:bg-white focus:ring-1 focus:ring-blue-500 rounded font-mono"
                        />
                      </td>
                      <td className="p-1 border border-slate-200 text-center">
                        <input
                          type="number"
                          value={row.trailer_axles ?? 30}
                          onChange={(e) => handleUpdateRowCell(idx, 'trailer_axles', Number(e.target.value))}
                          className="w-14 bg-transparent px-1.5 py-1 text-xs text-center focus:bg-white focus:ring-1 focus:ring-blue-500 rounded font-mono"
                        />
                      </td>
                      <td className="p-1 border border-slate-200">
                        <input
                          type="text"
                          dir="auto"
                          value={row.driver_name || ''}
                          onChange={(e) => handleUpdateRowCell(idx, 'driver_name', e.target.value)}
                          className="w-full bg-transparent px-1.5 py-1 text-xs focus:bg-white focus:ring-1 focus:ring-blue-500 rounded"
                        />
                      </td>
                      <td className="p-1 border border-slate-200">
                        <input
                          type="text"
                          value={row.declaration_no || ''}
                          onChange={(e) => handleUpdateRowCell(idx, 'declaration_no', e.target.value)}
                          className="w-full bg-transparent px-1.5 py-1 text-xs font-mono focus:bg-white focus:ring-1 focus:ring-blue-500 rounded"
                        />
                      </td>
                      <td className="p-1 border border-slate-200">
                        <input
                          type="text"
                          value={row.container_no || ''}
                          onChange={(e) => handleUpdateRowCell(idx, 'container_no', e.target.value)}
                          className="w-full bg-transparent px-1.5 py-1 text-xs font-mono font-bold text-blue-900 focus:bg-white focus:ring-1 focus:ring-blue-500 rounded"
                        />
                      </td>
                      <td className="p-1 border border-slate-200">
                        <input
                          type="text"
                          value={row.container_desc || ''}
                          onChange={(e) => handleUpdateRowCell(idx, 'container_desc', e.target.value)}
                          className="w-full bg-transparent px-1.5 py-1 text-xs focus:bg-white focus:ring-1 focus:ring-blue-500 rounded"
                        />
                      </td>
                      <td className="p-1 border border-slate-200">
                        <input
                          type="text"
                          value={row.container_path || ''}
                          onChange={(e) => handleUpdateRowCell(idx, 'container_path', e.target.value)}
                          className="w-full bg-transparent px-1.5 py-1 text-xs focus:bg-white focus:ring-1 focus:ring-blue-500 rounded"
                        />
                      </td>
                      <td className="p-1 border border-slate-200 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(idx)}
                          className="text-rose-500 hover:text-rose-700 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Official Clean Manifest Print Modal (NO COMMISSIONS, NO NAFEZ, NO TOTALS) */}
      {isOfficialSheetModalOpen && (
        <OfficialSheetPrintModal
          isOpen={isOfficialSheetModalOpen}
          onClose={() => setIsOfficialSheetModalOpen(false)}
          movements={previewMovements}
          title="شيت تسجيل حجز الشاحنات"
          berthName={berths.find((b) => b.id === selectedBerthId)?.name}
        />
      )}
    </div>
  );
};
