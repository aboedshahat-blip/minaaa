import * as XLSX from 'xlsx';
import * as mammoth from 'mammoth';
import { pdfjsLib } from './pdfjs';
import { Movement } from '../types';

export interface CashierInvoiceEntry {
  receipt_no: string;          // مسلسل الفاتورة (e.g. 0047-01-1/01-261021)
  raw_vehicle_str: string;     // e.g. د س ى - 2312 - أحمر / د ن ر - 3597 - أحمر
  truck_no: string;            // e.g. د س ى 2312
  truck_digits: string;        // 2312
  truck_letters: string;       // د س ى
  trailer_no: string;          // e.g. د ن ر 3597
  trailer_digits: string;      // 3597
  trailer_letters: string;     // د ن ر
  booking_category: string;    // e.g. وارد حاويات / تعتيق حاوية فارغة
  amount: number;              // e.g. 24.25
}

export interface CashierMatchResult {
  movementId: string;
  movementSeq: number;
  truckNo: string;
  driverName: string;
  containerNo: string;
  oldCashierInvoice: number;
  newCashierInvoice: number;
  cashierReceiptNo: string;
  bookingCategory: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
}

/**
 * Normalizes Arabic text by unifying hamzas, taa marbuta, and removing extra symbols.
 */
export const normalizeArabic = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[-_.,/\\()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const normalizeNumerals = (text: string): string => text.replace(/[٠-٩۰-۹]/g, (digit) => {
  const index = '٠١٢٣٤٥٦٧٨٩'.indexOf(digit);
  return String(index >= 0 ? index : '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit));
});

const getReceiptDate = (receiptNo: string): number | null => {
  const match = receiptNo.match(/(\d{2})(\d{2})(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  const time = Date.UTC(2000 + Number(year), Number(month) - 1, Number(day));
  const date = new Date(time);
  return date.getUTCFullYear() === 2000 + Number(year) &&
    date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day)
    ? time
    : null;
};

const getMovementDate = (movementDate: string): number | null => {
  const match = movementDate?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, year, month, day] = match;
  const time = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const date = new Date(time);
  return date.getUTCFullYear() === Number(year) && date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day)
    ? time
    : null;
};

/**
 * Extracts clean 3-4 digits for Egyptian vehicle license plates.
 */
export const extractPlateDigits = (text: string): string => {
  if (!text) return '';
  const westernDigits = normalizeNumerals(text);
  // Look for 3 or 4 digit plate numbers first
  const match = westernDigits.match(/\b\d{3,4}\b/);
  if (match) return match[0];
  return westernDigits.replace(/\D/g, '');
};

const extractAllPlateDigits = (text: string): string[] => {
  if (!text) return [];
  const westernDigits = normalizeNumerals(text);
  const delimitedPlates = Array.from(westernDigits.matchAll(/[-–—]\s*(\d{3,4})\s*[-–—]/g), (match) => match[1]);
  if (delimitedPlates.length > 0) return Array.from(new Set(delimitedPlates));
  return Array.from(new Set(westernDigits.match(/\b\d{3,4}\b/g) || []));
};

/**
 * Extracts clean digits from a string.
 */
export const extractDigits = (text: string): string => {
  return extractPlateDigits(text);
};

/**
 * Extracts clean Arabic letters from a string, ignoring colors and common words.
 */
export const extractPlateLetters = (text: string): string => {
  if (!text) return '';
  // Remove known common words like colors
  const clean = text
    .replace(/أحمر|احمر|ازرق|أزرق|ابيض|أبيض|اصفر|أصفر|اخضر|أخضر|شاحنة|شاحنه|مقطورة|مقطوره|فارغة|فارغه|نقدي/g, '')
    .replace(/[^ء-ي]/g, '');
  return clean;
};

/**
 * Parses vehicle string formatted like:
 * "د س ى - 2312 - أحمر / د ن ر - 3597 - أحمر"
 * or "ط و س 7919 / ص ه س 7625"
 */
export const parseVehicleString = (
  vehicleStr: string
): {
  truck_no: string;
  truck_digits: string;
  truck_letters: string;
  trailer_no: string;
  trailer_digits: string;
  trailer_letters: string;
} => {
  if (!vehicleStr) {
    return {
      truck_no: '',
      truck_digits: '',
      truck_letters: '',
      trailer_no: '',
      trailer_digits: '',
      trailer_letters: '',
    };
  }

  // Split truck and trailer by '/' or 'مقطورة'
  const parts = vehicleStr.split(/[/]/);
  const truckPart = parts[0] || '';
  const trailerPart = parts[1] || '';

  const plateDigits = extractAllPlateDigits(vehicleStr);
  const truck_digits = plateDigits[0] || extractDigits(truckPart);
  const truck_letters = extractPlateLetters(truckPart);
  const truck_no = `${truck_letters.split('').join(' ')} ${truck_digits}`.trim();

  const trailer_digits = plateDigits[1] || extractDigits(trailerPart);
  const trailer_letters = extractPlateLetters(trailerPart);
  const trailer_no = `${trailer_letters.split('').join(' ')} ${trailer_digits}`.trim();

  return {
    truck_no: truck_no || truckPart.trim(),
    truck_digits,
    truck_letters,
    trailer_no: trailer_no || trailerPart.trim(),
    trailer_digits,
    trailer_letters,
  };
};

/**
 * Extract Cashier Entries from raw text lines.
 */
export const parseCashierTextLines = (lines: string[]): CashierInvoiceEntry[] => {
  const entries: CashierInvoiceEntry[] = [];

  // Regex pattern for RSCT receipt number like: 0047-01-1/01-261021 or 0103-03-1/01-261021
  const receiptRegex = /\b\d{4}-\d{2}-\d+[\/\-][\d\-]+\b/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(receiptRegex);

    if (match) {
      const receipt_no = match[0];

      // Cashier PDFs often put the receipt, plate pair, and amount on separate lines.
      // Keep collecting until the next receipt so we don't associate a plate with its neighbor.
      let end = i + 1;
      while (end < lines.length && !receiptRegex.test(lines[end])) end++;
      const context = lines.slice(i, end).join(' ');

      // Look for amount: a number with decimals or standalone currency amount
      const amountMatches = context.match(/(?:\d{1,5}(?:\.\d{1,2})|[٠-٩۰-۹]{1,5}(?:\.[٠-٩۰-۹]{1,2}))/g);
      let amount = 0;
      if (amountMatches && amountMatches.length > 0) {
        // Exclude parts that look like dates or sequence numbers
        const validAmounts = amountMatches
          .map((amount) => Number(normalizeNumerals(amount)))
          .filter((n) => n > 0 && n < 100000 && !receipt_no.includes(String(n)));
        if (validAmounts.length > 0) {
          amount = validAmounts[validAmounts.length - 1]; // amount is typically at the end of the line
        }
      }

      // Look for booking category
      let booking_category = 'وارد حاويات';
      if (context.includes('تعتيق')) booking_category = 'تعتيق حاوية فارغة';
      else if (context.includes('صادر')) booking_category = 'صادر حاويات';
      else if (context.includes('وارد')) booking_category = 'وارد حاويات';
      else if (context.includes('استلام')) booking_category = 'استلام حاوية فارغة';

      // Remove receipt number from context so its internal slash and digits do not pollute plate numbers
      const vehicleStr = context.replace(receipt_no, ' ');

      const parsedVeh = parseVehicleString(vehicleStr);

      if (parsedVeh.truck_digits || parsedVeh.truck_letters) {
        entries.push({
          receipt_no,
          raw_vehicle_str: vehicleStr,
          ...parsedVeh,
          booking_category,
          amount,
        });
      }
    }
  }

  return entries;
};

