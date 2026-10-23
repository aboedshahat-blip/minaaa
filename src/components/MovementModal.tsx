import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Berth, Customer, Movement, SystemSettings } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { X, Calculator, Truck, FileText, Check } from 'lucide-react';

interface MovementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (movement: Partial<Movement>) => void;
  editingMovement?: Movement | null;
  customers: Customer[];
  berths: Berth[];
  settings: SystemSettings;
  nextSeq: number;
}

interface PlateInputProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  label: string;
}

const normalizePlateDigits = (value: string) => value
  .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
  .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));

const PlateInput: React.FC<PlateInputProps> = ({ value, onChange, required = false, label }) => {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const parseSlots = (plate: string) => {
    const letters = (plate.match(/\p{L}/gu) || []).slice(0, 3);
    const digits = normalizePlateDigits(plate).replace(/\D/g, '').slice(0, 4).split('');
    return [...letters, ...Array(3 - letters.length).fill(''), ...digits, ...Array(4 - digits.length).fill('')];
  };
  const [slots, setSlots] = useState<string[]>(() => parseSlots(value));
  const lastEmittedValue = useRef<string | null>(null);
  useEffect(() => {
    if (lastEmittedValue.current === value) {
      lastEmittedValue.current = null;
      return;
    }
    setSlots(parseSlots(value));
  }, [value]);
  const commit = (next: string[]) => {
    setSlots(next);
    const serialized = `${next.slice(0, 3).filter(Boolean).join(' ')} ${next.slice(3).filter(Boolean).join('')}`.trim();
    lastEmittedValue.current = serialized;
    onChange(serialized);
  };
  const renderSlot = (index: number) => {
    const isLetter = index < 3;
    return <input
      key={index}
      ref={(element) => { refs.current[index] = element; }}
      type="text"
      inputMode={isLetter ? 'text' : 'numeric'}
      maxLength={1}
      value={slots[index] || ''}
      onChange={(event) => {
        const raw = event.target.value;
        const enteredLetters = raw.match(/\p{L}/gu) || [];
        const enteredDigits = normalizePlateDigits(raw).replace(/\D/g, '').split('');
        if (enteredLetters.length + enteredDigits.length > 1) {
          const next = [...slots];
          enteredLetters.slice(0, 3).forEach((character, slot) => { next[slot] = character; });
          enteredDigits.slice(0, 4).forEach((character, slot) => { next[slot + 3] = character; });
          commit(next);
          refs.current[Math.min(enteredLetters.length, 2) + 3]?.focus();
          return;
        }
        const character = isLetter ? enteredLetters[0] : enteredDigits[0];
        const next = [...slots];
        next[index] = character || '';
        commit(next);
        if (character && index < 6) refs.current[index + 1]?.focus();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Backspace' && !slots[index] && index > 0) refs.current[index - 1]?.focus();
        if (event.key === 'ArrowLeft' && index < 6) refs.current[index + 1]?.focus();
        if (event.key === 'ArrowRight' && index > 0) refs.current[index - 1]?.focus();
      }}
      placeholder={isLetter ? 'ح' : '•'}
      aria-label={`${isLetter ? `الحرف ${index + 1}` : `الرقم ${index - 2}`} من لوحة ${label}`}
      required={required && index === 0}
      className="h-10 min-w-0 flex-1 border-0 bg-white p-0 text-center text-base font-semibold text-slate-800 outline-none placeholder:text-slate-300 focus:bg-blue-50"
    />;
  };
  return (
    <div dir="rtl" aria-label={label} className="flex w-full min-w-0 overflow-hidden rounded-md border border-slate-300 bg-white shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
      <div className="flex min-w-0 flex-[3] divide-x divide-x-reverse divide-slate-200">{[0, 1, 2].map(renderSlot)}</div>
      <span className="w-0.5 shrink-0 bg-slate-300" />
      <div dir="ltr" className="flex min-w-0 flex-[4] divide-x divide-slate-200">{[3, 4, 5, 6].map(renderSlot)}</div>
    </div>
  );
};

