

import React, { useState, useEffect } from 'react';
import { FestivalsProvider, useFestivals } from './contexts/FestivalsContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { FileUploadArea } from './components/FileUploadArea';
import { FestivalList } from './components/FestivalList';
import { CalendarView } from './components/CalendarView';
import { APP_TITLE } from './constants';
import { AlertTriangle, CalendarDays, ListChecks, UploadCloud, LogOut, UserCircle, HelpCircle, Sun, Moon } from 'lucide-react'; // Added Sun, Moon
import { FestivalInfo } from './types';
import { parseJalaliDate, toGregorian } from './utils/dateConverter';
import { PasswordModal } from './components/PasswordModal';
import { LoadingSpinner } from './components/LoadingSpinner';
import { InteractiveTour } from './components/InteractiveTour'; 
import { useLocalStorage } from './hooks/useLocalStorage'; 

const TOUR_COMPLETED_KEY = 'photoContestAnalyzerTourCompleted_v1';
const HELP_BUTTON_VISIBLE_KEY = 'photoContestAnalyzerHelpButtonVisible_v1';
const APP_THEME_KEY = 'photoContestAnalyzerTheme_v1';


enum View {
  Upload = 'upload',
  List = 'list',
  Calendar = 'calendar',
}

function App() {
  return (
    <AuthProvider>
      <FestivalsProvider>
        <AppContentRouter />
      </FestivalsProvider>
    </AuthProvider>
  );
}

const AppContentRouter: React.FC = () => {
  const { activeSession, isLoading: authIsLoading } = useAuth();
  const { isLoading: festivalsAreLoading, festivals, dbError } = useFestivals();


  if (authIsLoading || (festivalsAreLoading && festivals.length === 0 && !dbError)) { // Show loading if auth is loading OR festivals are loading initially without errors
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col items-center justify-center" dir="rtl">
        <LoadingSpinner size="12" color="text-teal-600 dark:text-teal-400" />
        <p className="mt-4 text-teal-600 dark:text-teal-400">در حال بارگذاری برنامه...</p>
         {dbError && ( // Display DB error during initial load if it occurs
          <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-md shadow-md max-w-md text-center">
            <AlertTriangle className="inline-block me-2" />
            خطا در بارگذاری داده‌های اولیه: {dbError.message}. لطفاً صفحه را رفرش کنید.
          </div>
        )}
      </div>
    );
  }


  if (!activeSession.isAuthenticated) {
    return <PasswordModal />;
  }

  return <AppContentWrapper />;
};


