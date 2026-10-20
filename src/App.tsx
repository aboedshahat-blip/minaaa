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
  saveBerths,
  saveCustomers,
  saveMovements,
  savePayments,
  saveSettings,
  fetchAllFromSupabase,
  syncMovementToSupabase,
  syncCustomerToSupabase,
  syncBerthToSupabase,
  syncPaymentToSupabase,
  deleteMovementFromSupabase,
  clearAllMovementsFromSupabase,
  deleteCustomerFromSupabase,
  deleteBerthFromSupabase,
} from './lib/storage';
import { exportTemplateToExcel } from './lib/excelUtils';
import { Navbar } from './components/Navbar';
import { NavigationTabs, TabType } from './components/NavigationTabs';
import { MovementsPage } from './pages/MovementsPage';
import { SheetProcessingPage } from './pages/SheetProcessingPage';
import { CustomersPage } from './pages/CustomersPage';
import { AccountsPage } from './pages/AccountsPage';
import { ReportsPage } from './pages/ReportsPage';
import { BerthsPage } from './pages/BerthsPage';
import { SettingsPage } from './pages/SettingsPage';
import { AdminControlPage } from './pages/AdminControlPage';
import { LoginPage } from './components/LoginPage';
import { MovementModal } from './components/MovementModal';
import { SheetUploadModal } from './components/SheetUploadModal';
import { CustomerModal } from './components/CustomerModal';
import { BerthModal } from './components/BerthModal';
import { PaymentModal } from './components/PaymentModal';

