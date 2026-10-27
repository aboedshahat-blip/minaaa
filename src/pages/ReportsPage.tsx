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
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>(() => customers.map((customer) => customer.id));
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const selectedCustomers = useMemo(
    () => customers.filter((customer) => selectedCustomerIds.includes(customer.id)),
    [customers, selectedCustomerIds],
  );

  const selectedCustomerReports = useMemo(() => selectedCustomers.map((customer) => {
    const clientMovements = movements.filter((movement) => {
      const matchesCustomer = movement.customer_id === customer.id || movement.customer_name === customer.name;
      if (!matchesCustomer) return false;
      if (dateFrom && movement.movement_date < dateFrom) return false;
      if (dateTo && movement.movement_date > dateTo) return false;
      const term = searchTerm.trim().toLocaleLowerCase('ar-EG');
      if (term) {
        const searchableFields = [movement.customer_name, movement.driver_name, movement.truck_no, movement.trailer_no, movement.container_no, movement.container_desc, movement.container_path, movement.declaration_no, movement.cashier_receipt_no, movement.movement_date];
        if (!searchableFields.some((value) => value?.toLocaleLowerCase('ar-EG').includes(term))) return false;
      }
      return true;
    });
    const stats = clientMovements.reduce((totals, movement) => ({
      count: totals.count + 1,
      cashier: totals.cashier + (Number(movement.cashier_invoice) || 0),
      sysComm: totals.sysComm + (Number(movement.system_commission) || 0),
      nafez: totals.nafez + (Number(movement.nafez_commission) || 0),
      total: totals.total + (Number(movement.total_amount) || 0),
      paid: totals.paid + (Number(movement.paid_amount) || 0),
      remaining: totals.remaining + (Number(movement.remaining_amount) || 0),
    }), { count: 0, cashier: 0, sysComm: 0, nafez: 0, total: 0, paid: 0, remaining: 0 });
    return { customer, movements: clientMovements, stats };
  }), [selectedCustomers, movements, dateFrom, dateTo, searchTerm]);

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
    if (selectedCustomerReports.length === 0) return;
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    selectedCustomerReports.forEach(({ customer, movements: clientMovements }, reportIndex) => {
      const data = clientMovements.map((m, idx) => ({
        'م': m.seq || idx + 1,
        'تاريخ الحركة': m.movement_date,
        'رقم الشاحنة': m.truck_no,
        'رقم المقطورة': m.trailer_no || '',
        'اسم السائق': m.driver_name || '',
        'رقم الحاوية': m.container_no || '',
        'وصف الحاوية': m.container_desc || '',
        'مسار الحاوية': m.container_path || '',
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
      const sheetName = `${reportIndex + 1}_${customer.code}_${customer.name}`.replace(/[\\/?*:[\]]/g, ' ').slice(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName || `عميل_${reportIndex + 1}`);
    });
    XLSX.writeFile(wb, `تقارير_العملاء_${selectedCustomerReports.length}_عميل.xlsx`);
  };

  const handlePrint = async () => {
    if (selectedCustomerReports.length === 0) return;
    if (!await confirmAction(`سيتم طباعة التقارير المحددة لـ ${selectedCustomerReports.length} عميل. هل تريد المتابعة؟`, 'نعم، اطبع التقارير')) return;
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
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 items-end">
              <div className="relative">
                <label className="block text-xs font-semibold text-slate-700 mb-1">العملاء المشمولون في التقرير</label>
                <details className="group">
                  <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800">
                    <span>{selectedCustomers.length === customers.length ? `كل العملاء (${customers.length})` : `تم تحديد ${selectedCustomers.length} من ${customers.length}`}</span>
                    <span className="text-slate-400">⌄</span>
                  </summary>
                  <div className="absolute right-0 top-full z-20 mt-1 max-h-64 w-full min-w-64 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
                    <label className="flex cursor-pointer items-center gap-2 border-b border-slate-100 px-2 py-2 text-xs font-bold text-blue-800">
                      <input
                        type="checkbox"
                        checked={customers.length > 0 && selectedCustomers.length === customers.length}
                        onChange={(event) => setSelectedCustomerIds(event.target.checked ? customers.map((customer) => customer.id) : [])}
                      />
                      تحديد الكل للطباعة
                    </label>
                    {customers.map((customer) => (
                      <label key={customer.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-xs text-slate-700 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={selectedCustomerIds.includes(customer.id)}
                          onChange={(event) => setSelectedCustomerIds((current) => event.target.checked ? [...current, customer.id] : current.filter((id) => id !== customer.id))}
                        />
                        <span>[{customer.code}] {customer.name}</span>
                      </label>
                    ))}
                  </div>
                </details>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">بحث في الحركات</label>
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="اسم، حاوية، وصف أو تاريخ..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs"
                />
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
                  disabled={selectedCustomerReports.length === 0}
                  className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold py-2 px-3 rounded-lg flex-1 flex items-center justify-center gap-1.5 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>تصدير Excel</span>
                </button>

                <button
                  onClick={handlePrint}
                  disabled={selectedCustomerReports.length === 0}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة الكشف</span>
                </button>
              </div>
            </div>
          </div>

          {/* Client Statement Card */}
          {selectedCustomerReports.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              حدد عميلًا واحدًا على الأقل لعرض التقرير أو طباعته.
            </div>
          )}
          {selectedCustomerReports.map(({ customer: selectedCustomer, movements: clientMovements, stats: clientStats }) => (
            <div key={selectedCustomer.id} className="client-report-print bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6 print:break-before-page">
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
                        <th className="p-2 border border-slate-700">وصف الحاوية</th>
                        <th className="p-2 border border-slate-700">مسار الحاوية</th>
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
                            <td className="p-2 border border-slate-200 text-slate-700">{m.container_desc || '-'}</td>
                            <td className="p-2 border border-slate-200 text-slate-700">{m.container_path || '-'}</td>
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
                          <td colSpan={16} className="p-6 text-center text-slate-400 text-xs">
                            لا توجد حركات مسجلة لهذا العميل في النطاق الزمني المحدد.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ))}
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
