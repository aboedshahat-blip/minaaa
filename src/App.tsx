import React, { Suspense, lazy, useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import {
  Berth,
  Customer,
  Movement,
  OfficeExpense,
  PaymentReceipt,
  SystemSettings,
} from './types';
import {
  getStoredBerths,
  getStoredCustomers,
  getStoredMovements,
  getStoredPayments,
  getStoredOfficeExpenses,
  getStoredSettings,
  getSafetyBackups,
  saveSafetyBackup,
  restoreSafetyBackupToSupabase,
  OperationalSafetyBackup,
  saveBerths,
  saveCustomers,
  saveMovements,
  savePayments,
  saveOfficeExpenses,
  saveSettings,
  fetchAllFromSupabase,
  syncCommissionSettingsToSupabase,
  syncMovementToSupabase,
  syncCustomerToSupabase,
  syncImportedBatchToSupabase,
  syncBerthToSupabase,
  syncPaymentToSupabase,
  syncMovementFinancialsToSupabase,
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
  syncOfficeExpenseToSupabase,
  deleteOfficeExpenseFromSupabase,
  uploadOfficeExpenseReceipt,
} from './lib/storage';
import { getSupabaseClient } from './lib/supabase';
import { exportTemplateToExcel } from './lib/excelUtils';
import { Navbar } from './components/Navbar';
import { NavigationTabs, TabType } from './components/NavigationTabs';
const MovementsPage = lazy(() => import('./pages/MovementsPage').then((module) => ({ default: module.MovementsPage })));
const CustomersPage = lazy(() => import('./pages/CustomersPage').then((module) => ({ default: module.CustomersPage })));
const AccountsPage = lazy(() => import('./pages/AccountsPage').then((module) => ({ default: module.AccountsPage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage').then((module) => ({ default: module.ReportsPage })));
const BerthsPage = lazy(() => import('./pages/BerthsPage').then((module) => ({ default: module.BerthsPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })));
const AdminControlPage = lazy(() => import('./pages/AdminControlPage').then((module) => ({ default: module.AdminControlPage })));
const OfficeExpensesPage = lazy(() => import('./pages/OfficeExpensesPage').then((module) => ({ default: module.OfficeExpensesPage })));
import { LoginPage } from './components/LoginPage';
import { PasswordRecoveryPage } from './components/PasswordRecoveryPage';
const MovementModal = lazy(() => import('./components/MovementModal').then((module) => ({ default: module.MovementModal })));
const CustomerModal = lazy(() => import('./components/CustomerModal').then((module) => ({ default: module.CustomerModal })));
const BerthModal = lazy(() => import('./components/BerthModal').then((module) => ({ default: module.BerthModal })));
const PaymentModal = lazy(() => import('./components/PaymentModal').then((module) => ({ default: module.PaymentModal })));
import { applyUnallocatedCustomerAdvances } from './lib/paymentUtils';
import { getMovementService, getServiceCommission } from './lib/serviceFees';
import { ConfirmActionProvider, useConfirmAction } from './contexts/ConfirmActionContext';

const getLocalOnlyRows = <T extends { id: string },>(cloudRows: T[], localRows: T[]) => {
  const cloudIds = new Set(cloudRows.map((row) => row.id));
  return localRows.filter((row) => !cloudIds.has(row.id));
};

const withoutFinancialDetails = (movement: Movement): Movement => ({
  ...movement,
  cashier_invoice: 0,
  cashier_receipt_no: '',
  system_commission: 0,
  nafez_commission: 0,
  discount: 0,
  total_amount: 0,
  payment_status: 'unpaid',
  paid_amount: 0,
  remaining_amount: 0,
  customer_paid_amount: 0,
});

const APP_TABS: TabType[] = ['movements', 'customers', 'accounts', 'reports', 'office_expenses', 'berths', 'settings', 'admin_control'];
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
    isLoading: isAuthLoading,
    isPasswordRecovery,
    completePasswordRecovery,
    finishPasswordRecovery,
    canViewFinancials,
    canAddMovements,
    canUploadSheets,
    canEditMovements,
    canDeleteMovements,
    canManageCustomers,
    canDeleteCustomers,
    canManageBerths,
    canManagePayments,
    canEditCommissions,
    isAdmin,
    currentUser,
  } = useAuth();

  // State
  const [activeTab, setActiveTab] = useState<TabType>(getStoredActiveTab);
  const [movements, setMovements] = useState<Movement[]>(getStoredMovements);
  const [customers, setCustomers] = useState<Customer[]>(getStoredCustomers);
  const [berths, setBerths] = useState<Berth[]>(getStoredBerths);
  const [payments, setPayments] = useState<PaymentReceipt[]>(getStoredPayments);
  const [expenses, setExpenses] = useState<OfficeExpense[]>(getStoredOfficeExpenses);
  const [expenseCloudReady, setExpenseCloudReady] = useState<boolean | null>(null);
  const [safetyBackups, setSafetyBackups] = useState<OperationalSafetyBackup[]>(getSafetyBackups);
  const [settings, setSettings] = useState<SystemSettings>(getStoredSettings);
  const [cloudFeedback, setCloudFeedback] = useState<string | null>(null);
  const [cloudSyncState, setCloudSyncState] = useState<'loading' | 'ready' | 'error'>('loading');
  const hasLoadedCloudSnapshotRef = useRef(false);
  const movementImportRevisionRef = useRef(0);
  const cloudRefreshRequestRef = useRef(0);

  useEffect(() => {
    if (isAuthLoading || !isAuthenticated || canViewFinancials) return;
    setMovements((current) => {
      const operationalOnly = current.map(withoutFinancialDetails);
      saveMovements(operationalOnly);
      return operationalOnly;
    });
    setPayments([]);
    savePayments([]);
    setSafetyBackups((current) => current.map((backup) => ({ ...backup, movements: backup.movements.map(withoutFinancialDetails), payments: [] })));
  }, [isAuthLoading, isAuthenticated, canViewFinancials]);

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
    const backup = saveSafetyBackup({ label, movements, customers, berths, payments, expenses });
    setSafetyBackups(getSafetyBackups());
    return backup;
  };

  // Initial cloud fetch from Supabase on mount
  const refreshDataFromCloud = async (restoreDeviceOnlyData = false, quiet = false) => {
    const refreshRequestId = ++cloudRefreshRequestRef.current;
    const importRevisionAtStart = movementImportRevisionRef.current;
    if (!hasLoadedCloudSnapshotRef.current) setCloudSyncState('loading');
    try {
      const cloudData = await fetchAllFromSupabase();
      if (cloudData) {
        // A slower cloud read must not replace a just-imported sheet with the
        // older snapshot it fetched before the import finished.
        if (refreshRequestId !== cloudRefreshRequestRef.current ||
            importRevisionAtStart !== movementImportRevisionRef.current) return;
        let financeSyncNotice: string | null = null;
        let effectiveSettings = settings;
        const cloudCommissionSettings = cloudData.commissionSettings;
        if (cloudCommissionSettings?.vib_configured_at) {
          const cloudNumericSettings = Object.fromEntries([
            'default_system_commission', 'default_inbound_commission', 'default_outbound_commission',
            'default_empty_commission', 'default_nafez_commission', 'default_truck_axles',
            'default_truck_weight', 'default_trailer_axles', 'default_trailer_weight',
          ].filter((key) => cloudCommissionSettings[key as keyof typeof cloudCommissionSettings] !== undefined)
            .map((key) => [key, Number(cloudCommissionSettings[key as keyof typeof cloudCommissionSettings])])) as unknown as Partial<SystemSettings>;
          effectiveSettings = {
            ...settings,
            ...cloudNumericSettings,
          };
          setSettings(effectiveSettings);
          saveSettings(effectiveSettings);
        } else if (canEditCommissions) {
          try {
            await syncCommissionSettingsToSupabase(settings);
          } catch (settingsError) {
            const message = settingsError instanceof Error ? settingsError.message : 'تعذر حفظ إعدادات العمولات المشتركة.';
            financeSyncNotice = message;
          }
        }
        setExpenseCloudReady(!cloudData.expensesTableMissing);
        const resetDetected = Boolean(cloudData.dataResetAt && cloudData.dataResetAt !== getLocalDataResetAt());
        if (resetDetected && cloudData.dataResetAt) {
          clearOperationalLocalData(cloudData.dataResetAt);
        }
        const localMovements = resetDetected ? [] : getStoredMovements().map((row) => canViewFinancials ? row : withoutFinancialDetails(row));
        const localCustomers = resetDetected ? [] : getStoredCustomers();
        const localBerths = getStoredBerths();
        const localPayments = resetDetected || !canViewFinancials ? [] : getStoredPayments();
        const localExpenses = getStoredOfficeExpenses();
        const pendingMovementsRaw = resetDetected ? { upserts: [], deletes: [] } : getPendingSyncForTable<Movement>('movements');
        const pendingMovements = canViewFinancials ? pendingMovementsRaw : { ...pendingMovementsRaw, upserts: pendingMovementsRaw.upserts.map(withoutFinancialDetails) };
        const pendingCustomers = resetDetected ? { upserts: [], deletes: [] } : getPendingSyncForTable<Customer>('customers');
        const pendingBerths = getPendingSyncForTable<Berth>('berths');
        const pendingPayments = resetDetected || !canViewFinancials ? { upserts: [], deletes: [] } : getPendingSyncForTable<PaymentReceipt>('payments');
        const pendingExpenses = getPendingSyncForTable<OfficeExpense>('office_expenses');
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
        const missingFinancialIds = new Set(cloudData.missingFinancialMovementIds || []);
        const localMovementById = new Map(localMovements.map((movement) => [movement.id, movement]));
        const customerById = new Map([...cloudData.customers, ...localCustomers].map((customer) => [customer.id, customer]));
        const cloudMovementsWithRecoveredFinance = cloudData.movements.map((movement) => {
          if (!canViewFinancials || !missingFinancialIds.has(movement.id)) return movement;
          const local = localMovementById.get(movement.id);
          if (local) {
            const cashierInvoice = Number(local.cashier_invoice) || 0;
            const systemCommission = Number(local.system_commission) || 0;
            const nafezCommission = Number(local.nafez_commission) || 0;
            const discount = Number(local.discount) || 0;
            const total = Number(local.total_amount) || Math.max(0, cashierInvoice + systemCommission + nafezCommission - discount);
            const paid = local.customer_paid_amount !== undefined
              ? Number(local.customer_paid_amount) || 0
              : local.cashier_receipt_no
                ? Math.max(0, (Number(local.paid_amount) || 0) - cashierInvoice)
                : Number(local.paid_amount) || 0;
            const remaining = Math.max(0, total - paid);
            return {
              ...movement,
              cashier_invoice: cashierInvoice,
              cashier_receipt_no: local.cashier_receipt_no ?? '',
              system_commission: systemCommission,
              nafez_commission: nafezCommission,
              discount,
              total_amount: total,
              payment_status: (remaining === 0 && total > 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid') as Movement['payment_status'],
              paid_amount: paid,
              remaining_amount: remaining,
              customer_paid_amount: paid,
            };
          }

          // A movement without a ledger row still owes its configured service
          // fee, even if its cashier invoice has not arrived yet.
          const customer = customerById.get(movement.customer_id || '');
          const service = getMovementService(movement.booking_category, movement.container_path || movement.container_desc);
          const systemCommission = service
            ? getServiceCommission(effectiveSettings, service)
            : customer?.system_commission ?? effectiveSettings.default_system_commission ?? 200;
          const nafezCommission = customer?.nafez_commission ?? effectiveSettings.default_nafez_commission ?? 0;
          const total = (Number(movement.cashier_invoice) || 0) + systemCommission + nafezCommission;
          return {
            ...movement,
            cashier_invoice: 0,
            cashier_receipt_no: '',
            system_commission: systemCommission,
            nafez_commission: nafezCommission,
            discount: 0,
            total_amount: total,
            payment_status: 'unpaid' as const,
            paid_amount: 0,
            remaining_amount: total,
            customer_paid_amount: 0,
          };
        });
        const mergedMovements = mergePending(cloudMovementsWithRecoveredFinance, localMovements, pendingMovements).map((originalMovement) => {
          const movement = canViewFinancials ? originalMovement : withoutFinancialDetails(originalMovement);
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
        const expensesToUse = mergePending(cloudData.expenses || [], localExpenses, pendingExpenses);
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
        setExpenses(expensesToUse);
        saveOfficeExpenses(expensesToUse);

        // Retry queued edits/deletes before reporting sync complete.
        await flushPendingSync();

        const missingLedgerRowsToRepair = movementsToUse.filter((movement) => missingFinancialIds.has(movement.id));
        if (canManagePayments && missingLedgerRowsToRepair.length > 0) {
          try {
            await syncMovementFinancialsToSupabase(missingLedgerRowsToRepair);
            financeSyncNotice = [financeSyncNotice, `تم استكمال حسابات ${missingLedgerRowsToRepair.length} حركة وإعادة حفظها في قاعدة البيانات.`].filter(Boolean).join(' ');
          } catch (repairError) {
            console.warn('Could not repair missing movement account rows:', repairError);
            financeSyncNotice = 'تم حساب الأرصدة محليًا، لكن تعذر حفظ بعض سجلات الحسابات في السحابة. أعد المزامنة أو تواصل مع المدير.';
          }
        } else if (missingLedgerRowsToRepair.length > 0) {
          financeSyncNotice = `تم احتساب أرصدة ${missingLedgerRowsToRepair.length} حركة على هذا الجهاز. يلزم المدير لحفظ السجلات الناقصة في قاعدة البيانات.`;
        }

        const movementsToRestore = restoreDeviceOnlyData ? getLocalOnlyRows(cloudData.movements, localMovements) : [];
        const customersToRestore = restoreDeviceOnlyData ? getLocalOnlyRows(cloudData.customers, localCustomers) : [];
        const berthsToRestore = restoreDeviceOnlyData ? getLocalOnlyRows(cloudData.berths, localBerths) : [];
        const paymentsToRestore = restoreDeviceOnlyData ? getLocalOnlyRows(cloudData.payments, localPayments) : [];
        const expensesToRestore = restoreDeviceOnlyData ? getLocalOnlyRows(cloudData.expenses || [], localExpenses) : [];
        const restoredCount = movementsToRestore.length + customersToRestore.length + berthsToRestore.length + paymentsToRestore.length + expensesToRestore.length;
        const shouldRestoreLocalData = restoredCount > 0;
        if (shouldRestoreLocalData) {
          await restoreLocalDataToSupabase({
            movements: movementsToRestore,
            customers: customersToRestore,
            berths: berthsToRestore,
            payments: paymentsToRestore,
            expenses: expensesToRestore,
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
          setCloudFeedback(financeSyncNotice || (resetDetected
            ? 'تم مسح البيانات المحلية القديمة بعد تجهيز النظام للتسليم.'
            : restoredCount > 0
            ? 'استعدنا البيانات المحفوظة على هذا الجهاز وأعدنا مزامنتها مع السحابة.'
            : 'تم تحميل البيانات من قاعدة البيانات السحابية بنجاح.'));
        }
        hasLoadedCloudSnapshotRef.current = true;
        setCloudSyncState('ready');
      }
    } catch (e) {
      if (refreshRequestId !== cloudRefreshRequestRef.current ||
          importRevisionAtStart !== movementImportRevisionRef.current) return;
      if (!hasLoadedCloudSnapshotRef.current) setCloudSyncState('error');
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
    if (isAuthLoading || !isAuthenticated) return;
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
      for (const table of ['movements', 'movement_financials', 'customers', 'payments', 'berths', 'office_expenses']) {
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
  }, [isAuthLoading, isAuthenticated, canViewFinancials, canManagePayments, canEditCommissions]);

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
        id: `m-${crypto.randomUUID()}`,
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
    setExpenses(backup.expenses ?? getStoredOfficeExpenses());
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
    setExpenses(latestBackup.expenses ?? getStoredOfficeExpenses());
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

  const handleImportMovements = async (importedMovements: Movement[], newCustomers?: Customer[]): Promise<boolean> => {
    if (!canAddMovements && !canUploadSheets) {
      setCloudFeedback('ليس لديك صلاحية رفع الشيتات أو إضافة الحركات. لم تُحفظ أي بيانات.');
      throw new Error('ليس لديك صلاحية رفع الشيتات أو إضافة الحركات. اطلب من المدير تفعيل الصلاحية المناسبة.');
    }
    movementImportRevisionRef.current += 1;
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
    try {
      // Customer rows are referenced by movements, so sync them first to avoid
      // foreign-key failures that would otherwise leave one device out of date.
      const referencedCustomerIds = new Set(importedBatch.map((movement) => movement.customer_id).filter(Boolean));
      const referencedCustomers = customersAfterImport.filter((customer) => referencedCustomerIds.has(customer.id));
      await syncImportedBatchToSupabase(referencedCustomers, importedBatch);
      setCloudFeedback('تم حفظ الحركات والعملاء في قاعدة البيانات السحابية ومزامنتها.');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'تعذر تأكيد مزامنة الشيت.';
      setCloudFeedback(`${message} حُفظت البيانات محليًا وستتم إعادة المزامنة عند عودة الاتصال.`);
      return false;
    } finally {
      // Also invalidate reads that started while the import was syncing.
      movementImportRevisionRef.current += 1;
    }
  };

  const handleBatchUpdateMovements = async (updatedMovements: Movement[]): Promise<boolean> => {
    const allocation = applyUnallocatedCustomerAdvances(updatedMovements, payments);
    const existingMovementById = new Map(movements.map((movement) => [movement.id, movement]));
    // Batch editors keep untouched rows by reference. Persist only rows that
    // actually changed instead of firing one Supabase write per loaded movement.
    const changedMovements = allocation.movements.filter(
      (movement) => existingMovementById.get(movement.id) !== movement,
    );
    setMovements(allocation.movements);
    saveMovements(allocation.movements);
    setPayments(allocation.payments);
    savePayments(allocation.payments);
    try {
      await Promise.all([
        ...changedMovements.map((movement) => syncMovementToSupabase(movement)),
        ...allocation.payments.filter((p) => allocation.changedPaymentIds.includes(p.id)).map((p) => syncPaymentToSupabase(p)),
      ]);
      setCloudFeedback(`تم حفظ ربط الفواتير ومزامنة ${changedMovements.length} حركة في قاعدة البيانات السحابية.`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'تعذر تأكيد مزامنة ربط الفواتير.';
      setCloudFeedback(`${message} حُفظت البيانات محليًا وستتم إعادة المزامنة عند عودة الاتصال.`);
      return false;
    }
  };

  const handleRepairZeroFinancialMovements = async (repairedMovements: Movement[]): Promise<boolean> => {
    if (!canManagePayments && !canEditCommissions) {
      setCloudFeedback('ليس لديك صلاحية إعادة احتساب حسابات الحركات.');
      return false;
    }
    const repairedIds = new Set(repairedMovements.map((movement) => movement.id));
    const updated = movements.map((movement) => repairedIds.has(movement.id)
      ? repairedMovements.find((repaired) => repaired.id === movement.id) || movement
      : movement);
    const changedMovements = updated.filter((movement) => repairedIds.has(movement.id));
    try {
      // Save the recalculated ledger in one bounded upsert, not one request per movement.
      await syncMovementFinancialsToSupabase(changedMovements);
      setMovements(updated);
      saveMovements(updated);
      setCloudFeedback(`تمت إعادة احتساب وحفظ حسابات ${repairedMovements.length} حركة في قاعدة البيانات.`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'تعذر حفظ الحسابات بعد إعادة احتسابها.';
      setCloudFeedback(`${message} لم نغيّر البيانات المعروضة؛ أعد المحاولة بعد إصلاح الاتصال أو الصلاحية.`);
      return false;
    }
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
    if (!canEditCommissions) {
      setCloudFeedback('ليس لديك صلاحية تعديل إعدادات العمولات المشتركة.');
      return;
    }
    setSettings(newSettings);
    saveSettings(newSettings);
    void runCloudOperation(syncCommissionSettingsToSupabase(newSettings));
  };

  if (isPasswordRecovery) {
    return <PasswordRecoveryPage onSave={completePasswordRecovery} onContinue={finishPasswordRecovery} />;
  }

  if (isAuthLoading) {
    return <div className="min-h-screen bg-slate-50 p-8 text-center text-sm font-semibold text-slate-600" role="status">جارٍ التحقق من جلسة الدخول الآمنة…</div>;
  }

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
      {cloudSyncState !== 'ready' && (
        <div className={`flex flex-wrap items-center justify-center gap-2 px-4 py-2 text-center text-xs font-semibold ${cloudSyncState === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-800'}`} role="status" aria-live="polite">
          <span>{cloudSyncState === 'error' ? 'تعذر تحديث البيانات من السحابة. لن نبدأ مطابقة الفواتير على بيانات قديمة.' : 'جارٍ تحميل أحدث الحركات من قاعدة البيانات؛ انتظر قليلًا قبل مطابقة الفواتير.'}</span>
          {cloudSyncState === 'error' && <button type="button" onClick={() => void refreshDataFromCloud(false)} className="rounded-md border border-rose-300 bg-white px-2.5 py-1 font-bold hover:bg-rose-100">إعادة المحاولة</button>}
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full min-w-0 mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        <Suspense fallback={<div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500" role="status" aria-live="polite">جارٍ تحميل الصفحة…</div>}>
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
            onRepairZeroFinancialMovements={handleRepairZeroFinancialMovements}
            isCloudDataReady={cloudSyncState === 'ready'}
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

        {activeTab === 'office_expenses' && (
          <OfficeExpensesPage
            expenses={expenses}
            cloudReady={expenseCloudReady}
            onSave={async (data, attachment, existing) => {
              const id = existing?.id || `expense-${crypto.randomUUID()}`;
              let receiptPath = existing?.receipt_path;
              if (attachment) receiptPath = await uploadOfficeExpenseReceipt(attachment, id);
              const expense: OfficeExpense = {
                ...existing,
                ...data,
                id,
                receipt_path: receiptPath,
                receipt_name: attachment?.name || existing?.receipt_name,
                created_at: existing?.created_at || new Date().toISOString(),
                created_by: existing?.created_by || currentUser.id,
                created_by_name: existing?.created_by_name || currentUser.name,
              };
              const updated = existing
                ? expenses.map((row) => row.id === id ? expense : row)
                : [expense, ...expenses];
              setExpenses(updated);
              saveOfficeExpenses(updated);
              void runCloudOperation(syncOfficeExpenseToSupabase(expense));
            }}
            onDelete={async (expense) => {
              const updated = expenses.filter((row) => row.id !== expense.id);
              setExpenses(updated);
              saveOfficeExpenses(updated);
              void runCloudOperation(deleteOfficeExpenseFromSupabase(expense));
            }}
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
        </Suspense>
      </main>

      {/* Modals */}
      <Suspense fallback={null}>
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
      </Suspense>
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
