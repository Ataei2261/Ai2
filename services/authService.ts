
import { AUTH_SCRIPT_URL } from '../constants';

interface AuthResponse {
  success: boolean;
  user?: string; 
  error?: string;
  expiresAt?: string; // Original key's expiry from server (less relevant for session, but could be info)
  activationToken?: string; // New: Token for this specific activation
  activationTokenExpiresAt?: string; // New: ISO string for activation token expiry
  role?: 'admin' | 'viewer';
}

export async function verifyPassword(password: string): Promise<AuthResponse> {
  if (!password.trim()) {
    return { success: false, error: 'رمز عبور (کلید) نمی‌تواند خالی باشد.' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 seconds timeout

  try {
    const response = await fetch(`${AUTH_SCRIPT_URL}?key=${encodeURIComponent(password)}`, {
      method: 'GET', 
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorText = `خطا در ارتباط با سرور احراز هویت. کد وضعیت: ${response.status}`;
      try {
        const errorBody = await response.json(); // Try to parse error body as JSON
        if (errorBody && errorBody.error) {
          errorText = errorBody.error;
        } else {
          const bodyText = await response.text(); 
          if (bodyText) {
            errorText = bodyText.substring(0, 200); 
          } else if (response.statusText) {
            errorText = `خطا: ${response.statusText}`;
          }
        }
      } catch (e) {
        // Fallback if error body is not JSON or text() fails
         if (response.statusText) {
          errorText = `خطا: ${response.statusText}`;
        }
      }
      if ((response.status === 401 || response.status === 403) && errorText.startsWith("خطا در ارتباط")) {
          errorText = 'کلید نامعتبر است یا دسترسی مجاز نیست.';
      }
      return { success: false, error: errorText };
    }

    const contentType = response.headers.get("content-type");

    if (contentType && contentType.toLowerCase().includes("application/json")) {
      try {
        const data: AuthResponse = await response.json();
        if (typeof data.success === 'boolean') {
          if (data.success) {
            // Modern responses should have a role. Default to 'viewer' if missing.
            if (!data.role) {
              console.warn("Successful auth response is missing 'role'. Defaulting to 'viewer' for security.");
              data.role = 'viewer';
            }
            return data; // Return the full response data
          } else {
            // data.success is false, return the error from server
            return data;
          }
        } else {
          console.error('Invalid JSON structure from auth server (missing "success" boolean). Response:', data);
          return { success: false, error: 'پاسخ نامعتبر از سرور احراز هویت (ساختار JSON اشتباه است).' };
        }
      } catch (jsonError: any) {
        console.error('Failed to parse JSON response from auth server:', jsonError);
        return { success: false, error: `خطا در پردازش پاسخ JSON از سرور: ${jsonError.message}` };
      }
    } else {
      // Handle legacy plain text responses from Google Apps Script ("VALID", "EXPIRED", "INVALID")
      const textResponse = await response.text();
      const normalizedTextResponse = textResponse.toLowerCase().trim();

      if (normalizedTextResponse === "valid") {
        console.warn("Legacy 'VALID' response from server. Assuming 'admin' role for backward compatibility.");
        return { success: true, user: password, role: 'admin' }; 
      } else if (normalizedTextResponse === "expired") {
        return { success: false, error: 'کلید وارد شده منقضی شده است.' };
      } else if (normalizedTextResponse === "invalid") {
        return { success: false, error: 'کلید وارد شده نامعتبر است.' };
      } else {
        if (normalizedTextResponse.includes("فعال سازی") || normalizedTextResponse.includes("activation")) {
           return { success: false, error: textResponse.trim() };
        }
        console.warn(`Auth server response was unexpected text/plain: "${textResponse.substring(0, 200)}"`);
        return { success: false, error: `سرور پاسخی با فرمت غیرمنتظره ارسال کرد: ${textResponse.substring(0, 100)}` };
      }
    }

  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      return { success: false, error: 'عملیات بررسی کلید به دلیل وقفه زمانی لغو شد.' };
    }
    console.error('Network or other error verifying key with Google Apps Script:', error);
    return { success: false, error: `خطا در ارتباط با سرویس احراز هویت: ${error.message}` };
  }
}
