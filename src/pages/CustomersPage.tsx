import React, { useMemo, useState } from 'react';
import { Customer, Movement } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { normalizeCustomerName } from '../lib/customerName';
import {
  Users,
  Plus,
  Truck,
  Phone,
  Mail,
  Edit2,
  Trash2,
  CreditCard,
  ChevronDown,
  ChevronUp,
  Search,
} from 'lucide-react';

interface CustomersPageProps {
  customers: Customer[];
  movements: Movement[];
  onOpenAddModal: () => void;
  onEditCustomer: (customer: Customer) => void;
  onDeleteCustomer: (id: string) => void;
  onOpenPaymentModal: (customerId: string) => void;
}

export const CustomersPage: React.FC<CustomersPageProps> = ({
  customers,
  movements,
  onOpenAddModal,
  onEditCustomer,
  onDeleteCustomer,
  onOpenPaymentModal,
}) => {
  const { canViewFinancials } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 24;

  const customerById = useMemo(() => new Map(customers.map((customer) => [customer.id, customer])), [customers]);
  const customerByNormalizedName = useMemo(() => {
    const grouped = new Map<string, Customer[]>();
    customers.forEach((customer) => {
      const key = normalizeCustomerName(customer.name);
      grouped.set(key, [...(grouped.get(key) || []), customer]);
    });
    return new Map(Array.from(grouped.entries())
      .filter(([, matches]) => matches.length === 1)
      .map(([key, [customer]]) => [key, customer]));
  }, [customers]);

  const customerFleet = useMemo(() => {
    const fleets = new Map<string, Array<{ truck_no: string; trailer_no: string; driver_names: string[]; fromMovement: boolean }>>();
    const addVehicle = (customerId: string, vehicle: { truck_no?: string; trailer_no?: string; driver_name?: string }, fromMovement: boolean) => {
      const truckNo = (vehicle.truck_no || '').trim();
      if (!truckNo || normalizeCustomerName(truckNo) === 'غير محدد') return;
      const trailerNo = (vehicle.trailer_no || '').trim();
      const truckKey = `${normalizeCustomerName(truckNo)}|${normalizeCustomerName(trailerNo)}`;
      const rows = fleets.get(customerId) || [];
      const existing = rows.find((row) => `${normalizeCustomerName(row.truck_no)}|${normalizeCustomerName(row.trailer_no)}` === truckKey);
      const driverName = (vehicle.driver_name || '').trim();
      if (existing) {
        if (driverName && !existing.driver_names.some((name) => normalizeCustomerName(name) === normalizeCustomerName(driverName))) {
          existing.driver_names.push(driverName);
        }
        existing.fromMovement ||= fromMovement;
      } else {
        rows.push({ truck_no: truckNo, trailer_no: trailerNo, driver_names: driverName ? [driverName] : [], fromMovement });
        fleets.set(customerId, rows);
      }
    };

    customers.forEach((customer) => (customer.trucks || []).forEach((truck) => addVehicle(customer.id, truck, false)));
    movements.forEach((movement) => {
      const directId = movement.customer_id?.trim();
      const customer = (directId && customerById.get(directId))
        || customerByNormalizedName.get(normalizeCustomerName(movement.customer_name || movement.driver_name || ''));
      if (customer) addVehicle(customer.id, movement, true);
    });
    return fleets;
  }, [customers, movements, customerById, customerByNormalizedName]);

  const filteredCustomers = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase('ar-EG');
    return customers
      .filter((customer) => !query || [customer.name, customer.code, customer.phone, ...(customer.trucks || []).map((truck) => truck.truck_no)]
        .some((value) => (value || '').toLocaleLowerCase('ar-EG').includes(query)) || movements.some((movement) =>
          (movement.customer_id === customer.id || movement.customer_name === customer.name) &&
          [movement.driver_name, movement.truck_no, movement.trailer_no, movement.container_no, movement.container_desc, movement.container_path, movement.declaration_no, movement.movement_date]
            .some((value) => value?.toLocaleLowerCase('ar-EG').includes(query))))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }, [customers, movements, searchTerm]);
  const pageCount = Math.max(1, Math.ceil(filteredCustomers.length / pageSize));
  const safePage = Math.min(currentPage, pageCount);
  const visibleCustomers = filteredCustomers.slice((safePage - 1) * pageSize, safePage * pageSize);

  const customerStats = useMemo(() => {
    const stats = new Map(customers.map((customer) => [customer.id, { count: 0, totalBilled: 0, totalPaid: 0, totalRemaining: 0 }]));
    movements.forEach((movement) => {
      const directId = movement.customer_id?.trim();
      const customerId = (directId && customerById.get(directId)?.id)
        || customerByNormalizedName.get(normalizeCustomerName(movement.customer_name || movement.driver_name || ''))?.id;
      const current = customerId ? stats.get(customerId) : undefined;
      if (!current) return;
      current.count += 1;
      current.totalBilled += Number(movement.total_amount) || 0;
      current.totalPaid += Number(movement.paid_amount) || 0;
      current.totalRemaining += Number(movement.remaining_amount) || 0;
    });
    return stats;
  }, [customers, movements, customerById, customerByNormalizedName]);

  const toggleExpand = (id: string) => {
    setExpandedCustomerId(expandedCustomerId === id ? null : id);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <span>دليل تكويد العملاء وإدارة أسطول الشاحنات</span>
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              تكويد كل عميل في المنظومة وربط شاحناته وسائقيه ومتابعة الحسابات والمديونيات
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onOpenAddModal}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg shadow-sm transition flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>تكويد عميل جديد</span>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="mt-5 relative max-w-md">
          <Search className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="ابحث بالعميل أو السائق أو رقم الشاحنة أو الحاوية أو وصفها أو التاريخ..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="w-full bg-slate-50 border border-slate-300 rounded-lg pr-9 pl-3 py-2 text-xs focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs font-semibold text-slate-600">
            {filteredCustomers.length === 0 ? 'لا يوجد عملاء مطابقون' : `عرض ${((safePage - 1) * pageSize) + 1}–${Math.min(safePage * pageSize, filteredCustomers.length)} من ${filteredCustomers.length} عميل`}
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={safePage <= 1} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40">السابق</button>
            <span className="min-w-20 text-center text-xs text-slate-600">صفحة {safePage} من {pageCount}</span>
            <button type="button" onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))} disabled={safePage >= pageCount} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40">التالي</button>
          </div>
        </div>
      </div>

      {/* Customer Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {visibleCustomers.map((customer) => {
          const stats = customerStats.get(customer.id) || { count: 0, totalBilled: 0, totalPaid: 0, totalRemaining: 0 };
          const fleet = customerFleet.get(customer.id) || [];
          const isExpanded = expandedCustomerId === customer.id;

          return (
            <div
              key={customer.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition overflow-hidden flex flex-col justify-between"
            >
              {/* Card Header */}
              <div className="p-5 border-b border-slate-100">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full font-mono">
                      {customer.code}
                    </span>
                    <h2 className="text-base font-bold text-slate-900 mt-2">
                      {customer.name}
                    </h2>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onEditCustomer(customer)}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                      title="تعديل العميل والسيارات"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onDeleteCustomer(customer.id)}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition"
                      title="حذف العميل"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-1 mt-3 text-xs text-slate-600">
                  {customer.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span dir="ltr">{customer.phone}</span>
                    </div>
                  )}
                  {customer.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span>{customer.email}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Financial Stats Bar (if allowed) */}
              {canViewFinancials && (
                <div className="bg-slate-50 p-4 border-b border-slate-100 grid grid-cols-3 gap-2 text-center">
                  <div className="p-1">
                    <span className="text-[10px] text-slate-500 block">إجمالي المستحق</span>
                    <span className="text-xs font-bold text-slate-800">
                      {stats.totalBilled.toLocaleString()} ج
                    </span>
                  </div>
                  <div className="p-1">
                    <span className="text-[10px] text-emerald-600 block">دفع كام</span>
                    <span className="text-xs font-bold text-emerald-700">
                      {stats.totalPaid.toLocaleString()} ج
                    </span>
                  </div>
                  <div className="p-1">
                    <span className="text-[10px] text-rose-600 block">ناقص كام</span>
                    <span className="text-xs font-black text-rose-700">
                      {stats.totalRemaining.toLocaleString()} ج
                    </span>
                  </div>
                </div>
              )}

              {/* Fleet & Trucks Section */}
              <div className="p-4 bg-white">
                <div
                  onClick={() => toggleExpand(customer.id)}
                  className="flex items-center justify-between cursor-pointer text-xs font-bold text-slate-700 py-1"
                >
                  <div className="flex items-center gap-1.5">
                    <Truck className="w-4 h-4 text-blue-600" />
                    <span>المركبات المسجلة والحركات ({fleet.length})</span>
                  </div>
                  <button className="text-slate-400">
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>

                {isExpanded && (
                  <div className="mt-3 space-y-2 border-t pt-2">
                    {fleet.length > 0 ? (
                      fleet.map((truck, idx) => (
                        <div
                          key={`${normalizeCustomerName(truck.truck_no)}-${normalizeCustomerName(truck.trailer_no)}-${idx}`}
                          className="bg-slate-50 p-2 rounded-lg text-xs border border-slate-100"
                        >
                          <div className="flex flex-wrap items-center gap-2 font-bold text-blue-900">
                            <span>شاحنة: {truck.truck_no}</span>
                            {truck.fromMovement && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">من الحركات</span>}
                          </div>
                          {truck.trailer_no && (
                            <div className="text-slate-500 text-[11px]">
                              مقطورة: {truck.trailer_no}
                            </div>
                          )}
                          {truck.driver_names.length > 0 && (
                            <div className="text-slate-600 text-[11px]">
                              السائق: {truck.driver_names.join('، ')}
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-[11px] text-slate-400 italic">
                        لم يتم تسجيل سيارات بعد لهذا العميل
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              {canViewFinancials && (
                <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-500 font-medium">
                    الحركات: {stats.count}
                  </span>
                  <button
                    onClick={() => onOpenPaymentModal(customer.id)}
                    className="inline-flex items-center gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg transition"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>تسجيل سند قبض</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {visibleCustomers.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          لا يوجد عميل يطابق البحث الحالي.
        </div>
      )}
    </div>
  );
};
