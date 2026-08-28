const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

/**
 * Parses a YYYY-MM-DD date string in UTC and subtracts exactly 1 day.
 * @param postingDate String formatted as YYYY-MM-DD
 * @returns Date object representing the newly calculated date (UTC)
 */
export function calculateNewDate(postingDate: string): Date {
  if (!postingDate || typeof postingDate !== "string") {
    throw new Error("postingDate must be a non-empty string in YYYY-MM-DD format.");
  }

  const parts = postingDate.split("-");
  if (parts.length !== 3) {
    throw new Error(`Invalid postingDate format: '${postingDate}'. Expected YYYY-MM-DD.`);
  }

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  if (isNaN(year) || isNaN(month) || isNaN(day) || month < 0 || month > 11 || day < 1 || day > 31) {
    throw new Error(`Invalid postingDate value: '${postingDate}'. Expected valid YYYY-MM-DD.`);
  }

  const dateObj = new Date(Date.UTC(year, month, day));
  dateObj.setUTCDate(dateObj.getUTCDate() - 1);
  return dateObj;
}

/**
 * Formats a Date object into YYYY-MM-DD format (UTC).
 * @param date Date object
 * @returns String in YYYY-MM-DD format
 */
export function formatYYYYMMDD(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Formats a Date object into dd-MMM-yy format (e.g. 19-Aug-26) in UTC.
 * @param date Date object
 * @returns String in dd-MMM-yy format
 */
export function formatDateDdMmmYy(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mmm = MONTH_NAMES[date.getUTCMonth()];
  const yy = String(date.getUTCFullYear()).slice(-2);
  return `${dd}-${mmm}-${yy}`;
}

/**
 * Uses a Regular Expression to find a substring matching 'dd-MMM-yy' pattern
 * and replaces it with the newly calculated date formatted as 'dd-MMM-yy'.
 * @param description Original description text
 * @param newDateDateObject Newly calculated Date object
 * @returns Transformed description text
 */
export function transformDescription(description: string, newDateDateObject: Date): string {
  if (!description || typeof description !== "string") {
    return description || "";
  }

  const replacementDateStr = formatDateDdMmmYy(newDateDateObject);
  // Match 2 digits, hyphen, 3 letters (month abbreviation), hyphen, 2 digits
  const dateRegex = /\b\d{2}-[A-Za-z]{3}-\d{2}\b/gi;

  return description.replace(dateRegex, replacementDateStr);
}
