import React from 'react';
import { Movement } from '../types';
import { X, Printer, Download, FileSpreadsheet, Check } from 'lucide-react';
import { exportTemplateToExcel } from '../lib/excelUtils';

interface OfficialSheetPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  movements: Movement[];
  title?: string;
  berthName?: string;
}

export const OfficialSheetPrintModal: React.FC<OfficialSheetPrintModalProps> = ({
  isOpen,
  onClose,
  movements,
  title = 'كشف حركات الشاحنات والحاويات المجمع (الاسطمبة الرسمية المعتمدة)',
  berthName,
}) => {
  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleExportPdf = async () => {
    const { exportMovementsToOfficialPdf } = await import('../lib/pdfExport');
    await exportMovementsToOfficialPdf(movements, title, berthName);
  };

  const handleExportExcel = () => {
    exportTemplateToExcel(
      movements,
      `كشف_الحركات_المجمع_للمكتب_${new Date().toISOString().split('T')[0]}.xlsx`
    );
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      {/* Print isolation style: Only print the clean 12-column manifest */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #official-clean-manifest-print-zone, #official-clean-manifest-print-zone * {
            visibility: visible !important;
          }
          #official-clean-manifest-print-zone {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 10mm !important;
            background: white !important;
            box-shadow: none !important;
            border: none !important;
          }
          @page {
            size: landscape;
            margin: 8mm;
          }
        }
      `}</style>

      <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full overflow-hidden border border-slate-300 flex flex-col max-h-[95vh]">
        {/* Modal Controls (Hidden in Print) */}
        <div className="bg-slate-900 text-white px-6 py-4 flex flex-wrap items-center justify-between gap-3 no-print">
          <div>
            <h2 className="text-base font-bold flex items-center gap-2">
              <Printer className="w-5 h-5 text-emerald-400" />
              <span>معاينة وطباعة الكشف المجمع للمكتب (خالٍ تماماً من العمولات والمبالغ)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              الاسطمبة الرسمية المعتمدة بـ 12 عموداً فقط لتقديمها لمكتب الميناء لإنهاء الإجراءات والمحاسبة
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black px-4 py-2 rounded-lg shadow-md transition flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة الكشف الآن</span>
            </button>

            <button
              onClick={handleExportPdf}
              className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-3.5 py-2 rounded-lg transition flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" />
              <span>تحميل PDF</span>
            </button>

            <button
              onClick={handleExportExcel}
              className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold px-3.5 py-2 rounded-lg transition flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>تصدير Excel</span>
            </button>

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition mr-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Paper View */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-100/60 print:bg-white print:p-0">
          <div
            id="official-clean-manifest-print-zone"
            className="bg-white p-6 sm:p-8 rounded-xl shadow-sm border border-slate-200 print:border-none print:shadow-none max-w-5xl mx-auto text-slate-900 font-sans"
          >
            {/* Official Sheet Header */}
            <div className="border-b-2 border-slate-900 pb-4 mb-4 text-center">
              <div className="flex items-center justify-between text-xs text-slate-600 mb-2">
                <div className="text-right">
                  <p className="font-bold text-slate-900 text-sm">منظومة VIB اللوجستية</p>
                  <p>إدارة وتشغيل حركة الشاحنات والحاويات بالميناء</p>
                </div>
                <div className="text-center">
                  <span className="inline-block bg-slate-900 text-white font-bold text-sm px-4 py-1.5 rounded-lg shadow-sm">
                    {title}
                  </span>
                  {berthName && (
                    <p className="font-bold text-slate-800 mt-1 text-xs">
                      الرصيف / المحطة: {berthName}
                    </p>
                  )}
                </div>
                <div className="text-left text-xs text-slate-600">
                  <p>تاريخ الاستخراج: {new Date().toLocaleDateString('ar-EG')}</p>
                  <p className="font-bold text-slate-900">إجمالي الحركات: {movements.length} حركة</p>
                </div>
              </div>
            </div>

            {/* Exact 12-Column Table (NO COMMISSIONS, NO NAFEZ, NO TOTALS, NO CASHIER) */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right border-collapse border border-slate-800">
                <thead>
                  <tr className="bg-slate-900 text-white text-center font-bold">
                    <th className="p-2 border border-slate-700 w-10">م</th>
                    <th className="p-2 border border-slate-700 whitespace-nowrap">رقم الشاحنة</th>
                    <th className="p-2 border border-slate-700 whitespace-nowrap text-[11px]">
                      وزن الشاحنة
                      <span className="block text-[9px] font-normal opacity-80">من واقع الرخصة</span>
                    </th>
                    <th className="p-2 border border-slate-700 whitespace-nowrap text-[11px]">محاور الشاحنة</th>
                    <th className="p-2 border border-slate-700 whitespace-nowrap">رقم المقطورة</th>
                    <th className="p-2 border border-slate-700 whitespace-nowrap text-[11px]">
                      وزن المقطورة
                      <span className="block text-[9px] font-normal opacity-80">من واقع الرخصة</span>
                    </th>
                    <th className="p-2 border border-slate-700 whitespace-nowrap text-[11px]">محاور المقطورة</th>
                    <th className="p-2 border border-slate-700 whitespace-nowrap min-w-[130px]">اسم السائق</th>
                    <th className="p-2 border border-slate-700 whitespace-nowrap">رقم الاقرار</th>
                    <th className="p-2 border border-slate-700 whitespace-nowrap font-mono">رقم الحاوية</th>
                    <th className="p-2 border border-slate-700 whitespace-nowrap">وصف الحاوية</th>
                    <th className="p-2 border border-slate-700 whitespace-nowrap">مسار الحاوية</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300 bg-white">
                  {movements.map((m, index) => (
                    <tr
                      key={m.id || index}
                      className="border-b border-slate-300 hover:bg-slate-50 transition"
                    >
                      <td className="p-2 border border-slate-300 text-center font-bold text-blue-900 bg-slate-50/50">
                        {m.seq || index + 1}
                      </td>
                      <td className="p-2 border border-slate-300 font-bold text-slate-900 text-center whitespace-nowrap">
                        {m.truck_no || '-'}
                      </td>
                      <td className="p-2 border border-slate-300 text-center font-mono font-semibold">
                        {m.truck_weight ?? 7.5}
                      </td>
                      <td className="p-2 border border-slate-300 text-center font-mono font-semibold">
                        {m.truck_axles ?? 20}
                      </td>
                      <td className="p-2 border border-slate-300 text-center whitespace-nowrap">
                        {m.trailer_no || '-'}
                      </td>
                      <td className="p-2 border border-slate-300 text-center font-mono font-semibold">
                        {m.trailer_weight ?? 11.5}
                      </td>
                      <td className="p-2 border border-slate-300 text-center font-mono font-semibold">
                        {m.trailer_axles ?? 30}
                      </td>
                      <td className="p-2 border border-slate-300 font-semibold text-slate-800">
                        {m.driver_name || '-'}
                      </td>
                      <td className="p-2 border border-slate-300 text-center font-mono">
                        {m.declaration_no || '-'}
                      </td>
                      <td className="p-2 border border-slate-300 text-center font-mono font-bold text-blue-800">
                        {m.container_no || '-'}
                      </td>
                      <td className="p-2 border border-slate-300 text-center">
                        {m.container_desc || '-'}
                      </td>
                      <td className="p-2 border border-slate-300 text-center">
                        {m.container_path || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Official Signatures & Stamp Footer */}
            <div className="mt-8 pt-6 border-t border-dashed border-slate-300 grid grid-cols-3 gap-4 text-center text-xs text-slate-700">
              <div>
                <p className="font-bold">توقيع مسؤول الحركة والتشغيل</p>
                <div className="mt-10 border-b border-slate-400 w-36 mx-auto"></div>
              </div>
              <div>
                <p className="font-bold">ختم المحطة / المنظومة</p>
                <div className="mt-3 w-24 h-14 border border-dashed border-slate-400 rounded-lg mx-auto flex items-center justify-center text-[10px] text-slate-400">
                  ختم رسمي
                </div>
              </div>
              <div>
                <p className="font-bold">توقيع مستلم الكشف (مكتب الميناء)</p>
                <div className="mt-10 border-b border-slate-400 w-36 mx-auto"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
