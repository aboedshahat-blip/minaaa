import React, { useState } from 'react';
import { Movement } from '../types';
import { X, Link2, Check, DollarSign, Search, FileText, Truck, AlertCircle } from 'lucide-react';
import { useConfirmAction } from '../contexts/ConfirmActionContext';

interface CashierLinkingModalProps {
  isOpen: boolean;
  onClose: () => void;
  movements: Movement[];
  onSaveMovement: (movement: Partial<Movement>) => void;
  initialMovement?: Movement | null;
}

export const CashierLinkingModal: React.FC<CashierLinkingModalProps> = ({
  isOpen,
  onClose,
  movements,
  onSaveMovement,
  initialMovement,
}) => {
  const confirmAction = useConfirmAction();
  const [selectedMovementId, setSelectedMovementId] = useState<string>(initialMovement?.id || '');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [receiptNo, setReceiptNo] = useState<string>(initialMovement?.cashier_receipt_no || '');
  const [amount, setAmount] = useState<number>(initialMovement?.cashier_invoice || 0);
  const [category, setCategory] = useState<string>(
    initialMovement?.booking_category || 'وارد حاويات'
  );

  if (!isOpen) return null;

  // Selected movement
  const selectedMovement = movements.find((m) => m.id === selectedMovementId) || initialMovement;

  // Filtered movements for lookup
  const filteredList = movements.filter((m) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      m.container_no?.toLowerCase().includes(term) ||
      m.container_desc?.toLowerCase().includes(term) ||
      m.container_path?.toLowerCase().includes(term) ||
      m.truck_no?.toLowerCase().includes(term) ||
      m.driver_name?.toLowerCase().includes(term) ||
      m.customer_name?.toLowerCase().includes(term) ||
      m.declaration_no?.toLowerCase().includes(term) ||
      m.cashier_receipt_no?.toLowerCase().includes(term) ||
      m.movement_date?.toLowerCase().includes(term)
    );
  });

  const handleSelectMovement = (m: Movement) => {
    setSelectedMovementId(m.id);
    setReceiptNo(m.cashier_receipt_no || '');
    setAmount(m.cashier_invoice || 0);
    setCategory(m.booking_category || 'وارد حاويات');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMovement) {
      alert('يرجى تحديد الشحنة أو الحركة أولاً');
      return;
    }

    if (!receiptNo.trim()) {
      alert('يرجى إدخال مسلسل أو رقم فاتورة الكاشير');
      return;
    }

    const cashierInvoice = Number(amount) || 0;
    const sysComm = Number(selectedMovement.system_commission ?? 200);
    const nafezComm = Number(selectedMovement.nafez_commission ?? 0);
    const newTotal = cashierInvoice + sysComm + nafezComm;
    const customerPaid = selectedMovement.customer_paid_amount !== undefined
      ? Number(selectedMovement.customer_paid_amount) || 0
      : Math.max(0, (Number(selectedMovement.paid_amount) || 0) - (Number(selectedMovement.cashier_invoice) || 0));
    const paid = customerPaid;
    const remaining = Math.max(0, newTotal - paid);

    const updatedData: Partial<Movement> = {
      ...selectedMovement,
      cashier_receipt_no: receiptNo.trim(),
      cashier_invoice: cashierInvoice,
      paid_amount: paid,
      customer_paid_amount: customerPaid,
      booking_category: category,
      total_amount: newTotal,
      remaining_amount: remaining,
      payment_status: paid >= newTotal && newTotal > 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
    };

    if (!await confirmAction(`هل تريد ربط فاتورة الكاشير ${receiptNo} وتحديث حساب هذه الحركة؟`, 'نعم، اربط الفاتورة')) return;
    onSaveMovement(updatedData);
    alert(`تم بنجاح ربط فاتورة الكاشير رقم (${receiptNo}) بالشحنة رقم الحاوية [${selectedMovement.container_no}] ورقم الشاحنة [${selectedMovement.truck_no}]!`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="bg-gradient-to-l from-slate-900 to-indigo-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <Link2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">ربط فاتورة الكاشير بالشحنة ورقم السيارة</h2>
              <p className="text-xs text-indigo-200">
                تسجيل مسلسل الفاتورة ومبلغ الكاشير الوارد من مكتب الميناء وربطه بالحاوية
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

        <form onSubmit={handleSave} className="p-6 space-y-5">
          {/* Movement Selection / Search */}
          {!initialMovement && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                ابحث بالعميل أو السائق أو رقم الحاوية أو وصفها أو التاريخ
              </label>
              <div className="relative mb-2">
                <Search className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="اسم، شاحنة، حاوية، وصفها، مسارها أو تاريخها..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg pr-9 pl-3 py-2 text-xs"
                />
              </div>

              <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 bg-slate-50">
                {filteredList.slice(0, 10).map((m) => (
                  <div
                    key={m.id}
                    onClick={() => handleSelectMovement(m)}
                    className={`p-2.5 text-xs cursor-pointer flex items-center justify-between transition ${
                      selectedMovementId === m.id
                        ? 'bg-indigo-100 text-indigo-950 font-bold border-r-4 border-indigo-600'
                        : 'hover:bg-slate-100 text-slate-800'
                    }`}
                  >
                    <div>
                      <span className="font-mono font-bold text-blue-900 ml-2">
                        {m.container_no || 'بدون حاوية'}
                      </span>
                      <span className="text-slate-600 ml-2">🚚 {m.truck_no}</span>
                      <span className="text-slate-500">👤 {m.driver_name || m.customer_name}</span>
                      {(m.container_desc || m.container_path) && <span className="block mt-1 text-[10px] text-slate-500">{m.container_desc || '-'} · {m.container_path || '-'}</span>}
                      <span className="block text-[10px] text-slate-400">التاريخ: {m.movement_date || '-'}</span>
                    </div>
                    {m.cashier_receipt_no && (
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded font-mono">
                        فاتورة: {m.cashier_receipt_no}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Selected Movement Summary Card */}
          {selectedMovement ? (
            <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-4">
              <span className="text-[11px] font-bold text-blue-900 block mb-2">
                بيانات الشحنة المحددة للربط:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-slate-500 block text-[10px]">رقم الحاوية</span>
                  <span className="font-mono font-bold text-blue-900">{selectedMovement.container_no || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">وصف الحاوية / المسار</span>
                  <span className="font-semibold text-slate-800">{selectedMovement.container_desc || '-'} / {selectedMovement.container_path || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">رقم الشاحنة</span>
                  <span className="font-bold text-slate-800">{selectedMovement.truck_no}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">اسم السائق (العميل)</span>
                  <span className="font-semibold text-slate-800">{selectedMovement.driver_name || selectedMovement.customer_name}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">رقم الإقرار</span>
                  <span className="font-mono text-slate-700">{selectedMovement.declaration_no || '-'}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-lg text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>يرجى اختيار الحركة أو الشحنة من القائمة أعلاه للربط بها.</span>
            </div>
          )}

          {/* Cashier Inputs */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
            <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-indigo-600" />
              <span>بيانات فاتورة الكاشير من واقع إيصال الميناء</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  مسلسل / رقم فاتورة الكاشير *
                </label>
                <input
                  type="text"
                  placeholder="مثال: 0047-01-1/01-261021"
                  value={receiptNo}
                  onChange={(e) => setReceiptNo(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-bold text-indigo-900"
                  required
                />
                <span className="text-[10px] text-slate-500 mt-0.5 block">
                  رقم المسلسل المطبوع على إيصال فاتورة السداد
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  قيمة فاتورة الكاشير (ج.م) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="2018.78"
                  value={amount || ''}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-900"
                  required
                />
                <span className="text-[10px] text-slate-500 mt-0.5 block">
                  المبلغ المسدد للكاشير بالميناء
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  تصنيف الحجز / الخدمة
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800"
                >
                  <option value="وارد حاويات">وارد حاويات</option>
                  <option value="صادر حاويات">صادر حاويات</option>
                  <option value="تعتيق حاوية فارغة">تعتيق حاوية فارغة</option>
                  <option value="شحن بضائع عامة">شحن بضائع عامة</option>
                  <option value="تفريغ">تفريغ</option>
                </select>
              </div>

              <div className="bg-white p-3 rounded-lg border border-slate-200 flex flex-col justify-center">
                <span className="text-[11px] text-slate-500">الإجمالي الجديد بعد العمولات</span>
                <span className="text-base font-black text-indigo-900">
                  {((amount || 0) + (selectedMovement?.system_commission ?? 200) + (selectedMovement?.nafez_commission ?? 0)).toLocaleString()} ج.م
                </span>
                <span className="text-[10px] text-slate-400">
                  شامل عمولة المنظومة ({selectedMovement?.system_commission ?? 200} ج)
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100 transition"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={!selectedMovement}
              className="px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold shadow-md hover:shadow-lg transition flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>ربط الفاتورة واعتماد الحساب</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
