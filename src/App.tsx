import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import {
  Berth,
  Customer,
  Movement,
  PaymentReceipt,
  SystemSettings,
} from './types';
import {
  getStoredBerths,
  getStoredCustomers,
  getStoredMovements,
  getStoredPayments,
  getStoredSettings,
  getSafetyBackups,
  saveSafetyBackup,
  restoreSafetyBackupToSupabase,
  OperationalSafetyBackup,
  saveBerths,
  saveCustomers,
  saveMovements,
  savePayments,
  saveSettings,
  fetchAllFromSupabase,
  syncMovementToSupabase,
  syncCustomerToSupabase,
  syncImportedBatchToSupabase,
  syncBerthToSupabase,
  syncPaymentToSupabase,
  restoreLocalDataToSupabase,
  getPendingSyncForTable,
  flushPendingSync,
  clearOperationalLocalData,
  clearOperationalDataFromSupabase,
  getLocalDataResetAt,
  deleteMovementFromSupabase,
  clearAllMovementsFromSupabase,
  deleteCustomerFromSupabase,
  deleteBerthFromSupabase,
} from './lib/storage';
import { getSupabaseClient } from './lib/supabase';
import { exportTemplateToExcel } from './lib/excelUtils';
import { Navbar } from './components/Navbar';
import { NavigationTabs, TabType } from './components/NavigationTabs';
import { MovementsPage } from './pages/MovementsPage';
import { CustomersPage } from './pages/CustomersPage';
import { AccountsPage } from './pages/AccountsPage';
import { ReportsPage } from './pages/ReportsPage';
import { BerthsPage } from './pages/BerthsPage';
import { SettingsPage } from './pages/SettingsPage';
import { AdminControlPage } from './pages/AdminControlPage';
import { LoginPage } from './components/LoginPage';
import { MovementModal } from './components/MovementModal';
import { CustomerModal } from './components/CustomerModal';
import { BerthModal } from './components/BerthModal';
import { PaymentModal } from './components/PaymentModal';
import { applyUnallocatedCustomerAdvances } from './lib/paymentUtils';
import { ConfirmActionProvider, useConfirmAction } from './contexts/ConfirmActionContext';

const getLocalOnlyRows = <T extends { id: string },>(cloudRows: T[], localRows: T[]) => {
  const cloudIds = new Set(cloudRows.map((row) => row.id));
  return localRows.filter((row) => !cloudIds.has(row.id));
};

const APP_TABS: TabType[] = ['movements', 'customers', 'accounts', 'reports', 'berths', 'settings', 'admin_control'];
const ACTIVE_TAB_KEY = 'pls_active_tab';

const getStoredActiveTab = (): TabType => {
  try {
    const savedTab = localStorage.getItem(ACTIVE_TAB_KEY) as TabType | null;
    return savedTab && APP_TABS.includes(savedTab) ? savedTab : 'movements';
  } catch {
    return 'movements';
  }
};

