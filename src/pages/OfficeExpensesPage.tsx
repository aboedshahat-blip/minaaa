import React, { useMemo, useState } from 'react';
import { Download, FileText, Paperclip, Plus, Trash2, Pencil, X, CalendarDays, Wallet } from 'lucide-react';
import { OfficeExpense, PaymentReceipt } from '../types';
import { getOfficeExpenseReceiptUrl } from '../lib/storage';
import { useConfirmAction } from '../contexts/ConfirmActionContext';
import { ProfessionalSearchField } from '../components/ProfessionalSearchField';

type ExpenseFormData = Omit<OfficeExpense, 'id' | 'created_at' | 'created_by' | 'created_by_name' | 'receipt_path' | 'receipt_name'>;

interface OfficeExpensesPageProps {
  expenses: OfficeExpense[];
  cloudReady: boolean | null;
  onSave: (data: ExpenseFormData, attachment?: File, existing?: OfficeExpense) => Promise<void>;
  onDelete: (expense: OfficeExpense) => Promise<void>;
}

const money = (amount: number) => `${Number(amount || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const emptyForm = (): ExpenseFormData => ({
  expense_date: today(), amount: 0, category: '', payee: '', payment_method: 'cash', description: '',
});

export const OfficeExpensesPage: React.FC<OfficeExpensesPageProps> = ({ expenses, cloudReady, onSave, onDelete }) => {
  const confirmAction = useConfirmAction();
  const [form, setForm] = useState<ExpenseFormData>(emptyForm);
  const [editing, setEditing] = useState<OfficeExpense | undefined>();
  const [attachment, setAttachment] = useState<File>();
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [query, setQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');

  const filtered = useMemo(() => expenses
    .filter((item) => !fromDate || item.expense_date >= fromDate)
    .filter((item) => !toDate || item.expense_date <= toDate)
    .filter((item) => methodFilter === 'all' || item.payment_method === methodFilter)
    .filter((item) => {
      const needle = query.trim().toLocaleLowerCase('ar');
      return !needle || [item.category, item.payee, item.description, item.created_by_name]
        .some((value) => (value || '').toLocaleLowerCase('ar').includes(needle));
    })
    .sort((a, b) => b.expense_date.localeCompare(a.expense_date) || b.created_at.localeCompare(a.created_at)),
  [expenses, fromDate, toDate, methodFilter, query]);

  const total = filtered.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const methods: { value: PaymentReceipt['payment_method']; label: string }[] = [
    { value: 'cash', label: 'نقدي' }, { value: 'bank_transfer', label: 'تحويل بنكي' },
    { value: 'check', label: 'شيك' }, { value: 'other', label: 'أخرى' },
  ];
  const beginNew = () => { setEditing(undefined); setForm(emptyForm()); setAttachment(undefined); setFormError(''); };
  const beginEdit = (expense: OfficeExpense) => {
    setEditing(expense);
    setForm({ expense_date: expense.expense_date, amount: expense.amount, category: expense.category, payee: expense.payee || '', payment_method: expense.payment_method, description: expense.description || '' });
    setAttachment(undefined);
    setFormError('');
    document.getElementById('office-expense-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.category.trim()) { setFormError('اكتب نوع المصروف.'); return; }
    if (!Number.isFinite(Number(form.amount)) || Number(form.amount) <= 0) { setFormError('أدخل مبلغاً أكبر من صفر.'); return; }
    if (!await confirmAction(editing ? 'هل تريد حفظ التعديلات على هذا المصروف؟' : 'هل أنت متأكد من تسجيل هذا المصروف؟', editing ? 'نعم، احفظ التعديلات' : 'نعم، سجّل المصروف')) return;
    setSaving(true); setFormError('');
    try {
      await onSave({ ...form, category: form.category.trim(), payee: form.payee?.trim(), description: form.description?.trim(), amount: Number(form.amount) }, attachment, editing);
      beginNew();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'تعذر حفظ المصروف.');
    } finally { setSaving(false); }
  };

  const openReceipt = async (expense: OfficeExpense) => {
    if (!expense.receipt_path) return;
    const newWindow = window.open('about:blank', '_blank');
    if (!newWindow) { setFormError('المتصفح منع فتح الإيصال. اسمح بالنوافذ المنبثقة ثم حاول مرة أخرى.'); return; }
    newWindow.opener = null;
    try {
      const url = await getOfficeExpenseReceiptUrl(expense.receipt_path);
      newWindow.location.href = url;
    }
    catch (error) { setFormError(error instanceof Error ? error.message : 'تعذر فتح الإيصال.'); }
  };

  const exportCsv = () => {
    const values = [
      ['تاريخ المصروف', 'وقت التسجيل', 'النوع', 'المبلغ', 'طريقة الدفع', 'المستفيد', 'البيان', 'المسجل'],
      ...filtered.map((row) => [row.expense_date, new Date(row.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }), row.category, row.amount.toFixed(2), methods.find((m) => m.value === row.payment_method)?.label || '', row.payee || '', row.description || '', row.created_by_name]),
    ];
    const csv = '\uFEFF' + values.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `مصاريف-المكتب-${today()}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  return <div className="space-y-5" dir="rtl">
    <section className="rounded-2xl bg-slate-900 p-5 text-white shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><p className="text-xs font-semibold text-blue-200">التسجيل والمتابعة</p><h1 className="mt-1 text-xl font-bold sm:text-2xl">مصاريف المكتب</h1><p className="mt-2 text-sm text-slate-300">سجل المصروفات والإيصالات في تقرير مستقل عن حسابات العملاء وإيرادات المكتب.</p></div>
        <button type="button" onClick={beginNew} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-500"><Plus size={18} />مصروف جديد</button>
      </div>
    </section>

    <section className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-sm text-slate-500"><FileText size={17} />عدد المصروفات المعروضة</div><strong className="mt-2 block text-2xl text-slate-900">{filtered.length}</strong></div>
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm"><div className="flex items-center gap-2 text-sm text-amber-800"><Wallet size={17} />إجمالي المصروفات المعروضة</div><strong className="mt-2 block text-2xl text-amber-900">{money(total)}</strong></div>
    </section>

    {cloudReady === false && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-900" role="status"><strong>مزامنة مصاريف المكتب تحتاج إعداد قاعدة البيانات.</strong><p>شغّل ملف <code dir="ltr">supabase/add_office_expenses.sql</code> في محرر SQL داخل Supabase. سجلات المصروفات تُحفظ محلياً لحين تجهيز الجدول؛ رفع الإيصالات يحتاج كذلك إعداد المخزن الذي ينشئه الملف.</p></div>}

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold text-slate-900">سجل المصروفات</h2><button onClick={exportCsv} type="button" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Download size={16} />تصدير النتائج</button></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <ProfessionalSearchField value={query} onChange={setQuery} placeholder="ابحث بنوع المصروف أو المستفيد أو البيان" className="md:col-span-2 xl:col-span-1" />
        <label className="relative"><span className="absolute right-3 top-3.5 text-slate-400"><CalendarDays size={16} /></span><input aria-label="من تاريخ" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 pr-10 text-sm" /></label>
        <label className="relative"><span className="absolute right-3 top-3.5 text-slate-400"><CalendarDays size={16} /></span><input aria-label="إلى تاريخ" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 pr-10 text-sm" /></label>
        <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)} aria-label="طريقة الدفع" className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="all">كل طرق الدفع</option>{methods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</select>
      </div>
      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[900px] text-right text-sm"><thead className="bg-slate-900 text-white"><tr>{['تاريخ المصروف / وقت التسجيل', 'نوع المصروف والبيان', 'المستفيد', 'طريقة الدفع', 'المبلغ', 'سجله', 'الإيصال', 'إجراءات'].map((title) => <th key={title} className="px-3 py-3 font-semibold">{title}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{filtered.map((row) => <tr key={row.id} className="hover:bg-slate-50"><td className="whitespace-nowrap px-3 py-3"><strong className="block">{new Date(`${row.expense_date}T12:00:00`).toLocaleDateString('ar-EG')}</strong><span className="mt-1 block text-xs text-slate-500">وقت التسجيل: {new Date(row.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span></td><td className="px-3 py-3"><strong className="block text-slate-900">{row.category}</strong>{row.description && <span className="mt-1 block max-w-xs text-xs text-slate-500">{row.description}</span>}</td><td className="px-3 py-3">{row.payee || '—'}</td><td className="px-3 py-3">{methods.find((m) => m.value === row.payment_method)?.label || 'أخرى'}</td><td className="whitespace-nowrap px-3 py-3 font-bold text-slate-900">{money(row.amount)}</td><td className="px-3 py-3">{row.created_by_name}</td><td className="px-3 py-3">{row.receipt_path ? <button type="button" onClick={() => void openReceipt(row)} className="inline-flex items-center gap-1 text-blue-700 hover:underline"><Paperclip size={15} />{row.receipt_name || 'فتح'}</button> : '—'}</td><td className="px-3 py-3"><div className="flex gap-1"><button type="button" title="تعديل" onClick={() => beginEdit(row)} className="rounded-lg p-2 text-blue-700 hover:bg-blue-50"><Pencil size={16} /></button><button type="button" title="حذف" onClick={async () => { if (await confirmAction('هل تريد حذف هذا المصروف وإيصال الدفع المرتبط به؟', 'نعم، احذف')) await onDelete(row); }} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"><Trash2 size={16} /></button></div></td></tr>)}
          {!filtered.length && <tr><td colSpan={8} className="p-10 text-center text-slate-500">لا توجد مصروفات مطابقة للبحث.</td></tr>}</tbody>
        </table>
      </div>
    </section>

    <section id="office-expense-form" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900">{editing ? 'تعديل المصروف' : 'تسجيل مصروف'}</h2><p className="mt-1 text-xs text-slate-500">كل المستخدمين يقدروا يسجلوا ويعدلوا ويحذفوا. يُحفظ اسم المسجل تلقائياً.</p></div>{editing && <button type="button" onClick={beginNew} className="inline-flex items-center gap-1 text-sm text-slate-500"><X size={16} />إلغاء التعديل</button>}</div>
      <form onSubmit={(event) => void submit(event)} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <label className="space-y-1.5 text-sm font-semibold text-slate-700">تاريخ المصروف<input required type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal" /></label>
        <label className="space-y-1.5 text-sm font-semibold text-slate-700">نوع المصروف<input required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="مثال: ضيافة، صيانة، انتقالات" className="min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal" /></label>
        <label className="space-y-1.5 text-sm font-semibold text-slate-700">المبلغ بالجنيه<input required type="number" min="0.01" step="0.01" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} placeholder="0.00" className="min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal" /></label>
        <label className="space-y-1.5 text-sm font-semibold text-slate-700">طريقة الدفع<select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value as PaymentReceipt['payment_method'] })} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal">{methods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label>
        <label className="space-y-1.5 text-sm font-semibold text-slate-700">المستفيد (اختياري)<input value={form.payee} onChange={(e) => setForm({ ...form, payee: e.target.value })} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal" /></label>
        <label className="space-y-1.5 text-sm font-semibold text-slate-700">إيصال أو فاتورة (اختياري)<input type="file" accept="image/png,image/jpeg,application/pdf" onChange={(e) => { const file = e.target.files?.[0]; if (file && file.size > 10 * 1024 * 1024) { setFormError('حجم الملف يجب ألا يتجاوز 10 ميجابايت.'); e.currentTarget.value = ''; return; } setAttachment(file); setFormError(''); }} className="block min-h-11 w-full rounded-lg border border-slate-300 p-2 text-xs font-normal file:ml-2 file:rounded-md file:border-0 file:bg-slate-100 file:px-2 file:py-1.5" />{editing?.receipt_name && !attachment && <span className="block text-xs font-normal text-slate-500">الإيصال الحالي: {editing.receipt_name}</span>}</label>
        <label className="space-y-1.5 text-sm font-semibold text-slate-700 md:col-span-2 xl:col-span-3">البيان أو الملاحظات<textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" /></label>
        {formError && <p className="md:col-span-2 xl:col-span-3 rounded-lg bg-rose-50 p-3 text-sm font-semibold text-rose-700" role="alert">{formError}</p>}
        <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-3"><button disabled={saving} type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-700 px-5 text-sm font-bold text-white hover:bg-blue-600 disabled:opacity-60"><Plus size={17} />{saving ? 'جارٍ الحفظ…' : editing ? 'حفظ التعديلات' : 'حفظ المصروف'}</button>{!editing && <button type="button" onClick={beginNew} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700">مسح الخانات</button>}</div>
      </form>
    </section>
  </div>;
};
