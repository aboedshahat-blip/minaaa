import React, { useState, useEffect } from 'react';
import { Customer, CustomerTruck } from '../types';
import { X, Users, Plus, Trash2, Truck, Check } from 'lucide-react';

interface CustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (customer: Customer) => void;
  editingCustomer?: Customer | null;
  existingCount: number;
}

export const CustomerModal: React.FC<CustomerModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingCustomer,
  existingCount,
}) => {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [trucks, setTrucks] = useState<CustomerTruck[]>([]);

  // New truck entry form
  const [newTruckNo, setNewTruckNo] = useState('');
  const [newTrailerNo, setNewTrailerNo] = useState('');
  const [newDriverName, setNewDriverName] = useState('');

  useEffect(() => {
    if (editingCustomer) {
      setCode(editingCustomer.code);
      setName(editingCustomer.name);
      setPhone(editingCustomer.phone);
      setEmail(editingCustomer.email || '');
      setNotes(editingCustomer.notes || '');
      setTrucks(editingCustomer.trucks || []);
    } else {
      setCode(`C-${100 + existingCount + 1}`);
      setName('');
      setPhone('');
      setEmail('');
      setNotes('');
      setTrucks([]);
    }
  }, [editingCustomer, isOpen, existingCount]);

  if (!isOpen) return null;

  const handleAddTruck = () => {
    if (!newTruckNo.trim()) {
      alert('برجاء كتابة رقم الشاحنة');
      return;
    }
    setTrucks([
      ...trucks,
      {
        truck_no: newTruckNo.trim(),
        trailer_no: newTrailerNo.trim(),
        driver_name: newDriverName.trim(),
      },
    ]);
    setNewTruckNo('');
    setNewTrailerNo('');
    setNewDriverName('');
  };

  const handleRemoveTruck = (index: number) => {
    setTrucks(trucks.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('برجاء كتابة اسم العميل أو الشركة');
      return;
    }

    const customerData: Customer = {
      id: editingCustomer ? editingCustomer.id : `c-${Date.now()}`,
      code: code.trim() || `C-${100 + existingCount + 1}`,
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      trucks,
      notes: notes.trim(),
      created_at: editingCustomer ? editingCustomer.created_at : new Date().toISOString(),
    };

    onSave(customerData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200">
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">
                {editingCustomer ? 'تعديل بيانات العميل' : 'تكويد عميل جديد'}
              </h2>
              <p className="text-xs text-slate-400">
                إدخال كود العميل وبياناته وشاحناته التابعة
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

        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Main Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                كود العميل (تكويد فريد) *
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="مثال: C-101"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-blue-900"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                اسم العميل أو الشركة *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: شركة النور للتجارة والنقل"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold text-slate-900"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                رقم الهاتف / الموبايل
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="010xxxxxxxx"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                البريد الإلكتروني (اختياري)
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="client@domain.com"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Trucks Section: "كل عميل عندو اكتر من عربيه" */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
            <div className="flex items-center justify-between mb-3 border-b pb-2">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-blue-600" />
                <span>شاحنات وعربيات العميل المسجلة ({trucks.length})</span>
              </h3>
              <span className="text-[11px] text-slate-500">
                يمكنك تسجيل عدة سيارات وسائقين لهذا العميل
              </span>
            </div>

            {/* List of existing trucks */}
            {trucks.length > 0 ? (
              <div className="space-y-2 mb-4">
                {trucks.map((t, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-slate-200 text-xs shadow-sm"
                  >
                    <div className="flex items-center gap-4">
                      <span className="font-bold text-blue-900">
                        شاحنة: {t.truck_no}
                      </span>
                      {t.trailer_no && (
                        <span className="text-slate-600">
                          مقطورة: {t.trailer_no}
                        </span>
                      )}
                      {t.driver_name && (
                        <span className="text-slate-600">
                          السائق: {t.driver_name}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveTruck(index)}
                      className="text-rose-500 hover:text-rose-700 p-1"
                      title="حذف السيارة"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic mb-4">
                لم يتم إضافة سيارات بعد لهذا العميل.
              </p>
            )}

            {/* Add new truck form */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  رقم الشاحنة
                </label>
                <input
                  type="text"
                  placeholder="مثال: ط ر ج ٤٥٢١"
                  value={newTruckNo}
                  onChange={(e) => setNewTruckNo(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs font-semibold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  رقم المقطورة
                </label>
                <input
                  type="text"
                  placeholder="م ق د ٨٩٢"
                  value={newTrailerNo}
                  onChange={(e) => setNewTrailerNo(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  اسم السائق الافتراضي
                </label>
                <input
                  type="text"
                  placeholder="اسم السائق"
                  value={newDriverName}
                  onChange={(e) => setNewDriverName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs"
                />
              </div>

              <div>
                <button
                  type="button"
                  onClick={handleAddTruck}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-1.5 px-3 rounded flex items-center justify-center gap-1 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة سيارة</span>
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              ملاحظات
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="شروط الدفع أو أي تفاصيل خاصة بالعميل..."
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
              className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow"
            >
              <Check className="w-4 h-4" />
              <span>{editingCustomer ? 'حفظ التعديلات' : 'حفظ وتكويد العميل'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
