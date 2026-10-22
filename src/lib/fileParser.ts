import * as XLSX from 'xlsx';
import * as mammoth from 'mammoth';
import { pdfjsLib } from './pdfjs';
import { Movement } from '../types';
import type { Worker as OcrWorker } from 'tesseract.js';

export interface ParsedDocumentResult {
  rows: Partial<Movement>[];
  headers: string[];
  rawRowCount: number;
  fileType: 'excel' | 'word' | 'pdf';
  needsDriverReview?: boolean;
}

const readArabicNamesFromPdf = async (
  page: pdfjsLib.PDFPageProxy,
  rowYs: number[],
  columnCenter: number,
  columnWidth: number,
  worker: OcrWorker,
) => {
  if (rowYs.length === 0) return [];

  const scale = 4;
  const viewport = page.getViewport({ scale });
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = Math.ceil(viewport.width);
  sourceCanvas.height = Math.ceil(viewport.height);
  const sourceContext = sourceCanvas.getContext('2d');
  if (!sourceContext) throw new Error('تعذر تجهيز صفحة PDF لقراءة الأسماء.');

  await page.render({ canvas: sourceCanvas, canvasContext: sourceContext, viewport }).promise;

  const cropWidth = Math.round(columnWidth * scale);
  const cropHeight = Math.round(18 * scale);
  const recognized: { name: string; confidence: number }[] = [];

  for (const rowY of rowYs) {
    const [centerX, centerY] = viewport.convertToViewportPoint(columnCenter, rowY);
    const crop = document.createElement('canvas');
    crop.width = cropWidth * 2;
    crop.height = cropHeight * 2;
    const context = crop.getContext('2d');
    if (!context) throw new Error('تعذر قص اسم السائق من ملف PDF.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, crop.width, crop.height);

    const sourceX = Math.max(0, Math.round(centerX - cropWidth / 2));
    const sourceY = Math.max(0, Math.round(centerY - cropHeight / 2));
    const availableWidth = Math.min(cropWidth, sourceCanvas.width - sourceX);
    const availableHeight = Math.min(cropHeight, sourceCanvas.height - sourceY);
    context.drawImage(sourceCanvas, sourceX, sourceY, availableWidth, availableHeight, 0, 0, availableWidth * 2, availableHeight * 2);

    const result = await worker.recognize(crop);
    const name = result.data.text
      .replace(/[\r\n|ـ]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[\s,.;:،]+|[\s,.;:،]+$/g, '')
      .trim();
    recognized.push({ name, confidence: result.data.confidence });
  }

  sourceCanvas.width = 0;
  sourceCanvas.height = 0;
  return recognized;
};

/**
 * Standard 12-column Template Headers
 */
export const STANDARD_HEADERS = [
  'مسار الحاوية',
  'وصف الحاوية',
  'رقم الحاوية',
  'رقم الاقرار',
  'اسم السائق',
  'محاور المقطورة',
  'وزن المقطورة من واقع الرخصة',
  'رقم المقطورة',
  'محاور الشاحنة',
  'وزن الشاحنة من واقع الرخصة',
  'رقم الشاحنة',
  'م',
];

const extractContainerNumbers = (text: string): string[] => {
  const matches = text.match(/[A-Z]{3,4}\s*[UJZ]?\s*\d{6,7}/gi) || [];
  return Array.from(new Set(matches.map((value) => value.replace(/\s+/g, '').toUpperCase())));
};

/**
 * Extracts structured movements from PDF documents (Page-by-Page with anchor awareness)
 */
export const parsePdfDocument = async (file: File): Promise<ParsedDocumentResult> => {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  const allMovements: Partial<Movement>[] = [];
  let ocrWorker: OcrWorker | undefined;
  let ocrUnavailable = false;
  let needsDriverReview = false;

  // Iterate strictly page by page so Y coordinates never conflict across pages
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    // Group items on this single page by vertical Y proximity (within 7px)
    const lineBuckets: { y: number; items: { x: number; str: string; dir?: string; width?: number }[] }[] = [];

    content.items.forEach((item: any) => {
      const str = (item.str || '').trim();
      if (!str) return;
      const y = Math.round(item.transform[5]);
      const x = Math.round(item.transform[4]);

      let bucket = lineBuckets.find((b) => Math.abs(b.y - y) <= 7);
      if (!bucket) {
        bucket = { y, items: [] };
        lineBuckets.push(bucket);
      }
      bucket.items.push({ x, str, dir: item.dir, width: item.width });
    });

    // Sort lines top to bottom on this page
    lineBuckets.sort((a, b) => b.y - a.y);

    const driverHeader = lineBuckets.find((bucket) => {
      const text = bucket.items.map((item) => item.str).join('');
      return text.includes('اسم') && text.includes('السائق');
    });
    let driverColumnCenter = 0;
    let driverColumnWidth = 0;
    if (driverHeader) {
      const labelItems = driverHeader.items.filter((item) => item.str.includes('اسم') || item.str.includes('السائق'));
      const left = Math.min(...labelItems.map((item) => item.x));
      const right = Math.max(...labelItems.map((item) => item.x + (item.width || item.str.length * 5)));
      driverColumnCenter = (left + right) / 2;
      const nearestOtherHeader = driverHeader.items
        .filter((item) => !labelItems.includes(item) && item.str.trim())
        .map((item) => Math.abs(item.x + (item.width || item.str.length * 5) / 2 - driverColumnCenter))
        .sort((a, b) => a - b)[0];
      driverColumnWidth = nearestOtherHeader
        ? Math.max(48, Math.min(90, nearestOtherHeader * 1.35))
        : 62;
    }
    const dataRowYs: number[] = [];
    const dataRowMovementIndexes: number[][] = [];

    lineBuckets.forEach((bucket) => {
      // Sort items on the line left to right (by X)
      bucket.items.sort((a, b) => a.x - b.x);
      const rowTokens = bucket.items.map((i) => i.str);
      const lineText = rowTokens.join(' ');

      // Filter out table headers, titles, and metadata
      if (
        lineText.includes('مسار') ||
        lineText.includes('الحاويه') ||
        lineText.includes('الحاوية') ||
        lineText.includes('الرخصة') ||
        lineText.includes('محاور') ||
        lineText.includes('واقع') ||
        lineText.includes('كشف') ||
        lineText.includes('صفحة')
      ) {
        return;
      }

      // Check for ISO container code: 4 letters + 6-7 digits
      const containerIdx = rowTokens.findIndex((token) => extractContainerNumbers(token).length > 0);

      let container_no = '';
      let containerNumbers: string[] = [];
      let declaration_no = '';
      let afterDec: string[] = [];
      let afterDecItems: typeof bucket.items = [];

      if (containerIdx !== -1) {
        containerNumbers = extractContainerNumbers(rowTokens.join(' '));
        container_no = containerNumbers[0] || '';
        if (rowTokens[containerIdx + 1] && /^\d{5,7}$/.test(rowTokens[containerIdx + 1])) {
          declaration_no = rowTokens[containerIdx + 1];
        }
        afterDec = rowTokens.slice(containerIdx + 2);
        afterDecItems = bucket.items.slice(containerIdx + 2);
      } else {
        // Line without container code - check for declaration number (5-7 digits)
        const decIdx = rowTokens.findIndex((t, idx) => idx > 0 && /^\d{5,7}$/.test(t));
        if (decIdx !== -1) {
          declaration_no = rowTokens[decIdx];
          afterDec = rowTokens.slice(decIdx + 1);
          afterDecItems = bucket.items.slice(decIdx + 1);
        } else {
          // Check if line contains truck weight (7.5 or 7,5) and trailer weight (11 or 11.5)
          const hasWeights = rowTokens.some((t) => t === '7.5' || t === '7,5');
          if (hasWeights) {
            afterDec = rowTokens.slice(1);
            afterDecItems = bucket.items.slice(1);
          } else {
            return; // Not a data row
          }
        }
      }

      const container_path = rowTokens[0] === 'وارد' || rowTokens[0] === 'صادر' ? rowTokens[0] : 'وارد';
      const container_desc = container_path;

      // Dynamic weights and axles
      let truck_axles = 20;
      let truck_weight = 7.5;
      let trailer_axles = 30;
      let trailer_weight = 11.5;

      // Find trailer axles index ('30' or '20')
      const axleIdx = afterDec.findIndex((t) => t === '30' || t === '20');
      let driver_name = '';
      if (axleIdx > 0) {
        const driverItems = afterDecItems.slice(0, axleIdx);
        // PDF.js reports Arabic runs as visual fragments. Reorder only the
        // fragments inside the driver cell into right-to-left reading order.
        driver_name = driverItems.length > 1 && driverItems.every((item) => item.dir === 'rtl')
          ? [...driverItems].sort((a, b) => b.x - a.x).map((item) => item.str).join(' ')
          : afterDec.slice(0, axleIdx).join(' ');
        trailer_axles = Number(afterDec[axleIdx]) || 30;
      }

      // Trailer weight index ('11.5', '11,5', or '11')
      const elevenIdx = afterDec.findIndex(
        (t, idx) => (t === '11.5' || t === '11,5' || t === '11') && idx >= axleIdx
      );
      if (elevenIdx !== -1) {
        trailer_weight = Number(afterDec[elevenIdx].replace(',', '.')) || 11.5;
      }

      // Trailer plate is between elevenIdx and truck_axles ('20')
      const truckAxleIdx = afterDec.findIndex(
        (t, idx) => (t === '20' || t === '30') && idx > elevenIdx
      );
      let trailer_no = '';
      if (elevenIdx !== -1 && truckAxleIdx !== -1 && truckAxleIdx > elevenIdx + 1) {
        trailer_no = afterDec.slice(elevenIdx + 1, truckAxleIdx).join(' ');
      }

      // Truck weight ('7.5' or '7,5')
      const sevenIdx = afterDec.findIndex(
        (t, idx) => (t === '7.5' || t === '7,5') && idx >= truckAxleIdx
      );
      if (sevenIdx !== -1) {
        truck_weight = Number(afterDec[sevenIdx].replace(',', '.')) || 7.5;
      }

      // Tokens after '7.5' are the truck plate number and letters
      let truck_no = '';
      if (sevenIdx !== -1 && sevenIdx < afterDec.length - 1) {
        const truckTokens = afterDec
          .slice(sevenIdx + 1)
          .filter((t) => !/^\d{1,2}$/.test(t)); // Filter out sequence number
        truck_no = truckTokens.join(' ');
      }

      const movementBase: Partial<Movement> = {
        container_path,
        container_desc,
        declaration_no,
        driver_name,
        trailer_axles,
        trailer_weight,
        trailer_no,
        truck_axles,
        truck_weight,
        truck_no,
        cashier_invoice: 0,
      };
      const rowMovementIndexes: number[] = [];
      rowMovementIndexes.push(allMovements.length);
      allMovements.push({
        ...movementBase,
        seq: allMovements.length + 1,
        container_no: containerNumbers.join(' / ') || container_no,
      });
      dataRowMovementIndexes.push(rowMovementIndexes);
      dataRowYs.push(bucket.y);
    });

    if (dataRowYs.length > 0 && driverHeader && !ocrUnavailable) {
      try {
        if (!ocrWorker) {
          const { createWorker, PSM } = await import('tesseract.js');
          ocrWorker = await createWorker('ara', 1);
          await ocrWorker.setParameters({
            tessedit_pageseg_mode: PSM.SINGLE_LINE,
            user_defined_dpi: '300',
          });
        }
        const recognizedNames = await readArabicNamesFromPdf(
          page,
          dataRowYs,
          driverColumnCenter,
          driverColumnWidth,
          ocrWorker,
        );
        recognizedNames.forEach(({ name, confidence }, index) => {
          const movementIndexes = dataRowMovementIndexes[index] || [];
          if (name && /[\u0600-\u06ff]/.test(name)) {
            movementIndexes.forEach((movementIndex) => { allMovements[movementIndex].driver_name = name; });
            if (confidence < 70) needsDriverReview = true;
          } else {
            needsDriverReview = true;
          }
        });
      } catch (error) {
        console.warn('Arabic PDF OCR was unavailable; retaining extracted text for review.', error);
        ocrUnavailable = true;
        needsDriverReview = true;
      }
    } else if (dataRowYs.length > 0) {
      needsDriverReview = true;
    }
  }

  if (ocrWorker) await ocrWorker.terminate();

  return {
    rows: allMovements,
    headers: STANDARD_HEADERS,
    rawRowCount: allMovements.length,
    fileType: 'pdf',
    needsDriverReview,
  };
};

