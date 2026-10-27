import React, { useState } from 'react';
import { SystemSettings } from '../types';
import { useConfirmAction } from '../contexts/ConfirmActionContext';
import {
  Settings,
  DollarSign,
  Truck,
  Save,
} from 'lucide-react';

interface SettingsPageProps {
  settings: SystemSettings;
  onSaveSettings: (settings: SystemSettings) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  settings,
  onSaveSettings,
}) => {
  const confirmAction = useConfirmAction();
  const [formData, setFormData] = useState<SystemSettings>(settings);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!await confirmAction('هل تريد حفظ إعدادات العمولات وقيم التشغيل الجديدة؟', 'نعم، احفظ الإعدادات')) return;
    onSaveSettings(formData);
    alert('تم حفظ إعدادات العمولات وقيم التشغيل بنجاح!');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
          <span>إعدادات العمولات المتغيرة والقيم التشغيلية</span>
        </h1>
        <p className="text-xs text-slate-500 mt-1">
                اضبط تعريفة الوارد والصادر والحاويات الفارغة، ورسوم نافذ الافتراضية، وأوزان ومحاور الاسطمبة.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Dynamic Commissions Settings */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-blue-600" />
            <div>
              <h2 className="text-base font-bold text-slate-900">
                عمولة المنظومة حسب نوع الخدمة
              </h2>
              <p className="text-xs text-slate-500">
                تُطبق على الحركات الجديدة بحسب مسار الحاوية. أي تعديل هنا لا يغير حسابات الحركات المسجلة سابقًا.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-emerald-50/60 p-4 rounded-xl border border-emerald-200">
              <label className="block text-xs font-bold text-emerald-900 mb-1">عمولة الوارد (ج.م)</label>
              <input type="number" min="0" step="0.01" value={formData.default_inbound_commission ?? formData.default_system_commission ?? 200}
                onChange={(e) => setFormData({ ...formData, default_inbound_commission: Number(e.target.value) })}
                className="w-full bg-white border border-emerald-200 rounded-lg px-3 py-2 text-sm font-bold text-emerald-900" />
              <span className="text-[11px] text-emerald-700 mt-1 block">تُستخدم عندما يكون مسار الحاوية واردًا.</span>
            </div>

            <div className="bg-blue-50/60 p-4 rounded-xl border border-blue-200">
              <label className="block text-xs font-bold text-blue-900 mb-1">عمولة الصادر (ج.م)</label>
              <input type="number" min="0" step="0.01" value={formData.default_outbound_commission ?? formData.default_system_commission ?? 200}
                onChange={(e) => setFormData({ ...formData, default_outbound_commission: Number(e.target.value) })}
                className="w-full bg-white border border-blue-200 rounded-lg px-3 py-2 text-sm font-bold text-blue-900" />
              <span className="text-[11px] text-blue-700 mt-1 block">تُستخدم عندما يكون مسار الحاوية صادرًا.</span>
            </div>

            <div className="bg-amber-50/70 p-4 rounded-xl border border-amber-200">
              <label className="block text-xs font-bold text-amber-900 mb-1">عمولة الحاوية الفارغة (ج.م)</label>
              <input type="number" min="0" step="0.01" value={formData.default_empty_commission ?? formData.default_system_commission ?? 200}
                onChange={(e) => setFormData({ ...formData, default_empty_commission: Number(e.target.value) })}
                className="w-full bg-white border border-amber-200 rounded-lg px-3 py-2 text-sm font-bold text-amber-900" />
              <span className="text-[11px] text-amber-700 mt-1 block">تُستخدم للحاوية الفارغة أو التعتيق أو الاستلام.</span>
            </div>

            <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
              <label className="block text-xs font-bold text-blue-900 mb-1">
                العمولة الافتراضية عند عدم وضوح المسار (ج.م) *
              </label>
              <input
                type="number"
                value={formData.default_system_commission}
                onChange={(e) =>
                  setFormData({ ...formData, default_system_commission: Number(e.target.value) })
                }
                className="w-full bg-white border border-blue-200 rounded-lg px-3 py-2 text-sm font-bold text-blue-900"
                required
              />
              <span className="text-[11px] text-blue-600 mt-1 block">
                تُستخدم كحل احتياطي إذا لم يحدد مسار الحاوية نوع الخدمة.
              </span>
            </div>

            <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
              <label className="block text-xs font-bold text-indigo-900 mb-1">
                قيمة عمولة نافذ الافتراضية (ج.م) *
              </label>
              <input
                type="number"
                value={formData.default_nafez_commission}
                onChange={(e) =>
                  setFormData({ ...formData, default_nafez_commission: Number(e.target.value) })
                }
                className="w-full bg-white border border-indigo-200 rounded-lg px-3 py-2 text-sm font-bold text-indigo-900"
                required
              />
              <span className="text-[11px] text-indigo-600 mt-1 block">
                قيمة افتراضية فقط؛ يمكن أن تكون رسوم نافذ مختلفة لكل عميل أو صفرًا.
              </span>
            </div>
          </div>
        </div>

        {/* Default Axles & Weights (الاسطمبة الرسمية) */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3 flex items-center gap-2">
            <Truck className="w-5 h-5 text-slate-700" />
            <div>
              <h2 className="text-base font-bold text-slate-900">
                القيم الافتراضية لأعمدة الاسطمبة الرسمية
              </h2>
              <p className="text-xs text-slate-500">
                القيم التلقائية التي تملأ أعمدة الأوزان والمحاور عند تفريغ أو تسجيل أي حركة
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                محاور الشاحنة (افتراضي)
              </label>
              <input
                type="number"
                value={formData.default_truck_axles}
                onChange={(e) =>
                  setFormData({ ...formData, default_truck_axles: Number(e.target.value) })
                }
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-center font-bold"
              />
              <span className="text-[10px] text-slate-400">القيمة بالاسطمبة: 20</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                وزن الشاحنة (طن)
              </label>
              <input
                type="number"
                step="0.1"
                value={formData.default_truck_weight}
                onChange={(e) =>
                  setFormData({ ...formData, default_truck_weight: Number(e.target.value) })
                }
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-center font-bold"
              />
              <span className="text-[10px] text-slate-400">القيمة بالاسطمبة: 7.5</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                محاور المقطورة (افتراضي)
              </label>
              <input
                type="number"
                value={formData.default_trailer_axles}
                onChange={(e) =>
                  setFormData({ ...formData, default_trailer_axles: Number(e.target.value) })
                }
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-center font-bold"
              />
              <span className="text-[10px] text-slate-400">القيمة بالاسطمبة: 30</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                وزن المقطورة (طن)
              </label>
              <input
                type="number"
                step="0.1"
                value={formData.default_trailer_weight}
                onChange={(e) =>
                  setFormData({ ...formData, default_trailer_weight: Number(e.target.value) })
                }
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-center font-bold"
              />
              <span className="text-[10px] text-slate-400">القيمة بالاسطمبة: 11.5</span>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end">
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-6 py-2.5 rounded-xl shadow-md hover:shadow-lg transition flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>حفظ جميع الإعدادات</span>
          </button>
        </div>
      </form>
    </div>
  );
};
