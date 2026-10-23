import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Movement, PaymentReceipt } from '../types';
import vibLogoUrl from '../assets/vib-logo.jpeg';

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character] as string));

const addCanvasAsPdfPages = (pdf: jsPDF, canvas: HTMLCanvasElement, margin = 5) => {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  const contentHeight = pageHeight - margin * 2;
  const pixelsPerMm = canvas.width / contentWidth;
  const pagePixelHeight = Math.max(1, Math.floor(contentHeight * pixelsPerMm));

  for (let top = 0; top < canvas.height; top += pagePixelHeight) {
    const sliceHeight = Math.min(pagePixelHeight, canvas.height - top);
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceHeight;
    const context = pageCanvas.getContext('2d');
    if (!context) throw new Error('تعذر تجهيز صفحة PDF في المتصفح.');

    context.drawImage(canvas, 0, top, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
    if (top > 0) pdf.addPage();
    pdf.addImage(
      pageCanvas.toDataURL('image/jpeg', 0.92),
      'JPEG',
      margin,
      margin,
      contentWidth,
      sliceHeight / pixelsPerMm,
      undefined,
      'FAST',
    );
  }
};

/**
 * Exports the official 12-column port logistics movement sheet as a downloadable PDF.
 * This sheet is clean and does NOT include financial columns (system commission, nafez, cashier, etc.),
 * exactly formatted for submission to the port operations / customs clearance office.
 */
export async function exportMovementsToOfficialPdf(
  movements: Movement[],
  title: string = 'كشف حركات الشاحنات والحاويات - ميناء التفريغ والشحن',
  berthName?: string
): Promise<void> {
  if (!movements || movements.length === 0) {
    alert('لا توجد حركات لتصديرها كملف PDF');
    return;
  }

  // Create an off-screen container styled for high-resolution A4 landscape printing
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '1200px';
  container.style.padding = '30px';
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#0f172a';
  container.style.fontFamily = "'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif";
  container.style.direction = 'rtl';

  const dateStr = new Date().toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const tableRows = movements
    .map(
      (m, idx) => `
    <tr style="border-bottom: 1px solid #cbd5e1; background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
      <td style="padding: 7px 6px; border: 1px solid #94a3b8; text-align: center; font-weight: bold; color: #1e3a8a;">${idx + 1}</td>
      <td style="padding: 7px 6px; border: 1px solid #94a3b8; font-weight: bold; text-align: center; color: #0f172a;">${escapeHtml(m.truck_no || '-')}</td>
      <td style="padding: 7px 6px; border: 1px solid #94a3b8; text-align: center;">${m.truck_weight ?? 7.5}</td>
      <td style="padding: 7px 6px; border: 1px solid #94a3b8; text-align: center;">${m.truck_axles ?? 20}</td>
      <td style="padding: 7px 6px; border: 1px solid #94a3b8; text-align: center;">${escapeHtml(m.trailer_no || '-')}</td>
      <td style="padding: 7px 6px; border: 1px solid #94a3b8; text-align: center;">${m.trailer_weight ?? 11.5}</td>
      <td style="padding: 7px 6px; border: 1px solid #94a3b8; text-align: center;">${m.trailer_axles ?? 30}</td>
      <td style="padding: 7px 8px; border: 1px solid #94a3b8; font-weight: 600; color: #1e293b;">${escapeHtml(m.driver_name || '-')}</td>
      <td style="padding: 7px 6px; border: 1px solid #94a3b8; text-align: center; font-family: monospace; font-size: 11px;">${escapeHtml(m.declaration_no || '-')}</td>
      <td style="padding: 7px 6px; border: 1px solid #94a3b8; text-align: center; font-family: monospace; font-weight: bold; color: #1d4ed8; font-size: 11px;">${escapeHtml(m.container_no || '-')}</td>
      <td style="padding: 7px 6px; border: 1px solid #94a3b8; text-align: center; font-size: 11px;">${escapeHtml(m.container_desc || '-')}</td>
      <td style="padding: 7px 6px; border: 1px solid #94a3b8; text-align: center; font-size: 11px;">${escapeHtml(m.container_path || '-')}</td>
    </tr>
  `
    )
    .join('');

  container.innerHTML = `
    <div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 15px; margin-bottom: 18px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <img src="${vibLogoUrl}" alt="شعار VIB" style="width:148px;height:118px;object-fit:contain;flex:none;" />
        <div style="text-align: center;">
          <span style="display: inline-block; background-color: #0f172a; color: #ffffff; padding: 6px 18px; border-radius: 8px; font-size: 14px; font-weight: bold;">
            ${escapeHtml(title)}
          </span>
          ${berthName ? `<p style="font-size: 12px; color: #334155; margin: 4px 0 0 0; font-weight: bold;">الرصيف: ${escapeHtml(berthName)}</p>` : ''}
        </div>
        <div style="text-align: left; font-size: 11px; color: #475569;">
          <p style="margin: 0;"><strong>تاريخ الاستخراج:</strong> ${dateStr}</p>
          <p style="margin: 3px 0 0 0;"><strong>إجمالي الحركات:</strong> ${movements.length} حركة</p>
        </div>
      </div>
    </div>

    <table style="width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 10px; border: 1.5px solid #0f172a; text-align: right; overflow-wrap:anywhere;word-break:break-word;">
      <thead>
        <tr style="background-color: #0f172a; color: #ffffff; text-align: center;">
          <th style="padding: 8px 4px; border: 1px solid #334155; width: 35px;">م</th>
          <th style="padding: 8px 6px; border: 1px solid #334155; white-space: nowrap;">رقم الشاحنة</th>
          <th style="padding: 8px 4px; border: 1px solid #334155; white-space: nowrap; font-size: 10.5px;">وزن الشاحنة<br><span style="font-size: 9px; opacity: 0.85;">(الرخصة)</span></th>
          <th style="padding: 8px 4px; border: 1px solid #334155; white-space: nowrap; font-size: 10.5px;">محاور الشاحنة</th>
          <th style="padding: 8px 6px; border: 1px solid #334155; white-space: nowrap;">رقم المقطورة</th>
          <th style="padding: 8px 4px; border: 1px solid #334155; white-space: nowrap; font-size: 10.5px;">وزن المقطورة<br><span style="font-size: 9px; opacity: 0.85;">(الرخصة)</span></th>
          <th style="padding: 8px 4px; border: 1px solid #334155; white-space: nowrap; font-size: 10.5px;">محاور المقطورة</th>
          <th style="padding: 8px 8px; border: 1px solid #334155; white-space: nowrap; min-width: 130px;">اسم السائق</th>
          <th style="padding: 8px 6px; border: 1px solid #334155; white-space: nowrap;">رقم الاقرار</th>
          <th style="padding: 8px 6px; border: 1px solid #334155; white-space: nowrap;">رقم الحاوية</th>
          <th style="padding: 8px 6px; border: 1px solid #334155; white-space: nowrap;">وصف الحاوية</th>
          <th style="padding: 8px 6px; border: 1px solid #334155; white-space: nowrap;">مسار الحاوية</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>

    <div style="margin-top: 25px; display: flex; justify-content: space-between; align-items: flex-end; padding-top: 15px; border-top: 1px dashed #cbd5e1; font-size: 12px; color: #475569;">
      <div>
        <p style="margin: 0; font-weight: bold;">توقيع واعتماد مسؤول الحركة:</p>
        <p style="margin-top: 35px; border-bottom: 1px solid #94a3b8; width: 180px;"></p>
      </div>
      <div style="text-align: center;">
        <p style="margin: 0; font-weight: bold;">ختم المحطة / المكتب:</p>
        <div style="margin-top: 10px; width: 90px; height: 50px; border: 1px dashed #94a3b8; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 10px;">
          ختم رسمي
        </div>
      </div>
      <div style="text-align: left;">
        <p style="margin: 0; font-weight: bold;">توقيع مستلم الكشف (مكتب التخليص):</p>
        <p style="margin-top: 35px; border-bottom: 1px solid #94a3b8; width: 180px;"></p>
      </div>
    </div>
  `;

  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 1.25,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      // Tailwind v4 emits OKLCH colors, which html2canvas cannot parse.
      // The export markup is fully styled inline, so strip app stylesheets
      // from the cloned document before html2canvas reads its CSS rules.
      onclone: (clonedDocument) => {
        clonedDocument.querySelectorAll('style, link[rel="stylesheet"]').forEach((stylesheet) => stylesheet.remove());
      },
    });

    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    addCanvasAsPdfPages(pdf, canvas);

    const cleanFileName = `كشف_حركات_${new Date().toISOString().split('T')[0]}_${movements.length}_حركة.pdf`;
    pdf.save(cleanFileName);
  } catch (error) {
    console.error('Error exporting PDF:', error);
    const details = error instanceof Error ? error.message : String(error);
    alert(`تعذر إنشاء ملف PDF. ${details}`);
  } finally {
    document.body.removeChild(container);
  }
}