const AppContent: React.FC = () => {
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
    canEditCommissions,
    isAdmin,
  } = useAuth();

  // State
  const [activeTab, setActiveTab] = useState<TabType>('movements');
  const [movements, setMovements] = useState<Movement[]>(getStoredMovements);
  const [customers, setCustomers] = useState<Customer[]>(getStoredCustomers);
  const [berths, setBerths] = useState<Berth[]>(getStoredBerths);
  const [payments, setPayments] = useState<PaymentReceipt[]>(getStoredPayments);
  const [settings, setSettings] = useState<SystemSettings>(getStoredSettings);

  // Initial cloud fetch from Supabase on mount
  const refreshDataFromCloud = async () => {
    try {
      const cloudData = await fetchAllFromSupabase();
      if (cloudData) {
        if (cloudData.movements !== null && cloudData.movements !== undefined) {
          setMovements(cloudData.movements);
          saveMovements(cloudData.movements);
        }
        if (cloudData.customers && cloudData.customers.length > 0) {
          setCustomers(cloudData.customers);
          saveCustomers(cloudData.customers);
        }
        if (cloudData.berths && cloudData.berths.length > 0) {
          setBerths(cloudData.berths);
          saveBerths(cloudData.berths);
        }
        if (cloudData.payments && cloudData.payments.length > 0) {
          setPayments(cloudData.payments);
          savePayments(cloudData.payments);
        }
      }
    } catch (e) {
      console.warn('Cloud sync error:', e);
    }
  };

  useEffect(() => {
    refreshDataFromCloud();
  }, []);

  // Security guard: If non-admin user lands on admin_control, redirect to movements
  useEffect(() => {
    if (activeTab === 'admin_control' && !isAdmin) {
      setActiveTab('movements');
    }
  }, [activeTab, isAdmin]);

  // Modals state
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [editingMovement, setEditingMovement] = useState<Movement | null>(null);

  const [isSheetUploadOpen, setIsSheetUploadOpen] = useState(false);

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
      setMovements(updated);
      saveMovements(updated);
      syncMovementToSupabase(updatedMovement);
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
      syncMovementToSupabase(newMovement);
    }
    setEditingMovement(null);
  };

  const handleDeleteMovement = (id: string) => {
    if (!canDeleteMovements) {
      alert('ليس لديك صلاحية لحذف الحركات');
      return;
    }
    if (window.confirm('هل أنت متأكد من حذف هذه الحركة من السيستم وقاعدة البيانات؟')) {
      const updated = movements.filter((m) => m.id !== id);
      setMovements(updated);
      saveMovements(updated);
      deleteMovementFromSupabase(id);
    }
  };

  const handleClearAllMovements = async () => {
    if (!isAdmin) {
      alert('هذه العملية تتطلب صلاحيات المدير العام.');
      return;
    }
    if (window.confirm('⚠️ تحذير تصفير السيستم:\nهل أنت متأكد من مسح وتصفير كافة الحركات والشحنات المسجلة؟\nسيتم إفراغ النظام وقاعدة البيانات تماماً لتسليمه للعميل خالي من أي بيانات تجريبية.')) {
      setMovements([]);
      saveMovements([]);
      await clearAllMovementsFromSupabase();
      alert('✓ تم مسح وتصفير كافة الشحنات بنجاح. النظام الآن فارغ ونظيف وجاهز للتسليم للعميل.');
    }
  };

  const handleTogglePaid = (movement: Movement) => {
    const isNowPaid = movement.payment_status === 'paid';
    const newStatus = isNowPaid ? 'unpaid' : 'paid';
    const newPaid = isNowPaid ? 0 : movement.total_amount;
    const newRemaining = isNowPaid ? movement.total_amount : 0;

    const updatedMovement = {
      ...movement,
      payment_status: newStatus as any,
      paid_amount: newPaid,
      remaining_amount: newRemaining,
    };

    const updated = movements.map((m) =>
      m.id === movement.id ? updatedMovement : m
    );
    setMovements(updated);
    saveMovements(updated);
    syncMovementToSupabase(updatedMovement);
  };

  const handleImportMovements = (importedMovements: Movement[]) => {
    const updated = [...importedMovements, ...movements];
    setMovements(updated);
    saveMovements(updated);
    // Sync all to Supabase
    importedMovements.forEach((m) => syncMovementToSupabase(m));
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
      syncCustomerToSupabase(customerData);
    } else {
      const updated = [customerData, ...customers];
      setCustomers(updated);
      saveCustomers(updated);
      syncCustomerToSupabase(customerData);
    }
    setEditingCustomer(null);
  };

  const handleDeleteCustomer = (id: string) => {
    if (!canDeleteCustomers) {
      alert('ليس لديك صلاحية لحذف العملاء');
      return;
    }
    if (window.confirm('هل أنت متأكد من حذف هذا العميل من المنظومة؟')) {
      const updated = customers.filter((c) => c.id !== id);
      setCustomers(updated);
      saveCustomers(updated);
      deleteCustomerFromSupabase(id);
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
      syncBerthToSupabase(berthData);
    } else {
      const updated = [...berths, berthData];
      setBerths(updated);
      saveBerths(updated);
      syncBerthToSupabase(berthData);
    }
    setEditingBerth(null);
  };

  const handleDeleteBerth = (id: string) => {
    if (!canManageBerths) {
      alert('ليس لديك صلاحية لحذف الأرصفة');
      return;
    }
    if (window.confirm('هل أنت متأكد من حذف هذا الرصيف؟')) {
      const updated = berths.filter((b) => b.id !== id);
      setBerths(updated);
      saveBerths(updated);
      deleteBerthFromSupabase(id);
    }
  };

  // Payment Handlers
  const handleSavePayment = (payment: PaymentReceipt, updatedMovements: Movement[]) => {
    if (!canManagePayments) {
      alert('ليس لديك صلاحية لتسجيل سندات القبض');
      return;
    }
    const newPayments = [payment, ...payments];
    setPayments(newPayments);
    savePayments(newPayments);
    syncPaymentToSupabase(payment);

    setMovements(updatedMovements);
    saveMovements(updatedMovements);
    // sync updated movements to Supabase
    updatedMovements.forEach((m) => syncMovementToSupabase(m));
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
        onOpenUpload={() => setIsSheetUploadOpen(true)}
        onExportTemplate={() => exportTemplateToExcel(movements)}
      />

      {/* Navigation Tabs */}
      <NavigationTabs
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        movementCount={movements.length}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'movements' && (
          <MovementsPage
            movements={movements}
            customers={customers}
            berths={berths}
            onOpenAddModal={() => {
              setEditingMovement(null);
              setIsMovementModalOpen(true);
            }}
            onOpenUploadModal={() => setIsSheetUploadOpen(true)}
            onEditMovement={(m) => {
              setEditingMovement(m);
              setIsMovementModalOpen(true);
            }}
            onDeleteMovement={handleDeleteMovement}
            onClearAllMovements={handleClearAllMovements}
            onTogglePaid={handleTogglePaid}
          />
        )}

        {activeTab === 'sheet_import' && (
          <SheetProcessingPage
            customers={customers}
            berths={berths}
            settings={settings}
            currentMaxSeq={currentMaxSeq}
            onImportMovements={handleImportMovements}
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
            onRefreshDataFromCloud={refreshDataFromCloud}
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

      <SheetUploadModal
        isOpen={isSheetUploadOpen}
        onClose={() => setIsSheetUploadOpen(false)}
        onImportMovements={handleImportMovements}
        customers={customers}
        berths={berths}
        settings={settings}
        currentMaxSeq={currentMaxSeq}
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
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