/**
 * Parses PDF document for Cashier Invoice report.
 */
export const parseCashierPdf = async (file: File): Promise<CashierInvoiceEntry[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    useSystemFonts: true,
  }).promise;

  const allLines: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    // Group items by Y coordinate to reconstruct table lines
    const lineBuckets: { y: number; items: { x: number; str: string }[] }[] = [];

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
      bucket.items.push({ x, str });
    });

    lineBuckets.sort((a, b) => b.y - a.y);

    lineBuckets.forEach((bucket) => {
      bucket.items.sort((a, b) => a.x - b.x);
      const line = bucket.items.map((i) => i.str).join(' ');
      allLines.push(line);
    });
  }

  return parseCashierTextLines(allLines);
};

/**
 * Parses Excel file of Cashier Invoice report.
 */
export const parseCashierExcel = async (file: File): Promise<CashierInvoiceEntry[]> => {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  const allLines: string[] = rows.map((r) => r.join(' '));
  return parseCashierTextLines(allLines);
};

/**
 * Main dispatcher to parse any uploaded cashier invoice file (PDF, Excel, Word).
 */
export const parseUploadedCashierReport = async (file: File): Promise<CashierInvoiceEntry[]> => {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) {
    return parseCashierPdf(file);
  } else if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
    return parseCashierExcel(file);
  } else if (name.endsWith('.docx') || name.endsWith('.doc')) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    const lines = result.value.split('\n');
    return parseCashierTextLines(lines);
  }
  throw new Error('صيغة الملف غير مدعومة. يرجى رفع ملف PDF أو Excel أو Word.');
};