interface ContainerNumberInputProps {
  value: string;
  onChange: (value: string) => void;
}

const ContainerNumberInput: React.FC<ContainerNumberInputProps> = ({ value, onChange }) => {
  const containers = value.split(/[\/,،؛\n]+/).map((item) => item.trim()).slice(0, 2);
  const updateContainer = (index: number, nextValue: string) => {
    const next = [...containers];
    next[index] = nextValue;
    onChange(next.map((item) => item.trim()).filter(Boolean).join(' / '));
  };
  const formatContainer = (raw: string) => {
    const letters = (raw.match(/[A-Za-z]/g) || []).join('').toUpperCase().slice(0, 4);
    const digits = normalizePlateDigits(raw).replace(/\D/g, '').slice(0, 7);
    return `${letters}${digits ? ` ${digits}` : ''}`;
  };
  return (
    <div className="space-y-2">
      {[0, 1].map((index) => (
        <label key={index} className="block text-[10px] font-semibold text-slate-500">
          {index === 0 ? 'رقم الحاوية' : 'رقم الحاوية الثانية (اختياري)'}
          <ContainerNumberField value={containers[index] || ''} onChange={(next) => updateContainer(index, next)} format={formatContainer} label={index === 0 ? 'الحاوية الأولى' : 'الحاوية الثانية'} />
        </label>
      ))}
      <p className="text-[10px] text-slate-500">اكتب 4 أحرف ثم 7 أرقام؛ تُضاف المسافة تلقائيًا. اترك الحاوية الثانية فارغة إن لم توجد.</p>
    </div>
  );
};

interface ContainerNumberFieldProps {
  value: string;
  onChange: (value: string) => void;
  format: (value: string) => string;
  label: string;
}

const ContainerNumberField: React.FC<ContainerNumberFieldProps> = ({ value, onChange, format, label }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const caretAfterRender = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (caretAfterRender.current === null || !inputRef.current) return;
    inputRef.current.setSelectionRange(caretAfterRender.current, caretAfterRender.current);
    caretAfterRender.current = null;
  }, [value]);
  return <input
    ref={inputRef}
    type="text"
    inputMode="text"
    dir="ltr"
    maxLength={12}
    value={value}
    onChange={(event) => {
      const input = event.currentTarget;
      const raw = input.value;
      const caret = input.selectionStart ?? raw.length;
      const validCharsBeforeCaret = (raw.slice(0, caret).match(/[A-Za-z0-9٠-٩۰-۹]/g) || []).length;
      const next = format(raw);
      caretAfterRender.current = validCharsBeforeCaret + (validCharsBeforeCaret >= 4 && next.length > 4 ? 1 : 0);
      onChange(next);
    }}
    placeholder="MSKU 1234567"
    aria-label={label}
    className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-left font-mono text-sm font-semibold tracking-wide text-slate-800 shadow-sm placeholder:text-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
  />;
};

interface SegmentedCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  letterCount: number;
  digitCount: number;
  label: string;
  required?: boolean;
}

