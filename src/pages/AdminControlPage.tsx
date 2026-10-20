import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ManagedUser, RolePermissions, SystemSettings } from '../types';
import { syncWithSupabase } from '../lib/storage';
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
  Database,
  RefreshCw,
  ExternalLink,
  Sliders,
  Settings,
  Users,
} from 'lucide-react';

interface AdminControlPageProps {
  settings: SystemSettings;
  onSaveSettings: (settings: SystemSettings) => void;
  movementCount: number;
  customerCount: number;
  berthCount: number;
  paymentCount: number;
  onRefreshDataFromCloud: () => Promise<void>;
}

export const AdminControlPage: React.FC<AdminControlPageProps> = ({
  settings,
  onSaveSettings,
  movementCount,
  customerCount,
  berthCount,
  paymentCount,
  onRefreshDataFromCloud,
}) => {
  const {
    users,
    currentUser,
    updateUserPermissions,
    updateUserStatus,
    updateUserPin,
    updateUserPassword,
    addNewUser,
    deleteUser,
  } = useAuth();

  // Admin PIN Unlock Gate
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  // New User Form State
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newUserRole, setNewUserRole] = useState<'accountant' | 'data_entry'>('accountant');
  const [newUserPassword, setNewUserPassword] = useState('123456');
  const [newUserPin, setNewUserPin] = useState('1111');

  // Password editing state for active selected user
  const [editingPassword, setEditingPassword] = useState('');
  const [isChangingPass, setIsChangingPass] = useState(false);

  // Supabase Sync state
  const [anonKeyInput, setAnonKeyInput] = useState(settings.supabase_anon_key || '');
  const [syncStatus, setSyncStatus] = useState<{ loading: boolean; message?: string; success?: boolean }>({
    loading: false,
  });

  // Permissions configuration state
  const [activeEditingUserId, setActiveEditingUserId] = useState<string>(users[1]?.id || 'u-accountant');

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === settings.admin_pin || pinInput === '1234') {
      setIsUnlocked(true);
      setPinError(false);
    } else {
      setPinError(true);
    }
  };

  const handleTogglePermission = (userId: string, key: keyof RolePermissions) => {
    const targetUser = users.find((u) => u.id === userId);
    if (!targetUser) return;

    const currentPerms = targetUser.permissions;
    const updatedPerms: RolePermissions = {
      ...currentPerms,
      [key]: !currentPerms[key],
    };

    updateUserPermissions(userId, updatedPerms);
  };

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newFullName.trim()) {
      alert('برجاء كتابة اسم المستخدم والاسم الكامل');
      return;
    }

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

    addNewUser({
      username: newUsername.trim(),
      password: newUserPassword.trim() || '123456',
      name: newFullName.trim(),
      role: newUserRole,
      pin_code: newUserPin || '1234',
      is_active: true,
      permissions: defaultPerms,
    });

    setNewUsername('');
    setNewFullName('');
    setIsAddUserOpen(false);
    alert('تم إضافة المستخدم الجديد بنجاح!');
  };

  const handleSaveSupabaseKey = async () => {
    const updatedSettings = {
      ...settings,
      supabase_anon_key: anonKeyInput.trim(),
    };
    onSaveSettings(updatedSettings);

    setSyncStatus({ loading: true });
    const res = await syncWithSupabase();
    setSyncStatus({ loading: false, message: res.message, success: res.success });
    if (res.success) {
      await onRefreshDataFromCloud();
    }
  };

  const selectedUser = users.find((u) => u.id === activeEditingUserId) || users[1];

  // If locked, show security PIN gate
  if (!isUnlocked && currentUser.role !== 'admin') {
    return (
      <div className="max-w-md mx-auto my-12 bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center space-y-5">
        <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
          <Lock className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-xl font-black text-slate-900">لوحة تحكم الإدارة العامة (محمية)</h2>
          <p className="text-xs text-slate-500 mt-1">
            هذه اللوحة خاصة بالأدمن الرئيسي للتحكم بالصلاحيات وقاعدة البيانات والمستخدمين
          </p>
        </div>

        <form onSubmit={handleUnlock} className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              أدخل رمز المرور السري للأدمن (PIN)
            </label>
            <input
              type="password"
              placeholder="الرمز الافتراضي: 1234"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              className="w-full text-center tracking-widest text-lg font-mono py-2.5 px-3 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-600"
              autoFocus
            />
            {pinError && (
              <span className="text-xs text-rose-600 font-bold block mt-1">
                رمز المرور غير صحيح! الرمز الافتراضي هو 1234
              </span>
            )}
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-sm transition shadow-md"
          >
            فتح لوحة التحكم
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
                <h1 className="text-xl font-black">لوحة تحكم الأدمن المستقلة وإدارة الصلاحيات</h1>
                <span className="bg-emerald-500/20 text-emerald-300 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                  تحكم كامل وشامل
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                التحكم بكل مستخدم، تعيين الصلاحيات المسموحة والمحظورة، وربط المزامنة السحابية الفورية
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onRefreshDataFromCloud()}
              className="bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1.5 transition border border-white/20"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>تحديث البيانات من السحابة</span>
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 1: CLOUD DATABASE SYNC CENTER */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
        <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-emerald-100 text-emerald-700 p-2 rounded-lg">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                مركز ربط ومزامنة قاعدة البيانات السحابية (Supabase)
              </h2>
              <p className="text-xs text-slate-500">
                حفظ البيانات أونلاين لمشاهدة نفس البيانات المحدثة من أي متصفح أو جهاز آخر
              </p>
            </div>
          </div>

          <a
            href="https://supabase.com/dashboard/project/jfhmarmaebrzdnsvkqzv/settings/api"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-900 font-bold bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 transition"
          >
            <span>فتح صفحة API Keys في Supabase</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              عنوان الخادم السحابي (Supabase URL)
            </label>
            <input
              type="text"
              readOnly
              value={settings.supabase_url}
              className="w-full bg-slate-100 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-700"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              مفتاح الوصول العام (Anon Public Key) *
            </label>
            <input
              type="text"
              placeholder="ألصق المفتاح هنا ليعمل التخزين للجميع فوراً..."
              value={anonKeyInput}
              onChange={(e) => setAnonKeyInput(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-bold"
            />
          </div>

          <div>
            <button
              onClick={handleSaveSupabaseKey}
              disabled={syncStatus.loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncStatus.loading ? 'animate-spin' : ''}`} />
              <span>حفظ المفتاح وتفعيل المزامنة السحابية</span>
            </button>
          </div>
        </div>

        {syncStatus.message && (
          <div
            className={`p-3 rounded-lg text-xs font-semibold flex items-center gap-2 ${
              syncStatus.success
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            <span>{syncStatus.message}</span>
          </div>
        )}

        {/* Database Status Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="bg-slate-50 p-3 rounded-xl border text-center">
            <span className="text-[10px] text-slate-500 block">حركات الشاحنات</span>
            <span className="text-base font-bold text-slate-900">{movementCount} حركة</span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border text-center">
            <span className="text-[10px] text-slate-500 block">العملاء المكودين</span>
            <span className="text-base font-bold text-slate-900">{customerCount} عميل</span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border text-center">
            <span className="text-[10px] text-slate-500 block">أرصفة الميناء</span>
            <span className="text-base font-bold text-slate-900">{berthCount} رصيف</span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border text-center">
            <span className="text-[10px] text-slate-500 block">سندات القبض المسجلة</span>
            <span className="text-base font-bold text-slate-900">{paymentCount} سند</span>
          </div>
        </div>
      </div>

      {/* SECTION 2: USERS & GRANULAR PERMISSIONS MATRIX */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="bg-blue-100 text-blue-700 p-2 rounded-lg">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                إدارة المستخدمين والتحكم بصلاحيات كل مستخدم بدقة
              </h2>
              <p className="text-xs text-slate-500">
                يمكن للأدمن تفعيل أو إلغاء أي صلاحية لكل مستخدم على حدة
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
                  className={`text-[10px] px-2 py-0.5 rounded-full ${
                    isSelected ? 'bg-blue-800 text-blue-200' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {u.role === 'admin' ? 'أدمن' : u.role === 'accountant' ? 'حسابات' : 'مدخل بيانات'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Selected User Permission Editor */}
        {selectedUser && (
          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">
                    تعديل صلاحيات: {selectedUser.name} ({selectedUser.username})
                  </h3>
                  {selectedUser.role === 'admin' && (
                    <span className="text-[11px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                      الأدمن الأساسي يمتلك جميع الصلاحيات دائماً
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 mt-1">
                  <span>اسم المستخدم: <strong className="font-mono text-blue-900">{selectedUser.username}</strong></span>
                  <span>|</span>
                  <span>كلمة المرور الحالية: <strong className="font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">{selectedUser.password || selectedUser.pin_code}</strong></span>
                  <span>|</span>
                  <span>رمز PIN: <strong className="font-mono text-slate-700">{selectedUser.pin_code}</strong></span>
                </div>

                {/* Change Password Inline */}
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-200/60">
                  <span className="text-[11px] font-semibold text-slate-500">تغيير كلمة المرور:</span>
                  <input
                    type="text"
                    placeholder="كلمة مرور جديدة..."
                    value={editingPassword}
                    onChange={(e) => setEditingPassword(e.target.value)}
                    className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-mono w-40"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!editingPassword.trim()) {
                        alert('يرجى كتابة كلمة مرور جديدة');
                        return;
                      }
                      updateUserPassword(selectedUser.id, editingPassword.trim());
                      alert(`تم بنجاح تغيير كلمة المرور للمستخدم (${selectedUser.name}) إلى: ${editingPassword.trim()}`);
                      setEditingPassword('');
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold px-3 py-1 rounded-lg transition"
                  >
                    حفظ الكلمة الجديدة
                  </button>
                </div>
              </div>

              {selectedUser.role !== 'admin' && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateUserStatus(selectedUser.id, !selectedUser.is_active)}
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
                    onClick={() => deleteUser(selectedUser.id)}
                    className="p-1.5 text-rose-600 hover:bg-rose-100 rounded-lg transition"
                    title="حذف المستخدم"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Permissions Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {[
                {
                  key: 'can_view_financials',
                  label: 'رؤية الحسابات وفواتير الكاشير',
                  desc: 'رؤية مبالغ فواتير الكاشير، الإجمالي، والمجاميع الفرعية',
                },
                {
                  key: 'can_view_system_revenue',
                  label: 'رؤية إيرادات عمولات المنظومة',
                  desc: 'رؤية أرباح وعمولات المنظومة الصافية لصاحب السيستم',
                },
                {
                  key: 'can_add_movements',
                  label: 'تسجيل حركات شاحنات جديدة',
                  desc: 'إمكانية إدخال سيارات وشاحنات جديدة بالاسطمبة',
                },
                {
                  key: 'can_edit_movements',
                  label: 'تعديل حركات الشاحنات المسجلة',
                  desc: 'إمكانية تعديل بيانات أي حركة أو حاوية سابقة',
                },
                {
                  key: 'can_delete_movements',
                  label: 'حذف حركات الشاحنات',
                  desc: 'إمكانية حذف صفوف الحركات من الجدول',
                },
                {
                  key: 'can_upload_sheets',
                  label: 'رفع وتصفية شيتات إكسيل',
                  desc: 'استيراد الشيتات الذكي وتفريغها بالاسطمبة',
                },
                {
                  key: 'can_export_excel',
                  label: 'تصدير الكشوفات وطباعتها',
                  desc: 'تصدير شيت الاسطمبة الرسمي وطباعة التقارير',
                },
                {
                  key: 'can_manage_customers',
                  label: 'تكويد وتعديل العملاء وأسطولهم',
                  desc: 'إضافة عملاء جدد وتعديل سياراتهم وسائقيهم',
                },
                {
                  key: 'can_delete_customers',
                  label: 'حذف العملاء من المنظومة',
                  desc: 'صلاحية حذف حساب العميل وسجلاته',
                },
                {
                  key: 'can_manage_payments',
                  label: 'تسجيل سندات القبض والتحصيل',
                  desc: 'تسوية المبالغ وخصم السيارات من الحساب',
                },
                {
                  key: 'can_manage_berths',
                  label: 'إدارة وتزويد أرصفة الميناء',
                  desc: 'إضافة رصيف جديد أو تعديل الأرصفة القائمة',
                },
                {
                  key: 'can_edit_commissions',
                  label: 'تعديل عمولات المنظومة ونافذ',
                  desc: 'تغيير عمولة الـ 200 جنيه أو عمولة نافذ الافتراضية',
                },
              ].map((perm) => {
                const isChecked =
                  selectedUser.role === 'admin'
                    ? true
                    : !!selectedUser.permissions[perm.key as keyof RolePermissions];

                return (
                  <label
                    key={perm.key}
                    className={`p-3.5 rounded-xl border transition flex items-start gap-3 cursor-pointer ${
                      isChecked
                        ? 'bg-white border-blue-300 shadow-sm'
                        : 'bg-slate-100 border-slate-200 opacity-60'
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={selectedUser.role === 'admin'}
                      checked={isChecked}
                      onChange={() =>
                        handleTogglePermission(
                          selectedUser.id,
                          perm.key as keyof RolePermissions
                        )
                      }
                      className="mt-1 rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">
                        {perm.label}
                      </span>
                      <span className="text-[11px] text-slate-500 block mt-0.5">
                        {perm.desc}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Modal: Add New User */}
      {isAddUserOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">إضافة مستخدم جديد للنظام</h3>
            <form onSubmit={handleCreateUser} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  اسم المستخدم (Username) *
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
                  placeholder="مثال: أحمد محمود - محاسب فرع الميناء"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  نوع الحساب الافتراضي
                </label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold"
                >
                  <option value="accountant">حسابات (مالية ومستحقات)</option>
                  <option value="data_entry">مدخل بيانات (تشغيل وحركات فقط)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  كلمة المرور (Password) *
                </label>
                <input
                  type="text"
                  placeholder="كلمة مرور الدخول"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-bold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  رمز المرور السريع للدخول (PIN)
                </label>
                <input
                  type="text"
                  placeholder="4 أرقام"
                  value={newUserPin}
                  onChange={(e) => setNewUserPin(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-center font-bold"
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
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold"
                >
                  إضافة وتحديد الصلاحيات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
