
import React, { useState, FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LoadingSpinner } from './LoadingSpinner';
import { ShieldCheck, AlertCircle, LogIn } from 'lucide-react';
import { APP_TITLE } from '../constants';


export const PasswordModal: React.FC = () => {
  const [password, setPassword] = useState('');
  const { login, isLoading, authError } = useAuth();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password.trim()) {
        // setError directly in context, so it will be displayed
        login(password); // Let AuthContext handle empty password error from authService
        return;
    }
    await login(password);
  };

  return (
    <div className="fixed inset-0 bg-gray-800 bg-opacity-80 flex items-center justify-center p-4 z-[100]" dir="rtl">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md transform transition-all p-6 sm:p-8">
        <div className="text-center">
          <img 
            src="https://i.postimg.cc/c4qbFYRR/image.png" 
            alt="لوگو برنامه" 
            className="mx-auto mb-4 rounded-lg shadow-md w-28 h-auto"
          />
          <h2 className="text-2xl font-bold text-teal-700 mb-2">ورود به {APP_TITLE}</h2>
          <p className="text-sm text-gray-600 mb-6">
            برای دسترسی به امکانات برنامه، لطفاً رمز عبور خود را وارد کنید.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="password-input" className="sr-only">
              رمز عبور
            </label>
            <div className="relative">
              <input
                id="password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="رمز عبور"
                required
                className="w-full p-3 ps-10 text-gray-700 bg-gray-50 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors placeholder-gray-400"
                aria-describedby={authError ? "password-error" : undefined}
              />
              <ShieldCheck className="absolute start-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            </div>
          </div>

          {authError && (
            <div id="password-error" role="alert" className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-md flex items-center text-sm">
              <AlertCircle className="h-5 w-5 me-2 flex-shrink-0" />
              <span className="flex-grow">{authError}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center px-6 py-3 bg-teal-600 text-white font-semibold rounded-lg shadow-md hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <LoadingSpinner size="5" color="text-white" />
            ) : (
              <>
                <LogIn size={20} className="me-2" />
                ورود
              </>
            )}
          </button>
        </form>
         <div className="text-xs text-gray-500 mt-6 text-center space-y-1">
            <p>مدیریت فراخوان‌ها، تحلیل و انتخاب عکس بر اساس اهداف جشنواره</p>
            <p>در صورتی که هنوز رمز ورود را دریافت نکرده‌اید، لطفاً با مدیر برنامه تماس بگیرید:</p>
            <p className="font-semibold text-gray-600">📞 09112790490</p>
        </div>
      </div>
    </div>
  );
};
