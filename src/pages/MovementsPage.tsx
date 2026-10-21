import React, { useState, useMemo } from 'react';
import { Berth, Customer, Movement } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { exportTemplateToExcel, downloadEmptyTemplate } from '../lib/excelUtils';
import { exportMovementsToOfficialPdf } from '../lib/pdfExport';
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
} from 'lucide-react';
import { DriverInvoiceModal } from '../components/DriverInvoiceModal';
import { CashierLinkingModal } from '../components/CashierLinkingModal';

interface MovementsPageProps {
  movements: Movement[];
  customers: Customer[];
  berths: Berth[];
  onOpenAddModal: () => void;
  onOpenUploadModal: () => void;
  onEditMovement: (movement: Movement) => void;
  onDeleteMovement: (id: string) => void;
  onClearAllMovements?: () => void;
  onTogglePaid: (movement: Movement) => void;
}

export const MovementsPage: React.FC<MovementsPageProps> = ({
  movements,
  customers,
  berths,
  onOpenAddModal,
  onOpenUploadModal,
  onEditMovement,
  onDeleteMovement,
  onClearAllMovements,
  onTogglePaid,
}) => {
  const { canViewFinancials, isAdmin } = useAuth();

  // Modals state
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isCashierModalOpen, setIsCashierModalOpen] = useState(false);
  const [linkingMovement, setLinkingMovement] = useState<Movement | null>(null);

  // Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [selectedBerth, setSelectedBerth] = useState('');
  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

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

  // Subtotals (المجموع الفرعي)
  const subtotals = useMemo(() => {
    let cashierTotal = 0;
    let systemCommTotal = 0;
    let nafezCommTotal = 0;
    let grandTotal = 0;
    let paidTotal = 0;
    let remainingTotal = 0;

    for (const m of filteredMovements) {
      cashierTotal += Number(m.cashier_invoice) || 0;
      systemCommTotal += Number(m.system_commission) || 0;
      nafezCommTotal += Number(m.nafez_commission) || 0;
      grandTotal += Number(m.total_amount) || 0;
      paidTotal += Number(m.paid_amount) || 0;
      remainingTotal += Number(m.remaining_amount) || 0;
    }

    return {
      count: filteredMovements.length,
      cashierTotal,
      systemCommTotal,
      nafezCommTotal,
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

  return (
    <div className="space-y-6">
      {/* Top Banner / Controls */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 no-print">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <Truck className="w-6 h-6 text-blue-600" />
              <span>كشف تسجيل حركات الشاحنات والحاويات (الاسطمبة الرسمية)</span>
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              تسجيل الحركات يدوي، أو استيراد الشيتات، وحساب الفواتير والعمولات وتصدير الاسطمبة
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onOpenAddModal}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3.5 py-2 rounded-lg shadow-sm transition flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>تسجيل حركة جديدة</span>
            </button>

            <button
              onClick={onOpenUploadModal}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-2 rounded-lg shadow-sm transition flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>رفع وتصفية شيت</span>
            </button>

            <button
              onClick={handleExportPdf}
              className="bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold px-3.5 py-2 rounded-lg shadow-sm transition flex items-center gap-1.5"
              title="تنزيل كشف الحركات كملف PDF رسمي (بدون عمولات ومبالغ) لتقديمه لمكتب الميناء"
            >
              <FileDown className="w-4 h-4" />
              <span>تحميل PDF الاسطمبة الرسمية</span>
            </button>

            <button
              onClick={handleExportExcel}
              className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-3.5 py-2 rounded-lg shadow-sm transition flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" />
              <span>تصدير Excel بالاسطمبة</span>
            </button>

            {canViewFinancials && (
              <button
                onClick={() => {
                  setLinkingMovement(null);
                  setIsCashierModalOpen(true);
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3.5 py-2 rounded-lg shadow-sm transition flex items-center gap-1.5"
                title="ربط فاتورة الكاشير من إيصال الميناء برقم الحاوية والسيارة"
              >
                <Link2 className="w-4 h-4" />
                <span>ربط فاتورة كاشير</span>
              </button>
            )}

            <button
              onClick={handlePrint}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3.5 py-2 rounded-lg transition flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة</span>
            </button>

            {canViewFinancials && filteredMovements.length > 0 && (
              <button
                onClick={() => setIsInvoiceModalOpen(true)}
                className="bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold px-3.5 py-2 rounded-lg shadow-sm transition flex items-center gap-1.5"
                title="إصدار وطباعة فاتورة حساب مجمعة بالحركات المفلترة باسم المكان أو الرصيف"
              >
                <FileText className="w-4 h-4" />
                <span>إصدار فاتورة باسم المكان ({filteredMovements.length})</span>
              </button>
            )}

            {isAdmin && movements.length > 0 && onClearAllMovements && (
              <button
                onClick={onClearAllMovements}
                className="bg-slate-600 hover:bg-slate-700 text-white text-xs font-bold px-3.5 py-2 rounded-lg shadow-sm transition flex items-center gap-1.5"
                title="مسح وتصفير كافة الشحنات لتسليم السيستم للعميل"
              >
                <Trash2 className="w-4 h-4" />
                <span>مسح الشحنات (تسليم للعميل)</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3 pt-4">
          <div className="md:col-span-2 relative">
            <Search className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="بحث برقم الشاحنة، المقطورة، الحاوية، الإقرار، السائق..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg pr-9 pl-3 py-2 text-xs focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <select
              value={selectedCustomer}
              onChange={(e) => setSelectedCustomer(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-700"
            >
              <option value="">جميع العملاء</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  [{c.code}] {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={selectedBerth}
              onChange={(e) => setSelectedBerth(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-700"
            >
              <option value="">جميع الأرصفة</option>
              {berths.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {canViewFinancials ? (
            <div>
              <select
                value={selectedPaymentStatus}
                onChange={(e) => setSelectedPaymentStatus(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-700"
              >
                <option value="">حالة السداد (الكل)</option>
                <option value="unpaid">غير مدفوع (متبقي)</option>
                <option value="partial">مدفوع جزئياً</option>
                <option value="paid">مدفوع بالكامل</option>
              </select>
            </div>
          ) : (
            <div className="flex items-center text-xs text-slate-400 italic px-2">
              وضع مدخل بيانات
            </div>
          )}

          <div className="flex items-center gap-1">
            <button
              onClick={handleResetFilters}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold py-2 px-2.5 rounded-lg flex items-center justify-center gap-1 transition"
              title="إعادة تعيين الفلاتر"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>إلغاء الفلاتر</span>
            </button>
          </div>
        </div>
      </div>

      {/* Subtotals & Financial Summary Bar (المجموع الفرعي) */}
      {canViewFinancials && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 no-print">
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-500 block">عدد الحركات المفلترة</span>
            <span className="text-xl font-black text-slate-800">{subtotals.count} حركة</span>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-500 block">فواتير الكاشير</span>
            <span className="text-lg font-bold text-slate-900">
              {subtotals.cashierTotal.toLocaleString()} ج.م
            </span>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-blue-200 bg-blue-50/50 shadow-sm">
            <span className="text-[11px] font-semibold text-blue-700 block">عمولة المنظومة</span>
            <span className="text-lg font-bold text-blue-900">
              {subtotals.systemCommTotal.toLocaleString()} ج.م
            </span>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-indigo-200 bg-indigo-50/50 shadow-sm">
            <span className="text-[11px] font-semibold text-indigo-700 block">عمولة نافذ</span>
            <span className="text-lg font-bold text-indigo-900">
              {subtotals.nafezCommTotal.toLocaleString()} ج.م
            </span>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50 shadow-sm">
            <span className="text-[11px] font-semibold text-emerald-700 block">إجمالي المستحق</span>
            <span className="text-lg font-black text-emerald-900">
              {subtotals.grandTotal.toLocaleString()} ج.م
            </span>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-rose-200 bg-rose-50/50 shadow-sm">
            <span className="text-[11px] font-semibold text-rose-700 block">المتبقي (المديونية)</span>
            <span className="text-lg font-black text-rose-900">
              {subtotals.remainingTotal.toLocaleString()} ج.م
            </span>
          </div>
        </div>
      )}

      {/* Official Table Matching User Template */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Printable Header */}
        <div className="hidden print:block p-4 text-center border-b border-black">
          <h1 className="text-xl font-bold">كشف حركات الشاحنات والحاويات - ميناء التفريغ والشحن</h1>
          <p className="text-xs text-gray-600 mt-1">تاريخ الطباعة: {new Date().toLocaleDateString('ar-EG')}</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-xs text-right border-collapse">
            {/* Table Header exactly ordered as requested:
                مسارالحاوية | وصفالحاوية | رقمالحاوية | رقمالاقرار | اسمالسائق | محاور المقطورة | وزنالمقطورة من واقع الرخصة | رقمالمقطورة | محاور الشاحنة | وزنالشاحنة من واقع الرخصة | رقمالشاحنة | م
            */}
            <thead className="bg-slate-900 text-white font-bold select-none">
              <tr>
                <th className="p-2.5 border border-slate-700 text-center w-12">م</th>
                <th className="p-2.5 border border-slate-700 whitespace-nowrap">رقم الشاحنة</th>
                <th className="p-2.5 border border-slate-700 text-center whitespace-nowrap">
                  وزن الشاحنة
                  <span className="block text-[10px] font-normal text-slate-400">من واقع الرخصة</span>
                </th>
                <th className="p-2.5 border border-slate-700 text-center whitespace-nowrap">محاور الشاحنة</th>
                <th className="p-2.5 border border-slate-700 whitespace-nowrap">رقم المقطورة</th>
                <th className="p-2.5 border border-slate-700 text-center whitespace-nowrap">
                  وزن المقطورة
                  <span className="block text-[10px] font-normal text-slate-400">من واقع الرخصة</span>
                </th>
                <th className="p-2.5 border border-slate-700 text-center whitespace-nowrap">محاور المقطورة</th>
                <th className="p-2.5 border border-slate-700 whitespace-nowrap min-w-[140px]">اسم السائق</th>
                <th className="p-2.5 border border-slate-700 whitespace-nowrap">رقم الاقرار</th>
                <th className="p-2.5 border border-slate-700 whitespace-nowrap">رقم الحاوية</th>
                <th className="p-2.5 border border-slate-700 whitespace-nowrap min-w-[150px]">وصف الحاوية</th>
                <th className="p-2.5 border border-slate-700 whitespace-nowrap min-w-[140px]">مسار الحاوية</th>
                
                {/* Financial columns visible only to Admin and Accountant */}
                {canViewFinancials && (
                  <>
                    <th className="p-2.5 border border-slate-700 text-center whitespace-nowrap bg-blue-950">فاتورة كاشير</th>
                    <th className="p-2.5 border border-slate-700 text-center whitespace-nowrap bg-blue-950">عمولة المنظومة</th>
                    <th className="p-2.5 border border-slate-700 text-center whitespace-nowrap bg-blue-950">نافذ</th>
                    <th className="p-2.5 border border-slate-700 text-center whitespace-nowrap bg-blue-950">الإجمالي</th>
                    <th className="p-2.5 border border-slate-700 text-center whitespace-nowrap bg-blue-950">الحالة والمتبقي</th>
                  </>
                )}

                <th className="p-2.5 border border-slate-700 text-center w-20 no-print">إجراءات</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 bg-white">
              {filteredMovements.length > 0 ? (
                filteredMovements.map((m, index) => (
                  <tr key={m.id} className="hover:bg-blue-50/40 transition">
                    <td className="p-2 border border-slate-200 text-center font-bold text-blue-900 bg-slate-50/50">
                      {m.seq || index + 1}
                    </td>
                    <td className="p-2 border border-slate-200 font-bold text-slate-900 whitespace-nowrap">
                      {m.truck_no}
                      {m.customer_name && (
                        <span className="block text-[10px] font-normal text-slate-500">
                          {m.customer_name}
                        </span>
                      )}
                    </td>
                    <td className="p-2 border border-slate-200 text-center font-mono font-semibold">
                      {m.truck_weight ?? 7.5}
                    </td>
                    <td className="p-2 border border-slate-200 text-center font-mono font-semibold">
                      {m.truck_axles ?? 20}
                    </td>
                    <td className="p-2 border border-slate-200 font-medium whitespace-nowrap">
                      {m.trailer_no || '-'}
                    </td>
                    <td className="p-2 border border-slate-200 text-center font-mono font-semibold">
                      {m.trailer_weight ?? 11.5}
                    </td>
                    <td className="p-2 border border-slate-200 text-center font-mono font-semibold">
                      {m.trailer_axles ?? 30}
                    </td>
                    <td className="p-2 border border-slate-200 text-slate-800">
                      {m.driver_name || '-'}
                    </td>
                    <td className="p-2 border border-slate-200 font-mono text-slate-700 whitespace-nowrap">
                      {m.declaration_no || '-'}
                    </td>
                    <td className="p-2 border border-slate-200 font-mono font-bold text-blue-800 whitespace-nowrap">
                      {m.container_no || '-'}
                    </td>
                    <td className="p-2 border border-slate-200 text-slate-600">
                      {m.container_desc || '-'}
                    </td>
                    <td className="p-2 border border-slate-200 text-slate-600">
                      {m.container_path || '-'}
                    </td>

                    {/* Financial Cells */}
                    {canViewFinancials && (
                      <>
                        <td className="p-2 border border-slate-200 text-center font-mono font-bold">
                          <div>{(m.cashier_invoice || 0).toLocaleString()}</div>
                          {m.cashier_receipt_no ? (
                            <span className="inline-block mt-0.5 text-[9.5px] font-mono bg-indigo-50 text-indigo-800 px-1.5 py-0.2 rounded border border-indigo-200">
                              #{m.cashier_receipt_no}
                            </span>
                          ) : (
                            <span className="inline-block mt-0.5 text-[9px] text-slate-400">
                              غير مربوط
                            </span>
                          )}
                        </td>
                        <td className="p-2 border border-slate-200 text-center font-mono font-bold text-blue-700">
                          {(m.system_commission || 200).toLocaleString()}
                        </td>
                        <td className="p-2 border border-slate-200 text-center font-mono font-bold text-indigo-700">
                          {(m.nafez_commission || 0).toLocaleString()}
                        </td>
                        <td className="p-2 border border-slate-200 text-center font-mono font-black text-slate-900 bg-slate-50">
                          {(m.total_amount || 0).toLocaleString()}
                        </td>
                        <td className="p-2 border border-slate-200 text-center whitespace-nowrap">
                          {m.payment_status === 'paid' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                              <CheckCircle className="w-3 h-3" />
                              خالص
                            </span>
                          )}
                          {m.payment_status === 'partial' && (
                            <span className="inline-flex flex-col items-center text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                              <span>جزئي (متبقي {m.remaining_amount} ج)</span>
                            </span>
                          )}
                          {m.payment_status === 'unpaid' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">
                              <Clock className="w-3 h-3" />
                              متبقي كامل
                            </span>
                          )}
                        </td>
                      </>
                    )}

                    {/* Actions */}
                    <td className="p-2 border border-slate-200 text-center no-print whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        {canViewFinancials && (
                          <button
                            onClick={() => {
                              setLinkingMovement(m);
                              setIsCashierModalOpen(true);
                            }}
                            className="p-1 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded"
                            title="ربط وتحديث فاتورة الكاشير"
                          >
                            <Link2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => onEditMovement(m)}
                          className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
                          title="تعديل الحركة"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDeleteMovement(m.id)}
                          className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded"
                          title="حذف الحركة"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={canViewFinancials ? 18 : 13}
                    className="p-8 text-center text-slate-400 text-sm"
                  >
                    لا توجد حركات شاحنات مسجلة مطابقة لخيارات البحث الحالية.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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
    </div>
  );
};
