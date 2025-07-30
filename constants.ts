

export const APP_TITLE = "دستیار هوشمند فراخوان‌های عکاسی";
export const GEMINI_MODEL_TEXT = "gemini-2.5-flash";
export const GEMINI_MODEL_VISION = "gemini-2.5-flash";

export const AUTH_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzxTyIDUg_c1OGDoAkbf7zK9CSw58dxO4AOS2n-JXZaJmL53spamSwcMAfDnHEZbsM-gQ/exec";

// URL for the publicly published festivals data for viewer synchronization.
// !!! CRITICAL CONFIGURATION !!!
// This URL MUST be replaced with the actual public URL of the 'updates.json' file
// from your Vercel Blob store. After the admin publishes for the first time, the
// correct URL will be displayed to them. Copy that URL and paste it here for the app to work.
export const PUBLIC_FESTIVALS_URL = "https://pfelhpbe1a0v4hpv.public.blob.vercel-storage.com/updates.json";


export const PERSIAN_MONTH_NAMES = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"
];

// Used for month filter dropdown, index 0 is "All Months"
export const PERSIAN_MONTH_NAMES_WITH_ALL = [
  "همه ماه‌ها", ...PERSIAN_MONTH_NAMES
];


export const PERSIAN_WEEK_DAYS_SHORT = [
  "ش", "ی", "د", "س", "چ", "پ", "ج" // شنبه تا جمعه
];