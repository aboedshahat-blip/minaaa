import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

interface ConfirmRequest { message: string; confirmLabel: string; }
type ConfirmAction = (message: string, confirmLabel?: string) => Promise<boolean>;
const ConfirmActionContext = createContext<ConfirmAction | null>(null);

export const ConfirmActionProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null);
  const finish = useCallback((confirmed: boolean) => {
    resolveRef.current?.(confirmed);
    resolveRef.current = null;
    setRequest(null);
  }, []);
  const confirmAction = useCallback<ConfirmAction>((message, confirmLabel = 'نعم، أكمل') => {
    if (resolveRef.current) finish(false);
    setRequest({ message, confirmLabel });
    return new Promise<boolean>((resolve) => { resolveRef.current = resolve; });
  }, [finish]);
  useEffect(() => {
    if (!request) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') finish(false); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [request, finish]);
  return (
    <ConfirmActionContext.Provider value={confirmAction}>
      {children}
      {request && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4" role="presentation">
        <section className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" role="alertdialog" aria-modal="true" aria-labelledby="confirm-action-title" aria-describedby="confirm-action-message" dir="rtl">
          <h2 id="confirm-action-title" className="text-lg font-black text-slate-900">تأكيد العملية</h2>
          <p id="confirm-action-message" className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-700">{request.message}</p>
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" autoFocus onClick={() => finish(false)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-5 font-bold text-slate-700 hover:bg-slate-50">لا</button>
            <button type="button" onClick={() => finish(true)} className="min-h-11 rounded-xl bg-blue-700 px-5 font-bold text-white hover:bg-blue-800">{request.confirmLabel}</button>
          </div>
        </section>
      </div>}
    </ConfirmActionContext.Provider>
  );
};

export const useConfirmAction = (): ConfirmAction => {
  const confirmAction = useContext(ConfirmActionContext);
  if (!confirmAction) throw new Error('useConfirmAction must be used within ConfirmActionProvider');
  return confirmAction;
};
