import jalaali from 'jalaali-js';
import { JalaliDate, GregorianDate } from '../types';
import { convertPersianToWesternNumerals } from './persianTools'; // Ensure this is imported if used here, or preferably before calling these utils

// Re-exporting from jalaali-js for convenience and consistent interface
export const toJalaali = (gy: number, gm: number, gd: number): JalaliDate => jalaali.toJalaali(gy, gm, gd);
export const toGregorian = (jy: number, jm: number, jd: number): GregorianDate => jalaali.toGregorian(jy, jm, jd);
export const isValidJalaliDate = (jy: number, jm: number, jd: number): boolean => jalaali.isValidJalaaliDate(jy, jm, jd);
export const jalaaliMonthLength = (jy: number, jm: number): number => jalaali.jalaaliMonthLength(jy, jm);

export const jalaaliToday = (): JalaliDate => {
  const today = new Date();
  return jalaali.toJalaali(today.getFullYear(), today.getMonth() + 1, today.getDate());
};

/**
 * Calculates the day of the week for a Gregorian date.
 * @returns {number} 0 for Saturday, 1 for Sunday, ..., 6 for Friday. (Persian calendar standard)
 */
export const weekDay = (gy: number, gm: number, gd: number): number => {
  // JavaScript's Date.getDay() returns 0 for Sunday, 1 for Monday, ..., 6 for Saturday.
  // We need to map this to Persian standard: 0 for Saturday, ..., 6 for Friday.
  const jsDay = new Date(gy, gm - 1, gd).getDay(); // gm is 1-12, Date month is 0-11
  // JS: Sun(0),Mon(1),Tue(2),Wed(3),Thu(4),Fri(5),Sat(6)
  // FA: Sat(0),Sun(1),Mon(2),Tue(3),Wed(4),Thu(5),Fri(6)
  // Mapping: (jsDay + 1) % 7, but Saturday needs to be 0
  if (jsDay === 6) return 0; // Saturday
  return jsDay + 1; 
};


export const formatJalaliDate = (jalaliDateStr?: string): string => {
  if (!jalaliDateStr) return 'نامشخص';
  const westernizedDateStr = convertPersianToWesternNumerals(jalaliDateStr) || jalaliDateStr;
  // Assuming jalaliDateStr is "YYYY/MM/DD"
  try {
    const parts = westernizedDateStr.split('/');
    if (parts.length === 3) {
      const [y, m, d] = parts.map(Number);
      if (isValidJalaliDate(y,m,d)) {
         return `${String(d).padStart(2, '0')} / ${String(m).padStart(2, '0')} / ${y}`; // DD / MM / YYYY
      }
    }
    return westernizedDateStr; // Return original if not parsable in expected format
  } catch {
    return westernizedDateStr;
  }
};

export const formatGregorianDate = (gregorianDateStr?: string): string => {
  if (!gregorianDateStr) return 'نامشخص';
  const westernizedDateStr = convertPersianToWesternNumerals(gregorianDateStr) || gregorianDateStr;
  // Assuming gregorianDateStr is "YYYY-MM-DD"
  try {
    const date = new Date(westernizedDateStr + "T00:00:00"); // Ensure parsing as local date
    if (isNaN(date.getTime())) return westernizedDateStr; // Invalid date
    // Format to DD / MM / YYYY for display consistency if needed, or keep as is.
    // For now, assume it's already YYYY-MM-DD and display directly
    return westernizedDateStr;
  } catch {
    return westernizedDateStr;
  }
};

// For HTML date input (YYYY-MM-DD)
export const formatGregorianDateForInput = (gDate: GregorianDate): string => {
  return `${gDate.gy}-${String(gDate.gm).padStart(2, '0')}-${String(gDate.gd).padStart(2, '0')}`;
};

// For text input (YYYY/MM/DD)
export const formatJalaliDateForInput = (jDate: JalaliDate): string => {
  return `${jDate.jy}/${String(jDate.jm).padStart(2, '0')}/${String(jDate.jd).padStart(2, '0')}`;
};

export const parseJalaliDate = (dateStr: string | undefined): JalaliDate | null => {
  if (!dateStr) return null;
  const westernDateStr = convertPersianToWesternNumerals(dateStr);
  if (!westernDateStr) return null;

  const parts = westernDateStr.split(/[-/.]/); // Allow various separators
  if (parts.length === 3) {
    const [y, m, d] = parts.map(Number);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      // Basic validation for year range, can be more specific
      // isValidJalaliDate will do the proper structural check.
      // We don't need to check y > 1000 etc. here, isValidJalaliDate handles it.
      return { jy: y, jm: m, jd: d };
    }
  }
  return null;
};

export const isValidGregorianDateString = (dateString: string | undefined): boolean => {
    if (!dateString) return false;
    const westernDateString = convertPersianToWesternNumerals(dateString);
    if (!westernDateString) return false;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(westernDateString)) {
        return false; // Invalid format
    }
    const date = new Date(westernDateString + "T00:00:00"); // Ensure parsed as local, not UTC
    if (isNaN(date.getTime())) {
        return false; // Invalid date value (e.g., 2023-02-30)
    }
    // Check if the date object's parts match the input string parts to catch issues like month overflow
    const [year, month, day] = westernDateString.split('-').map(Number);
    return date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day;
};

/**
 * Validates if the Jalali year is within a reasonable range for contemporary contests.
 * @param jy Jalali year number.
 * @returns A string error message if validation fails, otherwise null.
 */
export function getJalaliYearValidationMessage(jy: number | undefined): string | null {
  if (jy === undefined) return null; // No year to validate
  // Assuming contemporary contests are roughly between 1300 and 1500 Jalali.
  // This range can be adjusted.
  if (jy < 1300 || jy > 1500) { 
    return `سال شمسی (${jy}) خارج از محدوده مورد انتظار (1300-1500) است. لطفاً بررسی کنید.`;
  }
  return null; // Year is within the expected range
}