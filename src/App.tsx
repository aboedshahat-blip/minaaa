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
import { MovementModal } from './components/MovementModal';
import { SheetUploadModal } from './components/SheetUploadModal';
import { CustomerModal } from './components/CustomerModal';
import { BerthModal } from './components/BerthModal';
import { PaymentModal } from './components/PaymentModal';

const AppContent: React.FC = () => {
  const { canViewFinancials } = useAuth();

  // State
  const [activeTab, setActiveTab] = useState<TabType>('movements');
  const [movements, setMovements] = useState<Movement[]>(getStoredMovements);
  const [customers, setCustomers] = useState<Customer[]>(getStoredCustomers);
  const [berths, setBerths] = useState<Berth[]>(getStoredBerths);
  const [payments, setPayments] = useState<PaymentReceipt[]>(getStoredPayments);
  const [settings, setSettings] = useState<SystemSettings>(getStoredSettings);

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

  // Auto-switch away from restricted tabs if role changes to data_entry
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
      const updated = movements.map((m) =>
        m.id === editingMovement.id ? ({ ...m, ...movementData } as Movement) : m
      );
      setMovements(updated);
      saveMovements(updated);
    } else {
      const newMovement: Movement = {
        ...movementData,
        id: `m-${Date.now()}`,
        seq: movementData.seq || currentMaxSeq + 1,
        created_at: new Date().toISOString(),
      } as Movement;
      const updated = [newMovement, ...movements];
      setMovements(updated);
      saveMovements(updated);
    }
    setEditingMovement(null);
  };

  const handleDeleteMovement = (id: string) => {
    if (window.confirm('هل أنت متأكد من حذف هذه الحركة من السيستم؟')) {
      const updated = movements.filter((m) => m.id !== id);
      setMovements(updated);
      saveMovements(updated);
    }
  };

  const handleTogglePaid = (movement: Movement) => {
    const isNowPaid = movement.payment_status === 'paid';
    const newStatus = isNowPaid ? 'unpaid' : 'paid';
    const newPaid = isNowPaid ? 0 : movement.total_amount;
    const newRemaining = isNowPaid ? movement.total_amount : 0;

    const updated = movements.map((m) =>
      m.id === movement.id
        ? {
            ...m,
            payment_status: newStatus as any,
            paid_amount: newPaid,
            remaining_amount: newRemaining,
          }
        : m
    );
    setMovements(updated);
    saveMovements(updated);
  };

  const handleImportMovements = (importedMovements: Movement[]) => {
    const updated = [...importedMovements, ...movements];
    setMovements(updated);
    saveMovements(updated);
  };

  // Customer Handlers
  const handleSaveCustomer = (customerData: Customer) => {
    if (editingCustomer) {
      const updated = customers.map((c) =>
        c.id === editingCustomer.id ? customerData : c
      );
      setCustomers(updated);
      saveCustomers(updated);
    } else {
      const updated = [customerData, ...customers];
      setCustomers(updated);
      saveCustomers(updated);
    }
    setEditingCustomer(null);
  };

  const handleDeleteCustomer = (id: string) => {
    if (window.confirm('هل أنت متأكد من حذف هذا العميل من المنظومة؟')) {
      const updated = customers.filter((c) => c.id !== id);
      setCustomers(updated);
      saveCustomers(updated);
    }
  };

  // Berth Handlers
  const handleSaveBerth = (berthData: Berth) => {
    if (editingBerth) {
      const updated = berths.map((b) =>
        b.id === editingBerth.id ? berthData : b
      );
      setBerths(updated);
      saveBerths(updated);
    } else {
      const updated = [...berths, berthData];
      setBerths(updated);
      saveBerths(updated);
    }
    setEditingBerth(null);
  };

  const handleDeleteBerth = (id: string) => {
    if (window.confirm('هل أنت متأكد من حذف هذا الرصيف؟')) {
      const updated = berths.filter((b) => b.id !== id);
      setBerths(updated);
      saveBerths(updated);
    }
  };

  // Payment Handlers
  const handleSavePayment = (payment: PaymentReceipt, updatedMovements: Movement[]) => {
    const newPayments = [payment, ...payments];
    setPayments(newPayments);
    savePayments(newPayments);

    setMovements(updatedMovements);
    saveMovements(updatedMovements);
  };

  // Settings Handlers
  const handleSaveSettings = (newSettings: SystemSettings) => {
    setSettings(newSettings);
    saveSettings(newSettings);
  };

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