const SegmentedCodeInput: React.FC<SegmentedCodeInputProps> = ({ value, onChange, letterCount, digitCount, label, required = false }) => {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const letters = (value.match(/\p{L}/gu) || []).slice(0, letterCount);
  const digits = normalizePlateDigits(value).replace(/\D/g, '').slice(0, digitCount);
  const slots = [...letters, ...digits.split('')];
  const commitSlots = (next: string[]) => {
    onChange(`${next.slice(0, letterCount).filter(Boolean).join('')}${next.slice(letterCount).filter(Boolean).join('')}`);
  };
  return (
    <div dir="ltr" className="flex min-w-0 flex-1 overflow-hidden rounded-md border border-slate-300 bg-white shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100" aria-label={label}>
      {Array.from({ length: letterCount + digitCount }, (_, index) => {
        const isLetter = index < letterCount;
        const slotIndex = isLetter ? index : index - letterCount;
        return <input
          key={index}
          ref={(element) => { refs.current[index] = element; }}
          type="text"
          inputMode={isLetter ? 'text' : 'numeric'}
          maxLength={isLetter ? letterCount : digitCount}
          value={slots[index] || ''}
          onChange={(event) => {
            const raw = event.target.value;
            const pasted = raw.match(/[\p{L}0-9٠-٩۰-۹]/gu) || [];
            if (pasted.length > 1) {
              const next = [...slots];
              let target = index;
              pasted.forEach((character) => {
                const isCharacterLetter = /\p{L}/u.test(character);
                while (target < next.length && (target < letterCount) !== isCharacterLetter) target += 1;
                if (target < next.length) next[target++] = isCharacterLetter ? character.toLocaleUpperCase() : normalizePlateDigits(character);
              });
              commitSlots(next);
              refs.current[Math.min(target, next.length - 1)]?.focus();
              return;
            }
            const entered = isLetter
              ? (raw.match(/\p{L}/gu) || []).map((character) => character.toLocaleUpperCase())
              : normalizePlateDigits(raw).replace(/\D/g, '').split('');
            const next = [...slots];
            next[index] = entered[0] || '';
            commitSlots(next);
            if (entered[0] && index < next.length - 1) refs.current[index + 1]?.focus();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Backspace' && !slots[index] && index > 0) refs.current[index - 1]?.focus();
            if (event.key === 'ArrowLeft' && index > 0) refs.current[index - 1]?.focus();
            if (event.key === 'ArrowRight' && index < refs.current.length - 1) refs.current[index + 1]?.focus();
          }}
          placeholder={isLetter ? 'ح' : '•'}
          aria-label={isLetter ? `حرف ${slotIndex + 1} من ${label}` : `رقم ${slotIndex + 1} من ${label}`}
          className={`h-10 min-w-0 flex-1 border-0 bg-white p-0 text-center text-base font-semibold text-slate-800 outline-none placeholder:text-slate-300 focus:bg-blue-50 ${index > 0 ? 'border-l border-slate-200' : ''} ${index === letterCount ? 'border-l-2 border-l-slate-300' : ''}`}
          required={required && index === 0}
        />;
      })}
    </div>
  );
};

