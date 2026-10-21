import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Movement } from '../types';

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
      <td style="padding: 7px 6px; border: 1px solid #94a3b8; text-align: center; font-weight: bold; color: #1e3a8a;">${m.seq || idx + 1}</td>
      <td style="padding: 7px 6px; border: 1px solid #94a3b8; font-weight: bold; text-align: center; color: #0f172a;">${m.truck_no || '-'}</td>
      <td style="padding: 7px 6px; border: 1px solid #94a3b8; text-align: center;">${m.truck_weight ?? 7.5}</td>
      <td style="padding: 7px 6px; border: 1px solid #94a3b8; text-align: center;">${m.truck_axles ?? 20}</td>
      <td style="padding: 7px 6px; border: 1px solid #94a3b8; text-align: center;">${m.trailer_no || '-'}</td>
      <td style="padding: 7px 6px; border: 1px solid #94a3b8; text-align: center;">${m.trailer_weight ?? 11.5}</td>
      <td style="padding: 7px 6px; border: 1px solid #94a3b8; text-align: center;">${m.trailer_axles ?? 30}</td>
      <td style="padding: 7px 8px; border: 1px solid #94a3b8; font-weight: 600; color: #1e293b;">${m.driver_name || '-'}</td>
      <td style="padding: 7px 6px; border: 1px solid #94a3b8; text-align: center; font-family: monospace; font-size: 11px;">${m.declaration_no || '-'}</td>
      <td style="padding: 7px 6px; border: 1px solid #94a3b8; text-align: center; font-family: monospace; font-weight: bold; color: #1d4ed8; font-size: 11px;">${m.container_no || '-'}</td>
      <td style="padding: 7px 6px; border: 1px solid #94a3b8; text-align: center; font-size: 11px;">${m.container_desc || '-'}</td>
      <td style="padding: 7px 6px; border: 1px solid #94a3b8; text-align: center; font-size: 11px;">${m.container_path || '-'}</td>
    </tr>
  `
    )
    .join('');

  container.innerHTML = `
    <div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 15px; margin-bottom: 18px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <div style="text-align: right;">
          <h2 style="font-size: 20px; font-weight: 900; color: #0f172a; margin: 0;">منظومة VIB اللوجستية</h2>
          <p style="font-size: 12px; color: #64748b; margin: 2px 0 0 0;">إدارة حركة الشاحنات والحاويات بالميناء</p>
        </div>
        <div style="text-align: center;">
          <span style="display: inline-block; background-color: #0f172a; color: #ffffff; padding: 6px 18px; border-radius: 8px; font-size: 14px; font-weight: bold;">
            ${title}
          </span>
          ${berthName ? `<p style="font-size: 12px; color: #334155; margin: 4px 0 0 0; font-weight: bold;">الرصيف: ${berthName}</p>` : ''}
        </div>
        <div style="text-align: left; font-size: 11px; color: #475569;">
          <p style="margin: 0;"><strong>تاريخ الاستخراج:</strong> ${dateStr}</p>
          <p style="margin: 3px 0 0 0;"><strong>إجمالي الحركات:</strong> ${movements.length} حركة</p>
        </div>
      </div>
    </div>

    <table style="width: 100%; border-collapse: collapse; font-size: 11.5px; border: 1.5px solid #0f172a; text-align: right;">
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
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pdfWidth - 10;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    if (imgHeight <= pdfHeight - 10) {
      pdf.addImage(imgData, 'PNG', 5, 5, imgWidth, imgHeight);
    } else {
      // Split into multi-page if height exceeds page
      let heightLeft = imgHeight;
      let position = 5;
      pdf.addImage(imgData, 'PNG', 5, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight + 5;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 5, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }
    }

    const cleanFileName = `كشف_حركات_${new Date().toISOString().split('T')[0]}_${movements.length}_حركة.pdf`;
    pdf.save(cleanFileName);
  } catch (error) {
    console.error('Error exporting PDF:', error);
    alert('حدث خطأ أثناء إنشاء وتنزيل ملف PDF. يرجى المحاولة مرة أخرى.');
  } finally {
    document.body.removeChild(container);
  }
}
