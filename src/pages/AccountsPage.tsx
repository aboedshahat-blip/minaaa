import React, { useState, useMemo } from 'react';
import { Customer, Movement, PaymentReceipt } from '../types';
import {
  Wallet,
  TrendingUp,
  Receipt,
  CreditCard,
  Search,
  Download,
  Printer,
  CheckCircle,
  Clock,
  ArrowUpRight,
  ShieldCheck,
  Building2,
  User,
  Truck,
  FileText,
  Percent,
} from 'lucide-react';
import { DriverInvoiceModal } from '../components/DriverInvoiceModal';

interface AccountsPageProps {
  movements: Movement[];
  customers: Customer[];
  payments: PaymentReceipt[];
  onOpenPaymentModal: (customerId?: string) => void;
  onBatchUpdateMovements?: (updatedMovements: Movement[]) => void;
}

export const AccountsPage: React.FC<AccountsPageProps> = ({
  movements,
  customers,
  payments,
  onOpenPaymentModal,
  onBatchUpdateMovements,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSubTab, setActiveSubTab] = useState<'clients' | 'system_revenue' | 'receipts' | 'drivers'>('clients');
  const [driverSearch, setDriverSearch] = useState('');
  const [selectedDriverForInvoice, setSelectedDriverForInvoice] = useState<{ name: string; moves: Movement[] } | null>(null);
  const [isDriverInvoiceOpen, setIsDriverInvoiceOpen] = useState(false);

  // Update individual shipment discount
  const handleUpdateMovementDiscount = (movementId: string, discountVal: number) => {
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

  // Apply overall discount distributed to customer's shipments
  const handleApplyOverallCustomerDiscount = (customerName: string) => {
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

  // Download direct customer statement PDF
  const handleDownloadCustomerPdf = async (name: string, moves: Movement[], totals: any) => {
    const { exportCustomerStatementPdf } = await import('../lib/pdfExport');
    await exportCustomerStatementPdf(name, moves, totals);
  };

  // === Driver Ledger: group ALL movements by driver_name ===
  const driverLedger = useMemo(() => {
    if (!driverSearch.trim()) return [];

    const term = driverSearch.trim().toLowerCase();
    const filtered = movements.filter(
      (m) =>
        m.driver_name && m.driver_name.toLowerCase().includes(term)
    );

    // Group by exact driver name
    const driverMap = new Map<string, Movement[]>();
    filtered.forEach((m) => {
      const key = m.driver_name || 'غير محدد';
      if (!driverMap.has(key)) driverMap.set(key, []);
      driverMap.get(key)!.push(m);
    });

    return Array.from(driverMap.entries()).map(([name, moves]) => {
      const cashierTotal = moves.reduce((s, m) => s + (m.cashier_invoice || 0), 0);
      const systemCommTotal = moves.reduce((s, m) => s + (m.system_commission || 0), 0);
      const nafezCommTotal = moves.reduce((s, m) => s + (m.nafez_commission || 0), 0);
      const discountTotal = moves.reduce((s, m) => s + (m.discount || 0), 0);
      const totalAmount = moves.reduce((s, m) => s + (m.total_amount || 0), 0);
      const paidTotal = moves.reduce((s, m) => s + (m.paid_amount || 0), 0);
      const remainingTotal = moves.reduce((s, m) => s + (m.remaining_amount || 0), 0);
      return { name, moves, cashierTotal, systemCommTotal, nafezCommTotal, discountTotal, totalAmount, paidTotal, remainingTotal };
    });
  }, [movements, driverSearch]);

  // All unique driver names for quick autocomplete hint
  const allDriverNames = useMemo(() => {
    const names = new Set<string>();
    movements.forEach((m) => { if (m.driver_name) names.add(m.driver_name); });
    return Array.from(names).sort();
  }, [movements]);

  // Customer Financial Breakdown
  const customerLedger = useMemo(() => {
    return customers.map((c) => {
      const custMovements = movements.filter(
        (m) => m.customer_id === c.id || m.customer_name === c.name
      );
      const truckCount = custMovements.length;
      const cashierTotal = custMovements.reduce((sum, m) => sum + (m.cashier_invoice || 0), 0);
      const systemCommTotal = custMovements.reduce((sum, m) => sum + (m.system_commission || 0), 0);
      const nafezCommTotal = custMovements.reduce((sum, m) => sum + (m.nafez_commission || 0), 0);
      const discountTotal = custMovements.reduce((sum, m) => sum + (m.discount || 0), 0);
      const totalAmount = custMovements.reduce((sum, m) => sum + (m.total_amount || 0), 0);
      const paidTotal = custMovements.reduce((sum, m) => sum + (m.paid_amount || 0), 0);
      const remainingTotal = custMovements.reduce((sum, m) => sum + (m.remaining_amount || 0), 0);

      const paidRatio = totalAmount > 0 ? (paidTotal / totalAmount) * 100 : 100;

      return {
        customer: c,
        truckCount,
        custMovements,
        cashierTotal,
        systemCommTotal,
        nafezCommTotal,
        discountTotal,
        totalAmount,
        paidTotal,
        remainingTotal,
        paidRatio,
      };
    }).filter((item) =>
      item.customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.customer.code.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [customers, movements, searchTerm]);

  // Overall Financial Totals
  const overallTotals = useMemo(() => {
    let cashier = 0;
    let systemCommission = 0;
    let nafez = 0;
    let discount = 0;
    let total = 0;
    let paid = 0;
    let remaining = 0;

    for (const m of movements) {
      cashier += Number(m.cashier_invoice) || 0;
      systemCommission += Number(m.system_commission) || 0;
      nafez += Number(m.nafez_commission) || 0;
      discount += Number(m.discount) || 0;
      total += Number(m.total_amount) || 0;
      paid += Number(m.paid_amount) || 0;
      remaining += Number(m.remaining_amount) || 0;
    }

    return { cashier, systemCommission, nafez, discount, total, paid, remaining };
  }, [movements]);

  // Export Customer Financials to Excel
  const handleExportAccountsExcel = async () => {
    const XLSX = await import('xlsx');
    const data = customerLedger.map((item, idx) => ({
      'م': idx + 1,
      'كود العميل': item.customer.code,
      'اسم العميل': item.customer.name,
      'عدد الحركات': item.truckCount,
      'إجمالي فواتير كاشير': item.cashierTotal,
      'عمولة المنظومة': item.systemCommTotal,
      'عمولة نافذ': item.nafezCommTotal,
      'إجمالي المطلوب': item.totalAmount,
      'المدفوع (دفع كام)': item.paidTotal,
      'المتبقي (ناقص كام)': item.remainingTotal,
      'نسبة السداد': `${item.paidRatio.toFixed(1)}%`,
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!views'] = [{ rightToLeft: true }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'كشف حسابات العملاء');
    XLSX.writeFile(wb, `حسابات_العملاء_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 no-print">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <Wallet className="w-6 h-6 text-blue-600" />
              <span>الإدارة المالية وحسابات العملاء وعمولات المنظومة</span>
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              متابعة فواتير الكاشير، مديونيات العملاء، عمولات السيستم المستقلة، وسندات التحصيل
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onOpenPaymentModal()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg shadow-sm transition flex items-center gap-1.5"
            >
              <CreditCard className="w-4 h-4" />
              <span>تسجيل سند قبض جديد</span>
            </button>

            <button
              onClick={handleExportAccountsExcel}
              className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-3.5 py-2.5 rounded-lg shadow-sm transition flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" />
              <span>تصدير الحسابات Excel</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Dedicated System Revenue Card (حساب إضافة المنظومة منفصل) */}
        <div className="bg-gradient-to-br from-blue-900 to-indigo-950 text-white p-5 rounded-2xl shadow-md border border-blue-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-blue-200 text-xs font-semibold mb-2">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>حساب إضافة المنظومة (أرباح العمولات)</span>
              </span>
              <span className="bg-blue-800/80 text-[10px] px-2 py-0.5 rounded text-blue-200">
                خاص بصاحب السيستم
              </span>
            </div>
            <div className="text-2xl font-black tracking-tight text-white mt-1">
              {overallTotals.systemCommission.toLocaleString()} ج.م
            </div>
          </div>
          <p className="text-[11px] text-blue-300 mt-3 pt-2 border-t border-blue-800/60">
            صافي عمولات المنظومة المحسوبة على {movements.length} حركة شاحنة
          </p>
        </div>

        {/* Total Cashier */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 block mb-1">
              إجمالي فواتير الكاشير
            </span>
            <div className="text-2xl font-black text-slate-900">
              {overallTotals.cashier.toLocaleString()} ج.م
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-3 pt-2 border-t border-slate-100">
            مجموع مبالغ الكاشير الأصلية بدون العمولات
          </p>
        </div>

        {/* Total Collected (دفع كام) */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-emerald-100 bg-emerald-50/30 flex flex-col justify-between">
          <div>
            <span className="text-xs font-bold text-emerald-700 block mb-1">
              إجمالي المحصل الفعلي (دفع كام)
            </span>
            <div className="text-2xl font-black text-emerald-800">
              {overallTotals.paid.toLocaleString()} ج.م
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] text-emerald-600 mt-3 pt-2 border-t border-emerald-100">
            <span>نسبة التحصيل:</span>
            <span className="font-bold">
              {overallTotals.total > 0
                ? ((overallTotals.paid / overallTotals.total) * 100).toFixed(1)
                : 0}
              %
            </span>
          </div>
        </div>

        {/* Remaining Debts (ناقص كام) */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-rose-100 bg-rose-50/30 flex flex-col justify-between">
          <div>
            <span className="text-xs font-bold text-rose-700 block mb-1">
              إجمالي المتبقي والمديونيات (ناقص كام)
            </span>
            <div className="text-2xl font-black text-rose-800">
              {overallTotals.remaining.toLocaleString()} ج.م
            </div>
          </div>
          <p className="text-[11px] text-rose-600 mt-3 pt-2 border-t border-rose-100">
            مبالغ معلقة ومؤجلة على العملاء لم يتم تسديدها
          </p>
        </div>
      </div>

      {/* Sub Tabs Selector */}
      <div className="flex space-x-2 space-x-reverse border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveSubTab('clients')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
            activeSubTab === 'clients'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-slate-700 hover:bg-slate-100'
          }`}
        >
          كشف حساب ومستحقات كل عميل (المديونيات)
        </button>

        <button
          onClick={() => setActiveSubTab('system_revenue')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
            activeSubTab === 'system_revenue'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-slate-700 hover:bg-slate-100'
          }`}
        >
          حساب إيرادات المنظومة المفصل
        </button>

        <button
          onClick={() => setActiveSubTab('receipts')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
            activeSubTab === 'receipts'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-slate-700 hover:bg-slate-100'
          }`}
        >
          سجل سندات القبض والدفعات ({payments.length})
        </button>

        <button
          onClick={() => setActiveSubTab('drivers')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
            activeSubTab === 'drivers'
              ? 'bg-orange-600 text-white'
              : 'bg-white text-slate-700 hover:bg-slate-100'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Truck className="w-3.5 h-3.5" />
            كشف حساب السائقين
          </span>
        </button>
      </div>

      {/* Tab 1: Customer Balances Table */}
      {activeSubTab === 'clients' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden p-6 space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <h2 className="text-base font-bold text-slate-900">
              جدول أرصدة وحسابات العملاء (تفصيل دفع كام وناقص كام)
            </h2>
            <div className="w-full sm:w-72">
              <input
                type="text"
                placeholder="بحث باسم أو كود العميل..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-xs text-right border-collapse">
              <thead className="bg-slate-900 text-white font-bold">
                <tr>
                  <th className="p-2.5 border border-slate-700 text-center w-10">م</th>
                  <th className="p-2.5 border border-slate-700">كود العميل</th>
                  <th className="p-2.5 border border-slate-700">اسم العميل (السائق)</th>
                  <th className="p-2.5 border border-slate-700 text-center">عدد النقلات</th>
                  <th className="p-2.5 border border-slate-700 text-center font-bold text-indigo-300">المدفوع له كاشير بالميناء</th>
                  <th className="p-2.5 border border-slate-700 text-center">خدمة المنظومة</th>
                  <th className="p-2.5 border border-slate-700 text-center text-rose-300">الخصم</th>
                  <th className="p-2.5 border border-slate-700 text-center bg-blue-950 font-black">الصافي المطلوب</th>
                  <th className="p-2.5 border border-slate-700 text-center bg-emerald-950 font-bold">المحصل (دفع كام)</th>
                  <th className="p-2.5 border border-slate-700 text-center bg-rose-950 font-black">المتبقي (ناقص كام)</th>
                  <th className="p-2.5 border border-slate-700 text-center">حالة الحساب</th>
                  <th className="p-2.5 border border-slate-700 text-center">كشف وسداد</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {customerLedger.map((row, idx) => (
                  <tr key={row.customer.id} className="hover:bg-slate-50">
                    <td className="p-2.5 border border-slate-200 text-center font-bold text-blue-900 bg-slate-50">
                      {idx + 1}
                    </td>
                    <td className="p-2.5 border border-slate-200 font-mono font-bold text-blue-700">
                      {row.customer.code}
                    </td>
                    <td className="p-2.5 border border-slate-200 font-bold text-slate-900">
                      {row.customer.name}
                    </td>
                    <td className="p-2.5 border border-slate-200 text-center font-semibold">
                      {row.truckCount}
                    </td>
                    <td className="p-2.5 border border-slate-200 text-center font-mono">
                      {row.cashierTotal.toLocaleString()}
                    </td>
                    <td className="p-2.5 border border-slate-200 text-center font-mono font-bold text-blue-700">
                      {row.systemCommTotal.toLocaleString()}
                    </td>
                    <td className="p-2.5 border border-slate-200 text-center font-mono font-bold text-rose-600">
                      {row.discountTotal ? `${row.discountTotal.toLocaleString()} ج` : '0'}
                    </td>
                    <td className="p-2.5 border border-slate-200 text-center font-mono font-black text-slate-900 bg-blue-50/50">
                      {row.totalAmount.toLocaleString()} ج.م
                    </td>
                    <td className="p-2.5 border border-slate-200 text-center font-mono font-bold text-emerald-800 bg-emerald-50/50">
                      {row.paidTotal.toLocaleString()} ج.م
                    </td>
                    <td className="p-2.5 border border-slate-200 text-center font-mono font-black text-rose-800 bg-rose-50/50">
                      {row.remainingTotal.toLocaleString()} ج.م
                    </td>
                    <td className="p-2.5 border border-slate-200 text-center">
                      {row.remainingTotal === 0 ? (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                          خالص تماماً
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">
                          مدين بـ {row.remainingTotal.toLocaleString()} ج
                        </span>
                      )}
                    </td>
                    <td className="p-2.5 border border-slate-200 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleDownloadCustomerPdf(row.customer.name, row.custMovements, row)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-2 py-1 rounded transition flex items-center gap-1"
                          title="تحميل كشف حساب ومطالبة العميل PDF"
                        >
                          <Download className="w-3 h-3" />
                          <span>PDF</span>
                        </button>
                        <button
                          onClick={() => {
                            setDriverSearch(row.customer.name);
                            setActiveSubTab('drivers');
                          }}
                          className="bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-bold px-2 py-1 rounded border border-blue-200 transition flex items-center gap-1"
                          title="عرض وتعديل خصومات شحنات هذا العميل"
                        >
                          <Truck className="w-3 h-3" />
                          <span>الشحنات ({row.truckCount})</span>
                        </button>
                        <button
                          onClick={() => onOpenPaymentModal(row.customer.id)}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold px-2.5 py-1 rounded transition"
                        >
                          سند قبض
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Dedicated System Revenue View */}
      {activeSubTab === 'system_revenue' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
              <span>حساب إيرادات المنظومة المستقل (أرباح عمولات صاحب البرنامج)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              هذا الحساب معزول تماماً ومخصص لمتابعة دخل المنظومة من عمولات الشاحنات (الـ 200 ج.م أو المعدلة)
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <span className="text-xs text-slate-500 font-semibold block">إجمالي أرباح العمولات</span>
              <span className="text-2xl font-black text-blue-900">
                {overallTotals.systemCommission.toLocaleString()} ج.م
              </span>
              <span className="text-[11px] text-slate-400 block mt-2">
                محسوبة على {movements.length} حركة شاحنة مسجلة
              </span>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <span className="text-xs text-slate-500 font-semibold block">متوسط عمولة الشاحنة</span>
              <span className="text-2xl font-black text-slate-800">
                {movements.length > 0
                  ? (overallTotals.systemCommission / movements.length).toFixed(1)
                  : 0}{' '}
                ج.م
              </span>
              <span className="text-[11px] text-slate-400 block mt-2">
                العمولة الافتراضية المحددة بالسيستم: 200 ج.م
              </span>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <span className="text-xs text-slate-500 font-semibold block">إجمالي عمولات نافذ المحصلة</span>
              <span className="text-2xl font-black text-indigo-900">
                {overallTotals.nafez.toLocaleString()} ج.م
              </span>
              <span className="text-[11px] text-slate-400 block mt-2">
                خدمات نافذ الإضافية
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Receipts Ledger */}
      {activeSubTab === 'receipts' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-indigo-600" />
              <span>سجل سندات القبض والدفعات المحصلة</span>
            </h2>
            <button
              onClick={() => onOpenPaymentModal()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition"
            >
              + إضافة سند
            </button>
          </div>

          {payments.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right border-collapse">
                <thead className="bg-slate-800 text-white font-bold">
                  <tr>
                    <th className="p-2.5 border border-slate-700">رقم السند</th>
                    <th className="p-2.5 border border-slate-700">التاريخ</th>
                    <th className="p-2.5 border border-slate-700">العميل</th>
                    <th className="p-2.5 border border-slate-700 text-center">المبلغ المحصل</th>
                    <th className="p-2.5 border border-slate-700">طريقة الدفع</th>
                    <th className="p-2.5 border border-slate-700">ملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="p-2.5 border border-slate-200 font-mono font-bold text-blue-900">
                        {p.receipt_no}
                      </td>
                      <td className="p-2.5 border border-slate-200 text-slate-600">
                        {p.date}
                      </td>
                      <td className="p-2.5 border border-slate-200 font-bold text-slate-900">
                        {p.customer_name}
                      </td>
                      <td className="p-2.5 border border-slate-200 text-center font-mono font-bold text-emerald-800 bg-emerald-50/50">
                        {p.amount.toLocaleString()} ج.م
                      </td>
                      <td className="p-2.5 border border-slate-200 text-slate-700">
                        {p.payment_method === 'cash' && 'نقدي'}
                        {p.payment_method === 'bank_transfer' && 'تحويل بنكي'}
                        {p.payment_method === 'check' && 'شيك مصرفي'}
                        {p.payment_method === 'other' && 'أخرى'}
                      </td>
                      <td className="p-2.5 border border-slate-200 text-slate-500">
                        {p.notes || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400 text-xs">
              لم يتم تسجيل سندات قبض حتى الآن. اضغط "تسجيل سند قبض جديد" لإضافة دفعة.
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Driver Account Statement (كشف حساب السائقين) */}
      {activeSubTab === 'drivers' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-5">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Truck className="w-5 h-5 text-orange-600" />
              <span>كشف حساب السائقين — إجمالي الشحنات والمصاريف</span>
            </h2>
            <p className="text-xs text-slate-500">
              ابحث باسم السائق لعرض جميع شحناته وإجمالي ما عليه من مبالغ
            </p>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-96">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="ابحث باسم السائق..."
              value={driverSearch}
              onChange={(e) => setDriverSearch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg pr-9 pl-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          {/* Autocomplete hints */}
          {driverSearch.trim().length >= 1 && driverLedger.length === 0 && (
            <div className="text-xs text-slate-400 text-right">
              {allDriverNames.filter(n => n.toLowerCase().includes(driverSearch.trim().toLowerCase())).length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {allDriverNames
                    .filter(n => n.toLowerCase().includes(driverSearch.trim().toLowerCase()))
                    .slice(0, 8)
                    .map(n => (
                      <button
                        key={n}
                        onClick={() => setDriverSearch(n)}
                        className="bg-orange-50 border border-orange-200 text-orange-800 text-xs px-3 py-1 rounded-full hover:bg-orange-100 transition"
                      >
                        {n}
                      </button>
                    ))}
                </div>
              ) : (
                <span>لا يوجد سائق بهذا الاسم في قاعدة البيانات</span>
              )}
            </div>
          )}

          {/* Empty state */}
          {!driverSearch.trim() && (
            <div className="text-center py-10 text-slate-400 text-sm">
              <Truck className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p>اكتب اسم السائق في خانة البحث لعرض كشف حسابه الكامل</p>
              <p className="text-xs mt-1">
                يوجد {allDriverNames.length} سائق مسجل في النظام
              </p>
            </div>
          )}

          {/* Driver Results */}
          {driverLedger.map((driver) => {
            const exportDriverExcel = async () => {
              const XLSX = await import('xlsx');
              const rows = driver.moves.map((m, i) => ({
                'م': i + 1,
                'رقم الحاوية': m.container_no || '',
                'رقم الإقرار': m.declaration_no || '',
                'رقم الشاحنة': m.truck_no || '',
                'رقم المقطورة': m.trailer_no || '',
                'التاريخ': m.movement_date || '',
                'فاتورة كاشير': m.cashier_invoice || 0,
                'عمولة المنظومة': m.system_commission || 0,
                'نافذ': m.nafez_commission || 0,
                'الإجمالي': m.total_amount || 0,
                'المدفوع': m.paid_amount || 0,
                'المتبقي': m.remaining_amount || 0,
                'الحالة': m.payment_status === 'paid' ? 'مسدد' : m.payment_status === 'partial' ? 'جزئي' : 'معلق',
              }));
              const ws = XLSX.utils.json_to_sheet(rows);
              ws['!views'] = [{ rightToLeft: true }];
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, `كشف ${driver.name}`);
              XLSX.writeFile(wb, `كشف_حساب_${driver.name}_${new Date().toISOString().split('T')[0]}.xlsx`);
            };

            return (
              <div key={driver.name} className="border border-orange-200 rounded-xl overflow-hidden">
                {/* Driver Header */}
                <div className="bg-orange-600 text-white px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    <span className="font-black text-sm">{driver.name}</span>
                    <span className="bg-orange-500/60 text-[11px] px-2 py-0.5 rounded-full">
                      {driver.moves.length} شحنة
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDownloadCustomerPdf(driver.name, driver.moves, driver)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black px-3 py-1.5 rounded-lg flex items-center gap-1 transition shadow-sm"
                      title="تحميل كشف حساب ومطالبة العميل PDF بصيغة سهلة للطباعة والإرسال"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>تحميل مطالبة PDF للعميل</span>
                    </button>
                    {onBatchUpdateMovements && (
                      <button
                        onClick={() => handleApplyOverallCustomerDiscount(driver.name)}
                        className="bg-rose-500 hover:bg-rose-600 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition shadow-sm"
                        title="تطبيق خصم إجمالي بالجنيه على حساب هذا العميل"
                      >
                        <Percent className="w-3 h-3" />
                        <span>خصم عام</span>
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setSelectedDriverForInvoice(driver);
                        setIsDriverInvoiceOpen(true);
                      }}
                      className="bg-white text-orange-850 hover:bg-orange-50 text-[11px] font-black px-3 py-1.5 rounded-lg flex items-center gap-1 transition shadow-sm"
                    >
                      <FileText className="w-3.5 h-3.5 text-orange-600" />
                      <span>معاينة الفاتورة</span>
                    </button>
                    <button
                      onClick={exportDriverExcel}
                      className="bg-white/20 hover:bg-white/30 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Excel
                    </button>
                  </div>
                </div>

                {/* Movements Table */}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-xs text-right border-collapse">
                    <thead className="bg-slate-800 text-white font-bold">
                      <tr>
                        <th className="p-2 border border-slate-700 text-center w-8">م</th>
                        <th className="p-2 border border-slate-700">رقم الحاوية</th>
                        <th className="p-2 border border-slate-700">رقم الإقرار</th>
                        <th className="p-2 border border-slate-700">رقم الشاحنة</th>
                        <th className="p-2 border border-slate-700">رقم المقطورة</th>
                        <th className="p-2 border border-slate-700 text-center">التاريخ</th>
                        <th className="p-2 border border-slate-700 text-center">مسلسل الكاشير</th>
                        <th className="p-2 border border-slate-700 text-center">مبلغ الكاشير</th>
                        <th className="p-2 border border-slate-700 text-center">عمولة منظومة</th>
                        <th className="p-2 border border-slate-700 text-center text-rose-300">الخصم (ج.م)</th>
                        <th className="p-2 border border-slate-700 text-center bg-blue-950">الصافي المطلوب</th>
                        <th className="p-2 border border-slate-700 text-center bg-emerald-950">مدفوع</th>
                        <th className="p-2 border border-slate-700 text-center bg-rose-950">متبقي</th>
                        <th className="p-2 border border-slate-700 text-center">الحالة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {driver.moves.map((m, i) => (
                        <tr key={m.id} className="hover:bg-orange-50/30">
                          <td className="p-2 border border-slate-200 text-center text-slate-500 bg-slate-50">{i + 1}</td>
                          <td className="p-2 border border-slate-200 font-mono font-bold text-blue-800">{m.container_no || '-'}</td>
                          <td className="p-2 border border-slate-200 font-mono">{m.declaration_no || '-'}</td>
                          <td className="p-2 border border-slate-200 font-mono">{m.truck_no || '-'}</td>
                          <td className="p-2 border border-slate-200 font-mono">{m.trailer_no || '-'}</td>
                          <td className="p-2 border border-slate-200 text-center text-slate-600">{m.movement_date || '-'}</td>
                          <td className="p-2 border border-slate-200 text-center font-mono text-indigo-700 font-bold">
                            {m.cashier_receipt_no ? (
                              <span className="bg-indigo-50 border border-indigo-200 text-indigo-900 px-1.5 py-0.5 rounded text-[10px]">
                                {m.cashier_receipt_no}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[10px]">-</span>
                            )}
                          </td>
                          <td className="p-2 border border-slate-200 text-center font-mono">{(m.cashier_invoice || 0).toLocaleString()}</td>
                          <td className="p-2 border border-slate-200 text-center font-mono text-blue-700">{(m.system_commission || 0).toLocaleString()}</td>
                          <td className="p-2 border border-slate-200 text-center">
                            {onBatchUpdateMovements ? (
                              <input
                                type="number"
                                min="0"
                                step="5"
                                placeholder="0"
                                value={m.discount || ''}
                                onChange={(e) => handleUpdateMovementDiscount(m.id, Number(e.target.value))}
                                className="w-16 bg-white border border-rose-300 rounded px-1 py-0.5 text-xs text-center font-bold text-rose-700 focus:outline-none focus:ring-1 focus:ring-rose-500"
                                title="تعديل الخصم لهذه الشحنة"
                              />
                            ) : (
                              <span className="font-mono text-rose-700 font-bold">{m.discount || 0}</span>
                            )}
                          </td>
                          <td className="p-2 border border-slate-200 text-center font-mono font-black text-slate-900 bg-blue-50/50">{(m.total_amount || 0).toLocaleString()} ج.م</td>
                          <td className="p-2 border border-slate-200 text-center font-mono font-bold text-emerald-800 bg-emerald-50/50">{(m.paid_amount || 0).toLocaleString()} ج.م</td>
                          <td className="p-2 border border-slate-200 text-center font-mono font-black text-rose-800 bg-rose-50/50">{(m.remaining_amount || 0).toLocaleString()} ج.م</td>
                          <td className="p-2 border border-slate-200 text-center">
                            {m.payment_status === 'paid' && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">مسدد</span>}
                            {m.payment_status === 'partial' && <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">جزئي</span>}
                            {m.payment_status === 'unpaid' && <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">معلق</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {/* Totals Footer Row */}
                    <tfoot>
                      <tr className="bg-slate-900 text-white font-black text-xs">
                        <td colSpan={7} className="p-2.5 border border-slate-700 text-right pr-4">
                          إجمالي {driver.name} ({driver.moves.length} شحنة)
                        </td>
                        <td className="p-2.5 border border-slate-700 text-center font-mono">{driver.cashierTotal.toLocaleString()}</td>
                        <td className="p-2.5 border border-slate-700 text-center font-mono text-blue-300">{driver.systemCommTotal.toLocaleString()}</td>
                        <td className="p-2.5 border border-slate-700 text-center font-mono text-rose-300">{(driver.discountTotal || 0).toLocaleString()} ج.م</td>
                        <td className="p-2.5 border border-slate-600 text-center font-mono bg-blue-900">{driver.totalAmount.toLocaleString()} ج.م</td>
                        <td className="p-2.5 border border-slate-600 text-center font-mono bg-emerald-900">{driver.paidTotal.toLocaleString()} ج.م</td>
                        <td className="p-2.5 border border-slate-600 text-center font-mono bg-rose-900">{driver.remainingTotal.toLocaleString()} ج.م</td>
                        <td className="p-2.5 border border-slate-700 text-center">
                          {driver.remainingTotal === 0
                            ? <span className="text-emerald-300 text-[10px]">✓ خالص</span>
                            : <span className="text-rose-300 text-[10px]">مدين</span>}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Driver Invoice Modal */}
      {isDriverInvoiceOpen && selectedDriverForInvoice && (
        <DriverInvoiceModal
          isOpen={isDriverInvoiceOpen}
          onClose={() => {
            setIsDriverInvoiceOpen(false);
            setSelectedDriverForInvoice(null);
          }}
          movements={selectedDriverForInvoice.moves}
          initialDriverName={selectedDriverForInvoice.name}
        />
      )}
    </div>
  );
};
