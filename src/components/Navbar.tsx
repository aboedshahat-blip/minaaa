import React from 'react';
import { useAuth, USERS } from '../contexts/AuthContext';
import { UserRole } from '../types';
import { Anchor, ShieldCheck, UserCheck, FileSpreadsheet, Lock } from 'lucide-react';

interface NavbarProps {
  onOpenQuickAdd: () => void;
  onOpenUpload: () => void;
  onExportTemplate: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenQuickAdd,
  onOpenUpload,
  onExportTemplate,
}) => {
  const { currentUser, setRole, canViewFinancials } = useAuth();

  const handleRoleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setRole(e.target.value as UserRole);
  };

  return (
    <header className="bg-slate-900 text-white shadow-md border-b border-slate-800 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg text-white shadow-sm flex items-center justify-center">
            <Anchor className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg text-white">منظومة الميناء اللوجستية</span>
              <span className="text-xs bg-blue-900/60 text-blue-300 border border-blue-700/50 px-2 py-0.5 rounded-full font-mono">
                Port Operations
              </span>
            </div>
            <p className="text-xs text-slate-400">إدارة حركات الشاحنات والحاويات والحسابات</p>
          </div>
        </div>

        {/* Quick action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenQuickAdd}
            className="hidden sm:inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-2 rounded-lg shadow-sm transition"
          >
            <span>+ تسجيل حركة شاحنة</span>
          </button>

          <button
            onClick={onOpenUpload}
            className="hidden sm:inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-3 py-2 rounded-lg shadow-sm transition"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>رفع وتصفية شيت</span>
          </button>

          <button
            onClick={onExportTemplate}
            className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium px-3 py-2 rounded-lg transition"
            title="تصدير الشيت بالاسطمبة الرسمية"
          >
            <span>تصدير الاسطمبة</span>
          </button>

          {/* User Role Switcher */}
          <div className="flex items-center gap-2 bg-slate-800/90 border border-slate-700 rounded-lg p-1.5 pr-2">
            <div className="flex items-center gap-1.5">
              {currentUser.role === 'admin' && (
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              )}
              {currentUser.role === 'accountant' && (
                <UserCheck className="w-4 h-4 text-amber-400" />
              )}
              {currentUser.role === 'data_entry' && (
                <Lock className="w-4 h-4 text-rose-400" />
              )}
              <span className="text-xs text-slate-300 font-medium hidden md:inline">
                المستخدم الحالي:
              </span>
            </div>

            <select
              value={currentUser.role}
              onChange={handleRoleChange}
              className="bg-slate-900 text-white text-xs font-semibold py-1 px-2 rounded border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="admin">1. أدمن (صلاحيات كاملة)</option>
              <option value="accountant">2. حسابات (مالية ومستحقات)</option>
              <option value="data_entry">3. مدخل بيانات (حجب الحسابات)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Role notice bar if data_entry */}
      {!canViewFinancials && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-1 text-center text-xs text-amber-300">
          ⚠️ أنت في وضع (مدخل بيانات): تم حجب التكاليف، فواتير الكاشير، العمولات، ومجاميع الحسابات تلقائياً.
        </div>
      )}
    </header>
  );
};
