// Placeholder for Persian text normalization or other utilities.
// For now, we rely on Gemini API to handle Persian text correctly.

/**
 * Normalizes Persian characters (e.g., ي and ك to ی and ک).
 * This is a basic example. More comprehensive normalization might be needed.
 * @param text The input string.
 * @returns Normalized string.
 */
export function normalizePersianText(text: string): string {
  if (!text) return "";
  let normalized = text;
  normalized = normalized.replace(/ي/g, 'ی');
  normalized = normalized.replace(/ك/g, 'ک');
  // Add more replacements as needed
  return normalized;
}

const persianNumerals = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const westernNumerals = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Converts Persian numerals in a string to Western Arabic numerals.
 * If the input is a number, it's returned as a string.
 * If undefined or null, returns undefined.
 * @param input The input string or number.
 * @returns String with Western numerals, or undefined.
 */
export function convertPersianToWesternNumerals(input: string | number | undefined): string | undefined {
  if (input === undefined || input === null) {
    return undefined;
  }
  let strInput = String(input);
  for (let i = 0; i < persianNumerals.length; i++) {
    strInput = strInput.replace(new RegExp(persianNumerals[i], 'g'), westernNumerals[i]);
  }
  return strInput;
}

// This file can be expanded with more specific Persian language tools if required.