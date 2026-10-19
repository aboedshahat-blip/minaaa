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
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface AccountsPageProps {
  movements: Movement[];
  customers: Customer[];
  payments: PaymentReceipt[];
  onOpenPaymentModal: (customerId?: string) => void;
}

export const AccountsPage: React.FC<AccountsPageProps> = ({
  movements,
  customers,
  payments,
  onOpenPaymentModal,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSubTab, setActiveSubTab] = useState<'clients' | 'system_revenue' | 'receipts'>('clients');

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
      const totalAmount = custMovements.reduce((sum, m) => sum + (m.total_amount || 0), 0);
      const paidTotal = custMovements.reduce((sum, m) => sum + (m.paid_amount || 0), 0);
      const remainingTotal = custMovements.reduce((sum, m) => sum + (m.remaining_amount || 0), 0);

      const paidRatio = totalAmount > 0 ? (paidTotal / totalAmount) * 100 : 100;

      return {
        customer: c,
        truckCount,
        cashierTotal,
        systemCommTotal,
        nafezCommTotal,
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
    let total = 0;
    let paid = 0;
    let remaining = 0;

    for (const m of movements) {
      cashier += Number(m.cashier_invoice) || 0;
      systemCommission += Number(m.system_commission) || 0;
      nafez += Number(m.nafez_commission) || 0;
      total += Number(m.total_amount) || 0;
      paid += Number(m.paid_amount) || 0;
      remaining += Number(m.remaining_amount) || 0;
    }

    return { cashier, systemCommission, nafez, total, paid, remaining };
  }, [movements]);

  // Export Customer Financials to Excel
  const handleExportAccountsExcel = () => {
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
            <table className="w-full text-xs text-right border-collapse">
              <thead className="bg-slate-900 text-white font-bold">
                <tr>
                  <th className="p-2.5 border border-slate-700 text-center w-10">م</th>
                  <th className="p-2.5 border border-slate-700">كود العميل</th>
                  <th className="p-2.5 border border-slate-700">اسم العميل</th>
                  <th className="p-2.5 border border-slate-700 text-center">عدد الشاحنات</th>
                  <th className="p-2.5 border border-slate-700 text-center">فواتير الكاشير</th>
                  <th className="p-2.5 border border-slate-700 text-center">عمولة المنظومة</th>
                  <th className="p-2.5 border border-slate-700 text-center">عمولة نافذ</th>
                  <th className="p-2.5 border border-slate-700 text-center bg-blue-950">إجمالي المطلوب</th>
                  <th className="p-2.5 border border-slate-700 text-center bg-emerald-950">المدفوع (دفع كام)</th>
                  <th className="p-2.5 border border-slate-700 text-center bg-rose-950">المتبقي (ناقص كام)</th>
                  <th className="p-2.5 border border-slate-700 text-center">حالة الحساب</th>
                  <th className="p-2.5 border border-slate-700 text-center">تحصيل</th>
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
                    <td className="p-2.5 border border-slate-200 text-center font-mono text-indigo-700">
                      {row.nafezCommTotal.toLocaleString()}
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
                      <button
                        onClick={() => onOpenPaymentModal(row.customer.id)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-2.5 py-1 rounded transition"
                      >
                        سند قبض
                      </button>
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
    </div>
  );
};
