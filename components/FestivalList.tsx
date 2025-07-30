import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useFestivals } from '../contexts/FestivalsContext';
import { FestivalCard } from './FestivalCard';
import { FestivalModal } from './FestivalModal';
import { FestivalInfo, AppBackup } from '../types';
import { Search, Calendar as CalendarIcon, Download as DownloadIconLucide, Save, FolderOpen, AlertTriangle, CheckCircle, Upload, RotateCcw, ArrowDownUp, X, ListChecks, Send } from 'lucide-react';
import { PERSIAN_MONTH_NAMES_WITH_ALL } from '../constants';
import { parseJalaliDate, toJalaali, jalaaliToday, toGregorian } from '../utils/dateConverter';
import { useAuth } from '../contexts/AuthContext';
import { LoadingSpinner } from './LoadingSpinner';
import { canUseFileSystemAccessApi, saveFestivalsToFileSystem, loadFestivalsFromFileSystem, readJsonFromFile } from '../services/fileSystemAccessService';

type ActiveDateFilter = 'currentMonth' | 'pastMonths' | 'futureMonths';
type SubmittedStatusFilterType = 'all' | 'submitted' | 'notSubmitted';

interface FestivalListProps {
  emergencyFilterSource: FestivalInfo[] | null;
  emergencyFilterType: 'critical' | 'upcomingNonCritical' | null;
  clearActiveEmergencyFilter: () => void;
}

