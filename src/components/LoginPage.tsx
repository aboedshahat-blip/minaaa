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
import { vibLogoUrl } from '../lib/branding';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setErrorMessage('أدخل البريد الإلكتروني وكلمة المرور');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');
    try {
      const result = await login(email, password);
      if (!result.success) setErrorMessage(result.message || 'تعذر تسجيل الدخول. تحقق من البيانات وحالة الحساب.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'تعذر الاتصال بخدمة تسجيل الدخول الآمن.');
    } finally { setIsLoading(false); }
  };

  return (
    <div className="min-h-screen bg-slate-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900 via-slate-900 to-slate-950 flex flex-col justify-center items-center p-4 sm:p-6 text-slate-100">
      {/* Background glowing effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-md w-full relative z-10 space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto mb-3 h-24 w-36 overflow-hidden rounded-2xl bg-black shadow-xl shadow-blue-950/30 ring-1 ring-amber-300/25 sm:h-28 sm:w-40">
            <img src={vibLogoUrl} alt="شعار VIB للنقل وتجارة الحاويات" className="h-full w-full object-contain object-center" />
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
            <span className="text-xs text-slate-400">دخول آمن بالبريد الإلكتروني</span>
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
                البريد الإلكتروني
              </label>
              <input
                type="email"
                autoComplete="username"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                  autoComplete="current-password"
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

          {/* Security Policy Information */}
          <div className="pt-4 border-t border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                <span>سياسة الأمان والسرية المشددة:</span>
              </span>
              <span className="text-[10px] text-slate-500">دخول حسب الصلاحيات</span>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed bg-slate-800/40 p-2.5 rounded-xl border border-slate-800">
              <strong>استخدم البريد وكلمة المرور المخصصين لحسابك.</strong> تُحفظ كلمات المرور وتُتحقق عبر خدمة المصادقة، ولا تُخزن ضمن بيانات العملاء.
            </p>
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