/**
 * Matches extracted cashier entries against existing movements in the system.
 */
export const matchCashierEntriesWithMovements = (
  entries: CashierInvoiceEntry[],
  movements: Movement[],
  defaultSystemCommission: number = 200
): {
  matchedMovements: Movement[];
  matchResults: CashierMatchResult[];
  unmatchedEntries: CashierInvoiceEntry[];
} => {
  const updatedMovements = [...movements];
  const matchResults: CashierMatchResult[] = [];
  const matchedEntryIndexes = new Set<number>();
  const entriesByMovement = new Map<number, Array<{ entry: CashierInvoiceEntry; entryIndex: number; dayDistance: number | null }>>();

  // Match each receipt against the full unordered truck/trailer pair. When a
  // receipt contains both plates, do not attach it to an incomplete movement
  // using only one shared number. A genuinely single-plate receipt may match
  // only a unique movement candidate; ambiguous receipts stay for review.
  entries.forEach((entry, entryIndex) => {
    const entryDigits = Array.from(new Set([entry.truck_digits, entry.trailer_digits].filter(Boolean)));
    if (entryDigits.length === 0) return;

    const exactCandidates: Array<{ index: number; dayDistance: number | null; batchTime: number | null }> = [];
    const singlePlateCandidates: Array<{ index: number; dayDistance: number | null; batchTime: number | null }> = [];
    const receiptDate = getReceiptDate(entry.receipt_no);
    updatedMovements.forEach((movement, movementIndex) => {
      const movementDigits = Array.from(new Set([
        extractDigits(movement.truck_no || ''),
        extractDigits(movement.trailer_no || ''),
      ].filter(Boolean)));
      if (movementDigits.length === 0) return;

      const movementDate = getMovementDate(movement.movement_date || '');
      const dayDistance = receiptDate != null && movementDate != null
        ? Math.round(Math.abs(receiptDate - movementDate) / 86_400_000)
        : null;
      const parsedBatchTime = movement.import_batch_at ? Date.parse(movement.import_batch_at) : Number.NaN;
      const batchTime = Number.isFinite(parsedBatchTime) ? parsedBatchTime : null;
      // Booking sheets often have no trip date, so movements receive their import
      // date. Cashier receipts may be issued a few days earlier; allow a short
      // delay and use the newest imported booking batch to identify today's sheet.
      if (dayDistance != null && dayDistance > 7) return;

      if (entryDigits.length >= 2 && entryDigits.every((digits) => movementDigits.includes(digits))) {
        exactCandidates.push({ index: movementIndex, dayDistance, batchTime });
      } else if (entryDigits.length === 1 && movementDigits.includes(entryDigits[0])) {
        singlePlateCandidates.push({ index: movementIndex, dayDistance, batchTime });
      }
    });

    const candidates = exactCandidates.length > 0 ? exactCandidates : singlePlateCandidates;
    if (candidates.length === 0) return;
    const candidatesWithBatch = candidates.filter((candidate) => candidate.batchTime != null);
    const newestBatchTime = candidatesWithBatch.length > 0
      ? Math.max(...candidatesWithBatch.map((candidate) => candidate.batchTime as number))
      : null;
    const batchPreferredCandidates = newestBatchTime == null
      ? candidates
      : candidates.filter((candidate) => candidate.batchTime === newestBatchTime);
    const datedCandidates = batchPreferredCandidates.filter((candidate) => candidate.dayDistance != null);
    const scoredCandidates = datedCandidates.length > 0 ? datedCandidates : batchPreferredCandidates;
    const bestDistance = scoredCandidates.reduce<number | null>((best, candidate) =>
      candidate.dayDistance == null ? best : best == null ? candidate.dayDistance : Math.min(best, candidate.dayDistance), null);
    const bestCandidates = bestDistance == null
      ? scoredCandidates
      : scoredCandidates.filter((candidate) => candidate.dayDistance === bestDistance);
    if (bestCandidates.length !== 1) return;
    const { index: movementIndex, dayDistance } = bestCandidates[0];
    const assigned = entriesByMovement.get(movementIndex) || [];
    assigned.push({ entry, entryIndex, dayDistance });
    entriesByMovement.set(movementIndex, assigned);
  });

  entriesByMovement.forEach((assignedEntries, movementIndex) => {
    const movement = updatedMovements[movementIndex];
    const datedEntries = assignedEntries.filter((assigned) => assigned.dayDistance != null);
    const bestMovementDayDistance = datedEntries.length > 0
      ? Math.min(...datedEntries.map((assigned) => assigned.dayDistance as number))
      : null;
    const relevantEntries = bestMovementDayDistance == null
      ? assignedEntries
      : assignedEntries.filter((assigned) => assigned.dayDistance === bestMovementDayDistance);
    relevantEntries.forEach((assigned) => matchedEntryIndexes.add(assigned.entryIndex));
    const movementEntries = relevantEntries.map((assigned) => assigned.entry);
    const existingReceiptNumbers = (movement.cashier_receipt_no || '')
      .split(/[,،\n]+/).map((receipt) => receipt.trim()).filter(Boolean);
    const existingReceiptSet = new Set(existingReceiptNumbers);
    const seenReceipts = new Set(existingReceiptSet);
    const newEntries = movementEntries.filter((entry) => {
      if (seenReceipts.has(entry.receipt_no)) return false;
      seenReceipts.add(entry.receipt_no);
      return true;
    });
    if (newEntries.length === 0) return;

    const addedCashier = newEntries.reduce((sum, entry) => sum + Math.max(0, Number(entry.amount) || 0), 0);
    const oldCashier = Number(movement.cashier_invoice) || 0;
    const newCashier = oldCashier + addedCashier;
    const systemCommission = Number(movement.system_commission ?? defaultSystemCommission);
    const nafezCommission = Number(movement.nafez_commission ?? 0);
    const newTotal = newCashier + systemCommission + nafezCommission;
    // Cashier invoice is a cost on the movement; only customer receipts count
    // as money collected from the customer.
    const paid = movement.customer_paid_amount !== undefined
      ? Math.max(0, Number(movement.customer_paid_amount) || 0)
      : Math.max(0, (Number(movement.paid_amount) || 0) - oldCashier);
    const remaining = Math.max(0, newTotal - paid);
    const receiptNumbers = Array.from(new Set([...existingReceiptNumbers, ...newEntries.map((entry) => entry.receipt_no)]));
    const updatedMovement: Movement = {
      ...movement,
      cashier_receipt_no: receiptNumbers.join(', '),
      cashier_invoice: newCashier,
      paid_amount: paid,
      system_commission: systemCommission,
      nafez_commission: nafezCommission,
      booking_category: newEntries[newEntries.length - 1].booking_category || movement.booking_category,
      total_amount: newTotal,
      remaining_amount: remaining,
      payment_status: paid >= newTotal && newTotal > 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
    };
    updatedMovements[movementIndex] = updatedMovement;

    matchResults.push({
      movementId: movement.id,
      movementSeq: movement.seq,
      truckNo: movement.truck_no,
      driverName: movement.driver_name || movement.customer_name,
      containerNo: movement.container_no,
      oldCashierInvoice: oldCashier,
      newCashierInvoice: newCashier,
      cashierReceiptNo: newEntries.map((entry) => entry.receipt_no).join(', '),
      bookingCategory: updatedMovement.booking_category || '',
      totalAmount: newTotal,
      paidAmount: paid,
      remainingAmount: remaining,
    });
  });

  const unmatchedEntries = entries.filter((_, idx) => !matchedEntryIndexes.has(idx));

  return {
    matchedMovements: updatedMovements,
    matchResults,
    unmatchedEntries,
  };
};
