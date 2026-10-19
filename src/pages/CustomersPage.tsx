import React, { useState } from 'react';
import { Customer, Movement } from '../types';
import { useAuth } from '../contexts/AuthContext';
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
  Wallet,
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

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.includes(searchTerm)
  );

  // Calculate customer financials
  const getCustomerStats = (customer: Customer) => {
    const custMovements = movements.filter(
      (m) => m.customer_id === customer.id || m.customer_name === customer.name
    );
    const count = custMovements.length;
    const totalBilled = custMovements.reduce((sum, m) => sum + (m.total_amount || 0), 0);
    const totalPaid = custMovements.reduce((sum, m) => sum + (m.paid_amount || 0), 0);
    const totalRemaining = custMovements.reduce((sum, m) => sum + (m.remaining_amount || 0), 0);

    return { count, totalBilled, totalPaid, totalRemaining };
  };

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
              <Users className="w-6 h-6 text-blue-600" />
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
            placeholder="بحث باسم العميل، كود العميل، أو رقم الهاتف..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 rounded-lg pr-9 pl-3 py-2 text-xs focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Customer Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredCustomers.map((customer) => {
          const stats = getCustomerStats(customer);
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
                    <span>السيارات المسجلة ({customer.trucks?.length || 0})</span>
                  </div>
                  <button className="text-slate-400">
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>

                {isExpanded && (
                  <div className="mt-3 space-y-2 border-t pt-2">
                    {customer.trucks && customer.trucks.length > 0 ? (
                      customer.trucks.map((truck, idx) => (
                        <div
                          key={idx}
                          className="bg-slate-50 p-2 rounded-lg text-xs border border-slate-100"
                        >
                          <div className="font-bold text-blue-900">
                            شاحنة: {truck.truck_no}
                          </div>
                          {truck.trailer_no && (
                            <div className="text-slate-500 text-[11px]">
                              مقطورة: {truck.trailer_no}
                            </div>
                          )}
                          {truck.driver_name && (
                            <div className="text-slate-600 text-[11px]">
                              السائق: {truck.driver_name}
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
    </div>
  );
};
