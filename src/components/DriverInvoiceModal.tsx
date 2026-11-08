import React, { useState } from 'react';
import { Movement } from '../types';
import { X, Printer, Building2, FileText, Download } from 'lucide-react';
import { vibLogoUrl } from '../lib/branding';
import { useConfirmAction } from '../contexts/useConfirmAction';
import { getCurrentYear, getLocalDateInputValue } from '../lib/dateUtils';

interface DriverInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  movements: Movement[];
  initialDriverName?: string;
  defaultPlaceName?: string;
}

export const DriverInvoiceModal: React.FC<DriverInvoiceModalProps> = ({
  isOpen,
  onClose,
  movements,
  initialDriverName,
  defaultPlaceName = 'محطة تشغيل وتفريغ الحاويات والشاحنات - إدارة الحركة',
}) => {
  const confirmAction = useConfirmAction();
  const [placeName, setPlaceName] = useState(defaultPlaceName);
  const [invoiceNo] = useState(() => `INV-${getCurrentYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`);
  const [invoiceDate] = useState(getLocalDateInputValue);
  const [notes, _setNotes] = useState('المبلغ المستحق عن الشحنات الموضحة بالجدول أعلاه.');

  if (!isOpen) return null;

  // Determine driver name
  const driverName =
    initialDriverName ||
    movements.find((m) => m.driver_name)?.driver_name ||
    'سائق غير محدد';

  // Aggregate totals
  const totalCashier = movements.reduce((s, m) => s + (Number(m.cashier_invoice) || 0), 0);
  const totalSystemComm = movements.reduce((s, m) => s + (Number(m.system_commission) || 0), 0);
  const totalNafez = movements.reduce((s, m) => s + (Number(m.nafez_commission) || 0), 0);
  const totalDiscount = movements.reduce((s, m) => s + (Number(m.discount) || 0), 0);
  const grandTotal = movements.reduce((s, m) => s + (Number(m.total_amount) || 0), 0);
  const totalPaid = movements.reduce((s, m) => s + (Number(m.paid_amount) || 0), 0);
  const totalRemaining = movements.reduce((s, m) => s + (Number(m.remaining_amount) || 0), 0);

  // Distinct truck plates
  const berths = Array.from(new Set(movements.map((m) => m.berth_name).filter(Boolean))).join(' ، ');

  const handleDownloadPdf = async () => {
    const { exportCustomerStatementPdf } = await import('../lib/pdfExport');
    await exportCustomerStatementPdf(
      driverName,
      movements,
      {
        cashierTotal: totalCashier,
        systemCommTotal: totalSystemComm,
        nafezCommTotal: totalNafez,
        discountTotal: totalDiscount,
        totalAmount: grandTotal,
        paidTotal: totalPaid,
        remainingTotal: totalRemaining,
      },
      placeName
    );
  };

  const handlePrint = async () => {
    if (!await confirmAction(`هل تريد طباعة فاتورة ${driverName}؟`, 'نعم، اطبع')) return;
    const printContent = document.getElementById('printable-driver-invoice');
    if (!printContent) {
      window.print();
      return;
    }

    const printWindow = window.open('', '_blank', 'width=900,height=1000');
    if (!printWindow) {
      window.print();
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8" />
        <title>فاتورة حساب سائق - ${driverName}</title>
        <style>
          @page { size: A4 landscape; margin: 5mm 7mm; }
          * { box-sizing: border-box; }
          body {
            font-family: system-ui, -apple-system, 'Segoe UI', Tahoma, Arial, sans-serif;
            direction: rtl;
            text-align: right;
            color: #0f172a;
            margin: 0;
            padding: 0;
            font-size: 9px;
          }
          .header-box { border-bottom: 1.5px solid #0f172a; padding-bottom: 4px; margin-bottom: 6px; display: grid; grid-template-columns: 54px minmax(0,1fr) auto; gap: 8px; align-items: center; }
          .title { font-size: 16px; font-weight: 900; margin: 0 0 2px 0; color: #1e3a8a; }
          .office-name { max-width: 620px; overflow-wrap: anywhere; word-break: break-word; line-height: 1.25; }
          .brand-logo { display: block; width: 48px; height: 42px; max-width: 48px; max-height: 42px; object-fit: contain; object-position: center; border-radius: 6px; }
          .subtitle { font-size: 10px; font-weight: bold; color: #475569; margin: 0; }
          .meta-box {
            background-color: #f1f5f9;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            padding: 5px 7px;
            margin-bottom: 7px;
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 5px;
            font-size: 9px;
          }
          .meta-item { display: flex; flex-direction: column; }
          .meta-label { color: #64748b; font-size: 8px; font-weight: bold; }
          .meta-val { font-weight: bold; color: #0f172a; margin-top: 1px; }
          table {
            width: 100%;
            table-layout: fixed;
            border-collapse: collapse;
            margin-bottom: 7px;
            font-size: 8px;
          }
          th {
            background-color: #0f172a;
            color: white;
            padding: 4px 3px;
            border: 1px solid #334155;
            text-align: center;
          }
          td {
            padding: 3px 2px;
            border: 1px solid #cbd5e1;
            text-align: center;
            vertical-align: middle;
            white-space: normal;
            overflow-wrap: anywhere;
            word-break: normal;
            line-height: 1.2;
          }
          th { text-align: center; vertical-align: middle; white-space: normal; overflow-wrap: anywhere; word-break: normal; line-height: 1.2; }
          tr:nth-child(even) { background-color: #f8fafc; }
          .totals-table {
            width: 50%;
            margin-right: auto;
            border-collapse: collapse;
            margin: 0;
            font-size: 9px;
          }
          .totals-table td { padding: 3px 6px; border: 1px solid #94a3b8; }
          .totals-table .highlight { background-color: #1e3a8a; color: white; font-weight: 900; font-size: 10px; }
          .totals-table .due-box { background-color: #be123c; color: white; font-weight: 900; font-size: 10px; }
          .financial-summary { display: flex; flex-direction: row; align-items: stretch; gap: 8px; margin-bottom: 6px; }
          .financial-summary > div:first-child { flex: 1 1 auto; min-width: 0; }
          .financial-summary > div:last-child { flex: 0 0 52%; width: 52%; }
          .financial-summary .totals-table { width: 100%; }
          .signatures {
            display: flex;
            justify-content: space-between;
            margin-top: 8px;
            padding-top: 6px;
            border-top: 1px dashed #94a3b8;
          }
          .sign-col { text-align: center; width: 30%; font-size: 10px; font-weight: bold; }
          .transport-stamp { width: 100px; height: 35px; margin: 5px auto 0; border: 1.5px dashed #64748b; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #64748b; font-weight: 800; }
          .sign-line { margin-top: 45px; border-top: 1px solid #64748b; }
          .footer-note { text-align: center; font-size: 8px; color: #64748b; margin-top: 5px; padding-top: 4px; }
          @media print {
            body { padding: 0; font-size: 9px; }
            #printable-driver-invoice { width: 100%; max-width: none; padding: 0 !important; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; }
            th, td { padding: 3px 2px !important; }
            tr, .financial-summary, .invoice-stamp-footer, .footer-note { break-inside: avoid; page-break-inside: avoid; }
            thead { display: table-header-group; }
            .overflow-x-auto { overflow: visible !important; }
            .driver-invoice-content { padding-bottom: 0 !important; }
            .invoice-stamp-footer { position: static !important; margin: 4px 0 0 !important; padding-top: 4px !important; background: #fff; }
          }
        </style>
      </head>
      <body>
        ${printContent.innerHTML}
      </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Top Action Header (No-print) */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between no-print">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-orange-400" />
            <h2 className="font-bold text-sm sm:text-base">فاتورة ومطالبة حساب السائق (جاهزة للطباعة)</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPdf}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black px-4 py-2 rounded-lg shadow-sm flex items-center gap-1.5 transition"
              title="تحميل كشف الحساب والمطالبة بصيغة PDF للعميل مباشرة"
            >
              <Download className="w-4 h-4" />
              <span>تحميل PDF للعميل</span>
            </button>
            <button
              onClick={handlePrint}
              className="bg-orange-600 hover:bg-orange-700 text-white text-xs font-black px-4 py-2 rounded-lg shadow-sm flex items-center gap-1.5 transition"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة الفاتورة الآن</span>
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition mr-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Place Name Edit Bar (No-print) */}
        <div className="bg-orange-50 border-b border-orange-200 px-5 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs no-print">
          <span className="font-bold text-orange-900 flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-orange-600" />
            <span>اسم المكان / الرصيف المصدر للفاتورة:</span>
          </span>
          <input
            type="text"
            value={placeName}
            onChange={(e) => setPlaceName(e.target.value)}
            className="w-full sm:w-96 bg-white border border-orange-300 rounded px-2.5 py-1 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-orange-500"
            placeholder="اكتب اسم المكان أو المحطة..."
          />
        </div>

        {/* Scrollable Printable Document Container */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-100/60">
          <div
            id="printable-driver-invoice"
            className="driver-invoice-content bg-white rounded-xl p-6 sm:p-8 shadow-sm border border-slate-200 max-w-3xl mx-auto text-right text-slate-900"
          >
            {/* Invoice Header */}
            <div className="header-box border-b-2 border-slate-900 pb-3 mb-4 grid grid-cols-[64px_minmax(0,1fr)] sm:grid-cols-[84px_minmax(0,1fr)_auto] items-center gap-3">
              <img src={vibLogoUrl} alt="شعار VIB" className="brand-logo h-16 w-16 sm:h-[72px] sm:w-[84px] shrink-0 object-contain rounded-lg" />
              <div className="min-w-0 text-center sm:text-right">
                <h1 className="title office-name break-words text-lg sm:text-xl font-black text-blue-900">{placeName}</h1>
                <p className="subtitle text-xs font-bold text-slate-600 mt-1">
                  إدارة الحركة والتشغيل — فاتورة ومطالبة مجمعة لحساب سائق
                </p>
                {berths && (
                  <p className="text-[11px] text-slate-500 mt-0.5">الرصيف: {berths}</p>
                )}
              </div>
              <div className="col-span-2 sm:col-span-1 justify-self-end text-left bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs">
                <div className="font-mono font-black text-slate-900">{invoiceNo}</div>
                <div className="text-slate-500 text-[11px] mt-0.5">التاريخ: {invoiceDate}</div>
              </div>
            </div>

            {/* Meta Information Cards */}
            <div className="meta-box bg-slate-50 border border-slate-200 rounded-lg p-3.5 mb-5 grid grid-cols-2 gap-3 text-xs">
              <div className="meta-item">
                <span className="meta-label text-[11px] font-bold text-slate-500">اسم السائق:</span>
                <span className="meta-val font-black text-slate-900 text-sm mt-0.5">{driverName}</span>
              </div>
              <div className="meta-item">
                <span className="meta-label text-[11px] font-bold text-slate-500">عدد الشحنات:</span>
                <span className="meta-val font-bold text-blue-800 mt-0.5">{movements.length} حركة / حاوية</span>
              </div>
            </div>

            {/* Detailed Movements Table */}
            <div className="overflow-x-auto mb-5">
              <table className="w-full table-fixed text-xs text-right border-collapse border border-slate-300">
                <thead className="bg-slate-900 text-white font-bold text-[11px]">
                  <tr>
                    <th className="p-2 border border-slate-700 text-center w-8">م</th>
                    <th className="p-2 border border-slate-700">رقم الحاوية</th>
                    <th className="p-2 border border-slate-700">وصف الحاوية</th>
                    <th className="p-2 border border-slate-700">مسار الحاوية</th>
                    <th className="p-2 border border-slate-700">رقم الإقرار</th>
                    <th className="p-2 border border-slate-700 text-center">التاريخ</th>
                    <th className="p-2 border border-slate-700 text-center">فاتورة كاشير</th>
                    <th className="p-2 border border-slate-700 text-center">عمولة المنظومة</th>
                    <th className="p-2 border border-slate-700 text-center">نافذ</th>
                    <th className="p-2 border border-slate-700 text-center bg-blue-950">الإجمالي</th>
                    <th className="p-2 border border-slate-700 text-center bg-rose-950">المتبقي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-[11px]">
                  {movements.map((m, idx) => (
                    <tr key={m.id || idx} className="hover:bg-slate-50">
                      <td className="p-2 border border-slate-200 text-center font-bold text-slate-500 bg-slate-50">{idx + 1}</td>
                      <td className="p-2 border border-slate-200 font-mono font-bold text-blue-900">{m.container_no || '-'}</td>
                      <td className="p-2 border border-slate-200 text-slate-700">{m.container_desc || '-'}</td>
                      <td className="p-2 border border-slate-200 text-slate-700">{m.container_path || '-'}</td>
                      <td className="p-2 border border-slate-200 font-mono text-slate-700">{m.declaration_no || '-'}</td>
                      <td className="p-2 border border-slate-200 text-center text-slate-600">{m.movement_date || '-'}</td>
                      <td className="p-2 border border-slate-200 text-center font-mono">{(Number(m.cashier_invoice) || 0).toLocaleString()}</td>
                      <td className="p-2 border border-slate-200 text-center font-mono font-bold text-blue-800">{(Number(m.system_commission) || 0).toLocaleString()}</td>
                      <td className="p-2 border border-slate-200 text-center font-mono text-indigo-700">{(Number(m.nafez_commission) || 0).toLocaleString()}</td>
                      <td className="p-2 border border-slate-200 text-center font-mono font-bold text-slate-900 bg-blue-50/50">{(Number(m.total_amount) || 0).toLocaleString()}</td>
                      <td className="p-2 border border-slate-200 text-center font-mono font-bold text-rose-800 bg-rose-50/50">{(Number(m.remaining_amount) || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Financial Totals Breakdown Table */}
            <div className="financial-summary flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
              <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200 flex-1 w-full">
                <span className="font-bold text-slate-800 block mb-1">ملاحظات الفاتورة:</span>
                <p className="text-slate-600 text-[11px]">{notes}</p>
                <div className="mt-3 pt-2 border-t border-slate-200 text-[11px] text-slate-500">
                  تم إصدار هذا الكشف آلياً وتجميع كافة المبالغ والمصاريف والعمولات المستحقة.
                </div>
              </div>

              <div className="w-full sm:w-80">
                <table className="totals-table w-full text-xs border-collapse border border-slate-300">
                  <tbody>
                    <tr>
                      <td className="p-2 border border-slate-200 text-slate-600 font-bold">إجمالي فواتير الكاشير:</td>
                      <td className="p-2 border border-slate-200 font-mono font-bold text-left">{totalCashier.toLocaleString()} ج.م</td>
                    </tr>
                    <tr>
                      <td className="p-2 border border-slate-200 text-slate-600 font-bold">إجمالي عمولة المنظومة:</td>
                      <td className="p-2 border border-slate-200 font-mono font-bold text-blue-800 text-left">{totalSystemComm.toLocaleString()} ج.م</td>
                    </tr>
                    <tr>
                      <td className="p-2 border border-slate-200 text-slate-600 font-bold">إجمالي خدمات نافذ:</td>
                      <td className="p-2 border border-slate-200 font-mono font-bold text-indigo-800 text-left">{totalNafez.toLocaleString()} ج.م</td>
                    </tr>
                    <tr className="highlight bg-blue-900 text-white font-black text-sm">
                      <td className="p-2.5 border border-blue-950">إجمالي المبلغ المستحق:</td>
                      <td className="p-2.5 border border-blue-950 font-mono text-left">{grandTotal.toLocaleString()} ج.م</td>
                    </tr>
                    {totalPaid > 0 && (
                      <tr className="bg-emerald-50 text-emerald-900 font-bold">
                        <td className="p-2 border border-emerald-200">المدفوع:</td>
                        <td className="p-2 border border-emerald-200 font-mono text-left">{totalPaid.toLocaleString()} ج.م</td>
                      </tr>
                    )}
                    <tr className="due-box bg-rose-700 text-white font-black text-sm">
                      <td className="p-2.5 border border-rose-800">المبلغ المتبقي المطلوب سداده:</td>
                      <td className="p-2.5 border border-rose-800 font-mono text-left">{totalRemaining.toLocaleString()} ج.م</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Signatures & Stamps */}
            <div className="invoice-stamp-footer flex justify-center items-center pt-4 border-t border-dashed border-slate-300 mt-5 text-xs font-bold text-slate-700">
              <div className="text-center">
                <span>ختم مكتب النقل</span>
                <div className="transport-stamp">ختم مكتب النقل</div>
              </div>
            </div>

            <div className="footer-note text-center text-[10px] text-slate-400 mt-6 pt-3 border-t border-slate-100">
              فاتورة رسمية صادرة بتاريخ {invoiceDate}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
