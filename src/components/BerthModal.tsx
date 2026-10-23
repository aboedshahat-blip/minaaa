import React, { useState, useEffect } from 'react';
import { Berth } from '../types';
import { X, Anchor, Check } from 'lucide-react';
import { useConfirmAction } from '../contexts/ConfirmActionContext';

interface BerthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (berth: Berth) => void;
  editingBerth?: Berth | null;
  existingCount: number;
}

export const BerthModal: React.FC<BerthModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingBerth,
  existingCount,
}) => {
  const confirmAction = useConfirmAction();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (editingBerth) {
      setCode(editingBerth.code);
      setName(editingBerth.name);
      setDescription(editingBerth.description || '');
      setIsActive(editingBerth.is_active);
    } else {
      setCode(`B-0${existingCount + 1}`);
      setName('');
      setDescription('');
      setIsActive(true);
    }
  }, [editingBerth, isOpen, existingCount]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('برجاء كتابة اسم الرصيف');
      return;
    }

    const berthData: Berth = {
      id: editingBerth ? editingBerth.id : `b-${Date.now()}`,
      code: code.trim() || `B-${existingCount + 1}`,
      name: name.trim(),
      description: description.trim(),
      is_active: isActive,
      created_at: editingBerth ? editingBerth.created_at : new Date().toISOString(),
    };

    const action = editingBerth ? 'حفظ تعديلات الرصيف' : 'إضافة الرصيف إلى النظام';
    if (!await confirmAction(`هل تريد ${action}؟`, 'نعم، احفظ')) return;
    onSave(berthData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Anchor className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">
                {editingBerth ? 'تعديل رصيف الميناء' : 'إضافة رصيف جديد بالميناء'}
              </h2>
              <p className="text-xs text-slate-400">
                إدارة أرصفة الميناء للشحن والتفريغ
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              كود الرصيف *
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="مثال: B-01"
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-blue-900"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              اسم الرصيف بالميناء *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: رصيف الحاويات 1 أو رصيف البضائع 2"
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              وصف أو طبيعة العمل بالرصيف
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="حاويات صب، تفريغ سريع، ساحات تخزين..."
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="is_active"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
            />
            <label htmlFor="is_active" className="text-xs font-semibold text-slate-700 cursor-pointer">
              الرصيف نشط ويعمل حالياً
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow"
            >
              <Check className="w-4 h-4" />
              <span>{editingBerth ? 'حفظ التعديلات' : 'إضافة الرصيف'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
