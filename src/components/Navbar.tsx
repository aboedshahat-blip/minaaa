import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Anchor, ShieldCheck, UserCheck, Lock, LogOut, Plus, Upload } from 'lucide-react';

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
  const { currentUser, users, setCurrentUserId, canViewFinancials, logout } = useAuth();

  const handleUserChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCurrentUserId(e.target.value);
  };

  return (
    <header className="bg-slate-900 text-white shadow-md border-b border-slate-800 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 min-h-16 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
        {/* Brand */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="bg-blue-600 p-1.5 sm:p-2 rounded-lg text-white shadow-sm flex items-center justify-center shrink-0">
            <Anchor className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm sm:text-lg text-white truncate">منظومة VIB اللوجستية</span>
              <span className="hidden md:inline text-xs bg-blue-900/60 text-blue-300 border border-blue-700/50 px-2 py-0.5 rounded-full font-mono font-bold">
                VIB Operations
              </span>
            </div>
            <p className="hidden sm:block text-xs text-slate-400">إدارة حركات الشاحنات والحاويات والحسابات</p>
          </div>
        </div>

        {/* Quick action buttons & User Profile */}
        <div className="flex items-center justify-between sm:justify-end gap-1.5 sm:gap-2 min-w-0">
          <button
            onClick={onOpenQuickAdd}
            className="inline-flex items-center gap-1 sm:gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] sm:text-xs font-medium px-2 sm:px-3 py-2.5 sm:py-2 rounded-lg shadow-sm transition min-h-11 sm:min-h-0"
          >
            <Plus className="w-4 h-4" /><span className="hidden sm:inline">تسجيل حركة</span>
          </button>

          <button
            onClick={onOpenUpload}
            className="inline-flex items-center gap-1 sm:gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] sm:text-xs font-medium px-2 sm:px-3 py-2.5 sm:py-2 rounded-lg shadow-sm transition min-h-11 sm:min-h-0"
          >
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">رفع شيت</span>
          </button>

          <button
            onClick={onExportTemplate}
            className="hidden sm:inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium px-3 py-2 rounded-lg transition"
            title="تصدير الشيت بالاسطمبة الرسمية"
          >
            <span>تصدير الاسطمبة</span>
          </button>

          {/* Current Logged in User Badge & Logout */}
          <div className="flex items-center gap-1.5 sm:gap-2 bg-slate-800/90 border border-slate-700 rounded-lg p-1.5 px-2 sm:px-2.5 min-w-0">
            <div className="flex items-center gap-2">
              {currentUser.role === 'admin' && (
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              )}
              {currentUser.role === 'accountant' && (
                <UserCheck className="w-4 h-4 text-amber-400" />
              )}
              {currentUser.role === 'data_entry' && (
                <Lock className="w-4 h-4 text-rose-400" />
              )}
              <div className="hidden sm:flex flex-col text-right max-w-28">
                <span className="text-[11px] sm:text-xs text-white font-bold leading-tight truncate">
                  {currentUser.name}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {currentUser.role === 'admin' ? 'المدير العام' : currentUser.role === 'accountant' ? 'محاسب مالي' : 'مدخل بيانات'}
                </span>
              </div>
            </div>

            <div className="h-5 w-px bg-slate-700 mx-0.5 sm:mx-1" />

            {/* Secure Logout Button */}
            <button
              onClick={logout}
              title="تسجيل الخروج من الحساب"
              className="min-h-10 py-1 px-2 text-rose-400 hover:text-white hover:bg-rose-600/80 rounded-md transition flex items-center gap-1 text-xs font-semibold"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-[11px]">تسجيل خروج</span>
            </button>
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
