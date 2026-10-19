import React from 'react';
import { Berth, Movement } from '../types';
import { Anchor, Plus, Edit2, Trash2, CheckCircle2, XCircle } from 'lucide-react';

interface BerthsPageProps {
  berths: Berth[];
  movements: Movement[];
  onOpenAddModal: () => void;
  onEditBerth: (berth: Berth) => void;
  onDeleteBerth: (id: string) => void;
}

export const BerthsPage: React.FC<BerthsPageProps> = ({
  berths,
  movements,
  onOpenAddModal,
  onEditBerth,
  onDeleteBerth,
}) => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <Anchor className="w-6 h-6 text-blue-600" />
              <span>إدارة وتكويد أرصفة الميناء</span>
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              إضافة وتعديل أرصفة الشحن والتفريغ بالميناء وتوزيع حركات الشاحنات عليها
            </p>
          </div>

          <div>
            <button
              onClick={onOpenAddModal}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg shadow-sm transition flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>+ إضافة رصيف جديد</span>
            </button>
          </div>
        </div>
      </div>

      {/* Berths Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {berths.map((b) => {
          const berthMovements = movements.filter(
            (m) => m.berth_id === b.id || m.berth_name === b.name
          );

          return (
            <div
              key={b.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between hover:shadow-md transition"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full font-mono">
                      {b.code}
                    </span>
                    <h2 className="text-base font-bold text-slate-900 mt-2">{b.name}</h2>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onEditBerth(b)}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                      title="تعديل الرصيف"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onDeleteBerth(b.id)}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition"
                      title="حذف الرصيف"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-500 mt-3">
                  {b.description || 'رصيف مخصص لتفريغ وشحن الحاويات والبضائع العامة'}
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span className="font-bold text-slate-900">{berthMovements.length}</span>
                  <span>حركة شاحنة مسجلة</span>
                </div>

                <div>
                  {b.is_active ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      نشط ومتاح
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                      <XCircle className="w-3.5 h-3.5" />
                      معطل مؤقتاً
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
