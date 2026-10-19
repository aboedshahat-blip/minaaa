import React, { useState } from 'react';
import { SystemSettings } from '../types';
import { syncWithSupabase } from '../lib/storage';
import {
  Settings,
  DollarSign,
  Truck,
  Database,
  CheckCircle2,
  RefreshCw,
  Copy,
  ExternalLink,
  Save,
  Check,
} from 'lucide-react';

interface SettingsPageProps {
  settings: SystemSettings;
  onSaveSettings: (settings: SystemSettings) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  settings,
  onSaveSettings,
}) => {
  const [formData, setFormData] = useState<SystemSettings>(settings);
  const [syncStatus, setSyncStatus] = useState<{ loading: boolean; message?: string; success?: boolean }>({
    loading: false,
  });
  const [copiedSql, setCopiedSql] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings(formData);
    alert('تم حفظ الإعدادات وقيم العمولات بنجاح!');
  };

  const handleTestSupabase = async () => {
    setSyncStatus({ loading: true });
    const res = await syncWithSupabase();
    setSyncStatus({ loading: false, message: res.message, success: res.success });
  };

  const copySqlToClipboard = () => {
    const sql = `-- كود إنشاء جداول منظومة الميناء في Supabase SQL Editor
CREATE TABLE IF NOT EXISTS berths (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  trucks JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS movements (
  id TEXT PRIMARY KEY,
  seq BIGINT,
  movement_date DATE NOT NULL,
  berth_id TEXT,
  berth_name TEXT,
  customer_id TEXT,
  customer_code TEXT,
  customer_name TEXT,
  truck_no TEXT NOT NULL,
  truck_weight NUMERIC DEFAULT 7.5,
  truck_axles NUMERIC DEFAULT 20,
  trailer_no TEXT,
  trailer_weight NUMERIC DEFAULT 11.5,
  trailer_axles NUMERIC DEFAULT 30,
  driver_name TEXT,
  declaration_no TEXT,
  container_no TEXT,
  container_desc TEXT,
  container_path TEXT,
  cashier_invoice NUMERIC DEFAULT 0,
  system_commission NUMERIC DEFAULT 200,
  nafez_commission NUMERIC DEFAULT 0,
  total_amount NUMERIC DEFAULT 200,
  payment_status TEXT DEFAULT 'unpaid',
  paid_amount NUMERIC DEFAULT 0,
  remaining_amount NUMERIC DEFAULT 200,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  receipt_no TEXT NOT NULL,
  date DATE NOT NULL,
  customer_id TEXT,
  customer_name TEXT,
  amount NUMERIC NOT NULL,
  payment_method TEXT DEFAULT 'cash',
  notes TEXT,
  movement_ids JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
`;
    navigator.clipboard.writeText(sql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
          <Settings className="w-6 h-6 text-blue-600" />
          <span>إعدادات العمولات المتغيرة وربط Supabase & Vercel</span>
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          تحديد عمولة المنظومة وعمولة نافذ والقيم الافتراضية للأوزان والمحاور وتهيئة الربط السحابي
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Dynamic Commissions Settings */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-blue-600" />
            <div>
              <h2 className="text-base font-bold text-slate-900">
                العمولات المتغيرة لحساب كل حركة شاحنة
              </h2>
              <p className="text-xs text-slate-500">
                طريقة الحساب: فاتورة الكاشير + عمولة المنظومة + عمولة نافذ
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2">
            <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-200">
              <label className="block text-xs font-bold text-blue-950 mb-1">
                عمولة المنظومة الافتراضية (ج.م) [متغيرة] *
              </label>
              <input
                type="number"
                step="1"
                value={formData.default_system_commission}
                onChange={(e) =>
                  setFormData({ ...formData, default_system_commission: Number(e.target.value) })
                }
                className="w-full bg-white border border-blue-300 rounded-lg px-3 py-2 text-base font-black text-blue-900"
                required
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                تضاف تلقائياً لكل سيارة/شاحنة جديدة (يمكنك تعديلها في أي وقت)
              </span>
            </div>

            <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-200">
              <label className="block text-xs font-bold text-indigo-950 mb-1">
                عمولة نافذ الافتراضية إن وجدت (ج.م) *
              </label>
              <input
                type="number"
                step="1"
                value={formData.default_nafez_commission}
                onChange={(e) =>
                  setFormData({ ...formData, default_nafez_commission: Number(e.target.value) })
                }
                className="w-full bg-white border border-indigo-300 rounded-lg px-3 py-2 text-base font-black text-indigo-900"
                required
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                تضاف في حالة وجود خدمة نافذ، ويمكن تركها 0 في حالة عدم وجودها
              </span>
            </div>
          </div>
        </div>

        {/* Template Default Weights & Axles */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3 flex items-center gap-2">
            <Truck className="w-5 h-5 text-blue-600" />
            <div>
              <h2 className="text-base font-bold text-slate-900">
                القيم الافتراضية لاسطمبة الشاحنات والمقطورات
              </h2>
              <p className="text-xs text-slate-500">
                تعبأ تلقائياً في خانات الجدول كما هو محدد بالاسطمبة الرسمية
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                محاور الشاحنة الافتراضية
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
                وزن الشاحنة من الرخصة
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
                محاور المقطورة الافتراضية
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
                وزن المقطورة من الرخصة
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

        {/* Supabase & Deployment Integrations */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-emerald-600" />
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  ربط قاعدة بيانات Supabase ونشر Vercel
                </h2>
                <p className="text-xs text-slate-500">
                  مشروعك على Supabase: <span className="font-mono text-emerald-700 font-bold">jfhmarmaebrzdnsvkqzv</span>
                </p>
              </div>
            </div>

            <a
              href="https://supabase.com/dashboard/project/jfhmarmaebrzdnsvkqzv/settings/api"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-900 font-bold bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200 transition"
            >
              <span>فتح Supabase API Keys</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Supabase URL
              </label>
              <input
                type="text"
                value={formData.supabase_url}
                onChange={(e) => setFormData({ ...formData, supabase_url: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Supabase Anon Public Key
              </label>
              <input
                type="password"
                placeholder="ألصق المفتاح العام (anon public key) هنا..."
                value={formData.supabase_anon_key}
                onChange={(e) => setFormData({ ...formData, supabase_anon_key: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleTestSupabase}
              disabled={syncStatus.loading}
              className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-1.5 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncStatus.loading ? 'animate-spin' : ''}`} />
              <span>اختبار اتصال Supabase</span>
            </button>

            <button
              type="button"
              onClick={copySqlToClipboard}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition"
            >
              {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedSql ? 'تم نسخ كود SQL بنجاح!' : 'نسخ كود SQL للجداول'}</span>
            </button>
          </div>

          {syncStatus.message && (
            <div
              className={`p-3 rounded-lg text-xs font-semibold flex items-center gap-2 ${
                syncStatus.success
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              <span>{syncStatus.message}</span>
            </div>
          )}
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
