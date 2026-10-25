import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ShieldCheck, UserCheck, Lock, LogOut, Plus } from 'lucide-react';
import vibLogoUrl from '../assets/vib-logo.png';

interface NavbarProps {
  onOpenQuickAdd: () => void;
  onExportTemplate: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenQuickAdd,
  onExportTemplate,
}) => {
  const { currentUser, canViewFinancials, logout } = useAuth();

  return (
    <header className="bg-slate-900 text-white shadow-md border-b border-slate-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 min-h-[76px] py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4">
        {/* Brand */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="h-11 w-14 sm:h-12 sm:w-16 overflow-hidden rounded-xl bg-slate-950 shadow-sm ring-1 ring-white/20 shrink-0">
            <img src={vibLogoUrl} alt="شعار VIB للنقل والحاويات" className="h-full w-full object-cover object-center" />
          </div>
          <div className="min-w-0">
            <span className="block font-extrabold text-sm sm:text-base text-white truncate">VIB للنقل وتجارة الحاويات</span>
            <p className="mt-0.5 hidden sm:block text-[11px] text-slate-300">إدارة التشغيل والحركات والحسابات</p>
          </div>
        </div>

        {/* Quick action buttons & User Profile */}
        <div className="flex items-center justify-between sm:justify-end gap-1.5 sm:gap-2 min-w-0">
          <button
            onClick={onOpenQuickAdd}
            className="inline-flex items-center gap-1 sm:gap-1.5 bg-blue-600 hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 text-white text-[11px] sm:text-xs font-semibold px-2.5 sm:px-3.5 py-2.5 rounded-lg shadow-sm transition min-h-11"
          >
            <Plus className="w-4 h-4" /><span>إدخال يدوي</span>
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
