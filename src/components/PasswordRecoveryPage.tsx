import React, { useState } from 'react';
import { CheckCircle2, Eye, EyeOff, KeyRound, Lock, ShieldCheck, AlertCircle } from 'lucide-react';
import { vibLogoUrl } from '../lib/branding';

interface PasswordRecoveryPageProps {
  onSave: (password: string) => Promise<{ success: boolean; message?: string }>;
  onContinue: () => void;
}

export const PasswordRecoveryPage: React.FC<PasswordRecoveryPageProps> = ({ onSave, onContinue }) => {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isComplete, setIsComplete] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage('');
    if (password.length < 8) {
      setErrorMessage('كلمة المرور يجب ألا تقل عن 8 أحرف.');
      return;
    }
    if (password !== confirmation) {
      setErrorMessage('تأكيد كلمة المرور غير مطابق.');
      return;
    }
    setIsSaving(true);
    try {
      const result = await onSave(password);
      if (!result.success) setErrorMessage(result.message || 'تعذر حفظ كلمة المرور الجديدة.');
      else setIsComplete(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'تعذر حفظ كلمة المرور الجديدة. حاول مرة أخرى.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-slate-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900 via-slate-900 to-slate-950 flex flex-col justify-center items-center p-4 sm:p-6 text-slate-100">
      <div className="max-w-md w-full relative z-10 space-y-6">
        <div className="text-center space-y-3">
          <div className="mx-auto h-24 w-36 overflow-hidden rounded-2xl bg-black shadow-xl shadow-blue-950/30 ring-1 ring-amber-300/25 sm:h-28 sm:w-40">
            <img src={vibLogoUrl} alt="شعار VIB للنقل وتجارة الحاويات" className="h-full w-full object-contain object-center" />
          </div>
          <h1 className="text-2xl font-black text-white">VIB للنقل وتجارة الحاويات</h1>
          <p className="text-sm text-slate-400">استعادة آمنة لحسابك</p>
        </div>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl sm:p-8">
          {isComplete ? (
            <div className="space-y-5 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
              <h2 className="text-lg font-bold text-white">تم تغيير كلمة المرور</h2>
              <p className="text-sm leading-6 text-slate-300">كلمة المرور الجديدة أصبحت سارية. اضغط للمتابعة إلى النظام.</p>
              <button type="button" onClick={onContinue} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700">
                متابعة إلى النظام
              </button>
            </div>
          ) : (
            <>
              <div className="mb-5 border-b border-slate-800 pb-4">
                <h2 className="flex items-center gap-2 text-lg font-bold text-white">
                  <KeyRound className="h-5 w-5 text-amber-400" /> تعيين كلمة مرور جديدة
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">اكتب كلمة مرور جديدة من اختيارك. لا تحتاج إلى معرفة كلمة المرور القديمة.</p>
              </div>

              {errorMessage && (
                <div role="alert" className="mb-4 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {errorMessage}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <label className="block text-sm font-semibold text-slate-300">
                  كلمة المرور الجديدة
                  <div className="relative mt-2">
                    <Lock className="absolute right-3 top-3.5 h-4 w-4 text-slate-500" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      minLength={8}
                      required
                      className="w-full rounded-xl border border-slate-700 bg-slate-800 px-10 py-3 text-sm text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                    />
                    <button type="button" aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'} onClick={() => setShowPassword((visible) => !visible)} className="absolute left-3 top-3.5 text-slate-400 hover:text-white">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </label>

                <label className="block text-sm font-semibold text-slate-300">
                  تأكيد كلمة المرور الجديدة
                  <div className="relative mt-2">
                    <Lock className="absolute right-3 top-3.5 h-4 w-4 text-slate-500" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmation}
                      onChange={(event) => setConfirmation(event.target.value)}
                      minLength={8}
                      required
                      className="w-full rounded-xl border border-slate-700 bg-slate-800 px-10 py-3 text-sm text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>
                </label>

                <p className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-800/50 p-3 text-xs text-slate-400">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" /> استخدم 8 أحرف على الأقل، ولا تشارك كلمة المرور مع أي شخص.
                </p>

                <button type="submit" disabled={isSaving} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
                  {isSaving ? 'جارٍ حفظ كلمة المرور…' : 'حفظ كلمة المرور الجديدة'}
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
};
