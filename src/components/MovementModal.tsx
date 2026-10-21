import React, { useState, useEffect } from 'react';
import { Berth, Customer, Movement, SystemSettings } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { X, Calculator, Truck, FileText, Check } from 'lucide-react';

interface MovementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (movement: Partial<Movement>) => void;
  editingMovement?: Movement | null;
  customers: Customer[];
  berths: Berth[];
  settings: SystemSettings;
  nextSeq: number;
}

export const MovementModal: React.FC<MovementModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingMovement,
  customers,
  berths,
  settings,
  nextSeq,
}) => {
  const { canViewFinancials } = useAuth();

  const [formData, setFormData] = useState<Partial<Movement>>({
    seq: nextSeq,
    movement_date: new Date().toISOString().split('T')[0],
    berth_id: berths[0]?.id || '',
    berth_name: berths[0]?.name || '',
    customer_id: '',
    customer_code: '',
    customer_name: '',
    truck_no: '',
    truck_weight: settings.default_truck_weight ?? 7.5,
    truck_axles: settings.default_truck_axles ?? 20,
    trailer_no: '',
    trailer_weight: settings.default_trailer_weight ?? 11.5,
    trailer_axles: settings.default_trailer_axles ?? 30,
    driver_name: '',
    declaration_no: '',
    container_no: '',
    container_desc: '',
    container_path: '',
    cashier_invoice: 0,
    system_commission: settings.default_system_commission ?? 200,
    nafez_commission: settings.default_nafez_commission ?? 0,
    total_amount: 0,
    payment_status: 'unpaid',
    paid_amount: 0,
    remaining_amount: 0,
    notes: '',
  });

  useEffect(() => {
    if (editingMovement) {
      setFormData(editingMovement);
    } else {
      setFormData({
        seq: nextSeq,
        movement_date: new Date().toISOString().split('T')[0],
        berth_id: berths[0]?.id || '',
        berth_name: berths[0]?.name || '',
        customer_id: customers[0]?.id || '',
        customer_code: customers[0]?.code || '',
        customer_name: customers[0]?.name || '',
        truck_no: '',
        truck_weight: settings.default_truck_weight ?? 7.5,
        truck_axles: settings.default_truck_axles ?? 20,
        trailer_no: '',
        trailer_weight: settings.default_trailer_weight ?? 11.5,
        trailer_axles: settings.default_trailer_axles ?? 30,
        driver_name: '',
        declaration_no: '',
        container_no: '',
        container_desc: '',
        container_path: '',
        cashier_invoice: 0,
        system_commission: settings.default_system_commission ?? 200,
        nafez_commission: settings.default_nafez_commission ?? 0,
        total_amount: (settings.default_system_commission ?? 200) + (settings.default_nafez_commission ?? 0),
        payment_status: 'unpaid',
        paid_amount: 0,
        remaining_amount: (settings.default_system_commission ?? 200) + (settings.default_nafez_commission ?? 0),
        notes: '',
      });
    }
  }, [editingMovement, isOpen, nextSeq, settings, berths, customers]);

  // Recalculate totals whenever cashier, system_commission, or nafez_commission change
  useEffect(() => {
    const cashier = Number(formData.cashier_invoice) || 0;
    const sysComm = Number(formData.system_commission) || 0;
    const nafez = Number(formData.nafez_commission) || 0;
    const total = cashier + sysComm + nafez;
    const paid = Number(formData.paid_amount) || 0;
    const remaining = Math.max(0, total - paid);

    let status = formData.payment_status;
    if (paid >= total && total > 0) {
      status = 'paid';
    } else if (paid > 0 && paid < total) {
      status = 'partial';
    } else if (paid === 0) {
      status = 'unpaid';
    }

    setFormData((prev) => ({
      ...prev,
      total_amount: total,
      remaining_amount: remaining,
      payment_status: status,
    }));
  }, [formData.cashier_invoice, formData.system_commission, formData.nafez_commission, formData.paid_amount]);

  if (!isOpen) return null;

  const handleCustomerChange = (customerId: string) => {
    const cust = customers.find((c) => c.id === customerId);
    if (cust) {
      const firstTruck = cust.trucks?.[0];
      setFormData((prev) => ({
        ...prev,
        customer_id: cust.id,
        customer_code: cust.code,
        customer_name: cust.name,
        truck_no: firstTruck ? firstTruck.truck_no : prev.truck_no,
        trailer_no: firstTruck ? firstTruck.trailer_no || '' : prev.trailer_no,
        driver_name: firstTruck ? firstTruck.driver_name || '' : prev.driver_name,
      }));
    }
  };

  const handleBerthChange = (berthId: string) => {
    const b = berths.find((item) => item.id === berthId);
    if (b) {
      setFormData((prev) => ({
        ...prev,
        berth_id: b.id,
        berth_name: b.name,
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.truck_no && !formData.container_no) {
      alert('برجاء إدخال رقم الشاحنة أو رقم الحاوية على الأقل');
      return;
    }
    onSave(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="bg-gradient-to-l from-slate-900 to-blue-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Truck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">
                {editingMovement ? 'تعديل حركة الشاحنة' : 'تسجيل حركة شاحنة جديدة'}
              </h2>
              <p className="text-xs text-blue-200">
                إدخال بيانات الاسطمبة الرسمية وربط الحسابات
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Row 1: General Info (Customer, Berth, Date, Seq) */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                مسلسل الحركة (م)
              </label>
              <input
                type="number"
                value={formData.seq || nextSeq}
                onChange={(e) => setFormData({ ...formData, seq: Number(e.target.value) })}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-blue-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                تاريخ الحركة
              </label>
              <input
                type="date"
                value={formData.movement_date || ''}
                onChange={(e) => setFormData({ ...formData, movement_date: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                العميل (تكويد العميل)
              </label>
              <select
                value={formData.customer_id || ''}
                onChange={(e) => handleCustomerChange(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800"
              >
                <option value="">-- اختر العميل --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    [{c.code}] {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                رصيف الميناء
              </label>
              <select
                value={formData.berth_id || ''}
                onChange={(e) => handleBerthChange(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800"
              >
                {berths.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Truck & Trailer Data (Matching Official Template) */}
          <div className="border border-slate-200 rounded-xl p-4">
            <h3 className="text-xs font-bold text-blue-900 mb-3 flex items-center gap-1.5 border-b pb-2">
              <Truck className="w-4 h-4 text-blue-600" />
              <span>بيانات الشاحنة والمقطورة (الاسطمبة الرسمية)</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  رقم الشاحنة *
                </label>
                <input
                  type="text"
                  placeholder="مثال: ط ر ج ٤٥٢١"
                  value={formData.truck_no || ''}
                  onChange={(e) => setFormData({ ...formData, truck_no: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  وزن الشاحنة من واقع الرخصة
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.truck_weight ?? 7.5}
                  onChange={(e) => setFormData({ ...formData, truck_weight: Number(e.target.value) })}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-center"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  محاور الشاحنة
                </label>
                <input
                  type="number"
                  value={formData.truck_axles ?? 20}
                  onChange={(e) => setFormData({ ...formData, truck_axles: Number(e.target.value) })}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-center"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  رقم المقطورة
                </label>
                <input
                  type="text"
                  placeholder="مثال: م ق د ٨٩٢"
                  value={formData.trailer_no || ''}
                  onChange={(e) => setFormData({ ...formData, trailer_no: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  وزن المقطورة من واقع الرخصة
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.trailer_weight ?? 11.5}
                  onChange={(e) => setFormData({ ...formData, trailer_weight: Number(e.target.value) })}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-center"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  محاور المقطورة
                </label>
                <input
                  type="number"
                  value={formData.trailer_axles ?? 30}
                  onChange={(e) => setFormData({ ...formData, trailer_axles: Number(e.target.value) })}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-center"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  اسم السائق (العميل) *
                </label>
                <input
                  type="text"
                  placeholder="الاسم الثلاثي أو الرباعي للسائق (المؤسسة هي باسم السائق)"
                  value={formData.driver_name || ''}
                  onChange={(e) => {
                    const newDriver = e.target.value;
                    setFormData((prev) => ({
                      ...prev,
                      driver_name: newDriver,
                      // Automatically match or create customer by driver name if not set
                      customer_name: (!prev.customer_name || prev.customer_name === prev.driver_name) ? newDriver : prev.customer_name,
                    }));
                  }}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold"
                />
              </div>
            </div>
          </div>

          {/* Row 3: Container & Declaration Data */}
          <div className="border border-slate-200 rounded-xl p-4">
            <h3 className="text-xs font-bold text-blue-900 mb-3 flex items-center gap-1.5 border-b pb-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <span>بيانات الحاوية والإقرار الجمركي</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  رقم الإقرار الجمركي
                </label>
                <input
                  type="text"
                  placeholder="مثال: DEC-1029"
                  value={formData.declaration_no || ''}
                  onChange={(e) => setFormData({ ...formData, declaration_no: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  رقم الحاوية
                </label>
                <input
                  type="text"
                  placeholder="مثال: MSKU-1234567"
                  value={formData.container_no || ''}
                  onChange={(e) => setFormData({ ...formData, container_no: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  وصف الحاوية
                </label>
                <input
                  type="text"
                  placeholder="حاوية 40 قدم / 20 قدم / مبردة..."
                  value={formData.container_desc || ''}
                  onChange={(e) => setFormData({ ...formData, container_desc: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  مسار الحاوية
                </label>
                <input
                  type="text"
                  placeholder="مسار أ / بوابة 3 / فحص..."
                  value={formData.container_path || ''}
                  onChange={(e) => setFormData({ ...formData, container_path: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Row 4: Financial Calculation Section (Only for Admin & Accountant) */}
          {canViewFinancials ? (
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5 shadow-inner">
              <div className="flex items-center justify-between border-b border-blue-200 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-blue-700" />
                  <h3 className="text-sm font-bold text-blue-950">
                    حساب التكلفة والعمولات (طريقة الحساب المعتمدة)
                  </h3>
                </div>
                <div className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-medium">
                  المعادلة: فاتورة كاشير + عمولة المنظومة ({formData.system_commission}) + عمولة نافذ
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-4 pb-4 border-b border-blue-200">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    مسلسل / رقم فاتورة الكاشير (الميناء)
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: 0047-01-1/01-261021"
                    value={formData.cashier_receipt_no || ''}
                    onChange={(e) => setFormData({ ...formData, cashier_receipt_no: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono font-bold text-indigo-900"
                  />
                  <span className="text-[10px] text-slate-500">من واقع إيصال مكتب الكاشير</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    تصنيف الحجز / الخدمة
                  </label>
                  <select
                    value={formData.booking_category || 'وارد حاويات'}
                    onChange={(e) => setFormData({ ...formData, booking_category: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800"
                  >
                    <option value="وارد حاويات">وارد حاويات</option>
                    <option value="صادر حاويات">صادر حاويات</option>
                    <option value="تعتيق حاوية فارغة">تعتيق حاوية فارغة</option>
                    <option value="شحن بضائع عامة">شحن بضائع عامة</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    قيمة فاتورة كاشير (ج.م)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={formData.cashier_invoice || ''}
                    onChange={(e) => setFormData({ ...formData, cashier_invoice: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    عمولة المنظومة (ج.م) [متغيرة]
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={formData.system_commission ?? 200}
                    onChange={(e) => setFormData({ ...formData, system_commission: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-blue-800"
                  />
                  <span className="text-[10px] text-slate-500">القيمة الافتراضية 200 ج.م</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    عمولة نافذ إن وجدت (ج.م)
                  </label>
                  <input
                    type="number"
                    step="1"
                    placeholder="0"
                    value={formData.nafez_commission || ''}
                    onChange={(e) => setFormData({ ...formData, nafez_commission: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-indigo-800"
                  />
                  <span className="text-[10px] text-slate-500">إن وجدت، وممكن تبقى 0</span>
                </div>

                <div className="bg-white p-3 rounded-xl border border-blue-300 flex flex-col justify-center">
                  <span className="text-xs text-slate-600 font-medium">الإجمالي المحسوب</span>
                  <span className="text-xl font-black text-blue-900">
                    {(formData.total_amount || 0).toLocaleString()} ج.م
                  </span>
                </div>
              </div>

              {/* Payment Details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 pt-4 border-t border-blue-200">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    المبلغ المدفوع حالياً (ج.م)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.paid_amount || ''}
                    onChange={(e) => setFormData({ ...formData, paid_amount: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-emerald-800"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    المبلغ المتبقي (المديونية)
                  </label>
                  <div className="w-full bg-slate-100 border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-rose-700">
                    {(formData.remaining_amount || 0).toLocaleString()} ج.م
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    حالة السداد
                  </label>
                  <select
                    value={formData.payment_status || 'unpaid'}
                    onChange={(e) => setFormData({ ...formData, payment_status: e.target.value as any })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-slate-800"
                  >
                    <option value="unpaid">غير مدفوع (متبقي كامل)</option>
                    <option value="partial">مدفوع جزئياً</option>
                    <option value="paid">مدفوع بالكامل</option>
                  </select>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-100 p-3 rounded-lg text-xs text-slate-500 text-center border border-dashed border-slate-300">
              🔒 حقول الحسابات وفواتير الكاشير والعمولات مخفية تلقائياً لصلاحيات مدخل البيانات.
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              ملاحظات إضافية
            </label>
            <input
              type="text"
              placeholder="أي تفاصيل خاصة بالحركة أو العميل..."
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* Footer buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-lg border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-100 transition"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-md hover:shadow-lg transition flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{editingMovement ? 'حفظ التعديلات' : 'إضافة الحركة للسيستم'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
