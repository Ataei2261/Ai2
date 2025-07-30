
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error in ErrorBoundary:", error, errorInfo);
    this.setState({ error, errorInfo });
    // You can also log the error to an error reporting service here
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleClearStorageAndReload = () => {
    try {
      console.warn("Attempting to clear localStorage due to critical error.");
      // Selectively remove app-specific keys
      const appKeys = ['festivals', 'auth-session-v2']; // Updated key here
      let clearedSomething = false;
      appKeys.forEach(key => {
        if (localStorage.getItem(key) !== null) {
          localStorage.removeItem(key);
          clearedSomething = true;
          console.log(`[ErrorBoundary] Removed '${key}' from localStorage.`);
        }
      });
      if (!clearedSomething) { 
         // console.log("[ErrorBoundary] No app-specific keys found to remove, or they were already gone.");
      }

    } catch (e) {
      console.error("[ErrorBoundary] Failed to clear localStorage:", e);
    }
    window.location.reload();
  };


  public render() {
    if (this.state.hasError) {
      return (
        <div dir="rtl" className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col items-center justify-center p-4 text-gray-800 dark:text-gray-200">
          <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-lg shadow-xl text-center max-w-lg w-full">
            <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-xl sm:text-2xl font-bold text-red-600 dark:text-red-400 mb-3">
              خطایی رخ داده است
            </h1>
            <p className="mb-4 text-gray-700 dark:text-gray-300 text-sm sm:text-base">
              {this.props.fallbackMessage || 'متاسفانه مشکلی در بارگذاری یا اجرای برنامه پیش آمده است.'}
            </p>
            
            {this.state.error && (
              <details className="mb-4 text-left bg-red-50 dark:bg-gray-700 p-3 rounded-md border border-red-200 dark:border-red-600 text-xs">
                <summary className="cursor-pointer text-red-700 dark:text-red-400 font-medium">
                  نمایش جزئیات خطا (برای توسعه‌دهنده)
                </summary>
                <pre className="mt-2 whitespace-pre-wrap text-red-800 dark:text-red-300 overflow-auto max-h-32">
                  {this.state.error.toString()}
                  {this.state.errorInfo && `\nComponent Stack:\n${this.state.errorInfo.componentStack}`}
                </pre>
              </details>
            )}

            <p className="mb-5 text-sm text-gray-600 dark:text-gray-400">
              می‌توانید ابتدا صفحه را مجدداً بارگذاری کنید. اگر مشکل ادامه داشت، پاک کردن اطلاعات ذخیره‌شده برنامه و بارگذاری مجدد ممکن است کمک کند.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                    onClick={this.handleReload}
                    className="flex items-center justify-center px-4 py-2.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm"
                >
                    <RefreshCw size={18} className="me-2" />
                    بارگذاری مجدد صفحه
                </button>
                <button
                    onClick={this.handleClearStorageAndReload}
                    className="flex items-center justify-center px-4 py-2.5 bg-orange-500 text-white rounded-md hover:bg-orange-600 transition-colors text-sm font-medium shadow-sm"
                >
                    <Trash2 size={18} className="me-2" />
                    پاک کردن داده‌ها و بارگذاری مجدد
                </button>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-6">
                اگر مشکل همچنان پابرجا بود، لطفاً با توسعه‌دهنده تماس بگیرید و جزئیات خطا را (در صورت نمایش) ارائه دهید.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
