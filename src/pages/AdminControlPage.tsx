import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useConfirmAction } from '../contexts/ConfirmActionContext';
import { ManagedUser, RolePermissions, SystemSettings } from '../types';
import { OperationalSafetyBackup } from '../lib/storage';
import {
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Lock,
  Unlock,
  Key,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  RefreshCw,
  Users,
  Eye,
  EyeOff,
  Briefcase,
  Truck,
  Building2,
  DollarSign,
  FileSpreadsheet,
} from 'lucide-react';

interface AdminControlPageProps {
  settings: SystemSettings;
  onSaveSettings: (settings: SystemSettings) => void;
  movementCount: number;
  customerCount: number;
  berthCount: number;
  paymentCount: number;
  safetyBackups: OperationalSafetyBackup[];
  onRefreshDataFromCloud: () => Promise<void>;
  onClearOperationalData: () => Promise<void>;
  onRestoreSafetyBackup: (backup: OperationalSafetyBackup) => Promise<void>;
}

export const AdminControlPage: React.FC<AdminControlPageProps> = ({
  settings,
  onSaveSettings,
  movementCount,
  customerCount,
  berthCount,
  paymentCount,
  safetyBackups,
  onRefreshDataFromCloud,
  onClearOperationalData,
  onRestoreSafetyBackup,
}) => {
  const confirmAction = useConfirmAction();
  const {
    users,
    currentUser,
    updateUserPermissions,
    updateUserStatus,
    updateUserPassword,
    addNewUser,
    deleteUser,
    verifyCurrentPassword,
  } = useAuth();

  // Admin Password Unlock Gate (Secure password verification, NOT PIN)
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);

  // New User Form State
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newUserRole, setNewUserRole] = useState<'accountant' | 'data_entry'>('accountant');
  const [newUserPassword, setNewUserPassword] = useState('');

  // Password editing state for active selected user
  const [editingPassword, setEditingPassword] = useState('');
  const [showEditingPassword, setShowEditingPassword] = useState(false);

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [clearPassword, setClearPassword] = useState('');
  const [clearError, setClearError] = useState<string | null>(null);
  const [clearFeedback, setClearFeedback] = useState<string | null>(null);
  const [isClearingData, setIsClearingData] = useState(false);
  const [isRestoreDialogOpen, setIsRestoreDialogOpen] = useState(false);
  const [restorePassword, setRestorePassword] = useState('');
  const [selectedBackupId, setSelectedBackupId] = useState('');
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  const openLatestUndo = () => {
    const latestBackup = safetyBackups[0];
    if (!latestBackup) return;
    setSelectedBackupId(latestBackup.id);
    setRestorePassword('');
    setRestoreError(null);
    setIsRestoreDialogOpen(true);
  };

  useEffect(() => {
    if (!isUnlocked || !safetyBackups.length) return;
    const handleUndoShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.matches('input, textarea, select, [contenteditable="true"]');
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !isTyping) {
        event.preventDefault();
        openLatestUndo();
      }
    };
    window.addEventListener('keydown', handleUndoShortcut);
    return () => window.removeEventListener('keydown', handleUndoShortcut);
  }, [isUnlocked, safetyBackups]);

  // Active selected user for permissions/password management
  const [activeEditingUserId, setActiveEditingUserId] = useState<string>(users[0]?.id || 'u-admin');

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await verifyCurrentPassword(passwordInput)) {
      setIsUnlocked(true);
      setPasswordError(false);
    } else {
      setPasswordError(true);
    }
  };

  const handleSyncCloud = async () => {
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      await onRefreshDataFromCloud();
      setSyncFeedback('تمت مزامنة وتحديث كافة البيانات بنجاح تام! 🟢');
    } catch (e) {
      setSyncFeedback('حدث خطأ أثناء الاتصال السحابي، جاري إعادة المحاولة...');
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncFeedback(null), 4000);
    }
  };

  const handleConfirmClearData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!await verifyCurrentPassword(clearPassword)) {
      setClearError('كلمة المرور غير صحيحة. أدخل كلمة مرور الأدمن للمتابعة.');
      return;
    }

    const confirmed = await confirmAction(
      'تحذير: سيتم حذف كل الحركات والعملاء وسندات القبض من قاعدة البيانات والأجهزة المرتبطة. ستظل حسابات المستخدمين والإعدادات والأرصفة محفوظة. هل تريد المتابعة؟',
      'نعم، امسح بيانات التشغيل'
    );
    if (!confirmed) return;

    setIsClearingData(true);
    setClearError(null);
    setClearFeedback(null);
    try {
      await onClearOperationalData();
      setClearFeedback('تم مسح بيانات التشغيل ومزامنة التصفير مع الأجهزة المرتبطة.');
      setClearPassword('');
      setIsClearDialogOpen(false);
    } catch (error) {
      setClearError(error instanceof Error ? error.message : 'تعذر مسح البيانات.');
    } finally {
      setIsClearingData(false);
    }
  };

  const handleConfirmRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!await verifyCurrentPassword(restorePassword)) {
      setRestoreError('كلمة مرور الأدمن غير صحيحة.');
      return;
    }
    const backup = safetyBackups.find((item) => item.id === selectedBackupId);
    if (!backup) {
      setRestoreError('اختر نسخة محفوظة للاستعادة.');
      return;
    }
    if (!await confirmAction(`سيتم استبدال بيانات التشغيل الحالية بالنسخة المحفوظة بتاريخ ${new Date(backup.created_at).toLocaleString('ar-EG')} (${backup.label}). قد تختفي أي بيانات أضيفت بعد هذه النسخة. هل تريد الاستمرار؟`, 'نعم، استعد النسخة')) return;
    setIsRestoring(true);
    setRestoreError(null);
    try {
      await onRestoreSafetyBackup(backup);
      setRestorePassword('');
      setIsRestoreDialogOpen(false);
    } catch (error) {
      setRestoreError(error instanceof Error ? error.message : 'تعذرت استعادة النسخة.');
    } finally {
      setIsRestoring(false);
    }
  };

  const handleTogglePermission = async (userId: string, key: keyof RolePermissions) => {
    const targetUser = users.find((u) => u.id === userId);
    if (!targetUser) return;

    const currentPerms = targetUser.permissions;
    const updatedPerms: RolePermissions = {
      ...currentPerms,
      [key]: !currentPerms[key],
    };

    if (!await confirmAction('هل تريد تغيير صلاحية هذا المستخدم؟', 'نعم، غيّر الصلاحية')) return;
    try { await updateUserPermissions(userId, updatedPerms); }
    catch (error) { window.alert(error instanceof Error ? error.message : 'تعذر تحديث الصلاحية.'); }
  };

  const handleAddNewUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newFullName.trim() || !newUserEmail.trim()) {
      alert('أدخل الاسم واسم المستخدم والبريد الإلكتروني.');
      return;
    }

    if (newUserPassword.trim().length < 8) {
      alert('كلمة المرور يجب ألا تقل عن 8 أحرف.');
      return;
    }

    // Default permission templates based on role
    const defaultPerms: RolePermissions =
      newUserRole === 'accountant'
        ? {
            can_view_financials: true,
            can_view_system_revenue: false,
            can_add_movements: true,
            can_edit_movements: true,
            can_delete_movements: false,
            can_upload_sheets: true,
            can_export_excel: true,
            can_manage_customers: true,
            can_delete_customers: false,
            can_manage_payments: true,
            can_manage_berths: false,
            can_edit_commissions: false,
          }
        : {
            can_view_financials: false,
            can_view_system_revenue: false,
            can_add_movements: true,
            can_edit_movements: false,
            can_delete_movements: false,
            can_upload_sheets: true,
            can_export_excel: true,
            can_manage_customers: false,
            can_delete_customers: false,
            can_manage_payments: false,
            can_manage_berths: false,
            can_edit_commissions: false,
          };

    if (!await confirmAction(`هل تريد إضافة المستخدم ${newFullName.trim()} بالصلاحيات المحددة؟`, 'نعم، أضف المستخدم')) return;
    try {
      await addNewUser({
        email: newUserEmail.trim().toLowerCase(),
        username: newUsername.trim(),
        password: newUserPassword.trim(),
        name: newFullName.trim(),
        role: newUserRole,
        is_active: true,
        permissions: defaultPerms,
      });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'تعذر إنشاء حساب المستخدم.');
      return;
    }

    setNewUsername('');
    setNewUserEmail('');
    setNewFullName('');
    setNewUserPassword('');
    setIsAddUserOpen(false);
    alert('تم إنشاء الحساب وإرسال دعوة تأكيد إلى البريد الإلكتروني. بعد تأكيد البريد يمكن للمستخدم تسجيل الدخول.');
  };

  const selectedUser = users.find((u) => u.id === activeEditingUserId) || users[0];

  // If not admin, block completely from viewing or accessing Admin Control
  if (currentUser.role !== 'admin') {
    return (
      <div className="max-w-md mx-auto my-16 bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center space-y-4">
        <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-black text-slate-900">غير مصرح بالدخول</h2>
        <p className="text-xs text-slate-600 leading-relaxed">
          هذه الصفحة مخصصة فقط وحصرياً للمدير العام (الأدمن). حسابك الحالي لا يمتلك صلاحية الوصول لهذه اللوحة.
        </p>
      </div>
    );
  }

  // If locked, require Admin Password verification (Strict Password, NOT PIN)
  if (!isUnlocked) {
    return (
      <div className="max-w-md mx-auto my-12 bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center space-y-5">
        <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
          <Lock className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-xl font-black text-slate-900">تأكيد كلمة سر المدير العام</h2>
          <p className="text-xs text-slate-500 mt-1">
            أدخل كلمة سر الأدمن لفتح لوحة التحكم بالصلاحيات والمستخدمين
          </p>
        </div>

        <form onSubmit={handleUnlock} className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              كلمة سر الأدمن (Password)
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              className="w-full text-center text-lg font-mono py-2.5 px-3 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
              autoFocus
            />
            {passwordError && (
              <span className="text-xs text-rose-600 font-bold block mt-1">
                كلمة المرور غير صحيحة! يرجى إعادة المحاولة.
              </span>
            )}
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-sm transition shadow-md"
          >
            تأكيد وفتح لوحة التحكم
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-l from-slate-900 via-indigo-950 to-blue-950 text-white rounded-2xl shadow-xl p-6 border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-3 rounded-xl shadow-lg">
              <ShieldAlert className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black">لوحة تحكم منظومة VIB — إدارة الصلاحيات والمستخدمين</h1>
                <span className="bg-emerald-500/20 text-emerald-300 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                  لوحة المدير العام
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                التحكم بحسابات المستخدمين، تعديل كلمات المرور، وتحديد صلاحيات المحاسب ومدخل البيانات
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 px-3 py-1.5 rounded-lg text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>المزامنة السحابية نشطة 🟢</span>
            </div>

            <button
              onClick={handleSyncCloud}
              disabled={isSyncing}
              className="bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition border border-white/20 shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'جاري التحديث...' : 'تحديث البيانات السحابية'}</span>
            </button>
          </div>
        </div>

        {syncFeedback && (
          <div className="mt-3 p-2.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs font-bold text-center">
            {syncFeedback}
          </div>
        )}
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
          <span className="text-xs text-slate-500 block mb-1">حركات الشاحنات المسجلة</span>
          <span className="text-2xl font-black text-slate-900">{movementCount}</span>
          <span className="text-[10px] text-blue-600 block mt-1">حركة معتمدة</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
          <span className="text-xs text-slate-500 block mb-1">العملاء والشركات المكودة</span>
          <span className="text-2xl font-black text-slate-900">{customerCount}</span>
          <span className="text-[10px] text-emerald-600 block mt-1">عميل مسجل</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
          <span className="text-xs text-slate-500 block mb-1">أرصفة الميناء</span>
          <span className="text-2xl font-black text-slate-900">{berthCount}</span>
          <span className="text-[10px] text-indigo-600 block mt-1">رصيف تشغيل</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
          <span className="text-xs text-slate-500 block mb-1">سندات القبض والتحصيل</span>
          <span className="text-2xl font-black text-slate-900">{paymentCount}</span>
          <span className="text-[10px] text-amber-600 block mt-1">سند مالي</span>
        </div>
      </div>

      <section className="bg-rose-50 rounded-2xl border border-rose-200 p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-black text-rose-900 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5" /> مسح بيانات التشغيل
            </h2>
            <p className="text-xs text-rose-800 mt-1 leading-6">
              يمسح الحركات والعملاء وسندات القبض من السحابة والأجهزة المرتبطة. تبقى حسابات المستخدمين والإعدادات والأرصفة كما هي.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setClearError(null); setClearPassword(''); setIsClearDialogOpen(true); }}
            className="shrink-0 bg-rose-700 hover:bg-rose-800 text-white text-sm font-bold px-5 py-3 rounded-xl flex items-center justify-center gap-2 transition shadow-sm"
          >
            <Trash2 className="w-4 h-4" /> مسح البيانات
          </button>
        </div>
        {clearFeedback && <p role="status" className="text-sm font-bold text-emerald-700">{clearFeedback}</p>}
        {clearError && !isClearDialogOpen && <p role="alert" className="text-sm font-bold text-rose-700">{clearError}</p>}
      </section>

      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 sm:p-6 space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-black text-emerald-900"><RefreshCw className="h-5 w-5"/>استعادة نسخة الأمان</h2>
            <p className="mt-1 text-xs leading-6 text-emerald-800">يحفظ النظام تلقائيًا آخر 10 نسخ قبل حذف الحركات أو العميل أو مسح بيانات التشغيل. النسخ محفوظة على هذا الجهاز، والاستعادة تتطلب كلمة مرور الأدمن.</p>
            {safetyBackups[0] && <p className="mt-1 text-xs font-bold text-emerald-900">آخر نسخة: {new Date(safetyBackups[0].created_at).toLocaleString('ar-EG')} — {safetyBackups[0].label}</p>}
          </div>
          <button type="button" disabled={!safetyBackups.length} onClick={openLatestUndo} className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"><RefreshCw className="h-4 w-4"/>استعادة نسخة أمان</button>
        </div>
        {!safetyBackups.length && <p className="text-xs text-slate-600">لا توجد نسخة سابقة على هذا الجهاز حتى الآن. سيُنشئ النظام نسخة تلقائية قبل عمليات الحذف القادمة.</p>}
      </section>

      {/* Users & Granular Permissions Matrix */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="bg-blue-100 text-blue-700 p-2 rounded-lg">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                إدارة المستخدمين والتحكم بالصلاحيات وكلمات المرور
              </h2>
              <p className="text-xs text-slate-500">
                حدد المستخدم لتعديل كلمة مروره أو تفعيل وإلغاء صلاحياته بضغطة زر
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsAddUserOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3.5 py-2 rounded-lg shadow-sm transition flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>+ إضافة مستخدم جديد للنظام</span>
          </button>
        </div>

        {/* Users List Tabs */}
        <div className="flex flex-wrap gap-2">
          {users.map((u) => {
            const isSelected = u.id === activeEditingUserId;
            return (
              <button
                key={u.id}
                onClick={() => setActiveEditingUserId(u.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition ${
                  isSelected
                    ? 'bg-blue-900 text-white border-blue-900 shadow'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {u.role === 'admin' ? (
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                ) : (
                  <UserCheck className="w-4 h-4 text-blue-400" />
                )}
                <span>{u.name}</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                    isSelected ? 'bg-blue-800 text-blue-200' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {u.username}
                </span>
              </button>
            );
          })}
        </div>

        {/* Selected User Account Details & Password Changer */}
        {selectedUser && (
          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-6">
            {/* User Meta & Quick Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black text-slate-900">
                    حساب: {selectedUser.name}
                  </h3>
                  <span className="text-xs bg-blue-100 text-blue-800 font-mono px-2 py-0.5 rounded font-bold">
                    @{selectedUser.username}
                  </span>
                  {selectedUser.role === 'admin' && (
                    <span className="text-[11px] bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full font-bold">
                      المدير العام يمتلك جميع الصلاحيات
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  الدور: {selectedUser.role === 'admin' ? 'مدير عام كامل الصلاحيات' : selectedUser.role === 'accountant' ? 'محاسب مالي' : 'مدخل بيانات شاحنات'}
                </p>
              </div>

              {/* Status and Delete Actions */}
              {selectedUser.role !== 'admin' && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      const nextActive = !selectedUser.is_active;
                      if (await confirmAction(`هل تريد ${nextActive ? 'تفعيل' : 'تعطيل'} حساب ${selectedUser.name}؟`, 'نعم، نفّذ')) {
                        try { await updateUserStatus(selectedUser.id, nextActive); }
                        catch (error) { window.alert(error instanceof Error ? error.message : 'تعذر تحديث حالة الحساب.'); }
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                      selectedUser.is_active
                        ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                        : 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                    }`}
                  >
                    {selectedUser.is_active ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                    <span>{selectedUser.is_active ? 'الحساب مفعل' : 'الحساب معطل'}</span>
                  </button>

                  <button
                    onClick={async () => {
                    if (await confirmAction(`سيتم حذف حساب المستخدم ${selectedUser.name}. هل تريد المتابعة؟`, 'نعم، احذف المستخدم')) {
                      try { await deleteUser(selectedUser.id); }
                      catch (error) { window.alert(error instanceof Error ? error.message : 'تعذر حذف الحساب.'); }
                    }
                    }}
                    className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition"
                    title="حذف هذا المستخدم"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Change Password Card */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <Key className="w-4 h-4 text-orange-600" />
                <span>تغيير كلمة المرور لهذا المستخدم:</span>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1 max-w-sm">
                  <input
                    type={showEditingPassword ? 'text' : 'password'}
                    placeholder="اكتب كلمة المرور الجديدة هنا..."
                    value={editingPassword}
                    onChange={(e) => setEditingPassword(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg pr-3 pl-9 py-2 text-xs font-mono focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditingPassword(!showEditingPassword)}
                    className="absolute left-2.5 top-2.5 text-slate-400 hover:text-slate-700"
                    title={showEditingPassword ? 'إخفاء' : 'إظهار'}
                  >
                    {showEditingPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    if (!editingPassword.trim()) {
                      alert('يرجى كتابة كلمة مرور جديدة');
                      return;
                    }
                    if (!await confirmAction(`هل تريد تغيير كلمة مرور ${selectedUser.name}؟`, 'نعم، غيّر كلمة المرور')) return;
                    if (editingPassword.trim().length < 8) { alert('كلمة المرور يجب ألا تقل عن 8 أحرف.'); return; }
                    try {
                      await updateUserPassword(selectedUser.id, editingPassword.trim());
                      alert(`تم تحديث كلمة المرور في خدمة الدخول الآمن للمستخدم (${selectedUser.name}).`);
                      setEditingPassword('');
                    } catch (error) { window.alert(error instanceof Error ? error.message : 'تعذر تغيير كلمة المرور.'); }
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-sm transition flex items-center justify-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>حفظ وتفعيل كلمة المرور فوراً</span>
                </button>
              </div>

              <p className="text-[11px] text-slate-500">
                🔒 كلمة المرور مشفرة ومحمية، وبمجرد الحفظ تصبح سارية فوراً ويتم إلغاء كلمة المرور القديمة.
              </p>
            </div>

            {/* Granular Permissions Section */}
            {selectedUser.role !== 'admin' ? (
              <div className="space-y-4">
                <div className="border-b border-slate-200 pb-2">
                  <h4 className="text-sm font-black text-slate-900">
                    جدول صلاحيات المستخدم (اضغط على أي صلاحية لتشغيلها أو إيقافها):
                  </h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Financial Group */}
                  <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2.5">
                    <div className="flex items-center gap-1.5 text-blue-900 font-bold text-xs pb-2 border-b border-slate-100">
                      <DollarSign className="w-4 h-4 text-blue-600" />
                      <span>الصلاحيات المالية والمحاسبية</span>
                    </div>

                    {[
                      { key: 'can_view_financials', label: 'رؤية فواتير الكاشير والمبالغ والمديونيات' },
                      { key: 'can_view_system_revenue', label: 'مشاهدة حساب أرباح وعمولات المنظومة' },
                      { key: 'can_manage_payments', label: 'تسجيل وتحصيل سندات القبض' },
                      { key: 'can_edit_commissions', label: 'تعديل أسعار وقيم العمولات' },
                    ].map((item) => {
                      const enabled = selectedUser.permissions[item.key as keyof RolePermissions];
                      return (
                        <label
                          key={item.key}
                          className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition select-none"
                        >
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={() => handleTogglePermission(selectedUser.id, item.key as keyof RolePermissions)}
                            className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                          />
                          <span className={`text-xs ${enabled ? 'font-bold text-slate-900' : 'text-slate-500'}`}>
                            {item.label}
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  {/* Movements Group */}
                  <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2.5">
                    <div className="flex items-center gap-1.5 text-slate-900 font-bold text-xs pb-2 border-b border-slate-100">
                      <Truck className="w-4 h-4 text-emerald-600" />
                      <span>صلاحيات الشاحنات والتشغيل</span>
                    </div>

                    {[
                      { key: 'can_add_movements', label: 'تسجيل حركة شاحنة جديدة يدوياً' },
                      { key: 'can_edit_movements', label: 'تعديل بيانات الحركات والشحنات' },
                      { key: 'can_delete_movements', label: 'حذف الحركات والشحنات' },
                      { key: 'can_upload_sheets', label: 'رفع واستيراد شيتات الشاحنات' },
                      { key: 'can_export_excel', label: 'تصدير كشوفات Excel بالاسطمبة' },
                    ].map((item) => {
                      const enabled = selectedUser.permissions[item.key as keyof RolePermissions];
                      return (
                        <label
                          key={item.key}
                          className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition select-none"
                        >
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={() => handleTogglePermission(selectedUser.id, item.key as keyof RolePermissions)}
                            className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                          />
                          <span className={`text-xs ${enabled ? 'font-bold text-slate-900' : 'text-slate-500'}`}>
                            {item.label}
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  {/* Master Data Group */}
                  <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2.5">
                    <div className="flex items-center gap-1.5 text-indigo-900 font-bold text-xs pb-2 border-b border-slate-100">
                      <Building2 className="w-4 h-4 text-indigo-600" />
                      <span>صلاحيات العملاء والأرصفة</span>
                    </div>

                    {[
                      { key: 'can_manage_customers', label: 'إضافة وتكويد عملاء وشركات جديدة' },
                      { key: 'can_delete_customers', label: 'حذف وتعديل بيانات العملاء' },
                      { key: 'can_manage_berths', label: 'إدارة وتسمية أرصفة الميناء' },
                    ].map((item) => {
                      const enabled = selectedUser.permissions[item.key as keyof RolePermissions];
                      return (
                        <label
                          key={item.key}
                          className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition select-none"
                        >
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={() => handleTogglePermission(selectedUser.id, item.key as keyof RolePermissions)}
                            className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                          />
                          <span className={`text-xs ${enabled ? 'font-bold text-slate-900' : 'text-slate-500'}`}>
                            {item.label}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center text-xs font-bold text-emerald-800">
                ✓ حساب المدير العام يمتلك بطبيعة دوره كافة الصلاحيات الإدارية والمالية والتشغيلية في المنظومة دائماً.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add New User Modal */}
      {isAddUserOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4 text-right">
            <h3 className="text-base font-bold text-slate-900 border-b pb-3">
              إضافة مستخدم جديد لمنظومة VIB
            </h3>

            <form onSubmit={handleAddNewUser} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  اسم الدخول (Username) بالإنجليزية *
                </label>
                <input
                  type="text"
                  placeholder="مثال: ahmed_acc"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  الاسم الكامل أو المسمى الوظيفي *
                </label>
                <input
                  type="text"
                  placeholder="مثال: أحمد محمود - محاسب الميناء"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">البريد الإلكتروني المستخدم للدخول *</label>
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  نوع الحساب والصلاحيات الافتراضية
                </label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold"
                >
                  <option value="accountant">محاسب (مالية ومستحقات وسندات قبض)</option>
                  <option value="data_entry">مدخل بيانات (تشغيل وحركات شاحنات فقط)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  كلمة مرور أولية (8 أحرف أو أكثر) *
                </label>
                <input
                  type="password"
                  placeholder="لن تُحفظ في بيانات العملاء"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsAddUserOpen(false)}
                  className="px-4 py-2 border rounded-lg text-xs"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg text-xs"
                >
                  حفظ وإضافة المستخدم
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isClearDialogOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
          <div role="dialog" aria-modal="true" aria-labelledby="clear-data-title" className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-rose-200 p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-700">
              <div className="bg-rose-100 p-2.5 rounded-xl"><Lock className="w-5 h-5" /></div>
              <div>
                <h3 id="clear-data-title" className="font-black text-slate-900">تأكيد مسح بيانات التشغيل</h3>
                <p className="text-xs text-slate-500 mt-1">أدخل كلمة مرور الأدمن نفسها المستخدمة لفتح لوحة التحكم.</p>
              </div>
            </div>
            <form onSubmit={handleConfirmClearData} className="space-y-3">
              <label htmlFor="clear-data-password" className="block text-xs font-bold text-slate-700">كلمة مرور الأدمن</label>
              <input
                id="clear-data-password"
                type="password"
                autoFocus
                autoComplete="current-password"
                value={clearPassword}
                onChange={(e) => { setClearPassword(e.target.value); setClearError(null); }}
                className="w-full text-center font-mono py-2.5 px-3 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-rose-500 focus:outline-none"
                required
              />
              {clearError && <p role="alert" className="text-xs font-bold text-rose-700">{clearError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" disabled={isClearingData} onClick={() => setIsClearDialogOpen(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 disabled:opacity-50">إلغاء</button>
                <button type="submit" disabled={isClearingData} className="bg-rose-700 hover:bg-rose-800 text-white px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-60 flex items-center gap-2">
                  <Trash2 className="w-4 h-4" /> {isClearingData ? 'جارٍ المسح...' : 'تحقق وامسح البيانات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isRestoreDialogOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" dir="rtl">
          <div role="dialog" aria-modal="true" aria-labelledby="restore-safety-title" className="w-full max-w-md space-y-4 rounded-2xl border border-emerald-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-emerald-700"><div className="rounded-xl bg-emerald-100 p-2.5"><RefreshCw className="h-5 w-5"/></div><div><h3 id="restore-safety-title" className="font-black text-slate-900">استعادة نسخة الأمان</h3><p className="mt-1 text-xs text-slate-500">اختر النسخة وأدخل كلمة مرور الأدمن.</p></div></div>
            <form onSubmit={handleConfirmRestore} className="space-y-3">
              <label className="block text-xs font-bold text-slate-700">النسخة المحفوظة</label>
              <select value={selectedBackupId} onChange={(e)=>setSelectedBackupId(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm" required>
                {safetyBackups.map((backup)=><option key={backup.id} value={backup.id}>{new Date(backup.created_at).toLocaleString('ar-EG')} — {backup.label} ({backup.movements.length} حركة)</option>)}
              </select>
              <label htmlFor="restore-safety-password" className="block text-xs font-bold text-slate-700">كلمة مرور الأدمن</label>
              <input id="restore-safety-password" type="password" autoFocus autoComplete="current-password" value={restorePassword} onChange={(e)=>{setRestorePassword(e.target.value);setRestoreError(null);}} className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-center font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500" required/>
              {restoreError && <p role="alert" className="text-xs font-bold text-rose-700">{restoreError}</p>}
              <div className="flex justify-end gap-2 pt-2"><button type="button" disabled={isRestoring} onClick={()=>setIsRestoreDialogOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">إلغاء</button><button type="submit" disabled={isRestoring || !safetyBackups.length} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"><RefreshCw className="h-4 w-4"/>{isRestoring?'جارٍ الاستعادة...':'تحقق واستعد النسخة'}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