export const MovementModal: React.FC<MovementModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingMovement,
  customers,
  berths,
  settings,
  nextSeq,
}) => {
  const { canViewFinancials } = useAuth();

  const normalizeDigits = (value: string) => value.replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
  const vehicleNumberMessage = (value: string, label: string) => {
    if (!value.trim()) return '';
    const digitCount = normalizeDigits(value).replace(/\D/g, '').length;
    return digitCount >= 3 && digitCount <= 4 ? '' : `رقم ${label} المعتاد يحتوي على 3 أو 4 أرقام؛ راجع الرقم المدخل.`;
  };
  const containerNumberMessage = (value: string) => {
    if (!value.trim()) return '';
    const entries = value.split(/[\/,،؛\n]+/).map((part) => part.trim()).filter(Boolean);
    const valid = entries.every((entry) => {
      const normalized = normalizeDigits(entry).replace(/[\s-]/g, '').toUpperCase();
      return /^[A-Z]{4}\d{7}$/.test(normalized);
    });
    return valid ? '' : 'رقم الحاوية المعتاد يتكون من 4 حروف و7 أرقام. افصل الحاويتين بعلامة /.';
  };

  const draftKey = useMemo(
    () => `movement-form-draft:${editingMovement?.id ?? 'new'}`,
    [editingMovement?.id],
  );

  const [formData, setFormData] = useState<Partial<Movement>>({
    seq: nextSeq,
    movement_date: new Date().toISOString().split('T')[0],
    berth_id: berths[0]?.id || '',
    berth_name: berths[0]?.name || '',
    customer_id: '',
    customer_code: '',
    customer_name: '',
    truck_no: '',
    truck_weight: settings.default_truck_weight ?? 7.5,
    truck_axles: settings.default_truck_axles ?? 20,
    trailer_no: '',
    trailer_weight: settings.default_trailer_weight ?? 11.5,
    trailer_axles: settings.default_trailer_axles ?? 30,
    driver_name: '',
    declaration_no: '',
    container_no: '',
    container_desc: '',
    container_path: '',
    cashier_invoice: 0,
    system_commission: settings.default_system_commission ?? 200,
    nafez_commission: settings.default_nafez_commission ?? 0,
    total_amount: 0,
    payment_status: 'unpaid',
    paid_amount: 0,
    remaining_amount: 0,
    notes: '',
  });

  useEffect(() => {
    if (!isOpen) return;

    // Restore a recent draft before starting a blank form. This also protects
    // edits if the page reloads while the modal is open.
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const draft = JSON.parse(saved) as { savedAt?: number; formData?: Partial<Movement> };
        const isRecent = typeof draft.savedAt === 'number' && Date.now() - draft.savedAt < 24 * 60 * 60 * 1000;
        if (isRecent && draft.formData) {
          setFormData(draft.formData);
          return;
        }
        localStorage.removeItem(draftKey);
      }
    } catch {
      localStorage.removeItem(draftKey);
    }

    if (editingMovement) {
      setFormData(editingMovement);
    } else {
      setFormData({
        seq: nextSeq,
        movement_date: new Date().toISOString().split('T')[0],
        berth_id: berths[0]?.id || '',
        berth_name: berths[0]?.name || '',
        customer_id: customers[0]?.id || '',
        customer_code: customers[0]?.code || '',
        customer_name: customers[0]?.name || '',
        truck_no: '',
        truck_weight: settings.default_truck_weight ?? 7.5,
        truck_axles: settings.default_truck_axles ?? 20,
        trailer_no: '',
        trailer_weight: settings.default_trailer_weight ?? 11.5,
        trailer_axles: settings.default_trailer_axles ?? 30,
        driver_name: '',
        declaration_no: '',
        container_no: '',
        container_desc: '',
        container_path: '',
        cashier_invoice: 0,
        system_commission: customers[0]?.system_commission ?? settings.default_system_commission ?? 200,
        nafez_commission: customers[0]?.nafez_commission ?? settings.default_nafez_commission ?? 0,
        total_amount: (customers[0]?.system_commission ?? settings.default_system_commission ?? 200) + (customers[0]?.nafez_commission ?? settings.default_nafez_commission ?? 0),
        payment_status: 'unpaid',
        paid_amount: 0,
        remaining_amount: (settings.default_system_commission ?? 200) + (settings.default_nafez_commission ?? 0),
        notes: '',
      });
    }
  // Initialize on open / when switching to another movement only. Sync updates
  // to customers, berths, or settings must not wipe fields being entered.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, draftKey]);

  useEffect(() => {
    if (!isOpen) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ savedAt: Date.now(), formData }));
    } catch {
      // Keep the in-memory form usable if browser storage is unavailable.
    }
  }, [draftKey, formData, isOpen]);

  // Recalculate totals whenever cashier, system_commission, nafez_commission, or discount change
  useEffect(() => {
    const cashier = Number(formData.cashier_invoice) || 0;
    const sysComm = Number(formData.system_commission) || 0;
    const nafez = Number(formData.nafez_commission) || 0;
    const discount = Number(formData.discount) || 0;
    const total = Math.max(0, cashier + sysComm + nafez - discount);
    const paid = Number(formData.paid_amount) || 0;
    const remaining = Math.max(0, total - paid);

    let status = formData.payment_status;
    if (paid >= total && total > 0) {
      status = 'paid';
    } else if (paid > 0 && paid < total) {
      status = 'partial';
    } else if (paid === 0) {
      status = 'unpaid';
    }

    setFormData((prev) => ({
      ...prev,
      total_amount: total,
      remaining_amount: remaining,
      payment_status: status,
    }));
  }, [formData.cashier_invoice, formData.system_commission, formData.nafez_commission, formData.discount, formData.paid_amount]);

  if (!isOpen) return null;

  const handleCustomerChange = (customerId: string) => {
    const cust = customers.find((c) => c.id === customerId);
    if (cust) {
      const firstTruck = cust.trucks?.[0];
      setFormData((prev) => ({
        ...prev,
        customer_id: cust.id,
        customer_code: cust.code,
        customer_name: cust.name,
        system_commission: cust.system_commission ?? settings.default_system_commission ?? 200,
        nafez_commission: cust.nafez_commission ?? settings.default_nafez_commission ?? 0,
        truck_no: firstTruck ? firstTruck.truck_no : prev.truck_no,
        trailer_no: firstTruck ? firstTruck.trailer_no || '' : prev.trailer_no,
        driver_name: firstTruck ? firstTruck.driver_name || '' : prev.driver_name,
      }));
    }
  };

  const handleBerthChange = (berthId: string) => {
    const b = berths.find((item) => item.id === berthId);
    if (b) {
      setFormData((prev) => ({
        ...prev,
        berth_id: b.id,
        berth_name: b.name,
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.truck_no && !formData.container_no) {
      alert('برجاء إدخال رقم الشاحنة أو رقم الحاوية على الأقل');
      return;
    }
    const invalidNumber = vehicleNumberMessage(formData.truck_no || '', 'الشاحنة') ||
      vehicleNumberMessage(formData.trailer_no || '', 'المقطورة') ||
      containerNumberMessage(formData.container_no || '');
    if (invalidNumber) {
      alert(invalidNumber);
      return;
    }
    onSave(formData);
    localStorage.removeItem(draftKey);
    onClose();
  };

  const handleClose = () => {
    localStorage.removeItem(draftKey);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="bg-gradient-to-l from-slate-900 to-blue-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Truck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">
                {editingMovement ? 'تعديل حركة الشاحنة' : 'تسجيل حركة شاحنة جديدة'}
              </h2>
              <p className="text-xs text-blue-200">
                إدخال بيانات الاسطمبة الرسمية وربط الحسابات
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-slate-300 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Row 1: General Info (Customer, Berth, Date, Seq) */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                مسلسل الحركة (م)
              </label>
              <input
                type="number"
                value={formData.seq || nextSeq}
                onChange={(e) => setFormData({ ...formData, seq: Number(e.target.value) })}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-blue-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                تاريخ الحركة
              </label>
              <input
                type="date"
                value={formData.movement_date || ''}
                onChange={(e) => setFormData({ ...formData, movement_date: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                العميل (تكويد العميل)
              </label>
              <select
                value={formData.customer_id || ''}
                onChange={(e) => handleCustomerChange(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800"
              >
                <option value="">-- اختر العميل --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    [{c.code}] {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                رصيف الميناء
              </label>
              <select
                value={formData.berth_id || ''}
                onChange={(e) => handleBerthChange(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800"
              >
                {berths.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Truck & Trailer Data (Matching Official Template) */}
          <div className="border border-slate-200 rounded-xl p-4">
            <h3 className="text-xs font-bold text-blue-900 mb-3 flex items-center gap-1.5 border-b pb-2">
              <Truck className="w-4 h-4 text-blue-600" />
              <span>بيانات الشاحنة والمقطورة (الاسطمبة الرسمية)</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  رقم الشاحنة *
                </label>
                <PlateInput label="الشاحنة" value={formData.truck_no || ''} onChange={(truck_no) => setFormData((prev) => ({ ...prev, truck_no }))} required />
                {vehicleNumberMessage(formData.truck_no || '', 'الشاحنة') && <p className="mt-1 text-[11px] font-semibold text-rose-600">{vehicleNumberMessage(formData.truck_no || '', 'الشاحنة')}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  وزن الشاحنة من واقع الرخصة
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.truck_weight ?? 7.5}
                  onChange={(e) => setFormData({ ...formData, truck_weight: Number(e.target.value) })}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-center"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  محاور الشاحنة
                </label>
                <input
                  type="number"
                  value={formData.truck_axles ?? 20}
                  onChange={(e) => setFormData({ ...formData, truck_axles: Number(e.target.value) })}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-center"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  رقم المقطورة
                </label>
                <PlateInput label="المقطورة" value={formData.trailer_no || ''} onChange={(trailer_no) => setFormData((prev) => ({ ...prev, trailer_no }))} />
                {vehicleNumberMessage(formData.trailer_no || '', 'المقطورة') && <p className="mt-1 text-[11px] font-semibold text-rose-600">{vehicleNumberMessage(formData.trailer_no || '', 'المقطورة')}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  وزن المقطورة من واقع الرخصة
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.trailer_weight ?? 11.5}
                  onChange={(e) => setFormData({ ...formData, trailer_weight: Number(e.target.value) })}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-center"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  محاور المقطورة
                </label>
                <input
                  type="number"
                  value={formData.trailer_axles ?? 30}
                  onChange={(e) => setFormData({ ...formData, trailer_axles: Number(e.target.value) })}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-center"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  اسم السائق (العميل) *
                </label>
                <input
                  type="text"
                  placeholder="الاسم الثلاثي أو الرباعي للسائق (المؤسسة هي باسم السائق)"
                  value={formData.driver_name || ''}
                  onChange={(e) => {
                    const newDriver = e.target.value;
                    setFormData((prev) => ({
                      ...prev,
                      driver_name: newDriver,
                      // Automatically match or create customer by driver name if not set
                      customer_name: (!prev.customer_name || prev.customer_name === prev.driver_name) ? newDriver : prev.customer_name,
                    }));
                  }}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold"
                />
              </div>
            </div>
          </div>

          {/* Row 3: Container & Declaration Data */}
          <div className="border border-slate-200 rounded-xl p-4">
            <h3 className="text-xs font-bold text-blue-900 mb-3 flex items-center gap-1.5 border-b pb-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <span>بيانات الحاوية والإقرار الجمركي</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  رقم الإقرار الجمركي
                </label>
                <input
                  type="text"
                  placeholder="مثال: DEC-1029"
                  value={formData.declaration_no || ''}
                  onChange={(e) => setFormData({ ...formData, declaration_no: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  رقم الحاوية
                </label>
                <ContainerNumberInput value={formData.container_no || ''} onChange={(container_no) => setFormData((prev) => ({ ...prev, container_no }))} />
                {containerNumberMessage(formData.container_no || '') && <p className="mt-1 text-[11px] font-semibold text-rose-600">{containerNumberMessage(formData.container_no || '')}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  وصف الحاوية
                </label>
                <input
                  type="text"
                  placeholder="حاوية 40 قدم / 20 قدم / مبردة..."
                  value={formData.container_desc || ''}
                  onChange={(e) => setFormData({ ...formData, container_desc: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  مسار الحاوية
                </label>
                <input
                  type="text"
                  placeholder="مسار أ / بوابة 3 / فحص..."
                  value={formData.container_path || ''}
                  onChange={(e) => setFormData({ ...formData, container_path: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Row 4: Financial Calculation Section (Only for Admin & Accountant) */}
          {canViewFinancials ? (
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5 shadow-inner">
              <div className="flex items-center justify-between border-b border-blue-200 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-blue-700" />
                  <h3 className="text-sm font-bold text-blue-950">
                    حساب التكلفة والعمولات (طريقة الحساب المعتمدة)
                  </h3>
                </div>
                <div className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-medium">
                  المعادلة: فاتورة كاشير + عمولة المنظومة ({formData.system_commission}) + عمولة نافذ
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-4 pb-4 border-b border-blue-200">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    مسلسل / رقم فاتورة الكاشير (الميناء)
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: 0047-01-1/01-261021"
                    value={formData.cashier_receipt_no || ''}
                    onChange={(e) => setFormData({ ...formData, cashier_receipt_no: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono font-bold text-indigo-900"
                  />
                  <span className="text-[10px] text-slate-500">من واقع إيصال مكتب الكاشير</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    تصنيف الحجز / الخدمة
                  </label>
                  <select
                    value={formData.booking_category || 'وارد حاويات'}
                    onChange={(e) => setFormData({ ...formData, booking_category: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800"
                  >
                    <option value="وارد حاويات">وارد حاويات</option>
                    <option value="صادر حاويات">صادر حاويات</option>
                    <option value="تعتيق حاوية فارغة">تعتيق حاوية فارغة</option>
                    <option value="شحن بضائع عامة">شحن بضائع عامة</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    قيمة فاتورة كاشير (ج.م)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={formData.cashier_invoice || ''}
                    onChange={(e) => setFormData({ ...formData, cashier_invoice: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    عمولة المنظومة (ج.م) [متغيرة]
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.system_commission ?? 200}
                    onChange={(e) => setFormData({ ...formData, system_commission: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-blue-800"
                  />
                  <span className="text-[10px] text-slate-500">يُستخدم سعر العميل المحفوظ، ويمكن تغييره لهذه الحركة فقط.</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    عمولة نافذ إن وجدت (ج.م)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0"
                    value={formData.nafez_commission ?? 0}
                    onChange={(e) => setFormData({ ...formData, nafez_commission: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-indigo-800"
                  />
                  <span className="text-[10px] text-slate-500">يُستخدم سعر نافذ المحفوظ للعميل، والصفر يعني لا توجد رسوم.</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-rose-700 mb-1">
                    خصم خاص للعميل (ج.م)
                  </label>
                  <input
                    type="number"
                    step="1"
                    placeholder="0"
                    value={formData.discount || ''}
                    onChange={(e) => setFormData({ ...formData, discount: Number(e.target.value) })}
                    className="w-full bg-white border border-rose-300 rounded-lg px-3 py-2 text-sm font-bold text-rose-800"
                  />
                  <span className="text-[10px] text-slate-500">يُخصم من إجمالي المستحق</span>
                </div>

                <div className="bg-white p-3 rounded-xl border border-blue-300 flex flex-col justify-center">
                  <span className="text-xs text-slate-600 font-medium">الصافي المطلوب</span>
                  <span className="text-xl font-black text-blue-900">
                    {(formData.total_amount || 0).toLocaleString()} ج.م
                  </span>
                </div>
              </div>

              {/* Payment Details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 pt-4 border-t border-blue-200">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    المبلغ المدفوع حالياً (ج.م)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.paid_amount || ''}
                    onChange={(e) => setFormData({ ...formData, paid_amount: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-emerald-800"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    المبلغ المتبقي (المديونية)
                  </label>
                  <div className="w-full bg-slate-100 border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-rose-700">
                    {(formData.remaining_amount || 0).toLocaleString()} ج.م
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    حالة السداد
                  </label>
                  <select
                    value={formData.payment_status || 'unpaid'}
                    onChange={(e) => setFormData({ ...formData, payment_status: e.target.value as any })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-slate-800"
                  >
                    <option value="unpaid">غير مدفوع (متبقي كامل)</option>
                    <option value="partial">مدفوع جزئياً</option>
                    <option value="paid">مدفوع بالكامل</option>
                  </select>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-100 p-3 rounded-lg text-xs text-slate-500 text-center border border-dashed border-slate-300">
              🔒 حقول الحسابات وفواتير الكاشير والعمولات مخفية تلقائياً لصلاحيات مدخل البيانات.
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              ملاحظات إضافية
            </label>
            <input
              type="text"
              placeholder="أي تفاصيل خاصة بالحركة أو العميل..."
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* Footer buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={handleClose}
              className="px-5 py-2.5 rounded-lg border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-100 transition"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-md hover:shadow-lg transition flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{editingMovement ? 'حفظ التعديلات' : 'إضافة الحركة للسيستم'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