export const FestivalList: React.FC<FestivalListProps> = ({
  emergencyFilterSource,
  emergencyFilterType,
  clearActiveEmergencyFilter,
}) => {
  const { activeSession } = useAuth();
  const { festivals, isLoading: contextIsLoading, replaceAllFestivals } = useFestivals();
  const [selectedFestival, setSelectedFestival] = useState<FestivalInfo | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const initialCurrentMonth = jalaaliToday().jm;
  const [selectedShamsiMonth, setSelectedShamsiMonth] = useState<number>(initialCurrentMonth);
  const [activeDateFilter, setActiveDateFilter] = useState<ActiveDateFilter>('currentMonth');
  const [submittedStatusFilter, setSubmittedStatusFilter] = useState<SubmittedStatusFilterType>('all');


  const [isFileApiAvailable, setIsFileApiAvailable] = useState(false);
  const [fileOperationLoading, setFileOperationLoading] = useState(false);
  const [fileOpMessage, setFileOpMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishMessage, setPublishMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const mobileUploadInputRef = useRef<HTMLInputElement>(null);
  
  const isAdmin = activeSession.role === 'admin';

  useEffect(() => {
    setIsFileApiAvailable(canUseFileSystemAccessApi());
  }, []);

  useEffect(() => {
    // This effect ensures selectedShamsiMonth is correctly set when activeDateFilter is 'currentMonth',
    // especially after an emergency filter is cleared or on initial load.
    if (!emergencyFilterType && activeDateFilter === 'currentMonth') {
      setSelectedShamsiMonth(jalaaliToday().jm);
    }
    // For 'pastMonths' or 'futureMonths', selectedShamsiMonth is handled by handleDateFilterButtonClick
    // and the manual dropdown selection (handleMonthDropdownChange).
  }, [activeDateFilter, emergencyFilterType]);


  const handleEdit = (festival: FestivalInfo) => {
    setSelectedFestival(festival);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedFestival(null);
  };
  
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handleDateFilterButtonClick = (filter: ActiveDateFilter) => {
    if (emergencyFilterType) {
      clearActiveEmergencyFilter();
    }
    setActiveDateFilter(filter);

    if (filter === 'currentMonth') {
      setSelectedShamsiMonth(jalaaliToday().jm);
    } else if (filter === 'pastMonths' || filter === 'futureMonths') {
      setSelectedShamsiMonth(0); // 0 represents "All Months"
    }
  };
  
  const handleMonthDropdownChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (emergencyFilterType) {
      clearActiveEmergencyFilter();
    }
    setSelectedShamsiMonth(Number(e.target.value));
  };

  const handleSubmittedStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (emergencyFilterType) {
      clearActiveEmergencyFilter();
    }
    setSubmittedStatusFilter(e.target.value as SubmittedStatusFilterType);
  };

  const handleSaveDataToSystem = async () => {
    setFileOperationLoading(true);
    setFileOpMessage(null);
    
    const dataToSave: AppBackup = {
      festivals,
    };

    const result = await saveFestivalsToFileSystem(dataToSave, festivals.length > 0);
    if (result.success) {
      setFileOpMessage({ type: 'success', text: result.message });
    } else {
      setFileOpMessage({ type: 'error', text: result.message });
    }
    setFileOperationLoading(false);
     setTimeout(() => setFileOpMessage(null), 5000);
  };

  const handleLoadDataFromSystem = async () => {
    const confirmation = window.confirm(
      "بارگذاری اطلاعات از فایل، تمام اطلاعات فراخوان‌های فعلی شما را پاک کرده و با اطلاعات فایل جایگزین می‌کند. آیا مطمئن هستید؟"
    );
    if (!confirmation) return;

    setFileOperationLoading(true);
    setFileOpMessage(null);
    const result = await loadFestivalsFromFileSystem(); 
    
    if (result.success && result.data) {
      const appData = result.data as AppBackup; 
      replaceAllFestivals(appData.festivals || []); 
      
      let message = `اطلاعات فراخوان‌ها با موفقیت از فایل "${result.fileName || 'انتخابی'}" بارگذاری شد.`;
      setFileOpMessage({ type: 'success', text: message });
      setTimeout(() => setFileOpMessage(null), 5000);
    } else {
      setFileOpMessage({ type: 'error', text: result.message });
       setTimeout(() => setFileOpMessage(null), 5000);
    }
    setFileOperationLoading(false);
  };
  
  const handleDownloadBackupJson = () => {
    if (festivals.length === 0) {
      setFileOpMessage({ type: 'error', text: 'هیچ اطلاعات فراخوانی برای دانلود وجود ندارد.' });
      setTimeout(() => setFileOpMessage(null), 3000);
      return;
    }

    setFileOperationLoading(true);
    setFileOpMessage(null);
    try {
      const dataToSave: AppBackup = {
        festivals,
      };
      const jsonString = JSON.stringify(dataToSave, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      const today = jalaaliToday();
      link.download = `festivals_backup_${today.jy}-${String(today.jm).padStart(2, '0')}-${String(today.jd).padStart(2, '0')}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(href);
      setFileOpMessage({ type: 'success', text: 'فایل پشتیبان اطلاعات فراخوان‌ها با موفقیت آماده دانلود شد.' });
    } catch (error: any) {
      console.error('Error creating JSON backup:', error);
      setFileOpMessage({ type: 'error', text: `خطا در ایجاد فایل پشتیبان JSON: ${error.message}` });
    } finally {
      setFileOperationLoading(false);
      setTimeout(() => setFileOpMessage(null), 5000);
    }
  };

  const handleUploadBackupJson = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const confirmation = window.confirm(
      "بارگذاری اطلاعات از فایل، تمام اطلاعات فراخوان‌های فعلی شما را پاک کرده و با اطلاعات فایل جایگزین می‌کند. آیا مطمئن هستید؟"
    );
    if (!confirmation) {
      if (mobileUploadInputRef.current) mobileUploadInputRef.current.value = '';
      return;
    }

    setFileOperationLoading(true);
    setFileOpMessage(null);
    
    const result = await readJsonFromFile(file); 

    if (result.success && result.data) {
      const appData = result.data as AppBackup;
      replaceAllFestivals(appData.festivals || []);
      
      let message = `اطلاعات فراخوان‌ها با موفقیت از فایل "${file.name}" بارگذاری شد.`;
      setFileOpMessage({ type: 'success', text: message });
      setTimeout(() => setFileOpMessage(null), 5000);
    } else {
      setFileOpMessage({ type: 'error', text: result.message });
      setTimeout(() => setFileOpMessage(null), 5000);
    }
    setFileOperationLoading(false);
    if (mobileUploadInputRef.current) mobileUploadInputRef.current.value = ''; 
  };
  
  const handlePublish = async () => {
    if (noDataToSave) {
      setPublishMessage({ type: 'error', text: 'هیچ اطلاعاتی برای انتشار وجود ندارد.' });
      setTimeout(() => setPublishMessage(null), 5000);
      return;
    }

    const confirmation = window.confirm(
      `شما در حال انتشار ${festivals.length} فراخوان برای همه کاربران هستید. این عمل، داده‌های عمومی قبلی را بازنویسی می‌کند. آیا مطمئن هستید؟`
    );
    if (!confirmation) return;

    setIsPublishing(true);
    setPublishMessage(null); // Clear previous messages

    try {
      const payload = {
        version: new Date().toISOString(),
        festivals: festivals,
      };

      const response = await fetch('/api/publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        // Try to parse error response, but don't fail if it's not JSON
        let errorMessage = `خطا در انتشار داده‌ها. کد وضعیت: ${response.status}`;
        try {
          const errorResult = await response.json();
          if (errorResult.error) {
            errorMessage = errorResult.error;
          }
        } catch (e) {
          // Not a JSON response, maybe text. Ignore if parsing fails.
        }
        throw new Error(errorMessage);
      }

      // Vercel blob returns info about the stored file, which we don't need to display here.
      // We just need to know it was successful.
      await response.json(); // Consume the success response body

      setPublishMessage({ type: 'success', text: `انتشار موفق! داده‌ها برای کاربران «بیننده» به‌روز شد.` });

    } catch (error) {
      const err = error as Error;
      setPublishMessage({ type: 'error', text: `خطا در انتشار: ${err.message}` });
    } finally {
      setIsPublishing(false);
      setTimeout(() => setPublishMessage(null), 8000);
    }
  };

  const getGregorianDeadline = (festival: FestivalInfo): Date | null => {
    let deadline: Date | null = null;
    if (festival.submissionDeadlineGregorian) {
        try {
            const [year, month, day] = festival.submissionDeadlineGregorian.split('-').map(Number);
            const d = new Date(year, month - 1, day);
            if (!isNaN(d.getTime())) {
                d.setHours(0,0,0,0); 
                deadline = d;
            }
        } catch { deadline = null; }
    } else if (festival.submissionDeadlinePersian) {
        try {
            const jDate = parseJalaliDate(festival.submissionDeadlinePersian);
            if (jDate) {
                const gDate = toGregorian(jDate.jy, jDate.jm, jDate.jd);
                const d = new Date(gDate.gy, gDate.gm - 1, gDate.gd);
                if (!isNaN(d.getTime())) {
                    d.setHours(0,0,0,0); 
                    deadline = d;
                }
            }
        } catch { deadline = null; }
    }
    return deadline;
  };


  const filteredFestivals = useMemo(() => {
    let festivalsToDisplay: FestivalInfo[];
    const searchWords = searchTerm.toLowerCase().split(' ').filter(word => word.length > 0);

    if (emergencyFilterSource && emergencyFilterType) {
      festivalsToDisplay = [...emergencyFilterSource];
    } else {
      festivalsToDisplay = [...festivals];
      const todayJ = jalaaliToday();
      const currentJalaliYear = todayJ.jy;
      const currentJalaliMonth = todayJ.jm;
      const todayGregorian = new Date();
      todayGregorian.setHours(0, 0, 0, 0);

      festivalsToDisplay = festivalsToDisplay.filter(f => {
        const festivalGregorianDeadline = getGregorianDeadline(f);
        let festivalJalaliYear: number | null = null;
        let festivalJalaliMonth: number | null = null;

        if (f.submissionDeadlinePersian) {
          const parsed = parseJalaliDate(f.submissionDeadlinePersian);
          if (parsed) { festivalJalaliYear = parsed.jy; festivalJalaliMonth = parsed.jm; }
        } else if (festivalGregorianDeadline) {
          const jalali = toJalaali(festivalGregorianDeadline.getFullYear(), festivalGregorianDeadline.getMonth() + 1, festivalGregorianDeadline.getDate());
          festivalJalaliYear = jalali.jy; festivalJalaliMonth = jalali.jm;
        }
        
        if (activeDateFilter === 'currentMonth') {
          if (!festivalGregorianDeadline || festivalJalaliYear === null || festivalJalaliMonth === null) return false;
          return festivalJalaliYear === currentJalaliYear && 
                 festivalJalaliMonth === currentJalaliMonth &&
                 festivalGregorianDeadline.getTime() >= todayGregorian.getTime();
        } else if (activeDateFilter === 'pastMonths') {
          if (!festivalGregorianDeadline) return false;
          return festivalGregorianDeadline.getTime() < todayGregorian.getTime();
        } else if (activeDateFilter === 'futureMonths') {
           if (festivalJalaliYear === null || festivalJalaliMonth === null) return false;
          return festivalJalaliYear > currentJalaliYear || 
                 (festivalJalaliYear === currentJalaliYear && festivalJalaliMonth > currentJalaliMonth);
        }
        return true; 
      });

      if (activeDateFilter !== 'currentMonth' && selectedShamsiMonth > 0) {
        festivalsToDisplay = festivalsToDisplay.filter(f => {
          let festivalMonth: number | null = null;
          if (f.submissionDeadlinePersian) {
            const parsed = parseJalaliDate(f.submissionDeadlinePersian);
            if (parsed) festivalMonth = parsed.jm;
          } else {
            const gregDeadline = getGregorianDeadline(f);
            if (gregDeadline) {
              const jalali = toJalaali(gregDeadline.getFullYear(), gregDeadline.getMonth() + 1, gregDeadline.getDate());
              festivalMonth = jalali.jm;
            }
          }
          return festivalMonth === selectedShamsiMonth;
        });
      }
    }
    
    if (searchWords.length > 0) {
      festivalsToDisplay = festivalsToDisplay.filter(f => {
        return searchWords.some(word =>
          f.festivalName?.toLowerCase().includes(word) ||
          f.topics?.some(t => t.toLowerCase().includes(word)) ||
          f.objectives?.toLowerCase().includes(word)
        );
      });
    }

    if (submittedStatusFilter !== 'all') {
      festivalsToDisplay = festivalsToDisplay.filter(f => {
        if (submittedStatusFilter === 'submitted') return f.hasSubmitted === true;
        if (submittedStatusFilter === 'notSubmitted') return f.hasSubmitted === false || f.hasSubmitted === undefined;
        return true;
      });
    }
    
    return festivalsToDisplay.sort((a, b) => {
      const dateA = getGregorianDeadline(a);
      const dateB = getGregorianDeadline(b);
      if (dateA && dateB) return dateA.getTime() - dateB.getTime();
      if (dateA) return -1; 
      if (dateB) return 1;
      return (a.festivalName || "").localeCompare(b.festivalName || "");
    });

  }, [festivals, searchTerm, selectedShamsiMonth, activeDateFilter, submittedStatusFilter, emergencyFilterSource, emergencyFilterType]);


  if (contextIsLoading && festivals.length === 0 && !emergencyFilterSource) {
    return <div className="text-center py-10 text-gray-500 dark:text-gray-300">در حال بارگذاری لیست فراخوان‌ها...</div>;
  }

  const noDataToSave = festivals.length === 0; 
  const pageTitle = emergencyFilterType 
    ? `لیست فراخوان‌ها (${emergencyFilterType === 'critical' ? 'فقط هشدارهای فوری' : 'فقط مهلت‌های نزدیک'})` 
    : "لیست فراخوان‌های عکاسی";

  if (festivals.length === 0 && !contextIsLoading && !emergencyFilterSource) { 
    return (
        <div className="w-full" id="festival-list-container">
            <h2 className="text-3xl font-semibold text-teal-700 dark:text-teal-400 mb-6 text-center">{pageTitle}</h2>
            {isAdmin && (
              <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow-md flex flex-col sm:flex-row gap-4 items-center justify-center">
                  {isFileApiAvailable ? (
                    <>
                      <button
                        onClick={handleSaveDataToSystem}
                        disabled={fileOperationLoading || noDataToSave}
                        className="w-full sm:w-auto px-4 py-3 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
                        title={noDataToSave ? "هیچ اطلاعاتی برای ذخیره وجود ندارد" : "ذخیره اطلاعات فراخوان‌ها روی سیستم"}
                      >
                        {fileOperationLoading && <LoadingSpinner size="5" className="me-2" />}
                        <Save size={18} className="me-2" />
                        ذخیره اطلاعات روی سیستم
                      </button>
                      <button
                        onClick={handleLoadDataFromSystem}
                        disabled={fileOperationLoading}
                        className="w-full sm:w-auto px-4 py-3 bg-purple-600 text-white font-semibold rounded-lg shadow-md hover:bg-purple-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
                        title="بارگذاری اطلاعات فراخوان‌ها از فایل پشتیبان"
                      >
                        {fileOperationLoading && <LoadingSpinner size="5" className="me-2" />}
                        <FolderOpen size={18} className="me-2" />
                        بارگذاری اطلاعات از سیستم
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={handleDownloadBackupJson}
                        disabled={fileOperationLoading || noDataToSave}
                        className="w-full sm:w-auto px-4 py-3 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
                        title={noDataToSave ? "هیچ اطلاعاتی برای دانلود وجود ندارد" : "دانلود فایل پشتیبان JSON اطلاعات فراخوان‌ها"}
                      >
                        {fileOperationLoading && <LoadingSpinner size="5" className="me-2" />}
                        <DownloadIconLucide size={18} className="me-2" />
                        دانلود پشتیبان (JSON)
                      </button>
                      <label
                        htmlFor="upload-backup-input"
                        className={`w-full sm:w-auto px-4 py-3 bg-purple-600 text-white font-semibold rounded-lg shadow-md hover:bg-purple-700 transition-colors flex items-center justify-center cursor-pointer ${fileOperationLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title="بارگذاری پشتیبان از فایل JSON اطلاعات فراخوان‌ها"
                      >
                         {fileOperationLoading && <LoadingSpinner size="5" className="me-2" />}
                        <Upload size={18} className="me-2" />
                        بارگذاری پشتیبان (JSON)
                      </label>
                      <input
                        type="file"
                        id="upload-backup-input"
                        ref={mobileUploadInputRef}
                        className="hidden"
                        accept=".json,application/json"
                        onChange={handleUploadBackupJson}
                        disabled={fileOperationLoading}
                      />
                    </>
                  )}
              </div>
            )}
            {fileOpMessage && (
              <div className={`p-3 my-4 rounded-lg shadow-sm text-sm text-center ${fileOpMessage.type === 'success' 
                  ? 'bg-green-100 text-green-800 dark:bg-green-800/30 dark:text-green-200' 
                  : 'bg-red-100 text-red-800 dark:bg-red-800/40 dark:text-red-300'}`}>
                  {fileOpMessage.type === 'success' 
                      ? <CheckCircle className="inline me-2 h-5 w-5 text-green-600 dark:text-green-400" /> 
                      : <AlertTriangle className="inline me-2 h-5 w-5 text-red-600 dark:text-red-400" />}
                  {fileOpMessage.text}
              </div>
            )}
            <div className="text-center py-10 text-gray-500 dark:text-gray-400">
                هنوز هیچ فراخوانی اضافه نشده است. {isAdmin && "یک فایل جدید بارگذاری کنید تا شروع کنید!"}
            </div>
        </div>
    );
  }
  
  const dateFilterButtonBaseClasses = "px-3 py-2 text-xs sm:text-sm rounded-md font-medium flex items-center transition-colors duration-150 ease-in-out whitespace-nowrap";
  const dateFilterButtonActiveClasses = "bg-teal-600 text-white shadow-md dark:bg-teal-500";
  const dateFilterButtonInactiveClasses = "bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600";
  const filterControlDisabledClasses = "opacity-50 cursor-not-allowed";

  return (
    <div className="w-full" id="festival-list-container">
      <h2 className="text-3xl font-semibold text-teal-700 dark:text-teal-400 mb-6 text-center">{pageTitle}</h2>

      {emergencyFilterType && (
        <div className="mb-4 p-3 bg-sky-100 dark:bg-sky-800/40 text-sky-700 dark:text-sky-200 rounded-lg shadow flex justify-between items-center">
          <div className="flex items-center">
            <AlertTriangle size={20} className="me-2 text-sky-600 dark:text-sky-400" />
            <span className="font-semibold">
              فیلتر فعال: {emergencyFilterType === 'critical' ? 'هشدارهای فوری' : 'مهلت‌های نزدیک'}
            </span>
          </div>
          <button
            onClick={clearActiveEmergencyFilter}
            className="text-sky-600 dark:text-sky-300 hover:text-sky-800 dark:hover:text-sky-100 text-sm font-medium px-3 py-1 rounded-md hover:bg-sky-200 dark:hover:bg-sky-700 transition-colors flex items-center"
            title="پاک کردن این فیلتر ویژه"
          >
            <X size={16} className="me-1" /> پاک کردن فیلتر
          </button>
        </div>
      )}
      
      {/* Filter Bar */}
      <div className={`mb-6 p-3 bg-white dark:bg-gray-800 rounded-lg shadow-md flex flex-wrap gap-3 items-stretch ${emergencyFilterType ? 'opacity-70 pointer-events-none' : ''}`}>
        {/* Date Range Filter Buttons */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto order-1">
          <button
            onClick={() => handleDateFilterButtonClick('currentMonth')}
            className={`${dateFilterButtonBaseClasses} ${activeDateFilter === 'currentMonth' && !emergencyFilterType ? dateFilterButtonActiveClasses : dateFilterButtonInactiveClasses} ${emergencyFilterType ? filterControlDisabledClasses : ''} flex-1 xs:flex-auto sm:flex-initial`}
            aria-pressed={activeDateFilter === 'currentMonth' && !emergencyFilterType}
            disabled={!!emergencyFilterType}
          >
            <CalendarIcon size={16} className="me-1.5" /> ماه جاری (فعال)
          </button>
          <button
            onClick={() => handleDateFilterButtonClick('pastMonths')}
            className={`${dateFilterButtonBaseClasses} ${activeDateFilter === 'pastMonths' && !emergencyFilterType ? dateFilterButtonActiveClasses : dateFilterButtonInactiveClasses} ${emergencyFilterType ? filterControlDisabledClasses : ''} flex-1 xs:flex-auto sm:flex-initial`}
            aria-pressed={activeDateFilter === 'pastMonths' && !emergencyFilterType}
            disabled={!!emergencyFilterType}
          >
            <RotateCcw size={16} className="me-1.5" /> فراخوان‌های گذشته
          </button>
          <button
            onClick={() => handleDateFilterButtonClick('futureMonths')}
            className={`${dateFilterButtonBaseClasses} ${activeDateFilter === 'futureMonths' && !emergencyFilterType ? dateFilterButtonActiveClasses : dateFilterButtonInactiveClasses} ${emergencyFilterType ? filterControlDisabledClasses : ''} flex-1 xs:flex-auto sm:flex-initial`}
            aria-pressed={activeDateFilter === 'futureMonths' && !emergencyFilterType}
            disabled={!!emergencyFilterType}
          >
            <ArrowDownUp size={16} className="me-1.5" /> ماه‌های آینده
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:flex-grow order-2">
          <input 
            type="text"
            placeholder="جستجو بر اساس نام، موضوع یا اهداف..."
            className="w-full p-3 ps-10 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-shadow bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 text-sm"
            value={searchTerm}
            onChange={handleSearchChange}
            aria-label="متن جستجو"
            disabled={!!emergencyFilterType}
          />
          <Search className="absolute start-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-gray-500" />
        </div>

        {/* Month Dropdown */}
        <div className="relative w-full sm:w-auto sm:min-w-[150px] order-3">
          <select
            className={`w-full p-3 ps-10 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 appearance-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 transition-shadow text-sm ${emergencyFilterType || (activeDateFilter === 'currentMonth') ? filterControlDisabledClasses : ''}`}
            value={selectedShamsiMonth}
            onChange={handleMonthDropdownChange}
            aria-label="فیلتر بر اساس ماه شمسی"
            disabled={!!emergencyFilterType || (activeDateFilter === 'currentMonth')} 
          >
            {PERSIAN_MONTH_NAMES_WITH_ALL.map((monthName, index) => (
              <option key={index} value={index}>{monthName}</option> 
            ))}
          </select>
          <CalendarIcon className="absolute start-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-gray-500 pointer-events-none" />
        </div>
        
        {/* Submitted Status Dropdown */}
        <div className="relative w-full sm:w-auto sm:min-w-[170px] order-4">
          <select
            className={`w-full p-3 ps-10 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 appearance-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 transition-shadow text-sm ${emergencyFilterType ? filterControlDisabledClasses : ''}`}
            value={submittedStatusFilter}
            onChange={handleSubmittedStatusChange}
            aria-label="فیلتر بر اساس وضعیت ارسال"
            disabled={!!emergencyFilterType}
          >
            <option value="all">همه وضعیت‌ها</option>
            <option value="submitted">فقط ارسال شده‌ها</option>
            <option value="notSubmitted">فقط ارسال نشده‌ها</option>
          </select>
          <ListChecks className="absolute start-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-gray-500 pointer-events-none" />
        </div>
      </div>
      
      {/* Data Management Buttons (Save/Load/Publish) */}
      {isAdmin && (
        <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow-md flex flex-col sm:flex-row flex-wrap gap-4 items-center justify-center">
          {isFileApiAvailable ? (
            <>
              <button
                onClick={handleSaveDataToSystem}
                disabled={fileOperationLoading || isPublishing || noDataToSave }
                className="w-full sm:w-auto px-4 py-3 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
                title={noDataToSave ? "هیچ اطلاعاتی برای ذخیره وجود ندارد" : "ذخیره اطلاعات فراخوان‌ها روی سیستم"}
              >
                {fileOperationLoading && <LoadingSpinner size="5" className="me-2" />}
                <Save size={18} className="me-2" />
                ذخیره روی سیستم
              </button>
              <button
                onClick={handleLoadDataFromSystem}
                disabled={fileOperationLoading || isPublishing}
                className="w-full sm:w-auto px-4 py-3 bg-purple-600 text-white font-semibold rounded-lg shadow-md hover:bg-purple-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
                title="بارگذاری اطلاعات فراخوان‌ها از فایل پشتیبان"
              >
                {fileOperationLoading && <LoadingSpinner size="5" className="me-2" />}
                <FolderOpen size={18} className="me-2" />
                بارگذاری از سیستم
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleDownloadBackupJson}
                disabled={fileOperationLoading || isPublishing || noDataToSave }
                className="w-full sm:w-auto px-4 py-3 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
                title={noDataToSave ? "هیچ اطلاعاتی برای دانلود وجود ندارد" : "دانلود فایل پشتیبان JSON اطلاعات فراخوان‌ها"}
              >
                {fileOperationLoading && <LoadingSpinner size="5" className="me-2" />}
                <DownloadIconLucide size={18} className="me-2" />
                دانلود پشتیبان
              </button>
              <label
                htmlFor="upload-backup-input-list" 
                className={`w-full sm:w-auto px-4 py-3 bg-purple-600 text-white font-semibold rounded-lg shadow-md hover:bg-purple-700 transition-colors flex items-center justify-center cursor-pointer ${(fileOperationLoading || isPublishing) ? 'opacity-50 cursor-not-allowed' : ''}`}
                title="بارگذاری پشتیبان از فایل JSON اطلاعات فراخوان‌ها"
              >
                 {(fileOperationLoading) && <LoadingSpinner size="5" className="me-2" />}
                <Upload size={18} className="me-2" />
                بارگذاری پشتیبان
              </label>
              <input
                type="file"
                id="upload-backup-input-list"
                ref={mobileUploadInputRef}
                className="hidden"
                accept=".json,application/json"
                onChange={handleUploadBackupJson}
                disabled={fileOperationLoading || isPublishing}
              />
            </>
          )}
           <button
            onClick={handlePublish}
            disabled={isPublishing || fileOperationLoading || noDataToSave}
            className="w-full sm:w-auto px-4 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
            title={noDataToSave ? "هیچ اطلاعاتی برای انتشار وجود ندارد" : "انتشار داده‌های فعلی برای همه کاربران"}
          >
            {isPublishing ? <LoadingSpinner size="5" className="me-2" /> : <Send size={18} className="me-2" />}
            {isPublishing ? 'در حال انتشار...' : 'انتشار برای کاربران'}
          </button>
        </div>
      )}
       {(fileOpMessage || publishMessage) && !isPublishing && (
        <div className="mb-4 space-y-2">
            {fileOpMessage && (
            <div className={`p-3 rounded-lg shadow-sm text-sm text-center ${fileOpMessage.type === 'success' 
                ? 'bg-green-100 text-green-800 dark:bg-green-800/30 dark:text-green-200' 
                : 'bg-red-100 text-red-800 dark:bg-red-800/40 dark:text-red-300'}`}>
                {fileOpMessage.type === 'success' 
                    ? <CheckCircle className="inline me-2 h-5 w-5 text-green-600 dark:text-green-400" /> 
                    : <AlertTriangle className="inline me-2 h-5 w-5 text-red-600 dark:text-red-400" />}
                {fileOpMessage.text}
            </div>
            )}
            {publishMessage && (
            <div className={`p-3 rounded-lg shadow-sm text-sm text-center ${publishMessage.type === 'success' 
                ? 'bg-green-100 text-green-800 dark:bg-green-800/30 dark:text-green-200' 
                : 'bg-red-100 text-red-800 dark:bg-red-800/40 dark:text-red-300'}`}>
                {publishMessage.type === 'success' 
                    ? <CheckCircle className="inline me-2 h-5 w-5 text-green-600 dark:text-green-400" /> 
                    : <AlertTriangle className="inline me-2 h-5 w-5 text-red-600 dark:text-red-400" />}
                {publishMessage.text}
            </div>
            )}
        </div>
      )}

      {filteredFestivals.length === 0 && (searchTerm || selectedShamsiMonth > 0 || submittedStatusFilter !== 'all' || (activeDateFilter !== 'currentMonth' && festivals.length > 0) || emergencyFilterType ) && (
         <div className="text-center py-10 text-gray-500 dark:text-gray-400">
            {festivals.length > 0 || emergencyFilterSource ? "هیچ فراخوانی با معیارهای جستجو/فیلتر شما مطابقت ندارد." : "هنوز هیچ فراخوانی برای نمایش وجود ندارد."}
        </div>
      )}


      <div className="space-y-6">
        {filteredFestivals.map(festival => (
          <FestivalCard key={festival.id} festival={festival} onEdit={handleEdit} />
        ))}
      </div>
      {selectedFestival && (
        <FestivalModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          festivalData={selectedFestival}
          isEditing={true}
        />
      )}
    </div>
  );
};