/**
 * Universal Matrix Processor for Word tables and Excel sheets
 */
export const matrixToMovements = (matrix: unknown[][]): {
  rows: Partial<Movement>[];
  headers: string[];
  rawRowCount: number;
} => {
  if (!matrix || matrix.length === 0) {
    return { rows: [], headers: STANDARD_HEADERS, rawRowCount: 0 };
  }

  // Excel cells can be numbers, dates, booleans, or formula results rather than strings.
  const textMatrix = matrix.map((row) => row.map((cell) => cell == null ? '' : String(cell).trim()));

  // When a sheet has headers, use its driver-name column as the source of
  // truth instead of guessing the name from other text in the row.
  const headerRowIndex = textMatrix.findIndex((row) =>
    row.some((cell) => String(cell || '').replace(/[\s\u0640]/g, '').includes('السائق'))
  );
  const driverNameColumnIndex = headerRowIndex >= 0
    ? textMatrix[headerRowIndex].findIndex((cell) => String(cell || '').replace(/[\s\u0640]/g, '').includes('السائق'))
    : -1;

  // Filter out header and empty rows
  const cleanRows = textMatrix.filter((row, rowIndex) => {
    if (rowIndex === headerRowIndex) return false;
    const text = row.join(' ');
    const headerWords = ['مسار', 'الحاوية', 'المقطورة', 'الشاحنة', 'السائق', 'الرخصة', 'واقع', 'محاور', 'وزن', 'رقم'];
    let hits = 0;
    headerWords.forEach((kw) => { if (text.includes(kw)) hits++; });
    if (hits >= 2) return false;
    const nonEmpty = row.filter((cell) => cell && cell.trim() !== '-');
    return nonEmpty.length >= 2;
  });

  const parsedMovements: Partial<Movement>[] = cleanRows.flatMap((tokens, idx) => {
    const containerNumbers: string[] = [];
    let declaration_no = '';
    let driver_name = '';
    let truck_no = '';
    let trailer_no = '';
    let container_path = 'وارد';
    let container_desc = 'وارد';
    let truck_weight = 7.5;
    let truck_axles = 20;
    let trailer_weight = 11.5;
    let trailer_axles = 30;

    const plateLetters: string[] = [];
    const plateNumbers: string[] = [];

    tokens.forEach((tok, columnIndex) => {
      const s = String(tok || '').trim();
      if (!s || s === '-' || s === '—') return;

      if (columnIndex === driverNameColumnIndex) {
        driver_name = s;
        return;
      }

      // Container code
      const cMatches = extractContainerNumbers(s);
      if (cMatches.length > 0) {
        containerNumbers.push(...cMatches);
        return;
      }

      const spacedContainerMatches = s.match(/[A-Z]{3,4}\s*[UJZ]?\s*\d{6,7}/gi) || [];
      if (spacedContainerMatches.length > 0) {
        containerNumbers.push(...spacedContainerMatches.map((value) => value.replace(/\s+/g, '').toUpperCase()));
        return;
      }

      // Declaration code
      const dMatch = s.match(/\b(5\d{5}|4\d{5}|6\d{5}|5\d{4}|52\d{3}|51\d{3})\b/);
      if (dMatch && !declaration_no) {
        declaration_no = dMatch[0];
        return;
      }

      // Driver name
      if (!/\d/.test(s) && !['وارد', 'صادر', 'ترانزيت', 'الشاحنة', 'المقطورة'].includes(s)) {
        const words = s.split(/\s+/).filter(Boolean);
        if (words.length >= 2 && !driver_name) {
          driver_name = s;
          return;
        }
      }

      // Plate letters
      if (/^[أ-ي\s]{2,8}$/.test(s) && !['وارد', 'صادر', 'ترانزيت', 'الرخصة', 'واقع', 'وزن', 'من'].includes(s)) {
        plateLetters.push(s);
        return;
      }

      // Plate numbers
      if (/^\d{3,4}$/.test(s)) {
        plateNumbers.push(s);
        return;
      }

      if (['وارد', 'صادر', 'ترانزيت'].includes(s)) {
        container_path = s;
        container_desc = s;
      }
    });

    if (plateNumbers.length > 0 && plateLetters.length > 0) {
      truck_no = `${plateNumbers[0]} ${plateLetters[0]}`;
      if (plateNumbers.length > 1) {
        trailer_no = plateNumbers[1] + (plateLetters[1] ? ` ${plateLetters[1]}` : '');
      }
    } else if (plateNumbers.length > 0) {
      truck_no = plateNumbers[0];
      if (plateNumbers.length > 1) trailer_no = plateNumbers[1];
    } else if (plateLetters.length > 0) {
      truck_no = plateLetters[0];
    }

    const movementBase: Partial<Movement> = {
      container_path,
      container_desc,
      declaration_no,
      driver_name,
      trailer_axles,
      trailer_weight,
      trailer_no,
      truck_axles,
      truck_weight,
      truck_no,
      cashier_invoice: 0,
    };
    const uniqueContainerNumbers = Array.from(new Set(containerNumbers));
    return [{
      ...movementBase,
      seq: idx + 1,
      container_no: uniqueContainerNumbers.join(' / '),
    }];
  });

  parsedMovements.forEach((movement, index) => { movement.seq = index + 1; });

  return {
    rows: parsedMovements.filter((m) => m.container_no || m.truck_no),
    headers: STANDARD_HEADERS,
    rawRowCount: cleanRows.length,
  };
};