const AppContent: React.FC = () => {
  const confirmAction = useConfirmAction();
  const {
    isAuthenticated,
    canViewFinancials,
    canAddMovements,
    canEditMovements,
    canDeleteMovements,
    canManageCustomers,
    canDeleteCustomers,
    canManageBerths,
    canManagePayments,
    isAdmin,
  } = useAuth();

  // State
  const [activeTab, setActiveTab] = useState<TabType>(getStoredActiveTab);
  const [movements, setMovements] = useState<Movement[]>(getStoredMovements);
  const [customers, setCustomers] = useState<Customer[]>(getStoredCustomers);
  const [berths, setBerths] = useState<Berth[]>(getStoredBerths);
  const [payments, setPayments] = useState<PaymentReceipt[]>(getStoredPayments);
  const [safetyBackups, setSafetyBackups] = useState<OperationalSafetyBackup[]>(getSafetyBackups);
  const [settings, setSettings] = useState<SystemSettings>(getStoredSettings);
  const [cloudFeedback, setCloudFeedback] = useState<string | null>(null);

  const runCloudOperation = async (operation: Promise<unknown>) => {
    try {
      await operation;
      setCloudFeedback('تم حفظ التغيير في قاعدة البيانات السحابية.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'تعذر حفظ التغيير في قاعدة البيانات السحابية.';
      setCloudFeedback(message);
    }
  };

  const captureSafetyBackup = (label: string) => {
    const backup = saveSafetyBackup({ label, movements, customers, berths, payments });
    setSafetyBackups(getSafetyBackups());
    return backup;
  };

  // Initial cloud fetch from Supabase on mount
  const refreshDataFromCloud = async (restoreDeviceOnlyData = false, quiet = false) => {
    try {
      const cloudData = await fetchAllFromSupabase();
      if (cloudData) {
        const resetDetected = Boolean(cloudData.dataResetAt && cloudData.dataResetAt !== getLocalDataResetAt());
        if (resetDetected && cloudData.dataResetAt) {
          clearOperationalLocalData(cloudData.dataResetAt);
        }
        const localMovements = resetDetected ? [] : getStoredMovements();
        const localCustomers = resetDetected ? [] : getStoredCustomers();
        const localBerths = getStoredBerths();
        const localPayments = resetDetected ? [] : getStoredPayments();
        const pendingMovements = resetDetected ? { upserts: [], deletes: [] } : getPendingSyncForTable<Movement>('movements');
        const pendingCustomers = resetDetected ? { upserts: [], deletes: [] } : getPendingSyncForTable<Customer>('customers');
        const pendingBerths = getPendingSyncForTable<Berth>('berths');
        const pendingPayments = resetDetected ? { upserts: [], deletes: [] } : getPendingSyncForTable<PaymentReceipt>('payments');
        const mergePending = <T extends { id: string }>(cloud: T[], local: T[], pending: { upserts: T[]; deletes: string[] }) => {
          const merged = new Map(cloud.map((row) => [row.id, row]));
          if (restoreDeviceOnlyData) {
            for (const row of local) if (!merged.has(row.id)) merged.set(row.id, row);
          }
          for (const id of pending.deletes) merged.delete(id);
          for (const row of pending.upserts) merged.set(row.id, row);
          return Array.from(merged.values());
        };
        const reconciledCashierMovementIds = new Set<string>();
        const mergedMovements = mergePending(cloudData.movements, localMovements, pendingMovements).map((movement) => {
          if (!movement.cashier_receipt_no) return movement;
          const cashierInvoice = Number(movement.cashier_invoice) || 0;
          const customerPaid = movement.customer_paid_amount !== undefined
            ? Number(movement.customer_paid_amount) || 0
            : Math.max(0, (Number(movement.paid_amount) || 0) - cashierInvoice);
          const total = Number(movement.total_amount) || 0;
          const paid = customerPaid;
          const remaining = Math.max(0, total - paid);
          if (movement.customer_paid_amount === customerPaid && Number(movement.paid_amount) === paid && Number(movement.remaining_amount) === remaining) return movement;
          reconciledCashierMovementIds.add(movement.id);
          return {
            ...movement,
            customer_paid_amount: customerPaid,
            paid_amount: paid,
            remaining_amount: remaining,
            payment_status: (remaining === 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid') as Movement['payment_status'],
          };
        });
        const customersToUse = mergePending(cloudData.customers, localCustomers, pendingCustomers);
        const berthsToUse = mergePending(cloudData.berths, localBerths, pendingBerths);
        const paymentsToUse = mergePending(cloudData.payments, localPayments, pendingPayments);
        const allocation = applyUnallocatedCustomerAdvances(mergedMovements, paymentsToUse);
        const movementsToUse = allocation.movements;
        const paymentsFinal = allocation.payments;
        allocation.changedMovementIds.forEach((id) => reconciledCashierMovementIds.add(id));

        setMovements(movementsToUse);
        saveMovements(movementsToUse);
        setCustomers(customersToUse);
        saveCustomers(customersToUse);
        setBerths(berthsToUse);
        saveBerths(berthsToUse);
        setPayments(paymentsFinal);
        savePayments(paymentsFinal);

        // Retry queued edits/deletes before reporting sync complete.
        await flushPendingSync();

        const movementsToRestore = restoreDeviceOnlyData ? getLocalOnlyRows(cloudData.movements, localMovements) : [];
        const customersToRestore = restoreDeviceOnlyData ? getLocalOnlyRows(cloudData.customers, localCustomers) : [];
        const berthsToRestore = restoreDeviceOnlyData ? getLocalOnlyRows(cloudData.berths, localBerths) : [];
        const paymentsToRestore = restoreDeviceOnlyData ? getLocalOnlyRows(cloudData.payments, localPayments) : [];
        const restoredCount = movementsToRestore.length + customersToRestore.length + berthsToRestore.length + paymentsToRestore.length;
        const shouldRestoreLocalData = restoredCount > 0;
        if (shouldRestoreLocalData) {
          await restoreLocalDataToSupabase({
            movements: movementsToRestore,
            customers: customersToRestore,
            berths: berthsToRestore,
            payments: paymentsToRestore,
          });
        }
        const reconciledMovements = movementsToUse.filter((movement) => reconciledCashierMovementIds.has(movement.id));
        if (reconciledMovements.length > 0) {
          await Promise.all(reconciledMovements.map((movement) => syncMovementToSupabase(movement)));
        }
        const allocatedPayments = paymentsFinal.filter((payment) => allocation.changedPaymentIds.includes(payment.id));
        if (allocatedPayments.length > 0) {
          await Promise.all(allocatedPayments.map((payment) => syncPaymentToSupabase(payment)));
        }
        if (!quiet || resetDetected || restoredCount > 0) {
          setCloudFeedback(resetDetected
            ? 'تم مسح البيانات المحلية القديمة بعد تجهيز النظام للتسليم.'
            : restoredCount > 0
            ? 'استعدنا البيانات المحفوظة على هذا الجهاز وأعدنا مزامنتها مع السحابة.'
            : 'تم تحميل البيانات من قاعدة البيانات السحابية بنجاح.');
        }
      }
    } catch (e) {
      console.warn('Cloud sync error:', e);
      const message = e instanceof Error ? e.message : 'تعذر الاتصال بقاعدة البيانات السحابية.';
      setCloudFeedback(`${message} احتفظنا بالبيانات المحلية كما هي.`);
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_TAB_KEY, activeTab);
    } catch (error) {
      console.warn('Could not remember the current page:', error);
    }
  }, [activeTab]);

  useEffect(() => {
    void refreshDataFromCloud(true);

    const storedSettings = getStoredSettings();
    const supabase = getSupabaseClient(storedSettings.supabase_url, storedSettings.supabase_anon_key);
    let debounceTimer: number | undefined;
    const requestRefresh = () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => void refreshDataFromCloud(false, true), 800);
    };
    let channel = supabase?.channel(`pls-live-sync-${Math.random().toString(36).slice(2)}`);
    if (channel) {
      for (const table of ['movements', 'customers', 'payments', 'berths']) {
        channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, requestRefresh);
      }
      channel.subscribe();
    }

    // Realtime is supplemented by a quiet refresh for devices where database
    // change feeds are unavailable, and whenever the app returns to the screen.
    const pollId = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshDataFromCloud(false, true);
    }, 30_000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refreshDataFromCloud(false, true);
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(pollId);
      if (debounceTimer) window.clearTimeout(debounceTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (channel) void supabase?.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!cloudFeedback) return;
    const isError = cloudFeedback.includes('تعذر') || cloudFeedback.includes('فشل');
    if (isError) return;

    const timeoutId = window.setTimeout(() => setCloudFeedback(null), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [cloudFeedback]);

  // Security guard: If non-admin user lands on admin_control, redirect to movements
  useEffect(() => {
    if (activeTab === 'admin_control' && !isAdmin) {
      setActiveTab('movements');
    }
  }, [activeTab, isAdmin]);

  // Modals state
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [editingMovement, setEditingMovement] = useState<Movement | null>(null);


  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const [isBerthModalOpen, setIsBerthModalOpen] = useState(false);
  const [editingBerth, setEditingBerth] = useState<Berth | null>(null);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentCustomerId, setPaymentCustomerId] = useState<string | undefined>(undefined);

  // Auto-switch away from restricted tabs
  useEffect(() => {
    if (!canViewFinancials && (activeTab === 'accounts' || activeTab === 'reports')) {
      setActiveTab('movements');
    }
  }, [canViewFinancials, activeTab]);

  // Max seq calculation
  const currentMaxSeq = movements.reduce((max, m) => Math.max(max, m.seq || 0), 0);

  // Movement Handlers
  const handleSaveMovement = (movementData: Partial<Movement>) => {
    if (editingMovement) {
      if (!canEditMovements) {
        alert('ليس لديك صلاحية لتعديل الحركات المسجلة');
        return;
      }
      const updatedMovement = { ...editingMovement, ...movementData } as Movement;
      const updated = movements.map((m) =>
        m.id === editingMovement.id ? updatedMovement : m
      );
      const allocation = applyUnallocatedCustomerAdvances(updated, payments);
      setMovements(allocation.movements);
      saveMovements(allocation.movements);
      setPayments(allocation.payments);
      savePayments(allocation.payments);
      void runCloudOperation(Promise.all([
        ...allocation.movements.filter((m) => m.id === updatedMovement.id || allocation.changedMovementIds.includes(m.id)).map((m) => syncMovementToSupabase(m)),
        ...allocation.payments.filter((p) => allocation.changedPaymentIds.includes(p.id)).map((p) => syncPaymentToSupabase(p)),
      ]));
    } else {
      if (!canAddMovements) {
        alert('ليس لديك صلاحية لتسجيل حركات جديدة');
        return;
      }
      const newMovement: Movement = {
        ...movementData,
        id: `m-${Date.now()}`,
        seq: movementData.seq || currentMaxSeq + 1,
        created_at: new Date().toISOString(),
      } as Movement;
      const updated = [newMovement, ...movements];
      setMovements(updated);
      saveMovements(updated);
      void runCloudOperation(syncMovementToSupabase(newMovement));
    }
    setEditingMovement(null);
  };

  const handleDeleteMovement = async (id: string) => {
    if (!canDeleteMovements) {
      alert('ليس لديك صلاحية لحذف الحركات');
      return;
    }
    if (await confirmAction('هل تريد حذف هذه الحركة من النظام وقاعدة البيانات؟', 'نعم، احذف')) {
      captureSafetyBackup('قبل حذف حركة');
      const updated = movements.filter((m) => m.id !== id);
      setMovements(updated);
      saveMovements(updated);
      void runCloudOperation(deleteMovementFromSupabase(id));
    }
  };

  const handleClearAllMovements = async () => {
    if (!isAdmin) {
      alert('هذه العملية تتطلب صلاحيات المدير العام.');
      return;
    }
    if (await confirmAction('تحذير: سيتم حذف كل الحركات والشحنات من النظام وقاعدة البيانات. هل تريد المتابعة؟', 'نعم، امسح الكل')) {
      captureSafetyBackup('قبل مسح كل الحركات');
      setMovements([]);
      saveMovements([]);
      try {
        await clearAllMovementsFromSupabase();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'تعذر مسح الحركات من قاعدة البيانات السحابية.';
        setCloudFeedback(message);
        alert(`تم مسح الحركات محلياً، لكن تعذر مسحها من قاعدة البيانات: ${message}`);
        return;
      }
      alert('✓ تم مسح وتصفير كافة الشحنات بنجاح. النظام الآن فارغ ونظيف وجاهز للتسليم للعميل.');
    }
  };

  const handleClearOperationalData = async () => {
    if (!isAdmin) throw new Error('هذه العملية متاحة للمدير العام فقط.');
    captureSafetyBackup('قبل مسح بيانات التشغيل');
    const resetAt = await clearOperationalDataFromSupabase();
    clearOperationalLocalData(resetAt);
    setMovements([]);
    setCustomers([]);
    setPayments([]);
    setCloudFeedback('تم مسح بيانات التشغيل ومزامنة التصفير مع الأجهزة المرتبطة.');
  };

  const handleRestoreSafetyBackup = async (backup: OperationalSafetyBackup) => {
    if (!isAdmin) throw new Error('استعادة البيانات متاحة للمدير العام فقط.');
    await restoreSafetyBackupToSupabase(backup);
    setMovements(backup.movements);
    setCustomers(backup.customers);
    setBerths(backup.berths);
    setPayments(backup.payments);
    setCloudFeedback(`تمت استعادة النسخة المحفوظة: ${backup.label}`);
  };

  const handleUndoLatestDeletion = async () => {
    const latestBackup = getSafetyBackups()[0];
    if (!latestBackup) throw new Error('لا توجد نسخة أمان سابقة على هذا الجهاز.');
    await restoreSafetyBackupToSupabase(latestBackup);
    setMovements(latestBackup.movements);
    setCustomers(latestBackup.customers);
    setBerths(latestBackup.berths);
    setPayments(latestBackup.payments);
    setCloudFeedback(`تم التراجع واستعادة البيانات السابقة: ${latestBackup.label}`);
  };

  useEffect(() => {
    const handleUndoShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z' || event.repeat) return;
      const target = event.target as HTMLElement | null;
      const editingText = target?.matches('input, textarea, [contenteditable="true"]');
      // Leave Ctrl+Z to the browser while the user is editing a field.
      if (editingText) return;
      if (!getSafetyBackups().length) return;
      event.preventDefault();
      void confirmAction('سيتم استعادة البيانات كما كانت قبل آخر حذف. هل تريد التراجع؟', 'نعم، تراجع').then((confirmed) => {
        if (confirmed) return handleUndoLatestDeletion();
      }).catch((error) => window.alert(error instanceof Error ? error.message : 'تعذر التراجع عن آخر حذف.'));
    };
    window.addEventListener('keydown', handleUndoShortcut);
    return () => window.removeEventListener('keydown', handleUndoShortcut);
  }, [safetyBackups, confirmAction]);

  const handleImportMovements = (importedMovements: Movement[], newCustomers?: Customer[]) => {
    const batchAt = new Date().toISOString();
    const batchName = importedMovements[0]?.notes?.match(/(?:شيت|ملف):\s*(.+)$/)?.[1]?.trim()
      || `دفعة ${new Date(batchAt).toLocaleString('ar-EG')}`;
    const batchId = `batch-${Date.now()}-${crypto.randomUUID()}`;
    const importedBatch = importedMovements.map((movement) => ({
      ...movement,
      import_batch_id: batchId,
      import_batch_name: batchName,
      import_batch_at: batchAt,
    }));
    const updatedMovements = [...importedBatch, ...movements];
    setMovements(updatedMovements);
    saveMovements(updatedMovements);
    let filteredNew: Customer[] = [];
    let customersAfterImport = customers;
    if (newCustomers && newCustomers.length > 0) {
      // Merge unique customers by name
      const existingIds = new Set(customers.map((c) => c.id));
      filteredNew = newCustomers.filter((c) => !existingIds.has(c.id));
      if (filteredNew.length > 0) {
        customersAfterImport = [...filteredNew, ...customers];
        setCustomers(customersAfterImport);
        saveCustomers(customersAfterImport);
      }
    }
    void runCloudOperation((async () => {
      // Customer rows are referenced by movements, so sync them first to avoid
      // foreign-key failures that would otherwise leave one device out of date.
      const referencedCustomerIds = new Set(importedBatch.map((movement) => movement.customer_id).filter(Boolean));
      const referencedCustomers = customersAfterImport.filter((customer) => referencedCustomerIds.has(customer.id));
      await syncImportedBatchToSupabase(referencedCustomers, importedBatch);
    })());
  };

  const handleBatchUpdateMovements = (updatedMovements: Movement[]) => {
    const allocation = applyUnallocatedCustomerAdvances(updatedMovements, payments);
    setMovements(allocation.movements);
    saveMovements(allocation.movements);
    setPayments(allocation.payments);
    savePayments(allocation.payments);
    void runCloudOperation(Promise.all([
      ...allocation.movements.map((m) => syncMovementToSupabase(m)),
      ...allocation.payments.filter((p) => allocation.changedPaymentIds.includes(p.id)).map((p) => syncPaymentToSupabase(p)),
    ]));
  };

  // Customer Handlers
  const handleSaveCustomer = (customerData: Customer) => {
    if (!canManageCustomers) {
      alert('ليس لديك صلاحية لإدارة وتكويد العملاء');
      return;
    }
    if (editingCustomer) {
      const updated = customers.map((c) =>
        c.id === editingCustomer.id ? customerData : c
      );
      setCustomers(updated);
      saveCustomers(updated);
      void runCloudOperation(syncCustomerToSupabase(customerData));
    } else {
      const updated = [customerData, ...customers];
      setCustomers(updated);
      saveCustomers(updated);
      void runCloudOperation(syncCustomerToSupabase(customerData));
    }
    setEditingCustomer(null);
  };

  const handleDeleteCustomer = async (id: string) => {
    if (!canDeleteCustomers) {
      alert('ليس لديك صلاحية لحذف العملاء');
      return;
    }
    if (await confirmAction('هل تريد حذف هذا العميل من المنظومة؟', 'نعم، احذف العميل')) {
      captureSafetyBackup('قبل حذف عميل');
      const updated = customers.filter((c) => c.id !== id);
      setCustomers(updated);
      saveCustomers(updated);
      void runCloudOperation(deleteCustomerFromSupabase(id));
    }
  };

  // Berth Handlers
  const handleSaveBerth = (berthData: Berth) => {
    if (!canManageBerths) {
      alert('ليس لديك صلاحية لإدارة أرصفة الميناء');
      return;
    }
    if (editingBerth) {
      const updated = berths.map((b) =>
        b.id === editingBerth.id ? berthData : b
      );
      setBerths(updated);
      saveBerths(updated);
      void runCloudOperation(syncBerthToSupabase(berthData));
    } else {
      const updated = [...berths, berthData];
      setBerths(updated);
      saveBerths(updated);
      void runCloudOperation(syncBerthToSupabase(berthData));
    }
    setEditingBerth(null);
  };

  const handleDeleteBerth = async (id: string) => {
    if (!canManageBerths) {
      alert('ليس لديك صلاحية لحذف الأرصفة');
      return;
    }
    if (await confirmAction('هل تريد حذف هذا الرصيف؟', 'نعم، احذف الرصيف')) {
      captureSafetyBackup('قبل حذف رصيف');
      const updated = berths.filter((b) => b.id !== id);
      setBerths(updated);
      saveBerths(updated);
      void runCloudOperation(deleteBerthFromSupabase(id));
    }
  };

  // Payment Handlers
  const handleSavePayment = (payment: PaymentReceipt, updatedMovements: Movement[]) => {
    if (!canManagePayments) {
      alert('ليس لديك صلاحية لتسجيل سندات القبض');
      return;
    }
    setPayments([payment, ...payments]);
    savePayments([payment, ...payments]);
    setMovements(updatedMovements);
    saveMovements(updatedMovements);
    void runCloudOperation(Promise.all([
      syncPaymentToSupabase(payment),
      ...updatedMovements.filter((m) => m !== movements.find((old) => old.id === m.id)).map((m) => syncMovementToSupabase(m)),
    ]));
  };

  // Settings Handlers
  const handleSaveSettings = (newSettings: SystemSettings) => {
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Navbar */}
      <Navbar
        onOpenQuickAdd={() => {
          setEditingMovement(null);
          setIsMovementModalOpen(true);
        }}
        onExportTemplate={() => exportTemplateToExcel(movements)}
      />

      {/* Navigation Tabs */}
      <NavigationTabs
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        movementCount={movements.length}
      />
      {cloudFeedback && (
        <div className={`px-4 py-2 text-center text-xs font-semibold ${cloudFeedback.includes('تعذر') || cloudFeedback.includes('فشل') ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`} role="status">
          {cloudFeedback}
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full min-w-0 mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        {activeTab === 'movements' && (
          <MovementsPage
            movements={movements}
            customers={customers}
            berths={berths}
            settings={settings}
            currentMaxSeq={currentMaxSeq}
            onImportMovements={handleImportMovements}
            onEditMovement={(m) => {
              setEditingMovement(m);
              setIsMovementModalOpen(true);
            }}
            onDeleteMovement={handleDeleteMovement}
            onClearAllMovements={handleClearAllMovements}
            onUndoLatestDeletion={handleUndoLatestDeletion}
            canUndoLatestDeletion={safetyBackups.length > 0}
            onOpenPaymentModal={(cId) => {
              setPaymentCustomerId(cId);
              setIsPaymentModalOpen(true);
            }}
            onBatchUpdateMovements={handleBatchUpdateMovements}
          />
        )}

        {activeTab === 'customers' && (
          <CustomersPage
            customers={customers}
            movements={movements}
            onOpenAddModal={() => {
              setEditingCustomer(null);
              setIsCustomerModalOpen(true);
            }}
            onEditCustomer={(c) => {
              setEditingCustomer(c);
              setIsCustomerModalOpen(true);
            }}
            onDeleteCustomer={handleDeleteCustomer}
            onOpenPaymentModal={(cId) => {
              setPaymentCustomerId(cId);
              setIsPaymentModalOpen(true);
            }}
          />
        )}

        {activeTab === 'accounts' && canViewFinancials && (
          <AccountsPage
            movements={movements}
            customers={customers}
            payments={payments}
            onOpenPaymentModal={(cId) => {
              setPaymentCustomerId(cId);
              setIsPaymentModalOpen(true);
            }}
            onBatchUpdateMovements={handleBatchUpdateMovements}
          />
        )}

        {activeTab === 'reports' && canViewFinancials && (
          <ReportsPage
            customers={customers}
            movements={movements}
            berths={berths}
          />
        )}

        {activeTab === 'berths' && (
          <BerthsPage
            berths={berths}
            movements={movements}
            onOpenAddModal={() => {
              setEditingBerth(null);
              setIsBerthModalOpen(true);
            }}
            onEditBerth={(b) => {
              setEditingBerth(b);
              setIsBerthModalOpen(true);
            }}
            onDeleteBerth={handleDeleteBerth}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsPage
            settings={settings}
            onSaveSettings={handleSaveSettings}
          />
        )}

        {activeTab === 'admin_control' && isAdmin && (
          <AdminControlPage
            settings={settings}
            onSaveSettings={handleSaveSettings}
            movementCount={movements.length}
            customerCount={customers.length}
            berthCount={berths.length}
            paymentCount={payments.length}
            safetyBackups={safetyBackups}
            onRefreshDataFromCloud={async () => { await refreshDataFromCloud(); }}
            onClearOperationalData={handleClearOperationalData}
            onRestoreSafetyBackup={handleRestoreSafetyBackup}
          />
        )}
      </main>

      {/* Modals */}
      <MovementModal
        isOpen={isMovementModalOpen}
        onClose={() => {
          setIsMovementModalOpen(false);
          setEditingMovement(null);
        }}
        onSave={handleSaveMovement}
        editingMovement={editingMovement}
        customers={customers}
        berths={berths}
        settings={settings}
        nextSeq={currentMaxSeq + 1}
      />

      <CustomerModal
        isOpen={isCustomerModalOpen}
        onClose={() => {
          setIsCustomerModalOpen(false);
          setEditingCustomer(null);
        }}
        onSave={handleSaveCustomer}
        editingCustomer={editingCustomer}
        existingCount={customers.length}
        defaultSystemCommission={settings.default_system_commission ?? 200}
        defaultNafezCommission={settings.default_nafez_commission ?? 0}
      />

      <BerthModal
        isOpen={isBerthModalOpen}
        onClose={() => {
          setIsBerthModalOpen(false);
          setEditingBerth(null);
        }}
        onSave={handleSaveBerth}
        editingBerth={editingBerth}
        existingCount={berths.length}
      />

      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => {
          setIsPaymentModalOpen(false);
          setPaymentCustomerId(undefined);
        }}
        onSavePayment={handleSavePayment}
        customers={customers}
        movements={movements}
        initialCustomerId={paymentCustomerId}
      />
    </div>
  );
};

export default function App() {
  return (
    <ConfirmActionProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ConfirmActionProvider>
  );
}
