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

/**
 * Extracts clean 3-4 digits for Egyptian vehicle license plates.
 */
export const extractPlateDigits = (text: string): string => {
  if (!text) return '';
  const westernDigits = text.replace(/[٠-٩۰-۹]/g, (digit) => {
    const arabicIndic = '٠١٢٣٤٥٦٧٨٩';
    const persian = '۰۱۲۳۴۵۶۷۸۹';
    const index = arabicIndic.indexOf(digit);
    return String(index >= 0 ? index : persian.indexOf(digit));
  });
  // Look for 3 or 4 digit plate numbers first
  const match = westernDigits.match(/\b\d{3,4}\b/);
  if (match) return match[0];
  return westernDigits.replace(/\D/g, '');
};

const plateLetterVariants = (text: string): string[] => {
  const letters = extractPlateLetters(text).replace(/\s+/g, '');
  if (!letters) return [];
  const reversed = Array.from(letters).reverse().join('');
  return Array.from(new Set([letters, reversed]));
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

  const truck_digits = extractDigits(truckPart);
  const truck_letters = extractPlateLetters(truckPart);
  const truck_no = `${truck_letters.split('').join(' ')} ${truck_digits}`.trim();

  const trailer_digits = extractDigits(trailerPart);
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
          .map(Number)
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
  const usedMovementIds = new Set<string>();

  // Process each movement and find best matching cashier entry
  updatedMovements.forEach((mov, movIdx) => {
    const mTruckDigits = extractDigits(mov.truck_no || '');
    const mTrailerDigits = extractDigits(mov.trailer_no || '');
    const movementDigits = [mTruckDigits, mTrailerDigits].filter(Boolean);
    const movementLetters = [mov.truck_no, mov.trailer_no].flatMap((plate) => plateLetterVariants(plate || ''));

    if (!mTruckDigits && !mTrailerDigits) return;

    // Search for matching cashier entry
    for (let eIdx = 0; eIdx < entries.length; eIdx++) {
      if (matchedEntryIndexes.has(eIdx)) continue;
      const entry = entries[eIdx];

      const entryDigits = [entry.truck_digits, entry.trailer_digits].filter(Boolean);
      const matchingDigits = entryDigits.filter((digits) => movementDigits.includes(digits));
      const digitMatch = matchingDigits.length > 0;
      const entryLetters = [entry.truck_letters, entry.trailer_letters].flatMap((plate) => plateLetterVariants(plate || ''));
      const lettersMatch = entryLetters.some((letters) => movementLetters.includes(letters));
      // Cashier/PDF extraction may reverse the truck and trailer columns in RTL text.
      // Compare unordered plate numbers and allow one side to omit the trailer number.
      // The uploaded cashier report has plate digits but omits plate letters.
      // Match the complete unordered pair when both sides include truck + trailer,
      // otherwise allow the single shared number to identify a one-vehicle booking.
      const isMatch = digitMatch;

      if (isMatch) {
        matchedEntryIndexes.add(eIdx);
        usedMovementIds.add(mov.id);

        const newCashier = entry.amount > 0 ? entry.amount : mov.cashier_invoice;
        const sysComm = mov.system_commission || defaultSystemCommission;
        const nafezComm = mov.nafez_commission || 0;
        const newTotal = newCashier + sysComm + nafezComm;
        // A cashier report is proof that the external cashier invoice was paid.
        // Keep any larger amount already collected on the movement.
        const paid = Math.max(Number(mov.paid_amount) || 0, newCashier);
        const remaining = Math.max(0, newTotal - paid);

        const updatedMov: Movement = {
          ...mov,
          cashier_receipt_no: entry.receipt_no,
          cashier_invoice: newCashier,
          booking_category: entry.booking_category || mov.booking_category,
          total_amount: newTotal,
          remaining_amount: remaining,
          payment_status: paid >= newTotal && newTotal > 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
        };

        updatedMovements[movIdx] = updatedMov;

        matchResults.push({
          movementId: mov.id,
          movementSeq: mov.seq,
          truckNo: mov.truck_no,
          driverName: mov.driver_name || mov.customer_name,
          containerNo: mov.container_no,
          oldCashierInvoice: mov.cashier_invoice,
          newCashierInvoice: newCashier,
          cashierReceiptNo: entry.receipt_no,
          bookingCategory: entry.booking_category,
          totalAmount: newTotal,
        });

        break;
      }
    }
  });

  const unmatchedEntries = entries.filter((_, idx) => !matchedEntryIndexes.has(idx));

  return {
    matchedMovements: updatedMovements,
    matchResults,
    unmatchedEntries,
  };
};
