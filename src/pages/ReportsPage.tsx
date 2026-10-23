import React, { useState, useMemo } from 'react';
import { useConfirmAction } from '../contexts/ConfirmActionContext';
import { Customer, Movement, Berth } from '../types';
import {
  BarChart3,
  FileText,
  Printer,
  Download,
  Users,
  PieChart,
  Truck,
  TrendingUp,
  CheckCircle,
  AlertCircle,
  Clock,
} from 'lucide-react';

interface ReportsPageProps {
  customers: Customer[];
  movements: Movement[];
  berths: Berth[];
}

export const ReportsPage: React.FC<ReportsPageProps> = ({
  customers,
  movements,
  berths,
}) => {
  const confirmAction = useConfirmAction();
  const [activeReport, setActiveReport] = useState<'detailed_client' | 'statistics'>('detailed_client');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(customers[0]?.id || '');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Selected customer details
  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  // Movements of selected customer filtered by date
  const clientMovements = useMemo(() => {
    if (!selectedCustomer) return [];
    return movements.filter((m) => {
      const matchCust = m.customer_id === selectedCustomer.id || m.customer_name === selectedCustomer.name;
      if (!matchCust) return false;
      if (dateFrom && m.movement_date < dateFrom) return false;
      if (dateTo && m.movement_date > dateTo) return false;
      return true;
    });
  }, [movements, selectedCustomer, dateFrom, dateTo]);

  // Client summary stats
  const clientStats = useMemo(() => {
    let cashier = 0;
    let sysComm = 0;
    let nafez = 0;
    let total = 0;
    let paid = 0;
    let remaining = 0;

    for (const m of clientMovements) {
      cashier += Number(m.cashier_invoice) || 0;
      sysComm += Number(m.system_commission) || 0;
      nafez += Number(m.nafez_commission) || 0;
      total += Number(m.total_amount) || 0;
      paid += Number(m.paid_amount) || 0;
      remaining += Number(m.remaining_amount) || 0;
    }

    return {
      count: clientMovements.length,
      cashier,
      sysComm,
      nafez,
      total,
      paid,
      remaining,
    };
  }, [clientMovements]);

  // Statistical analytics for all clients
  const statistics = useMemo(() => {
    const totalMovements = movements.length;

    // Per-client statistics
    const perClient = customers.map((c) => {
      const cMoves = movements.filter((m) => m.customer_id === c.id || m.customer_name === c.name);
      const count = cMoves.length;
      const totalAmount = cMoves.reduce((s, m) => s + (m.total_amount || 0), 0);
      const paidAmount = cMoves.reduce((s, m) => s + (m.paid_amount || 0), 0);
      const remainingAmount = cMoves.reduce((s, m) => s + (m.remaining_amount || 0), 0);
      const percentage = totalMovements > 0 ? (count / totalMovements) * 100 : 0;

      return {
        customer: c,
        count,
        totalAmount,
        paidAmount,
        remainingAmount,
        percentage,
      };
    }).sort((a, b) => b.count - a.count);

    // Per-berth statistics
    const perBerth = berths.map((b) => {
      const bMoves = movements.filter((m) => m.berth_id === b.id || m.berth_name === b.name);
      const count = bMoves.length;
      const percentage = totalMovements > 0 ? (count / totalMovements) * 100 : 0;
      return { berth: b, count, percentage };
    });

    return { perClient, perBerth, totalMovements };
  }, [customers, movements, berths]);

  // Export Client Detailed Report
  const handleExportClientExcel = async () => {
    if (!selectedCustomer) return;
    const XLSX = await import('xlsx');

    const data = clientMovements.map((m, idx) => ({
      'م': m.seq || idx + 1,
      'تاريخ الحركة': m.movement_date,
      'رقم الشاحنة': m.truck_no,
      'رقم المقطورة': m.trailer_no || '',
      'اسم السائق': m.driver_name || '',
      'رقم الحاوية': m.container_no || '',
      'رقم الاقرار': m.declaration_no || '',
      'الرصيف': m.berth_name || '',
      'فاتورة كاشير': m.cashier_invoice || 0,
      'عمولة المنظومة': m.system_commission || 0,
      'عمولة نافذ': m.nafez_commission || 0,
      'الإجمالي': m.total_amount || 0,
      'المدفوع': m.paid_amount || 0,
      'المتبقي': m.remaining_amount || 0,
      'حالة السداد': m.payment_status === 'paid' ? 'مدفوع' : m.payment_status === 'partial' ? 'جزئي' : 'غير مدفوع',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!views'] = [{ rightToLeft: true }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `تقرير_${selectedCustomer.name}`);
    XLSX.writeFile(wb, `تقرير_حركات_${selectedCustomer.code}_${selectedCustomer.name}.xlsx`);
  };

  const handlePrint = async () => {
    if (!await confirmAction('هل تريد طباعة التقرير الحالي؟', 'نعم، اطبع')) return;
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 no-print">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <span>التقارير التفصيلية والإحصائية</span>
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              كشف حساب تفصيلي لكل عميل على حدة، وإحصائيات شاملة لحجم شغل كل عميل والأرصفة
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveReport('detailed_client')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
                activeReport === 'detailed_client'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              تقرير مفصل لكل عميل على حدة
            </button>

            <button
              onClick={() => setActiveReport('statistics')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
                activeReport === 'statistics'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              تقرير إحصائيات شغل العملاء والأرصفة
            </button>
          </div>
        </div>
      </div>

      {/* REPORT 1: DETAILED CLIENT REPORT */}
      {activeReport === 'detailed_client' && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 no-print">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  اختر العميل لعرض تقريره
                </label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-800"
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
                  من تاريخ
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  إلى تاريخ
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportClientExcel}
                  className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold py-2 px-3 rounded-lg flex-1 flex items-center justify-center gap-1.5 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>تصدير Excel</span>
                </button>

                <button
                  onClick={handlePrint}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة الكشف</span>
                </button>
              </div>
            </div>
          </div>

          {/* Client Statement Card */}
          {selectedCustomer && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
              {/* Header Box */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-4 gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-blue-100 text-blue-800 font-mono font-bold px-2 py-0.5 rounded">
                      {selectedCustomer.code}
                    </span>
                    <h2 className="text-lg font-black text-slate-900">
                      كشف حساب وحركات: {selectedCustomer.name}
                    </h2>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    هاتف: {selectedCustomer.phone} | عدد الشاحنات المسجلة: {selectedCustomer.trucks?.length || 0}
                  </p>
                </div>

                <div className="text-left">
                  <span className="text-xs text-slate-400">تاريخ إصدار التقرير</span>
                  <div className="text-sm font-bold text-slate-800">
                    {new Date().toLocaleDateString('ar-EG')}
                  </div>
                </div>
              </div>

              {/* Subtotals & Totals for this client */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 block">عدد الحركات</span>
                  <span className="text-lg font-black text-slate-800">{clientStats.count} حركة</span>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 block">فواتير الكاشير</span>
                  <span className="text-base font-bold text-slate-800">
                    {clientStats.cashier.toLocaleString()} ج
                  </span>
                </div>

                <div className="bg-blue-50 p-3 rounded-xl border border-blue-200">
                  <span className="text-[10px] text-blue-700 block">عمولة المنظومة</span>
                  <span className="text-base font-bold text-blue-900">
                    {clientStats.sysComm.toLocaleString()} ج
                  </span>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 block">إجمالي المستحق</span>
                  <span className="text-base font-black text-slate-900">
                    {clientStats.total.toLocaleString()} ج
                  </span>
                </div>

                <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                  <span className="text-[10px] text-emerald-700 block">المدفوع (دفع كام)</span>
                  <span className="text-base font-black text-emerald-800">
                    {clientStats.paid.toLocaleString()} ج
                  </span>
                </div>

                <div className="bg-rose-50 p-3 rounded-xl border border-rose-200">
                  <span className="text-[10px] text-rose-700 block">المتبقي (ناقص كام)</span>
                  <span className="text-base font-black text-rose-800">
                    {clientStats.remaining.toLocaleString()} ج
                  </span>
                </div>
              </div>

              {/* Client Detailed Movements Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-right border-collapse">
                    <thead className="bg-slate-900 text-white font-bold">
                      <tr>
                        <th className="p-2 border border-slate-700 text-center w-10">م</th>
                        <th className="p-2 border border-slate-700">التاريخ</th>
                        <th className="p-2 border border-slate-700">رقم الشاحنة</th>
                        <th className="p-2 border border-slate-700">المقطورة</th>
                        <th className="p-2 border border-slate-700">السائق</th>
                        <th className="p-2 border border-slate-700">الحاوية</th>
                        <th className="p-2 border border-slate-700">الإقرار</th>
                        <th className="p-2 border border-slate-700 text-center">الكاشير</th>
                        <th className="p-2 border border-slate-700 text-center">العمولة</th>
                        <th className="p-2 border border-slate-700 text-center">نافذ</th>
                        <th className="p-2 border border-slate-700 text-center bg-blue-950">الإجمالي</th>
                        <th className="p-2 border border-slate-700 text-center bg-emerald-950">المدفوع</th>
                        <th className="p-2 border border-slate-700 text-center bg-rose-950">المتبقي</th>
                        <th className="p-2 border border-slate-700 text-center">الحالة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {clientMovements.length > 0 ? (
                        clientMovements.map((m, idx) => (
                          <tr key={m.id} className="hover:bg-slate-50">
                            <td className="p-2 border border-slate-200 text-center font-bold text-blue-900 bg-slate-50">
                              {m.seq || idx + 1}
                            </td>
                            <td className="p-2 border border-slate-200">{m.movement_date}</td>
                            <td className="p-2 border border-slate-200 font-bold">{m.truck_no}</td>
                            <td className="p-2 border border-slate-200">{m.trailer_no || '-'}</td>
                            <td className="p-2 border border-slate-200">{m.driver_name || '-'}</td>
                            <td className="p-2 border border-slate-200 font-mono text-blue-900">{m.container_no || '-'}</td>
                            <td className="p-2 border border-slate-200 font-mono">{m.declaration_no || '-'}</td>
                            <td className="p-2 border border-slate-200 text-center font-mono">{(m.cashier_invoice || 0).toLocaleString()}</td>
                            <td className="p-2 border border-slate-200 text-center font-mono font-bold text-blue-700">{(m.system_commission || 0).toLocaleString()}</td>
                            <td className="p-2 border border-slate-200 text-center font-mono text-indigo-700">{(m.nafez_commission || 0).toLocaleString()}</td>
                            <td className="p-2 border border-slate-200 text-center font-mono font-bold bg-slate-50">{(m.total_amount || 0).toLocaleString()}</td>
                            <td className="p-2 border border-slate-200 text-center font-mono font-bold text-emerald-800 bg-emerald-50/40">{(m.paid_amount || 0).toLocaleString()}</td>
                            <td className="p-2 border border-slate-200 text-center font-mono font-black text-rose-800 bg-rose-50/40">{(m.remaining_amount || 0).toLocaleString()}</td>
                            <td className="p-2 border border-slate-200 text-center">
                              {m.payment_status === 'paid' && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">خالص</span>}
                              {m.payment_status === 'partial' && <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">جزئي</span>}
                              {m.payment_status === 'unpaid' && <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">متبقي</span>}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={14} className="p-6 text-center text-slate-400 text-xs">
                            لا توجد حركات مسجلة لهذا العميل في النطاق الزمني المحدد.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* REPORT 2: STATISTICAL ANALYTICS REPORT */}
      {activeReport === 'statistics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Client Volume Chart / Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <PieChart className="w-5 h-5 text-blue-600" />
                <span>إحصائيات حصة وحجم شغل كل عميل من الإجمالي</span>
              </h2>

              <div className="space-y-3">
                {statistics.perClient.map((item) => (
                  <div key={item.customer.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800">
                        [{item.customer.code}] {item.customer.name}
                      </span>
                      <span className="text-slate-500 font-mono">
                        {item.count} حركة ({item.percentage.toFixed(1)}%)
                      </span>
                    </div>
                    {/* Visual Bar */}
                    <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-blue-600 h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(5, item.percentage)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Berth Volume Stats */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Truck className="w-5 h-5 text-indigo-600" />
                <span>إحصائيات الحركة على أرصفة الميناء</span>
              </h2>

              <div className="space-y-3">
                {statistics.perBerth.map((item) => (
                  <div key={item.berth.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800">
                        {item.berth.name} ({item.berth.code})
                      </span>
                      <span className="text-slate-500 font-mono">
                        {item.count} شاحنة ({item.percentage.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(5, item.percentage)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