/**
 * Extracts data from Word document (.docx) using mammoth
 */
export const parseWordDocument = async (file: File): Promise<ParsedDocumentResult> => {
  const arrayBuffer = await file.arrayBuffer();
  const conversionResult = await mammoth.convertToHtml({ arrayBuffer });
  const html = conversionResult.value;

  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const table = doc.querySelector('table');

    if (table) {
      const matrix: string[][] = [];
      const trElements = table.querySelectorAll('tr');

      trElements.forEach((tr) => {
        const rowCells: string[] = [];
        const tdElements = tr.querySelectorAll('td, th');
        tdElements.forEach((td) => {
          rowCells.push((td.textContent || '').trim());
        });
        if (rowCells.some((c) => c.length > 0)) {
          matrix.push(rowCells);
        }
      });

      const { rows, headers, rawRowCount } = matrixToMovements(matrix);
      return {
        rows,
        headers,
        rawRowCount,
        fileType: 'word',
      };
    }
  }

  throw new Error('لم يتم العثور على جدول حركات صالح في مستند الوورد');
};

/**
 * Parses Excel files (.xlsx, .xls, .csv)
 */
export const parseExcelDocument = async (file: File): Promise<ParsedDocumentResult> => {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  const matrix = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1, defval: '' });
  const { rows, headers, rawRowCount } = matrixToMovements(matrix);

  return {
    rows,
    headers,
    rawRowCount,
    fileType: 'excel',
  };
};

/**
 * Universal Document Parser
 */
export const parseAnyDocument = async (file: File): Promise<ParsedDocumentResult> => {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';

  if (['xlsx', 'xls', 'csv'].includes(ext)) {
    return parseExcelDocument(file);
  } else if (['docx', 'doc'].includes(ext)) {
    return parseWordDocument(file);
  } else if (['pdf'].includes(ext)) {
    return parsePdfDocument(file);
  } else {
    try {
      return await parseExcelDocument(file);
    } catch {
      throw new Error(`صيغة الملف غير مدعومة (.${ext}). يرجى رفع ملف Excel أو Word أو PDF.`);
    }
  }
};
