import React, { useState, useEffect } from 'react';
import { Customer, Movement, PaymentReceipt } from '../types';
import { X, Receipt, Check, CreditCard, AlertCircle } from 'lucide-react';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSavePayment: (
    payment: PaymentReceipt,
    updatedMovements: Movement[]
  ) => void;
  customers: Customer[];
  movements: Movement[];
  initialCustomerId?: string;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  onSavePayment,
  customers,
  movements,
  initialCustomerId,
}) => {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [amount, setAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer' | 'check' | 'other'>('cash');
  const [notes, setNotes] = useState('');
  const [selectedMovementIds, setSelectedMovementIds] = useState<string[]>([]);

  useEffect(() => {
    if (initialCustomerId) {
      setSelectedCustomerId(initialCustomerId);
    } else if (customers.length > 0) {
      setSelectedCustomerId(customers[0].id);
    }
  }, [initialCustomerId, customers, isOpen]);

  if (!isOpen) return null;

  // Filter client's movements that are unpaid or partial
  const clientMovements = movements.filter(
    (m) => m.customer_id === selectedCustomerId || m.customer_name === customers.find(c => c.id === selectedCustomerId)?.name
  );

  const unpaidMovements = clientMovements.filter((m) => (m.remaining_amount || 0) > 0);
  const totalClientDebt = unpaidMovements.reduce((sum, m) => sum + (m.remaining_amount || 0), 0);

  const handleSelectAllUnpaid = () => {
    if (selectedMovementIds.length === unpaidMovements.length) {
      setSelectedMovementIds([]);
    } else {
      setSelectedMovementIds(unpaidMovements.map((m) => m.id));
      const totalSelected = unpaidMovements.reduce((sum, m) => sum + (m.remaining_amount || 0), 0);
      setAmount(totalSelected);
    }
  };

  const handleToggleMovement = (id: string) => {
    let nextIds: string[];
    if (selectedMovementIds.includes(id)) {
      nextIds = selectedMovementIds.filter((mId) => mId !== id);
    } else {
      nextIds = [...selectedMovementIds, id];
    }
    setSelectedMovementIds(nextIds);

    const totalSelected = unpaidMovements
      .filter((m) => nextIds.includes(m.id))
      .reduce((sum, m) => sum + (m.remaining_amount || 0), 0);
    setAmount(totalSelected);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0) {
      alert('برجاء كتابة مبلغ تحصيل صحيح أكبر من صفر');
      return;
    }

    const currentCustomer = customers.find((c) => c.id === selectedCustomerId);
    if (!currentCustomer) return;

    // Distribute amount to movements
    let remainingToDistribute = amount;
    const targetMovements = selectedMovementIds.length > 0
      ? unpaidMovements.filter((m) => selectedMovementIds.includes(m.id))
      : unpaidMovements; // distribute across oldest if none selected

    const updatedMovements = movements.map((m) => {
      const isTarget = targetMovements.some((tm) => tm.id === m.id);
      if (!isTarget || remainingToDistribute <= 0) return m;

      const debt = m.remaining_amount || 0;
      if (debt <= 0) return m;

      const paymentForThis = Math.min(debt, remainingToDistribute);
      remainingToDistribute -= paymentForThis;

      const newPaid = (m.paid_amount || 0) + paymentForThis;
      const newRemaining = Math.max(0, (m.total_amount || 0) - newPaid);
      const newStatus = newRemaining === 0 ? 'paid' : 'partial';

      return {
        ...m,
        paid_amount: newPaid,
        remaining_amount: newRemaining,
        payment_status: newStatus as any,
      };
    });

    const paymentReceipt: PaymentReceipt = {
      id: `rec-${Date.now()}`,
      receipt_no: `REC-${Math.floor(100000 + Math.random() * 900000)}`,
      date: new Date().toISOString().split('T')[0],
      customer_id: currentCustomer.id,
      customer_name: currentCustomer.name,
      amount,
      payment_method: paymentMethod,
      notes: notes.trim(),
      movement_ids: selectedMovementIds,
      created_at: new Date().toISOString(),
    };

    onSavePayment(paymentReceipt, updatedMovements);
    alert(`تم بنجاح تسجيل سند قبض بقيمة ${amount.toLocaleString()} ج.م وخصم/تسوية حركات السيارات!`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200">
        <div className="bg-gradient-to-l from-slate-900 to-indigo-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <Receipt className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">تسجيل سند قبض وتحصيل مالي</h2>
              <p className="text-xs text-indigo-200">
                تسوية وسداد فواتير الشاحنات وخصمها من مديونية العميل
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[85vh] overflow-y-auto">
          {/* Customer Selection & Balance Card */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                العميل
              </label>
              <select
                value={selectedCustomerId}
                onChange={(e) => {
                  setSelectedCustomerId(e.target.value);
                  setSelectedMovementIds([]);
                  setAmount(0);
                }}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-slate-900"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    [{c.code}] {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex flex-col justify-center">
              <span className="text-xs text-rose-700 font-semibold">إجمالي المتبقي على العميل (ناقص كام)</span>
              <span className="text-xl font-black text-rose-900">
                {totalClientDebt.toLocaleString()} ج.م
              </span>
            </div>
          </div>

          {/* Amount & Method */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                المبلغ المدفوع (سند القبض) *
              </label>
              <input
                type="number"
                step="0.01"
                value={amount || ''}
                onChange={(e) => setAmount(Number(e.target.value))}
                placeholder="0.00"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-base font-bold text-emerald-800"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                طريقة الدفع
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold"
              >
                <option value="cash">نقداً (خزينة المنظومة)</option>
                <option value="bank_transfer">تحويل بنكي</option>
                <option value="check">شيك مصرفي</option>
                <option value="other">أخرى</option>
              </select>
            </div>
          </div>

          {/* Movement Selection: "والعربيات تتخصم من السيستم" */}
          <div className="border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3 border-b pb-2">
              <div>
                <h3 className="text-xs font-bold text-slate-800">
                  تحديد سيارات لتسويتها وخصمها من الحساب ({unpaidMovements.length} حركة عليها متبقي)
                </h3>
                <p className="text-[11px] text-slate-500">
                  اختر الشاحنات المراد تسديدها، أو اتركها وسيتم الخصم تلقائياً من الأقدم
                </p>
              </div>
              {unpaidMovements.length > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAllUnpaid}
                  className="text-xs text-blue-600 hover:text-blue-800 font-bold"
                >
                  {selectedMovementIds.length === unpaidMovements.length ? 'إلغاء التحديد' : 'تحديد الكل'}
                </button>
              )}
            </div>

            {unpaidMovements.length > 0 ? (
              <div className="max-h-48 overflow-y-auto space-y-2">
                {unpaidMovements.map((m) => {
                  const isChecked = selectedMovementIds.includes(m.id);
                  return (
                    <label
                      key={m.id}
                      className={`flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer transition ${
                        isChecked
                          ? 'bg-blue-50 border-blue-300 shadow-sm'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleMovement(m.id)}
                          className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                        />
                        <span className="font-bold text-slate-900">
                          حركة م ({m.seq}): {m.truck_no}
                        </span>
                        <span className="text-slate-500 font-mono">
                          {m.container_no || 'بدون حاوية'}
                        </span>
                        <span className="text-slate-400">({m.movement_date})</span>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-slate-600">
                          الإجمالي: {(m.total_amount || 0).toLocaleString()} ج.م
                        </span>
                        <span className="font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                          المتبقي: {(m.remaining_amount || 0).toLocaleString()} ج.م
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="bg-emerald-50 text-emerald-800 p-3 rounded-lg text-xs font-semibold flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>هذا العميل خالص الحساب، لا توجد عليه أي شاحنات غير مدفوعة!</span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              ملاحظات سند القبض
            </label>
            <input
              type="text"
              placeholder="مثال: دفعة تحت الحساب رقم إيصال تحويل..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow"
            >
              <CreditCard className="w-4 h-4" />
              <span>اعتماد السند وتحديث السيستم</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
