import React, { useState, useRef, useMemo } from 'react';
import { parseUploadedSheet, exportTemplateToExcel, downloadEmptyTemplate } from '../lib/excelUtils';
import { Customer, Berth, Movement, SystemSettings } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { OfficialSheetPrintModal } from './OfficialSheetPrintModal';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Download,
  X,
  ArrowRight,
  Filter,
  FileDown,
  Printer,
} from 'lucide-react';

interface SheetUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportMovements: (movements: Movement[], newCustomers?: Customer[]) => void;
  customers: Customer[];
  berths: Berth[];
  settings: SystemSettings;
  currentMaxSeq: number;
}

export const SheetUploadModal: React.FC<SheetUploadModalProps> = ({
  isOpen,
  onClose,
  onImportMovements,
  customers,
  berths,
  settings,
  currentMaxSeq,
}) => {
  const { canViewFinancials } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState<Partial<Movement>[]>([]);
  const [originalHeaders, setOriginalHeaders] = useState<string[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(customers[0]?.id || '');
  const [selectedBerthId, setSelectedBerthId] = useState<string>(berths[0]?.id || '');
  const [defaultCashierInvoice, setDefaultCashierInvoice] = useState<number>(0);
  const [applyDefaultCommissions, setApplyDefaultCommissions] = useState<boolean>(true);
  const [isOfficialSheetModalOpen, setIsOfficialSheetModalOpen] = useState<boolean>(false);

  const previewMovements: Movement[] = useMemo(() => {
    const targetBerth = berths.find((b) => b.id === selectedBerthId);
    return parsedRows.map((r, i) => ({
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
  }, [parsedRows, selectedBerthId, berths]);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setFileName(file.name);

    try {
      const result = await parseUploadedSheet(file);
      setParsedRows(result.rows);
      setOriginalHeaders(result.headers);
      if (result.needsDriverReview) {
        alert('تمت قراءة الملف. راجع أسماء السائقين في الجدول قبل إضافتها، لأن وضوح النص في ملف PDF قد يؤثر على القراءة.');
      }
    } catch (err: any) {
      console.error(err);
      alert(`حدث خطأ أثناء قراءة الملف: ${err?.message || 'تأكد من صيغة الملف (.xlsx, .docx, .pdf, .csv)'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProcessAndSave = () => {
    if (parsedRows.length === 0) {
      alert('لا توجد بيانات مستخلصة لحفظها');
      return;
    }

    const targetCustomer = customers.find((c) => c.id === selectedCustomerId);
    const targetBerth = berths.find((b) => b.id === selectedBerthId);

    const now = new Date().toISOString().split('T')[0];
    const defaultSysComm = settings.default_system_commission ?? 200;
    const defaultNafezComm = settings.default_nafez_commission ?? 0;

    let seqCounter = currentMaxSeq;
    const newCustomersMap = new Map<string, Customer>();
    let customerSeq = customers.length;

    const finalizedMovements: Movement[] = parsedRows.map((row) => {
      seqCounter += 1;
      const cashier = row.cashier_invoice || defaultCashierInvoice || 0;
      const cleanDriver = (row.driver_name || '').trim();
      let rowCustomer = targetCustomer;

      if (cleanDriver) {
        const existing =
          customers.find((c) => c.name.trim().toLowerCase() === cleanDriver.toLowerCase()) ||
          newCustomersMap.get(cleanDriver.toLowerCase());

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
                truck_no: row.truck_no || '',
                trailer_no: row.trailer_no || '',
                driver_name: cleanDriver,
              },
            ],
            created_at: new Date().toISOString(),
            notes: 'تم إنشاؤه تلقائياً كعميل/سائق من كشف الشيت المرفوع',
            system_commission: defaultSysComm,
            nafez_commission: defaultNafezComm,
          };
          newCustomersMap.set(cleanDriver.toLowerCase(), newCust);
          rowCustomer = newCust;
        }
      }

      const systemCommission = applyDefaultCommissions
        ? (rowCustomer?.system_commission ?? defaultSysComm)
        : 0;
      const nafezCommission = applyDefaultCommissions
        ? (rowCustomer?.nafez_commission ?? defaultNafezComm)
        : 0;
      const total = cashier + systemCommission + nafezCommission;

      return {
        id: `m-imp-${Date.now()}-${seqCounter}`,
        seq: seqCounter,
        movement_date: row.movement_date || now,
        berth_id: targetBerth?.id || berths[0]?.id || '',
        berth_name: targetBerth?.name || berths[0]?.name || 'رصيف 1',
        customer_id: rowCustomer?.id || '',
        customer_code: rowCustomer?.code || '',
        customer_name: rowCustomer?.name || cleanDriver || 'عميل عام',
        truck_no: row.truck_no || 'غير محدد',
        truck_weight: row.truck_weight ?? 7.5,
        truck_axles: row.truck_axles ?? 20,
        trailer_no: row.trailer_no || '',
        trailer_weight: row.trailer_weight ?? 11.5,
        trailer_axles: row.trailer_axles ?? 30,
        driver_name: cleanDriver || '',
        declaration_no: row.declaration_no || '',
        container_no: row.container_no || '',
        container_desc: row.container_desc || '',
        container_path: row.container_path || '',
        cashier_invoice: cashier,
        system_commission: systemCommission,
        nafez_commission: nafezCommission,
        total_amount: total,
        payment_status: 'unpaid',
        paid_amount: 0,
        remaining_amount: total,
        created_at: new Date().toISOString(),
        notes: `مستورد من شيت: ${fileName}`,
      };
    });

    const newCustomersList = Array.from(newCustomersMap.values());
    onImportMovements(finalizedMovements, newCustomersList);
    const custMsg = newCustomersList.length > 0 ? ` وتم تكويد ${newCustomersList.length} عميل (سائق) جديد تلقائياً` : '';
    alert(`تم بنجاح تصفية واستيراد ${finalizedMovements.length} حركة شاحنة إلى السيستم!${custMsg}`);
    onClose();
  };

  const handleExportPdfDirectly = async () => {
    if (parsedRows.length === 0) return;
    const tempMovements: Movement[] = parsedRows.map((r, i) => ({
      ...r,
      id: `temp-${i}`,
      seq: i + 1,
      movement_date: new Date().toISOString().split('T')[0],
      berth_name: berths.find((b) => b.id === selectedBerthId)?.name || '',
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
    const { exportMovementsToOfficialPdf } = await import('../lib/pdfExport');
    await exportMovementsToOfficialPdf(
      tempMovements,
      'كشف الحركات المصفاة لتقديمه للمكتب (الاسطمبة الرسمية)',
      berths.find((b) => b.id === selectedBerthId)?.name
    );
  };

  const handleExportProcessedDirectly = () => {
    if (parsedRows.length === 0) return;
    const tempMovements: Movement[] = parsedRows.map((r, i) => ({
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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-l from-emerald-900 to-teal-800 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-600 p-2 rounded-lg">
              <Filter className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">
                رفع شيت وتصفية المطلوب وملؤه تلقائياً في الاسطمبة
              </h2>
              <p className="text-xs text-emerald-200">
                السيستم يقوم بالتعرف الذكي على الأعمدة وتصفية البيانات وتجهيزها في الاسطمبة الرسمية
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
          {/* Upload Drop Area */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-emerald-300 hover:border-emerald-500 bg-emerald-50/50 hover:bg-emerald-50 rounded-2xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center gap-3"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx, .xls, .csv, .docx, .doc, .pdf"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="bg-white p-3 rounded-full shadow-sm text-emerald-600">
              <Upload className="w-7 h-7" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">
                اضغط هنا لاختيار الملف (Excel أو Word أو PDF) أو اسحب الملف وأفلته هنا
              </p>
              <p className="text-xs text-slate-500 mt-1">
                يدعم تفريغ البيانات من ملفات Excel، مستندات Word (.docx)، وملفات PDF (.pdf) آلياً
              </p>
            </div>

            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  downloadEmptyTemplate(50);
                }}
                className="inline-flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-3 py-1.5 rounded-lg font-semibold transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>تحميل اسطمبة فارغة نموذجية جاهزة</span>
              </button>
            </div>
          </div>

          {/* If file is uploaded & parsed */}
          {parsedRows.length > 0 && (
            <div className="space-y-4">
              {/* Batch Assignment Controls */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h3 className="text-xs font-bold text-slate-700 mb-3 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>
                    تم استخلاص وتصفية ({parsedRows.length}) سجل من الملف: {fileName}
                  </span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      ربط جميع السجلات بالعميل
                    </label>
                    <select
                      value={selectedCustomerId}
                      onChange={(e) => setSelectedCustomerId(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800"
                    >
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          [{c.code}] {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      تحديد الرصيف
                    </label>
                    <select
                      value={selectedBerthId}
                      onChange={(e) => setSelectedBerthId(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800"
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
                          قيمة الكاشير الافتراضية
                        </label>
                        <input
                          type="number"
                          placeholder="0"
                          value={defaultCashierInvoice || ''}
                          onChange={(e) => setDefaultCashierInvoice(Number(e.target.value))}
                          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold"
                        />
                      </div>

                      <div className="flex items-center pt-5">
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                          <input
                            type="checkbox"
                            checked={applyDefaultCommissions}
                            onChange={(e) => setApplyDefaultCommissions(e.target.checked)}
                            className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                          />
                          <span>تطبيق عمولة المنظومة ({settings.default_system_commission} ج.م)</span>
                        </label>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Data Preview Table Matching Template */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">
                    معاينة البيانات المصفاة طبقاً لاسطمبة السيستم المعتمدة:
                  </span>
                  <span className="text-xs text-slate-500">
                    عدد الصفوف: {parsedRows.length}
                  </span>
                </div>

                <div className="overflow-x-auto max-h-72">
                  <table className="w-full text-xs text-right border-collapse">
                    <thead className="bg-slate-800 text-white sticky top-0 font-bold">
                      <tr>
                        <th className="p-2 border border-slate-700 whitespace-nowrap">م</th>
                        <th className="p-2 border border-slate-700 whitespace-nowrap">رقم الشاحنة</th>
                        <th className="p-2 border border-slate-700 whitespace-nowrap">وزن الشاحنة</th>
                        <th className="p-2 border border-slate-700 whitespace-nowrap">محاور الشاحنة</th>
                        <th className="p-2 border border-slate-700 whitespace-nowrap">رقم المقطورة</th>
                        <th className="p-2 border border-slate-700 whitespace-nowrap">وزن المقطورة</th>
                        <th className="p-2 border border-slate-700 whitespace-nowrap">محاور المقطورة</th>
                        <th className="p-2 border border-slate-700 whitespace-nowrap">اسم السائق</th>
                        <th className="p-2 border border-slate-700 whitespace-nowrap">رقم الاقرار</th>
                        <th className="p-2 border border-slate-700 whitespace-nowrap">رقم الحاوية</th>
                        <th className="p-2 border border-slate-700 whitespace-nowrap">وصف الحاوية</th>
                        <th className="p-2 border border-slate-700 whitespace-nowrap">مسار الحاوية</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {parsedRows.slice(0, 30).map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2 border border-slate-200 text-center font-bold text-blue-900">
                            {idx + 1}
                          </td>
                          <td className="p-2 border border-slate-200 font-semibold">{row.truck_no || '-'}</td>
                          <td className="p-2 border border-slate-200 text-center">{row.truck_weight ?? 7.5}</td>
                          <td className="p-2 border border-slate-200 text-center">{row.truck_axles ?? 20}</td>
                          <td className="p-2 border border-slate-200">{row.trailer_no || '-'}</td>
                          <td className="p-2 border border-slate-200 text-center">{row.trailer_weight ?? 11.5}</td>
                          <td className="p-2 border border-slate-200 text-center">{row.trailer_axles ?? 30}</td>
                          <td dir="auto" className="p-2 border border-slate-200">{row.driver_name || '-'}</td>
                          <td className="p-2 border border-slate-200 font-mono">{row.declaration_no || '-'}</td>
                          <td className="p-2 border border-slate-200 font-mono">{row.container_no || '-'}</td>
                          <td className="p-2 border border-slate-200">{row.container_desc || '-'}</td>
                          <td className="p-2 border border-slate-200">{row.container_path || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {parsedRows.length > 30 && (
                  <div className="bg-slate-50 p-2 text-center text-xs text-slate-500 border-t">
                    يتم عرض أول 30 صف للمعاينة، وسيتم حفظ جميع الـ {parsedRows.length} صف كاملة.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {parsedRows.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setIsOfficialSheetModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold transition shadow-sm"
                  title="معاينة وطباعة وتنزيل كشف الحركات المجمع الرسمي لتقديمه للمكتب (خالٍ تماماً من العمولات والمبالغ)"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>معاينة وطباعة كشف المكتب (بدون عمولات)</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportProcessedDirectly}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-100 text-xs font-semibold transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>تصدير إلى Excel</span>
                </button>
              </>
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
              disabled={parsedRows.length === 0}
              onClick={handleProcessAndSave}
              className="px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-md hover:shadow-lg transition flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>اعتماد وتنزيل الحركات في المنظومة ({parsedRows.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Official Manifest Print Preview Modal */}
      {isOfficialSheetModalOpen && (
        <OfficialSheetPrintModal
          isOpen={isOfficialSheetModalOpen}
          onClose={() => setIsOfficialSheetModalOpen(false)}
          movements={previewMovements}
          title="كشف حركات وتفريغ الشاحنات والحاويات المجمع (الاسطمبة الرسمية)"
          berthName={berths.find((b) => b.id === selectedBerthId)?.name}
        />
      )}
    </div>
  );
};