/**
 * Exports a comprehensive customer statement & billing invoice as a downloadable PDF.
 * Consolidates all shipments and trucks for this customer with cashier amounts, commissions, discounts, and net balance.
 */
export async function exportCustomerStatementPdf(
  customerName: string,
  movements: Movement[],
  totals: {
    cashierTotal: number;
    systemCommTotal: number;
    nafezCommTotal: number;
    discountTotal: number;
    totalAmount: number;
    paidTotal: number;
    remainingTotal: number;
  },
  placeName: string = 'محطة تشغيل وتفريغ الحاويات والشاحنات - إدارة الحركة',
  paymentReceipts: PaymentReceipt[] = [],
): Promise<void> {
  if (!movements || movements.length === 0) {
    alert('لا توجد شحنات لتصدير فاتورة هذا العميل');
    return;
  }

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '1200px';
  container.style.padding = '24px';
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#0f172a';
  container.style.fontFamily = "'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif";
  container.style.direction = 'rtl';

  const dateStr = new Date().toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const truckPlates = Array.from(new Set(movements.map((m) => m.truck_no).filter(Boolean))).join(' ، ');
  const paymentRowsHtml = paymentReceipts.map((payment, idx) => `
    <tr style="background-color:${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
      <td style="padding:6px;border:1px solid #cbd5e1;text-align:center;direction:ltr;unicode-bidi:plaintext;">${escapeHtml(payment.receipt_no || '-')}</td>
      <td style="padding:6px;border:1px solid #cbd5e1;text-align:center;">${escapeHtml(payment.date || '-')}</td>
      <td style="padding:6px;border:1px solid #cbd5e1;text-align:center;">${payment.payment_method === 'cash' ? 'نقدي' : payment.payment_method === 'bank_transfer' ? 'تحويل بنكي' : payment.payment_method === 'check' ? 'شيك' : 'أخرى'}</td>
      <td style="padding:6px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;color:#047857;">${(Number(payment.amount) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م</td>
      <td style="padding:6px;border:1px solid #cbd5e1;">${escapeHtml(payment.notes || '-')}</td>
    </tr>
  `).join('');

  const rowsHtml = movements
    .map(
      (m, idx) => `
    <tr style="border-bottom: 1px solid #e2e8f0; background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
      <td style="padding: 6px 4px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: #1e3a8a;">${idx + 1}</td>
      <td style="padding: 8px 6px; border: 1px solid #cbd5e1; font-family: monospace; font-weight: bold; color: #1d4ed8;">${escapeHtml(m.container_no || '-')}</td>
      <td style="padding: 8px 6px; border: 1px solid #cbd5e1; text-align: center; font-family: monospace;">${escapeHtml(m.declaration_no || '-')}</td>
      <td style="padding: 8px 6px; border: 1px solid #cbd5e1; font-weight: 600; text-align: center; direction:ltr; unicode-bidi:plaintext;">${escapeHtml(m.truck_no || '-')}</td>
      <td style="padding: 8px 6px; border: 1px solid #cbd5e1; text-align: center; font-size: 12px;">${escapeHtml(m.movement_date || '-')}</td>
      <td style="padding: 8px 6px; border: 1px solid #cbd5e1; text-align: center; font-family: monospace; font-size: 11px; color: #4338ca; direction:ltr; unicode-bidi:plaintext; overflow-wrap:anywhere;">${escapeHtml(m.cashier_receipt_no || '-')}</td>
      <td style="padding: 8px 6px; border: 1px solid #cbd5e1; text-align: center; font-family: monospace; font-weight: bold;">${(Number(m.cashier_invoice) || 0).toLocaleString('en-US')}</td>
      <td style="padding: 8px 6px; border: 1px solid #cbd5e1; text-align: center; font-family: monospace; color: #1d4ed8;">${(Number(m.system_commission) || 0).toLocaleString('en-US')}</td>
      <td style="padding: 8px 6px; border: 1px solid #cbd5e1; text-align: center; font-family: monospace; color: #0f766e;">${(Number(m.nafez_commission) || 0).toLocaleString('en-US')}</td>
      <td style="padding: 8px 6px; border: 1px solid #cbd5e1; text-align: center; font-family: monospace; color: ${m.discount ? '#e11d48' : '#64748b'};">${m.discount ? `${Number(m.discount).toLocaleString('en-US')}-` : '0'}</td>
      <td style="padding: 8px 6px; border: 1px solid #cbd5e1; text-align: center; font-family: monospace; font-weight: 900; background-color: #eff6ff;">${(Number(m.total_amount) || 0).toLocaleString('en-US')} ج.م</td>
    </tr>
  `
    )
    .join('');

  container.innerHTML = `
    <div style="border-bottom: 2px solid #1e3a8a; padding-bottom: 12px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center; gap: 16px;">
      <img src="${vibLogoUrl}" alt="شعار VIB" style="width:150px;height:120px;object-fit:contain;flex:none;" />
      <div style="text-align: center;">
        <span style="display: inline-block; background-color: #1e3a8a; color: #ffffff; padding: 6px 20px; border-radius: 8px; font-size: 14px; font-weight: bold;">
          فاتورة ومطالبة حساب عميل / سائق
        </span>
        <p style="font-size: 11px; color: #475569; margin: 4px 0 0 0;">${escapeHtml(placeName)}</p>
      </div>
      <div style="text-align: left; font-size: 11px; color: #475569;">
        <p style="margin: 0;"><strong>تاريخ الفاتورة:</strong> ${dateStr}</p>
        <p style="margin: 3px 0 0 0;"><strong>عدد الشحنات:</strong> ${movements.length} شحنة</p>
      </div>
    </div>

    <!-- Customer Info Card -->
    <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; margin-bottom: 15px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; font-size: 12px;">
      <div>
        <span style="color: #64748b; font-size: 10px; font-weight: bold; display: block;">اسم العميل / السائق:</span>
        <strong style="font-size: 14px; color: #0f172a;">${escapeHtml(customerName)}</strong>
      </div>
      <div>
        <span style="color: #64748b; font-size: 10px; font-weight: bold; display: block;">الشاحنات المنفذة:</span>
        <span style="color: #334155; font-size: 11px;">${escapeHtml(truckPlates || 'غير محدد')}</span>
      </div>
      <div>
        <span style="color: #64748b; font-size: 10px; font-weight: bold; display: block;">حالة الحساب:</span>
        <strong style="color: ${totals.remainingTotal === 0 ? '#16a34a' : '#e11d48'};">
          ${totals.remainingTotal === 0 ? 'مسدد بالكامل ✓' : `متبقي مطلوب سداده: ${totals.remainingTotal.toLocaleString()} ج.م`}
        </strong>
      </div>
    </div>

    <!-- Movements Table -->
    <table style="width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 10px; border: 1px solid #cbd5e1; text-align: right; margin-bottom: 15px; overflow-wrap:anywhere;word-break:break-word;">
      <thead>
        <tr style="background-color: #0f172a; color: #ffffff; text-align: center;">
          <th style="padding: 7px 4px; border: 1px solid #334155; width: 30px;">م</th>
          <th style="padding: 8px 5px; border: 1px solid #334155; width: 16%;">رقم الحاوية</th>
          <th style="padding: 8px 5px; border: 1px solid #334155; width: 8%;">رقم الإقرار</th>
          <th style="padding: 8px 5px; border: 1px solid #334155; width: 11%;">رقم الشاحنة</th>
          <th style="padding: 7px 6px; border: 1px solid #334155;">التاريخ</th>
          <th style="padding: 8px 5px; border: 1px solid #334155; width: 14%;">مسلسل الكاشير</th>
          <th style="padding: 7px 6px; border: 1px solid #334155;">الكاشير (الميناء)</th>
          <th style="padding: 7px 6px; border: 1px solid #334155;">العمولة</th>
          <th style="padding: 7px 6px; border: 1px solid #334155;">نافذ</th>
          <th style="padding: 7px 6px; border: 1px solid #334155;">الخصم</th>
          <th style="padding: 7px 6px; border: 1px solid #334155; background-color: #1e3a8a;">الإجمالي</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    ${paymentReceipts.length > 0 ? `
      <div style="margin:10px 0 15px;">
        <h3 style="font-size:13px;color:#0f172a;margin:0 0 6px;">سجل الدفعات الجزئية وسندات القبض</h3>
        <table style="width:100%;border-collapse:collapse;font-size:11px;text-align:right;">
          <thead><tr style="background:#0f172a;color:#fff;">
            <th style="padding:6px;border:1px solid #334155;">رقم السند</th>
            <th style="padding:6px;border:1px solid #334155;">التاريخ</th>
            <th style="padding:6px;border:1px solid #334155;">طريقة الدفع</th>
            <th style="padding:6px;border:1px solid #334155;">مبلغ الدفعة</th>
            <th style="padding:6px;border:1px solid #334155;">ملاحظات</th>
          </tr></thead>
          <tbody>${paymentRowsHtml}</tbody>
        </table>
      </div>
    ` : ''}

    <!-- Totals Breakdown Box -->
    <div style="background-color: #f1f5f9; border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 12px; margin-top: 10px;">
      <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; text-align: center; font-size: 12px;">
        <div style="background: #ffffff; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0;">
          <span style="font-size: 10px; color: #64748b; display: block;">إجمالي فواتير الكاشير</span>
          <strong style="font-size: 13px; color: #0f172a;">${totals.cashierTotal.toLocaleString()} ج.م</strong>
        </div>
        <div style="background: #ffffff; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0;">
          <span style="font-size: 10px; color: #64748b; display: block;">إجمالي عمولة المنظومة</span>
          <strong style="font-size: 13px; color: #1e3a8a;">${totals.systemCommTotal.toLocaleString()} ج.م</strong>
        </div>
        <div style="background: #ffffff; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0;">
          <span style="font-size: 10px; color: #64748b; display: block;">إجمالي رسوم نافذ</span>
          <strong style="font-size: 13px; color: #0f766e;">${totals.nafezCommTotal.toLocaleString()} ج.م</strong>
        </div>
        <div style="background: #ffffff; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0;">
          <span style="font-size: 10px; color: #64748b; display: block;">إجمالي الخصم الممنوح</span>
          <strong style="font-size: 13px; color: #e11d48;">${totals.discountTotal ? totals.discountTotal.toLocaleString() : '0'} ج.م</strong>
        </div>
        <div style="background: #1e3a8a; color: #ffffff; padding: 8px; border-radius: 6px;">
          <span style="font-size: 10px; opacity: 0.9; display: block;">الصافي المطلوب سداده</span>
          <strong style="font-size: 14px; font-weight: 900;">${totals.totalAmount.toLocaleString()} ج.م</strong>
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; padding-top: 8px; border-top: 1px dashed #cbd5e1; font-size: 11px;">
        <span><strong>المدفوع والمسدد:</strong> ${totals.paidTotal.toLocaleString()} ج.م</span>
        <span style="font-size: 12px; font-weight: 900; color: ${totals.remainingTotal === 0 ? '#16a34a' : '#b91c1c'};">
          ${totals.remainingTotal === 0 ? '✓ تم سداد كامل المبلغ ولا توجد مديونية' : `المتبقي للتحصيل: ${totals.remainingTotal.toLocaleString()} ج.م`}
        </span>
      </div>
    </div>

    <!-- Signatures and Stamp Footer -->
    <div style="margin-top: 30px; display: flex; justify-content: space-between; align-items: flex-end; padding-top: 15px; border-top: 1px dashed #cbd5e1; font-size: 11px; color: #475569;">
      <div>
        <p style="margin: 0; font-weight: bold;">توقيع المحاسب / مسؤول الإدارة:</p>
        <p style="margin-top: 30px; border-bottom: 1px solid #94a3b8; width: 160px;"></p>
      </div>
      <div style="text-align: center;">
        <p style="margin: 0; font-weight: bold;">ختم المنظومة:</p>
        <div style="margin-top: 8px; width: 80px; height: 45px; border: 1px dashed #94a3b8; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 9px;">
          ختم رسمي
        </div>
      </div>
      <div style="text-align: left;">
        <p style="margin: 0; font-weight: bold;">توقيع واستلام العميل / السائق:</p>
        <p style="margin-top: 30px; border-bottom: 1px solid #94a3b8; width: 160px;"></p>
      </div>
    </div>
  `;

  document.body.appendChild(container);

  try {
    await Promise.all(Array.from(container.querySelectorAll('img')).map((image) => image.decode().catch(() => undefined)));
    const canvas = await html2canvas(container, {
      scale: 1.25,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      // Tailwind v4 emits OKLCH colors, which html2canvas cannot parse.
      // The export markup is fully styled inline, so strip app stylesheets
      // from the cloned document before html2canvas reads its CSS rules.
      onclone: (clonedDocument) => {
        clonedDocument.querySelectorAll('style, link[rel="stylesheet"]').forEach((stylesheet) => stylesheet.remove());
      },
    });

    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    addCanvasAsPdfPages(pdf, canvas);

    const safeName = customerName.replace(/[^ء-يa-zA-Z0-9_-]/g, '_');
    pdf.save(`فاتورة_حساب_${safeName}_${new Date().toISOString().split('T')[0]}.pdf`);
  } catch (error) {
    console.error('Error exporting customer PDF:', error);
    const details = error instanceof Error ? error.message : String(error);
    alert(`تعذر تنزيل فاتورة العميل PDF. ${details}`);
  } finally {
    document.body.removeChild(container);
  }
}