const AppContentWrapper: React.FC = () => {
  const { festivals, dbError: festivalsDbError } = useFestivals(); 
  const { logout, activeSession, isLoading: authContextIsLoading } = useAuth(); 
  const [criticalDeadlines, setCriticalDeadlines] = useState<FestivalInfo[]>([]);
  const [upcomingNonCriticalDeadlines, setUpcomingNonCriticalDeadlines] = useState<FestivalInfo[]>([]);
  const [currentView, setCurrentView] = useState<View>(View.Calendar); 
  
  const [timeLeftDisplay, setTimeLeftDisplay] = useState<string>('');

  const [hasCompletedTour, setHasCompletedTour] = useLocalStorage<boolean>(TOUR_COMPLETED_KEY, false);
  const [isTourActive, setIsTourActive] = useState<boolean>(false);
  const [currentTourStep, setCurrentTourStep] = useState<number>(0);
  const [showHelpButtonVisibility, setShowHelpButtonVisibility] = useLocalStorage<boolean>(HELP_BUTTON_VISIBLE_KEY, false);
  
  const [theme, setTheme] = useLocalStorage<'light' | 'dark'>(APP_THEME_KEY, 
    (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'
  );

  const [activeEmergencyFilterSource, setActiveEmergencyFilterSource] = useState<FestivalInfo[] | null>(null);
  const [activeEmergencyFilterType, setActiveEmergencyFilterType] = useState<'critical' | 'upcomingNonCritical' | null>(null);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);
  
  // Redirect viewer from upload view if they somehow land on it
  useEffect(() => {
    if (activeSession.role === 'viewer' && currentView === View.Upload) {
      setCurrentView(View.Calendar);
    }
  }, [activeSession.role, currentView]);

  const toggleTheme = () => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };


  useEffect(() => {
    if (activeSession.isAuthenticated && !authContextIsLoading && !hasCompletedTour && !showHelpButtonVisibility) {
      const timer = setTimeout(() => {
        setIsTourActive(true);
        setCurrentTourStep(0); 
      }, 700); 
      return () => clearTimeout(timer);
    }
  }, [activeSession.isAuthenticated, authContextIsLoading, hasCompletedTour, showHelpButtonVisibility]);

  const handleCompleteTour = () => {
    setIsTourActive(false);
    setHasCompletedTour(true);
    setShowHelpButtonVisibility(true); 
  };

  const startTourManually = () => {
    setIsTourActive(true);
    setCurrentTourStep(0); 
  };

  useEffect(() => {
    if (isTourActive) {
      document.body.classList.add('tour-active');
    } else {
      document.body.classList.remove('tour-active');
    }
    return () => { 
      document.body.classList.remove('tour-active');
    };
  }, [isTourActive]);


  useEffect(() => {
    document.title = APP_TITLE;
    if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const checkAndSetDeadlines = (currentFestivals: FestivalInfo[]) => {
      const now = new Date();
      now.setHours(0,0,0,0); 
      const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000 - 1); 
      const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

      const criticalItems: FestivalInfo[] = [];
      const allUpcomingForNotifications: FestivalInfo[] = [];

      currentFestivals.forEach(festival => {
        let deadlineDate: Date | null = null;

        if (festival.submissionDeadlineGregorian) {
            try {
                const parts = festival.submissionDeadlineGregorian.split('-');
                if (parts.length === 3) {
                    const year = parseInt(parts[0], 10);
                    const month = parseInt(parts[1], 10) - 1; 
                    const day = parseInt(parts[2], 10);
                    const d = new Date(year, month, day);
                    d.setHours(0,0,0,0); 
                    if (!isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
                        deadlineDate = d;
                    } else {
                        console.warn(`Invalid or overflowed Gregorian date: ${festival.submissionDeadlineGregorian} for festival ${festival.festivalName}`);
                    }
                } else {
                     console.warn(`Malformed Gregorian date string: ${festival.submissionDeadlineGregorian} for festival ${festival.festivalName}`);
                }
            } catch (e) {
                console.error("Error parsing Gregorian deadline:", festival.submissionDeadlineGregorian, e);
            }
        } else if (festival.submissionDeadlinePersian) {
            try {
                const jDate = parseJalaliDate(festival.submissionDeadlinePersian);
                if (jDate) {
                    const gDate = toGregorian(jDate.jy, jDate.jm, jDate.jd);
                    const d = new Date(gDate.gy, gDate.gm - 1, gDate.gd);
                    d.setHours(0,0,0,0); 
                    if (!isNaN(d.getTime()) && d.getFullYear() === gDate.gy && d.getMonth() === gDate.gm - 1 && d.getDate() === gDate.gd) {
                        deadlineDate = d;
                    } else {
                        console.warn(`Invalid or overflowed date from Persian to Gregorian: ${festival.submissionDeadlinePersian} for festival ${festival.festivalName}`);
                    }
                }
            } catch (e) {
                console.error("Error parsing Persian deadline:", festival.submissionDeadlinePersian, e);
            }
        }

        if (deadlineDate) {
          if (deadlineDate >= now && deadlineDate <= twentyFourHoursFromNow) { 
            criticalItems.push(festival);
          }
          if (deadlineDate >= now && deadlineDate <= twoDaysFromNow) {
            allUpcomingForNotifications.push(festival);
          }
        }
      });

      setCriticalDeadlines(criticalItems);

      allUpcomingForNotifications.forEach(festival => {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.ready.then(registration => {
              registration.showNotification(`یادآوری: ${festival.festivalName}`, {
                body: `مهلت ارسال آثار برای ${festival.festivalName} به زودی (ظرف ۲ روز آینده) به پایان می‌رسد.`,
                icon: '/logo192.png',
                tag: `deadline-reminder-${festival.id}` 
              });
            }).catch(err => {
              console.error('Service Worker: Error showing notification:', err);
            });
          } else {
            console.warn('Service Worker not ready or not available for notifications. Notification for "${festival.festivalName}" might not be shown.');
          }
        }
      });
      
      const nonCriticalUpcoming = allUpcomingForNotifications.filter(
        ud => !criticalItems.find(cd => cd.id === ud.id)
      );
      setUpcomingNonCriticalDeadlines(nonCriticalUpcoming);
    };

    checkAndSetDeadlines(festivals);
  }, [festivals]);
  
  useEffect(() => {
    const LEGACY_SESSION_DURATION_MS_FALLBACK = 24 * 60 * 60 * 1000;

    if (activeSession.isAuthenticated) {
      const updateTimer = () => {
        const now = Date.now();
        let effectiveExpiryTimestamp: number | null = null;
        let effectiveLabel = "";
        let effectiveExpiredMessage = "";

        const candidates: { timestamp: number; label: string; expiredMessage: string; type: 'activation' | 'key' | 'legacy' }[] = [];

        if (activeSession.activationToken && activeSession.activationTokenExpiresAt) {
          if (activeSession.activationTokenExpiresAt > now) {
            candidates.push({
              timestamp: activeSession.activationTokenExpiresAt,
              label: "زمان انقضای فعال‌سازی:",
              expiredMessage: "فعال‌سازی منقضی شده",
              type: 'activation'
            });
          }
        }

        if (activeSession.sessionExpiresAt) {
          if (activeSession.sessionExpiresAt > now) {
            candidates.push({
              timestamp: activeSession.sessionExpiresAt,
              label: "زمان انقضای کلید اصلی:",
              expiredMessage: "کلید اصلی منقضی شده",
              type: 'key'
            });
          }
        }
        
        if (candidates.filter(c => c.type === 'activation' || c.type === 'key').length === 0 && activeSession.sessionStartedAt) {
            const legacyExpiry = activeSession.sessionStartedAt + LEGACY_SESSION_DURATION_MS_FALLBACK;
            if (legacyExpiry > now) {
                 candidates.push({
                    timestamp: legacyExpiry,
                    label: "زمان باقی‌مانده نشست (محلی):",
                    expiredMessage: "نشست محلی منقضی شده",
                    type: 'legacy'
                });
            }
        }

        if (candidates.length > 0) {
          candidates.sort((a, b) => a.timestamp - b.timestamp); 
          const soonest = candidates[0];
          effectiveExpiryTimestamp = soonest.timestamp;
          effectiveLabel = soonest.label;
          effectiveExpiredMessage = soonest.expiredMessage;
        }


        if (effectiveExpiryTimestamp === null || effectiveExpiryTimestamp <= now) {
          let finalExpiredMessage = "نشست منقضی شده"; 
          if (activeSession.activationToken && activeSession.activationTokenExpiresAt && activeSession.activationTokenExpiresAt <= now) {
            finalExpiredMessage = "فعال‌سازی منقضی شده";
          } else if (activeSession.sessionExpiresAt && activeSession.sessionExpiresAt <= now) {
            finalExpiredMessage = "کلید اصلی منقضی شده";
          } else if (activeSession.sessionStartedAt && (activeSession.sessionStartedAt + LEGACY_SESSION_DURATION_MS_FALLBACK <= now)) {
            finalExpiredMessage = "نشست محلی منقضی شده";
          }
          setTimeLeftDisplay(finalExpiredMessage);
          return;
        }

        const remaining = effectiveExpiryTimestamp - now;
        const hours = Math.floor(remaining / (1000 * 60 * 60));
        const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
        setTimeLeftDisplay(`${effectiveLabel} ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`);
      };

      updateTimer(); 
      const intervalId = setInterval(updateTimer, 30000); 
      return () => clearInterval(intervalId);
    } else {
      setTimeLeftDisplay('');
    }
  }, [activeSession]);

  const handleEmergencyNotificationClick = (
    type: 'critical' | 'upcomingNonCritical',
    sourceList: FestivalInfo[]
  ) => {
    setActiveEmergencyFilterSource(sourceList);
    setActiveEmergencyFilterType(type);
    setCurrentView(View.List);
    // Attempt to scroll to the list view component
    setTimeout(() => { // Timeout to allow view switch and rendering
        const listElement = document.getElementById('festival-list-container');
        if (listElement) {
            listElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, 100);
  };

  const clearActiveEmergencyFilter = () => {
    setActiveEmergencyFilterSource(null);
    setActiveEmergencyFilterType(null);
  };


  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col items-center transition-colors duration-300" dir="rtl">
      <div className="w-full sticky top-0 z-40 backdrop-blur-lg bg-slate-100/80 dark:bg-slate-900/80 shadow-sm transition-colors duration-300">
        <div className="max-w-5xl mx-auto px-4"> 
          <header className="w-full pt-3 pb-2 text-center">
            <img src="https://i.postimg.cc/c4qbFYRR/image.png" alt="لوگو برنامه تحلیلگر فراخوان عکس" className="mx-auto mb-2 rounded-lg shadow-sm w-24 h-auto" />
            <h1 className="text-3xl font-bold text-teal-700 dark:text-teal-400">{APP_TITLE}</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              مدیریت فراخوان‌ها؛ تحلیل و انتخاب عکس با توجه به اهداف جشنواره
            </p>
            {activeSession.isAuthenticated && activeSession.userIdentifier && (
                 <div className="text-xs text-teal-600 dark:text-teal-300 mt-1">
                   <UserCircle size={14} className="inline-block me-1" />
                   کاربر: <span className="font-semibold">{activeSession.userIdentifier}</span> {activeSession.role && <span className="font-normal text-teal-500 dark:text-teal-400">({activeSession.role === 'admin' ? 'مدیر' : 'بیننده'})</span>}
                 </div>
            )}
             {timeLeftDisplay && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{timeLeftDisplay}</p>
            )}
          </header>

          <div className="w-full max-w-3xl mx-auto bg-white/40 dark:bg-slate-800/40 shadow-md rounded-lg p-2 mb-3 flex justify-between items-center transition-colors duration-300">
            <nav className="flex justify-start space-s-2 sm:space-s-3">
              {activeSession.role === 'admin' && (
                <button
                  id="tour-nav-upload"
                  onClick={() => setCurrentView(View.Upload)}
                  className={`flex items-center px-2 sm:px-4 py-2 rounded-md transition-colors duration-200 ease-in-out text-xs sm:text-sm ${currentView === View.Upload ? 'bg-teal-600 text-white dark:bg-teal-500' : 'text-gray-700 hover:bg-teal-100 dark:text-gray-300 dark:hover:bg-teal-700 dark:hover:text-gray-100'}`}
                >
                  <UploadCloud className="me-1 sm:me-2 h-4 sm:h-5 w-4 sm:w-5" /> بارگذاری
                </button>
              )}
              <button
                id="tour-nav-list"
                onClick={() => setCurrentView(View.List)}
                className={`flex items-center px-2 sm:px-4 py-2 rounded-md transition-colors duration-200 ease-in-out text-xs sm:text-sm ${currentView === View.List ? 'bg-teal-600 text-white dark:bg-teal-500' : 'text-gray-700 hover:bg-teal-100 dark:text-gray-300 dark:hover:bg-teal-700 dark:hover:text-gray-100'}`}
              >
                <ListChecks className="me-1 sm:me-2 h-4 sm:h-5 w-4 sm:w-5" /> لیست
              </button>
              <button
                id="tour-nav-calendar"
                onClick={() => setCurrentView(View.Calendar)}
                className={`flex items-center px-2 sm:px-4 py-2 rounded-md transition-colors duration-200 ease-in-out text-xs sm:text-sm ${currentView === View.Calendar ? 'bg-teal-600 text-white dark:bg-teal-500' : 'text-gray-700 hover:bg-teal-100 dark:text-gray-300 dark:hover:bg-teal-700 dark:hover:text-gray-100'}`}
              >
                <CalendarDays className="me-1 sm:me-2 h-4 sm:h-5 w-4 sm:w-5" /> تقویم
              </button>
            </nav>
            <div className="flex items-center space-s-1 sm:space-s-2">
                <button
                    onClick={toggleTheme}
                    className="p-1.5 sm:p-2 rounded-full text-yellow-500 hover:bg-yellow-100 dark:text-yellow-400 dark:hover:bg-yellow-700 transition-colors"
                    title={theme === 'light' ? 'تغییر به تم تیره' : 'تغییر به تم روشن'}
                >
                    {theme === 'light' ? <Moon className="h-5 sm:h-6 w-5 sm:w-6" /> : <Sun className="h-5 sm:h-6 w-5 sm:w-6" />}
                </button>
                {showHelpButtonVisibility && activeSession.isAuthenticated && (
                    <button
                        onClick={startTourManually}
                        className="p-1.5 sm:p-2 rounded-full text-sky-600 hover:bg-sky-100 dark:text-sky-400 dark:hover:bg-sky-700 transition-colors"
                        title="نمایش راهنمای تعاملی"
                    >
                        <HelpCircle className="h-5 sm:h-6 w-5 sm:w-6" />
                    </button>
                )}
                 {activeSession.isAuthenticated && (
                    <button
                        onClick={logout}
                        className="flex items-center px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-xs sm:text-sm text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-700 transition-colors"
                        title="خروج از حساب کاربری"
                    >
                        <LogOut className="me-1 sm:me-2 h-4 sm:h-5 w-4 sm:w-5" /> خروج
                    </button>
                )}
            </div>
          </div>
        </div>
      </div>
      
      <div className="w-full max-w-5xl mx-auto px-4 py-4 flex-grow">
        <div id="tour-notifications-area">
          {criticalDeadlines.length > 0 && (
            <div
              role="button"
              tabIndex={0}
              onClick={() => handleEmergencyNotificationClick('critical', criticalDeadlines)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleEmergencyNotificationClick('critical', criticalDeadlines); }}
              className="w-full max-w-3xl mx-auto p-4 my-4 bg-red-100 border-r-4 border-red-600 text-red-700 dark:bg-red-700/30 dark:text-red-300 dark:border-red-500 rounded-md shadow-lg animate-blink cursor-pointer hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              <div className="flex items-center">
                <AlertTriangle className="h-8 w-8 me-3 text-red-600 dark:text-red-400 flex-shrink-0" />
                <div>
                  <p className="font-bold text-lg">هشدار فوری! مهلت‌های بسیار نزدیک (امروز):</p>
                  <ul className="list-disc ps-5 mt-1">
                    {criticalDeadlines.map(f => (
                      <li key={f.id} className="text-md font-medium">
                        مهلت ارسال آثار برای "{f.festivalName}" امروز به پایان می‌رسد!
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {upcomingNonCriticalDeadlines.length > 0 && (
             <div
              role="button"
              tabIndex={0}
              onClick={() => handleEmergencyNotificationClick('upcomingNonCritical', upcomingNonCriticalDeadlines)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleEmergencyNotificationClick('upcomingNonCritical', upcomingNonCriticalDeadlines); }}
              className="w-full max-w-3xl mx-auto p-4 mb-6 bg-yellow-100 border-r-4 border-yellow-500 text-yellow-700 dark:bg-yellow-600/30 dark:text-yellow-300 dark:border-yellow-400 rounded-md shadow cursor-pointer hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2"
            >
              <div className="flex items-center">
                <AlertTriangle className="h-6 w-6 me-3 text-yellow-500 dark:text-yellow-400" />
                <div>
                  <p className="font-bold">مهلت‌های نزدیک (ظرف ۲ روز آینده، غیر از موارد فوری):</p>
                  <ul className="list-disc ps-5">
                  {upcomingNonCriticalDeadlines.map(f => <li key={f.id}>مهلت "{f.festivalName}" به زودی فرا می‌رسد.</li>)}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div> 


        {festivalsDbError && (
          <div className="w-full max-w-3xl mx-auto p-4 mb-6 bg-orange-100 border-r-4 border-orange-500 text-orange-800 dark:bg-orange-700/30 dark:text-orange-300 dark:border-orange-400 rounded-md shadow">
            <div className="flex items-start">
              <AlertTriangle className="h-6 w-6 me-3 text-orange-500 dark:text-orange-400 flex-shrink-0" />
              <div className="flex-grow">
                <p className="font-bold">هشدار پایگاه داده!</p>
                <p className="text-sm">
                  {festivalsDbError.name === 'QuotaExceededError' 
                    ? 'فضای ذخیره‌سازی محلی مرورگر پر است. ممکن است تغییرات جدید یا فایل‌های بزرگ ذخیره نشوند. برای رفع مشکل، سعی کنید تعدادی از فراخوان‌های قدیمی‌تر یا فایل‌های حجیم را حذف کنید، یا فضای ذخیره‌سازی مرورگر خود را برای این سایت مدیریت نمایید.'
                    : `خطایی در پایگاه داده داخلی برنامه رخ داده است: ${festivalsDbError.message}. ممکن است برخی اطلاعات به درستی بارگذاری یا ذخیره نشوند.`}
                </p>
                <p className="text-xs mt-1 text-orange-700 dark:text-orange-300">در صورت ادامه مشکل، اطلاعات کنسول مرورگر (F12) می‌تواند مفید باشد یا با پشتیبانی تماس بگیرید.</p>
              </div>
            </div>
          </div>
        )}

        <main className="w-full max-w-3xl mx-auto">
          {currentView === View.Upload && <FileUploadArea />}
          {currentView === View.List && (
            <FestivalList 
              emergencyFilterSource={activeEmergencyFilterSource}
              emergencyFilterType={activeEmergencyFilterType}
              clearActiveEmergencyFilter={clearActiveEmergencyFilter}
            />
          )}
          {currentView === View.Calendar && <CalendarView />}
        </main>
      </div>

      <InteractiveTour
        isOpen={isTourActive}
        currentStepIndex={currentTourStep}
        setCurrentStepIndex={setCurrentTourStep}
        onComplete={handleCompleteTour}
        currentAppView={currentView}
      />
      
      <footer className="w-full max-w-5xl mx-auto px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700">
        <p>
          ایده و طراحی محمد عطایی 09112790490‏
          <br />
          ساخته شده با ❤️ و React + TailwindCSS + Gemini API
        </p>
      </footer>
    </div>
  );
};

export default App;
