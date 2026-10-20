import React, { useState } from 'react';
import { Movement } from '../types';
import { X, Printer, Building2, Truck, Calendar, Hash, FileText, CheckCircle2 } from 'lucide-react';

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
  const [placeName, setPlaceName] = useState(defaultPlaceName);
  const [invoiceNo] = useState(`INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
  const [invoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('المبلغ المستحق عن الشحنات الموضحة بالجدول أعلاه.');

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
  const grandTotal = movements.reduce((s, m) => s + (Number(m.total_amount) || 0), 0);
  const totalPaid = movements.reduce((s, m) => s + (Number(m.paid_amount) || 0), 0);
  const totalRemaining = movements.reduce((s, m) => s + (Number(m.remaining_amount) || 0), 0);

  // Distinct truck plates
  const truckPlates = Array.from(new Set(movements.map((m) => m.truck_no).filter(Boolean))).join(' ، ');
  const trailerPlates = Array.from(new Set(movements.map((m) => m.trailer_no).filter(Boolean))).join(' ، ');
  const berths = Array.from(new Set(movements.map((m) => m.berth_name).filter(Boolean))).join(' ، ');

  const handlePrint = () => {
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
          @page { size: A4 portrait; margin: 10mm; }
          * { box-sizing: border-box; }
          body {
            font-family: system-ui, -apple-system, 'Segoe UI', Tahoma, Arial, sans-serif;
            direction: rtl;
            text-align: right;
            color: #0f172a;
            margin: 0;
            padding: 15px;
            font-size: 12px;
          }
          .header-box {
            border-bottom: 2px solid #0f172a;
            padding-bottom: 12px;
            margin-bottom: 15px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .title { font-size: 20px; font-weight: 900; margin: 0 0 4px 0; color: #1e3a8a; }
          .subtitle { font-size: 13px; font-weight: bold; color: #475569; margin: 0; }
          .meta-box {
            background-color: #f1f5f9;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            padding: 10px;
            margin-bottom: 15px;
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
            font-size: 12px;
          }
          .meta-item { display: flex; flex-direction: column; }
          .meta-label { color: #64748b; font-size: 10px; font-weight: bold; }
          .meta-val { font-weight: bold; color: #0f172a; margin-top: 2px; }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 15px;
            font-size: 11px;
          }
          th {
            background-color: #0f172a;
            color: white;
            padding: 7px 5px;
            border: 1px solid #334155;
            text-align: center;
          }
          td {
            padding: 6px 5px;
            border: 1px solid #cbd5e1;
            text-align: center;
          }
          tr:nth-child(even) { background-color: #f8fafc; }
          .totals-table {
            width: 50%;
            margin-right: auto;
            border-collapse: collapse;
            margin-bottom: 20px;
            font-size: 12px;
          }
          .totals-table td { padding: 6px 10px; border: 1px solid #94a3b8; }
          .totals-table .highlight { background-color: #1e3a8a; color: white; font-weight: 900; font-size: 14px; }
          .totals-table .due-box { background-color: #be123c; color: white; font-weight: 900; font-size: 14px; }
          .signatures {
            display: flex;
            justify-content: space-between;
            margin-top: 35px;
            padding-top: 20px;
            border-top: 1px dashed #94a3b8;
          }
          .sign-col { text-align: center; width: 30%; font-size: 12px; font-weight: bold; }
          .sign-line { margin-top: 45px; border-top: 1px solid #64748b; }
          .footer-note { text-align: center; font-size: 10px; color: #64748b; margin-top: 25px; }
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
              onClick={handlePrint}
              className="bg-orange-600 hover:bg-orange-700 text-white text-xs font-black px-4 py-2 rounded-lg shadow-sm flex items-center gap-1.5 transition"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة الفاتورة الآن</span>
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
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
            className="bg-white rounded-xl p-6 sm:p-8 shadow-sm border border-slate-200 max-w-3xl mx-auto text-right text-slate-900"
          >
            {/* Invoice Header */}
            <div className="header-box border-b-2 border-slate-900 pb-4 mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h1 className="title text-xl font-black text-blue-900">{placeName}</h1>
                <p className="subtitle text-xs font-bold text-slate-600 mt-1">
                  إدارة الحركة والتشغيل — فاتورة ومطالبة مجمعة لحساب سائق
                </p>
                {berths && (
                  <p className="text-[11px] text-slate-500 mt-0.5">الرصيف: {berths}</p>
                )}
              </div>
              <div className="text-left sm:text-left bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs">
                <div className="font-mono font-black text-slate-900">{invoiceNo}</div>
                <div className="text-slate-500 text-[11px] mt-0.5">التاريخ: {invoiceDate}</div>
              </div>
            </div>

            {/* Meta Information Cards */}
            <div className="meta-box bg-slate-50 border border-slate-200 rounded-lg p-3.5 mb-5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="meta-item">
                <span className="meta-label text-[11px] font-bold text-slate-500">اسم السائق:</span>
                <span className="meta-val font-black text-slate-900 text-sm mt-0.5">{driverName}</span>
              </div>
              <div className="meta-item">
                <span className="meta-label text-[11px] font-bold text-slate-500">عدد الشحنات:</span>
                <span className="meta-val font-bold text-blue-800 mt-0.5">{movements.length} حركة / حاوية</span>
              </div>
              <div className="meta-item">
                <span className="meta-label text-[11px] font-bold text-slate-500">رقم الشاحنة:</span>
                <span className="meta-val font-mono font-bold text-slate-800 mt-0.5">{truckPlates || '-'}</span>
              </div>
              <div className="meta-item">
                <span className="meta-label text-[11px] font-bold text-slate-500">رقم المقطورة:</span>
                <span className="meta-val font-mono font-bold text-slate-800 mt-0.5">{trailerPlates || '-'}</span>
              </div>
            </div>

            {/* Detailed Movements Table */}
            <div className="overflow-x-auto mb-5">
              <table className="w-full text-xs text-right border-collapse border border-slate-300">
                <thead className="bg-slate-900 text-white font-bold text-[11px]">
                  <tr>
                    <th className="p-2 border border-slate-700 text-center w-8">م</th>
                    <th className="p-2 border border-slate-700">رقم الحاوية</th>
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
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
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
            <div className="signatures flex justify-between items-center pt-8 border-t border-dashed border-slate-300 mt-6 text-xs font-bold text-slate-700">
              <div className="sign-col text-center w-1/3">
                <span>توقيع السائق / المستلم</span>
                <div className="sign-line mt-10 border-t border-slate-400 w-32 mx-auto"></div>
              </div>
              <div className="sign-col text-center w-1/3">
                <span>المحاسب المختص</span>
                <div className="sign-line mt-10 border-t border-slate-400 w-32 mx-auto"></div>
              </div>
              <div className="sign-col text-center w-1/3">
                <span>اعتماد مدير المحطة / الختم</span>
                <div className="sign-line mt-10 border-t border-slate-400 w-32 mx-auto"></div>
              </div>
            </div>

            <div className="footer-note text-center text-[10px] text-slate-400 mt-6 pt-3 border-t border-slate-100">
              منظومة الميناء اللوجستية لإدارة الشاحنات والحاويات • فاتورة رسمية صادرة بتاريخ {invoiceDate}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
