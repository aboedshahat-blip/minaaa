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
  payments: PaymentReceipt[];
  initialCustomerId?: string;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  onSavePayment,
  customers,
  movements,
  payments,
  initialCustomerId,
}) => {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [amount, setAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer' | 'check' | 'other'>('cash');
  const [notes, setNotes] = useState('');
  const [selectedMovementIds, setSelectedMovementIds] = useState<string[]>([]);
  const [paymentType, setPaymentType] = useState<'collection' | 'advance'>('collection');

  useEffect(() => {
    if (!isOpen) return;
    const customerId = initialCustomerId && customers.some((customer) => customer.id === initialCustomerId)
      ? initialCustomerId
      : customers[0]?.id || '';
    setSelectedCustomerId(customerId);
    setAmount(0);
    setSelectedMovementIds([]);
    setPaymentMethod('cash');
    setNotes('');
    setPaymentType('collection');
  }, [initialCustomerId, customers, isOpen]);

  if (!isOpen) return null;

  // Always derive the balance from total minus paid. This keeps installment
  // collection working even when an older record has a stale remaining_amount.
  const clientMovements = movements.filter(
    (m) => m.customer_id === selectedCustomerId || m.customer_name === customers.find(c => c.id === selectedCustomerId)?.name
  );
  const getOutstandingCents = (movement: Movement) => Math.max(
    0,
    Math.round(((Number(movement.total_amount) || 0) - (Number(movement.paid_amount) || 0)) * 100),
  );
  const unpaidMovements = clientMovements
    .filter((m) => getOutstandingCents(m) > 0)
    .sort((a, b) => (a.movement_date || '').localeCompare(b.movement_date || '') || (a.seq || 0) - (b.seq || 0));
  const totalClientDebtCents = unpaidMovements.reduce((sum, m) => sum + getOutstandingCents(m), 0);
  const totalClientDebt = totalClientDebtCents / 100;
  const existingAdvance = payments
    .filter((payment) => payment.customer_id === selectedCustomerId)
    .reduce((sum, payment) => sum + (Number(payment.unallocated_amount) || 0), 0);
  const selectedDebtCents = selectedMovementIds.length
    ? unpaidMovements.filter((m) => selectedMovementIds.includes(m.id)).reduce((sum, m) => sum + getOutstandingCents(m), 0)
    : totalClientDebtCents;
  const installmentRemainder = Math.max(0, selectedDebtCents - Math.round((Number(amount) || 0) * 100)) / 100;

  const handleSelectAllUnpaid = () => {
    if (selectedMovementIds.length === unpaidMovements.length) {
      setSelectedMovementIds([]);
    } else {
      setSelectedMovementIds(unpaidMovements.map((m) => m.id));
      setAmount(totalClientDebt);
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
      .reduce((sum, m) => sum + getOutstandingCents(m), 0) / 100;
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

    const amountCents = Math.round(Number(amount) * 100);
    if (paymentType === 'advance') {
      const advanceReceipt: PaymentReceipt = {
        id: `rec-${Date.now()}`,
        receipt_no: `REC-${Math.floor(100000 + Math.random() * 900000)}`,
        date: new Date().toISOString().split('T')[0],
        customer_id: currentCustomer.id,
        customer_name: currentCustomer.name,
        amount: amountCents / 100,
        payment_method: paymentMethod,
        payment_type: 'advance',
        unallocated_amount: amountCents / 100,
        notes: notes.trim(),
        movement_ids: [],
        created_at: new Date().toISOString(),
      };
      onSavePayment(advanceReceipt, movements);
      alert(`تم تسجيل مقدم ${amount.toLocaleString()} ج.م للعميل. سيخصم تلقائياً عند ربط فاتورة الكاشير.`);
      onClose();
      return;
    }

    const selectedTargets = unpaidMovements.filter((movement) => selectedMovementIds.includes(movement.id));
    const targetMovements = selectedTargets.length > 0 ? selectedTargets : unpaidMovements;
    const availableDebtCents = targetMovements.reduce((sum, movement) => sum + getOutstandingCents(movement), 0);
    const availableDebt = availableDebtCents / 100;
    if (targetMovements.length === 0 || availableDebt <= 0) {
      alert('لا توجد حركات عليها رصيد مستحق لهذا العميل لتسويتها.');
      return;
    }
    if (amountCents > availableDebtCents) {
      alert(`المبلغ أكبر من الرصيد المحدد. أقصى مبلغ يمكن تسجيله هو ${availableDebt.toLocaleString()} ج.م`);
      return;
    }

    // Distribute payment to the selected unpaid movements, or to all unpaid movements.
    let remainingToDistributeCents = amountCents;
    const appliedMovementIds: string[] = [];

    const updatedMovements = movements.map((m) => {
      const isTarget = targetMovements.some((tm) => tm.id === m.id);
      if (!isTarget || remainingToDistributeCents <= 0) return m;

      const debtCents = getOutstandingCents(m);
      if (debtCents <= 0) return m;

      const paymentForThisCents = Math.min(debtCents, remainingToDistributeCents);
      remainingToDistributeCents -= paymentForThisCents;

      const cashierPaidCents = Math.round((Number(m.cashier_invoice) || 0) * 100);
      const currentCustomerPaidCents = m.customer_paid_amount !== undefined
        ? Math.round((Number(m.customer_paid_amount) || 0) * 100)
        : Math.max(0, Math.round((Number(m.paid_amount) || 0) * 100) - cashierPaidCents);
      const newCustomerPaidCents = currentCustomerPaidCents + paymentForThisCents;
      const newPaidCents = cashierPaidCents + newCustomerPaidCents;
      const totalCents = Math.max(0, Math.round((Number(m.total_amount) || 0) * 100));
      const newRemainingCents = Math.max(0, totalCents - newPaidCents);
      const newPaid = newPaidCents / 100;
      const newRemaining = newRemainingCents / 100;
      const newStatus = newRemaining === 0 ? 'paid' : 'partial';
      appliedMovementIds.push(m.id);

      return {
        ...m,
        customer_paid_amount: newCustomerPaidCents / 100,
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
      amount: amountCents / 100,
      payment_method: paymentMethod,
      payment_type: 'collection',
      unallocated_amount: 0,
      notes: notes.trim(),
      movement_ids: appliedMovementIds,
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
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
            <button type="button" onClick={()=>setPaymentType('collection')} className={`rounded-lg px-3 py-2 text-xs font-bold ${paymentType==='collection'?'bg-white text-blue-800 shadow-sm':'text-slate-600'}`}>سداد مديونية قائمة</button>
            <button type="button" onClick={()=>{setPaymentType('advance');setSelectedMovementIds([]);}} className={`rounded-lg px-3 py-2 text-xs font-bold ${paymentType==='advance'?'bg-white text-emerald-800 shadow-sm':'text-slate-600'}`}>مقدم قبل الكاشير</button>
          </div>

          {/* Customer Selection & Balance Card */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex flex-col justify-center">
              <span className="text-xs font-semibold text-emerald-700">مقدم غير موزع</span>
              <span className="text-xl font-black text-emerald-900">{existingAdvance.toLocaleString()} ج.م</span>
            </div>
          </div>

          {/* Amount & Method */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {paymentType === 'advance' ? 'مبلغ المقدم المستلم *' : 'المبلغ المسدد *'}
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={paymentType === 'collection' ? selectedDebtCents / 100 : undefined}
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

          {paymentType === 'advance' ? (
            <div className="-mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              <strong>بعد تسجيل المقدم سيصبح رصيد العميل المقدم {(existingAdvance + (Number(amount) || 0)).toLocaleString()} ج.م.</strong>{' '}
              سيُخصم تلقائيًا من مستحقاته بعد ربط فاتورة الكاشير، وأي رصيد زائد يظل مقدمًا للعميل.
            </div>
          ) : <div className="-mt-3 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
            <span className="font-bold">
              {amount > 0 && Math.round(amount * 100) < selectedDebtCents ? 'دفعة جزئية' : 'المتبقي بعد الدفعة'}:
            </span>{' '}
            {installmentRemainder.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
            {amount > 0 && Math.round(amount * 100) < selectedDebtCents && (
              <span className="mr-2 text-indigo-700">سيُسجل المبلغ كسند مستقل، ويظل باقي الرصيد مفتوحًا للدفعة التالية.</span>
            )}
          </div>}

          {/* Movement Selection: "والعربيات تتخصم من السيستم" */}
          {paymentType === 'collection' ? <div className="border border-slate-200 rounded-xl p-4">
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
                          المتبقي: {(getOutstandingCents(m) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
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
          </div> : <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-900">المقدم محفوظ باسم العميل ولن يُحسب سدادًا لحركة قبل اكتمال ربط الكاشير. عند تسجيل فاتورة الكاشير سيخصم النظام المقدم تلقائيًا من أقدم مستحقات العميل.</div>}

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
              <span>{paymentType === 'advance' ? 'تسجيل المقدم' : 'اعتماد السند وتحديث السيستم'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
