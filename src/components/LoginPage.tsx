import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  ShieldCheck,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import vibLogoUrl from '../assets/vib-logo.jpeg';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setErrorMessage('يرجى إدخال اسم المستخدم وكلمة المرور');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    setTimeout(() => {
      const res = login(username, password);
      if (!res.success) {
        setErrorMessage(res.message || 'بيانات الدخول غير صحيحة');
      }
      setIsLoading(false);
    }, 200);
  };

  return (
    <div className="min-h-screen bg-slate-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900 via-slate-900 to-slate-950 flex flex-col justify-center items-center p-4 sm:p-6 text-slate-100">
      {/* Background glowing effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-md w-full relative z-10 space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto mb-3 h-28 w-28 overflow-hidden rounded-3xl bg-white p-1.5 shadow-xl shadow-blue-950/30 ring-1 ring-white/15 sm:h-32 sm:w-32">
            <img src={vibLogoUrl} alt="شعار VIB للنقل وتجارة الحاويات" className="h-full w-full rounded-2xl object-contain" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            VIB للنقل وتجارة الحاويات
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            إدارة التشغيل وحركات الشاحنات والحسابات
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-blue-400" />
              <span>تسجيل الدخول للنظام</span>
            </h2>
            <span className="text-xs text-slate-400">حدد حسابك للدخول</span>
          </div>

          {errorMessage && (
            <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                اسم المستخدم (Username)
              </label>
              <input
                type="text"
                placeholder="أدخل اسم المستخدم..."
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                كلمة المرور (Password)
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="أدخل كلمة المرور..."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-3 text-slate-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-bold py-3 px-4 rounded-xl text-sm transition shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2"
            >
              <span>تسجيل الدخول</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Security Policy Information (Strict credentials required) */}
          <div className="pt-4 border-t border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                <span>سياسة الأمان والسرية المشددة:</span>
              </span>
              <span className="text-[10px] text-slate-500">دخول حسب الصلاحيات</span>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed bg-slate-800/40 p-2.5 rounded-xl border border-slate-800">
              <strong>أدخل بيانات الحساب المخصصة لك.</strong> تُحدد صلاحيات الوصول وفق دور المستخدم.
            </p>

            <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
              <div className="bg-slate-800/60 border border-slate-700/60 p-2 rounded-xl">
                <span className="block text-emerald-400 font-bold">المدير العام</span>
                <span className="font-mono text-slate-400">admin</span>
              </div>
              <div className="bg-slate-800/60 border border-slate-700/60 p-2 rounded-xl">
                <span className="block text-amber-400 font-bold">المحاسب المالي</span>
                <span className="font-mono text-slate-400">accountant</span>
              </div>
              <div className="bg-slate-800/60 border border-slate-700/60 p-2 rounded-xl">
                <span className="block text-rose-400 font-bold">مدخل البيانات</span>
                <span className="font-mono text-slate-400">dataentry</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center text-xs text-slate-500">
          VIB للنقل وتجارة الحاويات © {new Date().getFullYear()} - جميع الحقوق محفوظة
        </div>
      </div>
    </div>
  );
};
