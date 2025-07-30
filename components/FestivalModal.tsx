
import React, { useState, useEffect, FormEvent } from 'react';
import { FestivalInfo } from '../types';
import { useFestivals } from '../contexts/FestivalsContext';
import { X, Save, Tag, Calendar, AlertCircle, Link as LinkIcon, Maximize, Image as LucideImage, FileText, Type as TypeIcon, ClipboardPaste, Target, ExternalLink, Info, Edit2, MessageSquare, CheckCircle, DollarSign } from 'lucide-react'; // Added DollarSign
import { parseJalaliDate, toGregorian, toJalaali, isValidJalaliDate, formatJalaliDateForInput, formatGregorianDateForInput, isValidGregorianDateString, getJalaliYearValidationMessage, formatJalaliDate } from '../utils/dateConverter';
import { normalizeSubmissionUrl } from '../utils/urlUtils'; 
import { convertPersianToWesternNumerals } from '../utils/persianTools';

interface FestivalModalProps {
  isOpen: boolean;
  onClose: () => void;
  festivalData: Partial<FestivalInfo>;
  isEditing?: boolean;
  onSave?: (data: FestivalInfo) => void; // For new festival creation
}

export const FestivalModal: React.FC<FestivalModalProps> = ({ isOpen, onClose, festivalData, isEditing = false, onSave }) => {
  const { updateFestival, addFestival } = useFestivals();
  const [formData, setFormData] = useState<Partial<FestivalInfo>>({});
  const [topicsInput, setTopicsInput] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const [showDateConfirmationStep, setShowDateConfirmationStep] = useState(false);
  const [confirmedDeadlineDisplayPersian, setConfirmedDeadlineDisplayPersian] = useState<string | null>(null);
  const [confirmedDeadlineDisplayGregorian, setConfirmedDeadlineDisplayGregorian] = useState<string | null>(null);


  const validatePersianDateAndGetError = (persianDateStrRaw: string | undefined): string => {
    const persianDateStr = convertPersianToWesternNumerals(persianDateStrRaw);
    if (!persianDateStr || persianDateStr.trim() === '') return '';

    const parsedJalali = parseJalaliDate(persianDateStr); 
    if (!parsedJalali || !isValidJalaliDate(parsedJalali.jy, parsedJalali.jm, parsedJalali.jd)) {
        return "فرمت تاریخ شمسی صحیح نیست (مثال: YYYY/MM/DD).";
    }
    const yearValidationError = getJalaliYearValidationMessage(parsedJalali.jy);
    if (yearValidationError) {
        return yearValidationError;
    }
    return ''; 
  };


  useEffect(() => {
    if (!isOpen) {
      setShowDateConfirmationStep(false); // Reset confirmation step when modal closes or data changes
      return;
    }
    
    const festivalDataWesternized = {
        ...festivalData,
        submissionDeadlinePersian: convertPersianToWesternNumerals(festivalData.submissionDeadlinePersian),
        submissionDeadlineGregorian: convertPersianToWesternNumerals(festivalData.submissionDeadlineGregorian),
    };

    let initialFormData = { ...festivalDataWesternized };
    let initialErrors: Record<string, string> = {};

    if (initialFormData.submissionDeadlinePersian) {
      const persianDateError = validatePersianDateAndGetError(initialFormData.submissionDeadlinePersian);
      if (!persianDateError) { 
        const parsedJalali = parseJalaliDate(initialFormData.submissionDeadlinePersian)!; 
        const gregorian = toGregorian(parsedJalali.jy, parsedJalali.jm, parsedJalali.jd);
        initialFormData.submissionDeadlineGregorian = formatGregorianDateForInput(gregorian);
      } else { 
        initialErrors.submissionDeadlinePersian = persianDateError;
        initialFormData.submissionDeadlinePersian = festivalDataWesternized.submissionDeadlinePersian; 
        if (initialFormData.submissionDeadlineGregorian && isValidGregorianDateString(initialFormData.submissionDeadlineGregorian)) {
          const [year, month, day] = initialFormData.submissionDeadlineGregorian.split('-').map(Number);
          const jalali = toJalaali(year, month, day);
          if (!initialFormData.submissionDeadlinePersian) { // only set if not already set by user
            initialFormData.submissionDeadlinePersian = formatJalaliDateForInput(jalali);
             const derivedPersianError = validatePersianDateAndGetError(initialFormData.submissionDeadlinePersian);
            if(derivedPersianError) initialErrors.submissionDeadlinePersian = (initialErrors.submissionDeadlinePersian ? initialErrors.submissionDeadlinePersian + " " : "") + `خطای تاریخ شمسی مشتق شده: ${derivedPersianError}`;
          }
        } else {
          initialFormData.submissionDeadlineGregorian = undefined; 
        }
      }
    } 
    else if (initialFormData.submissionDeadlineGregorian && isValidGregorianDateString(initialFormData.submissionDeadlineGregorian)) {
      const [year, month, day] = initialFormData.submissionDeadlineGregorian.split('-').map(Number);
      const jalali = toJalaali(year, month, day);
      initialFormData.submissionDeadlinePersian = formatJalaliDateForInput(jalali);
      const derivedPersianError = validatePersianDateAndGetError(initialFormData.submissionDeadlinePersian);
      if(derivedPersianError) initialErrors.submissionDeadlinePersian = derivedPersianError;
    } 
    else {
      initialFormData.submissionDeadlinePersian = undefined;
      initialFormData.submissionDeadlineGregorian = undefined;
    }

    setFormData(initialFormData);
    setTopicsInput(initialFormData.topics?.join(', ') || '');
    setErrors(initialErrors);
    setShowDateConfirmationStep(false); // Ensure confirmation step is reset
  }, [isOpen, festivalData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    if (type === 'checkbox') {
        setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
        setFormData(prev => ({ ...prev, [name]: value }));
    }
    
    if (errors[name]) {
      setErrors(prev => ({...prev, [name]: ''}));
    }
  };

  const handleTopicsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTopicsInput(e.target.value);
    setFormData(prev => ({ ...prev, topics: e.target.value.split('\n').flatMap(line => line.split(',')).map(t => t.trim()).filter(t => t) }));
     if (errors.topics) {
      setErrors(prev => ({...prev, topics: ''}));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.festivalName?.trim()) {
      newErrors.festivalName = "نام فراخوان اجباری است.";
    }
    
    const persianDateError = validatePersianDateAndGetError(formData.submissionDeadlinePersian);
    if (persianDateError) {
      newErrors.submissionDeadlinePersian = persianDateError;
    }
    
    if (formData.feeStatusPaid && !formData.feeDescription?.trim()) {
        newErrors.feeDescription = "لطفاً توضیحات هزینه یا مبلغ را برای ورودی پولی وارد کنید.";
    }
    if (formData.feeStatusFree && formData.feeStatusPaid && !formData.feeDescription?.trim()) {
        newErrors.feeDescription = "برای شرایط ترکیبی (رایگان/پولی)، لطفاً توضیحات هزینه را ارائه دهید.";
    }


    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  const proceedToSave = () => {
    let submissionDeadlineGregorianFinal = formData.submissionDeadlineGregorian; 
    const finalPersianDate = convertPersianToWesternNumerals(formData.submissionDeadlinePersian);

    if (finalPersianDate && finalPersianDate.trim() !== '') {
        const parsedJalali = parseJalaliDate(finalPersianDate); 
        if (parsedJalali && isValidJalaliDate(parsedJalali.jy, parsedJalali.jm, parsedJalali.jd) && !getJalaliYearValidationMessage(parsedJalali.jy)) {
            const gregorian = toGregorian(parsedJalali.jy, parsedJalali.jm, parsedJalali.jd);
            submissionDeadlineGregorianFinal = formatGregorianDateForInput(gregorian);
        } else {
             submissionDeadlineGregorianFinal = undefined;
        }
    } else { 
        submissionDeadlineGregorianFinal = undefined; 
    }

    const normalizedSubmissionMethod = formData.submissionMethod ? normalizeSubmissionUrl(formData.submissionMethod) : undefined;

    const finalData: FestivalInfo = {
      id: formData.id || crypto.randomUUID(), 
      fileName: formData.fileName || 'N/A',
      fileType: formData.fileType || 'N/A',
      ...formData,
      topics: topicsInput.split('\n').flatMap(line => line.split(',')).map(t => t.trim()).filter(t => t),
      submissionDeadlinePersian: finalPersianDate?.trim() === '' ? undefined : finalPersianDate,
      submissionDeadlineGregorian: submissionDeadlineGregorianFinal,
      submissionMethod: normalizedSubmissionMethod,
      feeStatusFree: formData.feeStatusFree || false,
      feeStatusPaid: formData.feeStatusPaid || false,
      feeDescription: formData.feeDescription?.trim() === '' ? undefined : formData.feeDescription,
      extractionSourceUrls: formData.extractionSourceUrls, 
      userNotesForSmartAnalysis: formData.userNotesForSmartAnalysis?.trim() === '' ? undefined : formData.userNotesForSmartAnalysis,
    };
    
    if (isEditing) {
      updateFestival(finalData);
    } else if (onSave) { 
      onSave(finalData);
    } else { 
      addFestival(finalData);
    }
    setShowDateConfirmationStep(false); // Reset for next time
    onClose();
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    const persianDateToConfirm = convertPersianToWesternNumerals(formData.submissionDeadlinePersian);
    const gregorianDateToConfirm = formData.submissionDeadlineGregorian;

    if (!showDateConfirmationStep && (persianDateToConfirm?.trim() || gregorianDateToConfirm?.trim())) {
        let displayPersian = "نامشخص";
        if (persianDateToConfirm && !validatePersianDateAndGetError(persianDateToConfirm)) {
            displayPersian = formatJalaliDate(persianDateToConfirm);
        }
        
        let displayGregorian = "نامشخص";
        if (gregorianDateToConfirm && isValidGregorianDateString(gregorianDateToConfirm)) {
            displayGregorian = gregorianDateToConfirm; // This is 'YYYY-MM-DD' string.

            // If Persian was invalid but Gregorian is valid, try to derive Persian for display
             if (displayPersian === "نامشخص" || validatePersianDateAndGetError(persianDateToConfirm)) {
                const [gy, gm, gd] = gregorianDateToConfirm.split('-').map(Number);
                const jalali = toJalaali(gy, gm, gd); // jalali is {jy, jm, jd}
                const jalaliStrForValidation = formatJalaliDateForInput(jalali); // "YYYY/MM/DD"
                if (!validatePersianDateAndGetError(jalaliStrForValidation)) {
                    displayPersian = formatJalaliDate(jalaliStrForValidation); // "DD / MM / YYYY"
                }
            }
        }

        setConfirmedDeadlineDisplayPersian(displayPersian);
        setConfirmedDeadlineDisplayGregorian(displayGregorian !== "نامشخص" ? displayGregorian : null);
        setShowDateConfirmationStep(true);
        return; 
    }
    
    proceedToSave();
  };


  const handlePersianDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newRawPersianDate = e.target.value;
    const newPersianDate = convertPersianToWesternNumerals(newRawPersianDate); 
    setFormData(prev => ({...prev, submissionDeadlinePersian: newPersianDate })); 

    const currentError = validatePersianDateAndGetError(newPersianDate);
    setErrors(prev => ({ ...prev, submissionDeadlinePersian: currentError }));

    if (!currentError && newPersianDate && newPersianDate.trim() !== '') {
        const parsedJalali = parseJalaliDate(newPersianDate)!; 
        const gregorian = toGregorian(parsedJalali.jy, parsedJalali.jm, parsedJalali.jd);
        setFormData(prev => ({...prev, submissionDeadlineGregorian: formatGregorianDateForInput(gregorian)}));
    } else {
        setFormData(prev => ({ ...prev, submissionDeadlineGregorian: undefined }));
    }
  };


  if (!isOpen) return null;

  const inputBaseClasses = "w-full p-2 border rounded-md shadow-sm focus:ring-teal-500 focus:border-teal-500 bg-white text-gray-900 placeholder-gray-500";
  const textAreaBaseClasses = `${inputBaseClasses} min-h-[60px]`;


  const renderInput = (name: keyof FestivalInfo, label: string, Icon: React.ElementType, placeholder?: string, type: string = "text", isTextArea: boolean = false) => (
    <div className="mb-4">
      <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
        <Icon className="h-4 w-4 me-2 text-teal-600" /> {label}
      </label>
      {isTextArea ? (
        <textarea
          id={name}
          name={name}
          value={(formData[name] as string) || ''}
          onChange={handleChange}
          placeholder={placeholder || label}
          rows={3}
          className={`${textAreaBaseClasses} ${errors[name] ? 'border-red-500' : 'border-gray-300'}`}
        />
      ) : (
        <input
          type={type}
          id={name}
          name={name}
          value={(formData[name] as string) || ''}
          onChange={handleChange}
          placeholder={placeholder || label}
          className={`${inputBaseClasses} ${errors[name] ? 'border-red-500' : 'border-gray-300'}`}
        />
      )}
      {errors[name] && <p className="text-xs text-red-500 mt-1 flex items-center"><AlertCircle size={14} className="me-1" />{errors[name]}</p>}
    </div>
  );
  
  const renderUserNotesInput = () => (
    <div className="mb-4">
      <label htmlFor="userNotesForSmartAnalysis" className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
        <MessageSquare className="h-4 w-4 me-2 text-teal-600" /> یادداشت‌های تکمیلی برای تحلیل هوشمند (اختیاری)
      </label>
      <textarea
        id="userNotesForSmartAnalysis"
        name="userNotesForSmartAnalysis"
        value={formData.userNotesForSmartAnalysis || ''}
        onChange={handleChange}
        placeholder="مثال: این جشنواره بیشتر بر عکاسی مستند با رویکرد اجتماعی تمرکز دارد، حتی اگر موضوعات گسترده‌تری اعلام کرده باشد. داوران معمولا به عکس‌های سیاه‌وسفید توجه ویژه‌ای دارند."
        rows={3}
        className={`${textAreaBaseClasses} border-gray-300`}
      />
       <p className="text-xs text-gray-500 mt-1">این یادداشت‌ها به هوش مصنوعی در تحلیل بهتر ویژگی‌های جشنواره کمک می‌کند.</p>
    </div>
  );


  const persianDateErrorText = errors.submissionDeadlinePersian;
  const isYearWarning = persianDateErrorText?.includes('خارج از محدوده');


  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 transition-opacity duration-300 ease-in-out">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="text-xl font-semibold text-teal-700">{isEditing ? 'ویرایش فراخوان' : 'افزودن فراخوان جدید'}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={24} />
          </button>
        </div>

        {!showDateConfirmationStep ? (
          <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
            {formData.filePreview && (
              <div className="mb-4 text-center">
                {formData.filePreview === 'pdf' ? (
                  <FileText className="h-20 w-20 text-red-400 mx-auto" />
                ) : formData.filePreview === 'text_input' ? (
                  <ClipboardPaste className="h-20 w-20 text-sky-500 mx-auto" />
                ) : (
                  <img src={formData.filePreview} alt="پیش‌نمایش" className="max-h-40 object-contain rounded mx-auto shadow-sm border" />
                )}
                <p className="text-xs text-gray-500 mt-1">{formData.fileName}</p>
              </div>
            )}
            
            {renderInput('festivalName', 'نام فراخوان', Tag, 'مثال: مسابقه عکاسی طبیعت ایران')}
            {renderInput('objectives', 'اهداف جشنواره (اختیاری)', Target, 'مثال: ترویج فرهنگ حفاظت از محیط زیست از طریق هنر عکاسی...', 'text', true)}
            
            <div className="mb-4">
              <label htmlFor="topics" className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                <Tag className="h-4 w-4 me-2 text-teal-600" /> موضوعات / دسته‌بندی‌ها (هر موضوع یا دسته در یک خط جدید یا با کاما جدا کنید)
              </label>
              <textarea
                id="topics"
                name="topics"
                value={topicsInput}
                onChange={handleTopicsChange}
                placeholder="مثال: طبیعت, پرتره, مستند اجتماعی"
                rows={3}
                className={`${textAreaBaseClasses} ${errors.topics ? 'border-red-500' : 'border-gray-300'}`}
              />
              {errors.topics && <p className="text-xs text-red-500 mt-1 flex items-center"><AlertCircle size={14} className="me-1" />{errors.topics}</p>}
            </div>
            
            <div>
              <label htmlFor="submissionDeadlinePersian" className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                <Calendar className="h-4 w-4 me-2 text-teal-600" /> مهلت ارسال (شمسی)
              </label>
              <input
                type="text" 
                id="submissionDeadlinePersian"
                name="submissionDeadlinePersian"
                value={formData.submissionDeadlinePersian || ''} 
                onChange={handlePersianDateChange}
                placeholder="مثال: 1403/05/20"
                className={`${inputBaseClasses} ${persianDateErrorText ? (isYearWarning ? 'border-orange-500' : 'border-red-500') : 'border-gray-300'}`}
                dir="ltr" 
              />
              {persianDateErrorText && (
                <p className={`text-xs mt-1 flex items-center ${isYearWarning ? 'text-orange-600' : 'text-red-600'}`}>
                  <AlertCircle size={14} className="me-1" />
                  {persianDateErrorText}
                </p>
              )}
            </div>
            
            {renderInput('maxPhotos', 'حداکثر تعداد عکس', Maximize, 'مثال: 5 یا "تا 10 عکس"')}
            {renderInput('imageSize', 'مشخصات تصویر', LucideImage, 'مثال: حداقل 3000 پیکسل در ضلع بزرگ، 300 DPI', 'text', true)}
            {renderInput('submissionMethod', 'روش ارسال / لینک', LinkIcon, 'مثال: ایمیل به contest@example.com یا آدرس وبسایت', 'text', true)}

            {/* Fee Information Section */}
            <div className="mb-4 p-3 border border-gray-200 rounded-md bg-gray-50">
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                    <DollarSign className="h-4 w-4 me-2 text-teal-600" /> هزینه شرکت
                </label>
                <div className="space-y-2">
                    <div className="flex items-center">
                        <input
                            id="feeStatusFree"
                            name="feeStatusFree"
                            type="checkbox"
                            checked={!!formData.feeStatusFree}
                            onChange={handleChange}
                            className="h-4 w-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                        />
                        <label htmlFor="feeStatusFree" className="ms-2 block text-sm text-gray-900">
                            رایگان است
                        </label>
                    </div>
                    <div className="flex items-center">
                        <input
                            id="feeStatusPaid"
                            name="feeStatusPaid"
                            type="checkbox"
                            checked={!!formData.feeStatusPaid}
                            onChange={handleChange}
                            className="h-4 w-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                        />
                        <label htmlFor="feeStatusPaid" className="ms-2 block text-sm text-gray-900">
                            دارای هزینه ورودی است
                        </label>
                    </div>
                    <div>
                        <label htmlFor="feeDescription" className="block text-xs font-medium text-gray-600 mt-1 mb-0.5">
                            توضیحات هزینه / مبلغ (در صورت وجود):
                        </label>
                        <textarea
                            id="feeDescription"
                            name="feeDescription"
                            value={formData.feeDescription || ''}
                            onChange={handleChange}
                            placeholder="مثال: ۲۰ دلار برای هر عکس، یا: اولین عکس رایگان، عکس‌های بعدی ۱۰ دلار"
                            rows={2}
                            className={`${textAreaBaseClasses} text-sm ${errors.feeDescription ? 'border-red-500' : 'border-gray-300'}`}
                        />
                        {errors.feeDescription && <p className="text-xs text-red-500 mt-1 flex items-center"><AlertCircle size={14} className="me-1" />{errors.feeDescription}</p>}
                    </div>
                </div>
            </div>
            
            {renderUserNotesInput()}

            {formData.extractedText && (
              <details className="mt-4 bg-gray-50 p-3 rounded-md border">
                <summary className="text-sm text-gray-600 cursor-pointer hover:text-teal-700 flex items-center">
                  <FileText size={16} className="me-2 text-gray-500" /> مشاهده متن استخراج شده از فایل
                </summary>
                <pre className="mt-2 p-2 bg-white text-xs text-gray-700 border rounded-md max-h-32 overflow-y-auto whitespace-pre-wrap">
                  {formData.extractedText}
                </pre>
              </details>
            )}

            {formData.extractionSourceUrls && formData.extractionSourceUrls.length > 0 && (
              <details className="mt-4 bg-blue-50 p-3 rounded-md border border-blue-200" open>
                <summary className="text-sm text-blue-700 cursor-pointer hover:text-blue-800 flex items-center">
                  <Info size={16} className="me-2" /> منابع تکمیلی مورد استفاده در استخراج (از وب)
                </summary>
                <ul className="mt-2 space-y-1 text-xs">
                  {formData.extractionSourceUrls.map((source, index) => (
                    <li key={index} className="flex items-center">
                      <ExternalLink size={12} className="me-2 text-blue-600 flex-shrink-0" />
                      <a 
                        href={source.uri} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 hover:underline truncate"
                        title={source.uri}
                      >
                        {source.title || source.uri}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            )}


            <div className="pt-4 border-t mt-6 flex justify-end space-s-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                انصراف
              </button>
              <button
                type="submit"
                className="px-6 py-2 bg-teal-600 text-white font-semibold rounded-md shadow-sm hover:bg-teal-700 transition-colors flex items-center"
              >
                <Save size={18} className="me-2"/> ذخیره اطلاعات
              </button>
            </div>
          </form>
        ) : (
          // Date Confirmation Step UI
          <div className="p-6 space-y-4 overflow-y-auto text-center">
            <Calendar size={48} className="mx-auto text-teal-500 mb-4" />
            <h4 className="text-lg font-semibold text-gray-800">تایید تاریخ مهلت ارسال</h4>
            <p className="text-sm text-gray-600">لطفاً تاریخ(های) مهلت ارسال شناسایی‌شده برای فراخوان <strong className="text-teal-700">"{formData.festivalName}"</strong> را بررسی و تایید کنید:</p>
            
            <div className="my-4 p-3 bg-teal-50 border border-teal-200 rounded-md">
              {confirmedDeadlineDisplayPersian && confirmedDeadlineDisplayPersian !== "نامشخص" && (
                <p className="text-md font-semibold text-gray-700">
                  تاریخ شمسی: <span className="text-teal-600">{confirmedDeadlineDisplayPersian}</span>
                </p>
              )}
              {confirmedDeadlineDisplayGregorian && (
                <p className="text-md font-semibold text-gray-700 mt-1">
                  تاریخ میلادی: <span className="text-teal-600">{confirmedDeadlineDisplayGregorian}</span>
                </p>
              )}
               {(!confirmedDeadlineDisplayPersian || confirmedDeadlineDisplayPersian === "نامشخص") && !confirmedDeadlineDisplayGregorian && (
                 <p className="text-md font-semibold text-gray-500">تاریخی برای تایید یافت نشد (احتمالا وارد نشده یا نامعتبر است).</p>
               )}
            </div>

            <p className="text-sm text-gray-600 mb-6">آیا تاریخ(های) فوق صحیح است؟</p>

            <div className="pt-4 border-t mt-6 flex flex-col sm:flex-row justify-center gap-3">
              <button
                type="button"
                onClick={() => setShowDateConfirmationStep(false)}
                className="w-full sm:w-auto px-6 py-2 text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-md transition-colors flex items-center justify-center"
              >
                <Edit2 size={18} className="me-2"/> خیر، ویرایش می‌کنم
              </button>
              <button
                type="button"
                onClick={proceedToSave}
                className="w-full sm:w-auto px-6 py-2 bg-green-600 text-white font-semibold rounded-md shadow-sm hover:bg-green-700 transition-colors flex items-center justify-center"
              >
                <CheckCircle size={18} className="me-2"/> بله، تاریخ صحیح است و ذخیره کن
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
