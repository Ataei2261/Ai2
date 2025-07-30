
import React, { useState, useCallback, useRef, DragEvent } from 'react';
import { useFestivals } from '../contexts/FestivalsContext';
import { FestivalInfo, ExtractedData, FestivalSourceFile } from '../types';
import { extractTextFromPdf, fileToBase64 } from '../services/fileProcessingService';
import { extractTextFromImageViaGemini, extractFestivalInfoFromTextViaGemini, extractFestivalInfoFromUrlViaGemini } from '../services/geminiService';
import { UploadCloud, FileText, Type, AlertCircle, CheckCircle, X, Image as ImageIcon, AlertTriangle, Edit2, XCircle, RefreshCw, Link2 } from 'lucide-react';
import { LoadingSpinner } from './LoadingSpinner';
import { FestivalModal } from './FestivalModal';
import { useAuth } from '../contexts/AuthContext';

const MIN_CHARS_FOR_IMAGE_TEXT = 30;
const MIN_CHARS_FOR_INPUT_TEXT = 50;

interface ProcessingWarning {
  type: 'shortImageText' | 'shortInputText';
  message: string;
  dataToProcess?: string; // Store the extracted text or input text here
}

export const FileUploadArea: React.FC = () => {
  const { activeSession } = useAuth();
  const { addFestival, isLoading: contextIsLoading } = useFestivals();
  const [isSelfProcessing, setIsSelfProcessing] = useState<boolean>(false);
  const [isAttemptingCancel, setIsAttemptingCancel] = useState<boolean>(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<string[]>([]);
  const [pdfPreview, setPdfPreview] = useState<boolean>(false);
  const [textInput, setTextInput] = useState<string>('');
  const [urlInput, setUrlInput] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [processingMessage, setProcessingMessage] = useState<string | null>(null);
  const [processingWarning, setProcessingWarning] = useState<ProcessingWarning | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [initialModalData, setInitialModalData] = useState<Partial<FestivalInfo> | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const currentOperationAbortControllerRef = useRef<AbortController | null>(null);

  if (activeSession.role !== 'admin') {
    return (
      <div className="w-full max-w-2xl mx-auto p-6 bg-white dark:bg-gray-800 rounded-xl shadow-2xl text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-orange-400" />
        <h2 className="mt-4 text-xl font-semibold text-gray-800 dark:text-gray-200">دسترسی غیرمجاز</h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          شما اجازه دسترسی به این بخش را ندارید.
        </p>
      </div>
    );
  }

  const resetInputState = () => {
    setSelectedFiles([]);
    setFilePreviews([]);
    setPdfPreview(false);
    setTextInput('');
    setUrlInput('');
    setError(null);
    setProcessingMessage(null);
    setProcessingWarning(null);
    setIsAttemptingCancel(false);
    setIsDragging(false);
    if (currentOperationAbortControllerRef.current) {
        currentOperationAbortControllerRef.current.abort();
        currentOperationAbortControllerRef.current = null;
    }
    const fileInput = document.getElementById('file-upload') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
    const urlInputElement = document.getElementById('url-input') as HTMLInputElement;
    if (urlInputElement) urlInputElement.value = '';
  };

  const handleCancelProcessing = () => {
    if (currentOperationAbortControllerRef.current && !isAttemptingCancel) {
      setIsAttemptingCancel(true);
      setProcessingMessage("درخواست لغو ارسال شد. منتظر پاسخ سرویس...");
      currentOperationAbortControllerRef.current.abort();
    }
  };

  const processAndSetFiles = async (files: FileList | null, sourceElement?: HTMLInputElement) => {
    setError(null);
    setProcessingMessage(null);
    setProcessingWarning(null);
    setIsAttemptingCancel(false);
    setTextInput('');
    setUrlInput('');
    if (currentOperationAbortControllerRef.current) {
        currentOperationAbortControllerRef.current.abort();
        currentOperationAbortControllerRef.current = null;
    }

    if (files && files.length > 0) {
      setSelectedFiles([]);
      setFilePreviews([]);
      setPdfPreview(false);

      const newFilesArray = Array.from(files);
      const validImageTypes = ['image/jpeg', 'image/png'];
      const validPdfType = 'application/pdf';

      const isPdfSelected = newFilesArray.some(f => f.type === validPdfType);
      const areAllImages = newFilesArray.every(f => validImageTypes.includes(f.type));

      if (isPdfSelected && newFilesArray.length > 1) {
        setError('فقط یک فایل PDF قابل انتخاب است. برای بارگذاری چندین فایل، همه باید تصویر باشند.');
        setSelectedFiles([]); setFilePreviews([]); setPdfPreview(false);
        if (sourceElement) sourceElement.value = '';
        return;
      }
      if (isPdfSelected && newFilesArray.length === 1) {
        setSelectedFiles(newFilesArray);
        setFilePreviews([]);
        setPdfPreview(true);
      } else if (areAllImages && newFilesArray.length > 0) {
        setSelectedFiles(newFilesArray);
        const previews: string[] = [];
        for (const file of newFilesArray) {
          try {
            const base64 = await fileToBase64(file);
            previews.push(base64);
          } catch (err) {
            setError(`خطا در خواندن فایل ${file.name}`);
            setSelectedFiles([]); setFilePreviews([]); setPdfPreview(false);
            if (sourceElement) sourceElement.value = '';
            return;
          }
        }
        setFilePreviews(previews);
        setPdfPreview(false);
      } else if (newFilesArray.length > 0) {
        setError('ترکیب فایل نامعتبر است. لطفاً یا یک فایل PDF، یا یک یا چند فایل تصویر (JPG/PNG) انتخاب کنید.');
        setSelectedFiles([]); setFilePreviews([]); setPdfPreview(false);
        if (sourceElement) sourceElement.value = '';
        return;
      }
    } else {
      setSelectedFiles([]);
      setFilePreviews([]);
      setPdfPreview(false);
    }
  };


  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setUrlInput(''); 
    const urlInputElement = document.getElementById('url-input') as HTMLInputElement;
    if (urlInputElement) urlInputElement.value = '';
    processAndSetFiles(event.target.files, event.target);
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const dropzone = event.currentTarget;
    if (!dropzone.contains(event.relatedTarget as Node)) {
        setIsDragging(false);
    }
  };
  
  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true); 
  };
  
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    setUrlInput(''); 
    const urlInputElement = document.getElementById('url-input') as HTMLInputElement;
    if (urlInputElement) urlInputElement.value = '';
    const files = event.dataTransfer.files;
    processAndSetFiles(files); 
    const fileInput = document.getElementById('file-upload') as HTMLInputElement;
    if (fileInput) { fileInput.files = files; }
  };
  
  const handleTextInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTextInput(event.target.value);
    if (event.target.value) {
        setSelectedFiles([]);
        setFilePreviews([]);
        setPdfPreview(false);
        setUrlInput('');
        const fileInput = document.getElementById('file-upload') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
        const urlInputElement = document.getElementById('url-input') as HTMLInputElement;
        if (urlInputElement) urlInputElement.value = '';
    }
    setError(null);
    setProcessingMessage(null);
    setProcessingWarning(null);
  };

  const handleUrlInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setUrlInput(event.target.value);
    if (event.target.value) {
        setSelectedFiles([]);
        setFilePreviews([]);
        setPdfPreview(false);
        setTextInput('');
        const fileInput = document.getElementById('file-upload') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
    }
    setError(null);
    setProcessingMessage(null);
    setProcessingWarning(null);
  };

  const handleProcessFiles = async () => {
    if (selectedFiles.length === 0) {
      setError("هیچ فایلی برای پردازش انتخاب نشده است.");
      return;
    }
    setError(null);
    setProcessingMessage(null);
    setProcessingWarning(null);
    setIsSelfProcessing(true);
    setIsAttemptingCancel(false);
    if (currentOperationAbortControllerRef.current) {
        currentOperationAbortControllerRef.current.abort();
    }
    currentOperationAbortControllerRef.current = new AbortController();
    const { signal } = currentOperationAbortControllerRef.current;

    setProcessingMessage("در حال آماده‌سازی فایل‌ها...");

    const sourceFilesInfo: FestivalSourceFile[] = [];
    let extractedText = "";
    let fileType = "";
    let filePreview: string | undefined = undefined; // For single image preview
    let mainFileName = selectedFiles.length === 1 ? selectedFiles[0].name : `${selectedFiles[0].name} و ${selectedFiles.length - 1} فایل دیگر`;


    if (pdfPreview && selectedFiles[0]) { // Single PDF
      fileType = selectedFiles[0].type;
      filePreview = 'pdf';
      try {
        setProcessingMessage(`در حال استخراج متن از فایل PDF: ${selectedFiles[0].name}...`);
        extractedText = await extractTextFromPdf(selectedFiles[0]);
        if (signal.aborted) {
            throw new DOMException('Operation aborted by user', 'AbortError');
        }
        const dataUrl = await fileToBase64(selectedFiles[0]);
        sourceFilesInfo.push({ name: selectedFiles[0].name, dataUrl: dataUrl, type: selectedFiles[0].type });

      } catch (err: any) {
        if (err.name === 'AbortError') {
          setError("عملیات توسط کاربر لغو شد.");
          setProcessingMessage("عملیات لغو شد.");
        } else {
          setError(`خطا در پردازش PDF: ${err.message}`);
          setProcessingMessage(`خطا در پردازش PDF.`);
        }
        setIsSelfProcessing(false);
        setIsAttemptingCancel(false);
        currentOperationAbortControllerRef.current = null;
        return;
      }
    } else if (filePreviews.length > 0 && selectedFiles.length > 0) { // One or more images
        fileType = selectedFiles.length > 1 ? 'image/multiple' : selectedFiles[0].type;
        mainFileName = selectedFiles.length === 1 ? selectedFiles[0].name : `${selectedFiles[0].name} (+${selectedFiles.length - 1})`;
        if(selectedFiles.length === 1) filePreview = filePreviews[0];

        let combinedText = "";
        for (let i = 0; i < selectedFiles.length; i++) {
          const file = selectedFiles[i];
          const base64Data = filePreviews[i].split(',')[1];
          try {
            setProcessingMessage(`در حال استخراج متن از تصویر ${i + 1}/${selectedFiles.length}: ${file.name}...`);
            const text = await extractTextFromImageViaGemini(base64Data, file.type, signal);
            if (signal.aborted) {
                throw new DOMException('Operation aborted by user', 'AbortError');
            }
            combinedText += `--- متن از فایل: ${file.name} ---\n${text}\n\n`;
            sourceFilesInfo.push({ name: file.name, dataUrl: filePreviews[i], type: file.type });
          } catch (err: any) {
            if (err.name === 'AbortError') {
              setError("عملیات توسط کاربر لغو شد.");
              setProcessingMessage("عملیات لغو شد.");
            } else {
              setError(`خطا در استخراج متن از تصویر ${file.name}: ${err.message}`);
              setProcessingMessage(`خطا در استخراج متن از تصویر.`);
            }
            setIsSelfProcessing(false);
            setIsAttemptingCancel(false);
            currentOperationAbortControllerRef.current = null;
            return;
          }
        }
        extractedText = combinedText.trim();
        if (extractedText.length < MIN_CHARS_FOR_IMAGE_TEXT && extractedText.length > 0) {
          setProcessingWarning({ type: 'shortImageText', message: `متن استخراج شده از تصویر(ها) بسیار کوتاه است (${extractedText.length} کاراکتر). ممکن است نتایج تحلیل دقیق نباشد. آیا مایل به ادامه هستید؟`, dataToProcess: extractedText });
          setIsSelfProcessing(false);
          setIsAttemptingCancel(false);
          currentOperationAbortControllerRef.current = null;
          return;
        }
        if (!extractedText) {
          setError("متنی از تصویر(ها) استخراج نشد. لطفاً از کیفیت تصاویر اطمینان حاصل کنید.");
          setIsSelfProcessing(false);
          setIsAttemptingCancel(false);
          currentOperationAbortControllerRef.current = null;
          return;
        }
    } else {
        setError("نوع فایل نامعتبر است یا مشکلی در آماده‌سازی فایل‌ها رخ داده.");
        setIsSelfProcessing(false);
        setIsAttemptingCancel(false);
        currentOperationAbortControllerRef.current = null;
        return;
    }

    setProcessingMessage("در حال تحلیل متن استخراج شده توسط هوش مصنوعی...");
    try {
      const data: ExtractedData = await extractFestivalInfoFromTextViaGemini(extractedText, mainFileName, signal);
      if (signal.aborted) {
        throw new DOMException('Operation aborted by user', 'AbortError');
      }
      setInitialModalData({
        id: crypto.randomUUID(),
        fileName: mainFileName,
        fileType: fileType,
        filePreview: pdfPreview ? 'pdf' : filePreview,
        sourceDataUrl: sourceFilesInfo.length === 1 ? sourceFilesInfo[0].dataUrl : undefined,
        sourceFiles: sourceFilesInfo.length > 1 ? sourceFilesInfo : (sourceFilesInfo.length === 1 && fileType === 'application/pdf' ? sourceFilesInfo : undefined), // Only store sourceFiles for multi-image or PDF
        extractedText: extractedText,
        ...data
      });
      setShowModal(true);
      setProcessingMessage("اطلاعات با موفقیت استخراج شد.");
      setTimeout(() => setProcessingMessage(null), 3000);
      setSelectedFiles([]); setFilePreviews([]); setPdfPreview(false); 
      const fileInput = document.getElementById('file-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError("عملیات توسط کاربر لغو شد.");
        setProcessingMessage("عملیات لغو شد.");
      } else {
        console.error("Error in Gemini API call:", err);
        setError(`خطا در تحلیل متن توسط هوش مصنوعی: ${err.message}`);
        setProcessingMessage(`خطا در تحلیل متن.`);
      }
    } finally {
      setIsSelfProcessing(false);
      setIsAttemptingCancel(false);
      currentOperationAbortControllerRef.current = null;
    }
  };

  const handleProcessTextInput = async () => {
    if (!textInput.trim()) {
      setError("لطفاً متن فراخوان را وارد کنید.");
      return;
    }
    if (textInput.trim().length < MIN_CHARS_FOR_INPUT_TEXT) {
       setProcessingWarning({ type: 'shortInputText', message: `متن وارد شده بسیار کوتاه است (${textInput.trim().length} کاراکتر). ممکن است نتایج تحلیل دقیق نباشد. آیا مایل به ادامه هستید؟`, dataToProcess: textInput.trim() });
       return;
    }
    setError(null);
    setProcessingMessage(null);
    setProcessingWarning(null);
    setIsSelfProcessing(true);
    setIsAttemptingCancel(false);
    if (currentOperationAbortControllerRef.current) {
        currentOperationAbortControllerRef.current.abort();
    }
    currentOperationAbortControllerRef.current = new AbortController();
    const { signal } = currentOperationAbortControllerRef.current;
    
    setProcessingMessage("در حال تحلیل متن وارد شده توسط هوش مصنوعی...");
    try {
      const data = await extractFestivalInfoFromTextViaGemini(textInput.trim(), "متن ورودی کاربر", signal);
      if (signal.aborted) {
        throw new DOMException('Operation aborted by user', 'AbortError');
      }
      setInitialModalData({
        id: crypto.randomUUID(),
        fileName: "ورودی متنی کاربر",
        fileType: "text/plain",
        filePreview: 'text_input',
        extractedText: textInput.trim(),
        ...data
      });
      setShowModal(true);
      setProcessingMessage("اطلاعات با موفقیت استخراج شد.");
      setTextInput('');
      setTimeout(() => setProcessingMessage(null), 3000);
    } catch (err: any) {
       if (err.name === 'AbortError') {
        setError("عملیات توسط کاربر لغو شد.");
        setProcessingMessage("عملیات لغو شد.");
      } else {
        console.error("Error in Gemini API call for text input:", err);
        setError(`خطا در تحلیل متن وارد شده: ${err.message}`);
        setProcessingMessage(`خطا در تحلیل متن.`);
      }
    } finally {
      setIsSelfProcessing(false);
      setIsAttemptingCancel(false);
      currentOperationAbortControllerRef.current = null;
    }
  };

  const handleProcessUrlInput = async () => {
    if (!urlInput.trim()) {
      setError("لطفاً آدرس وب‌سایت فراخوان را وارد کنید.");
      return;
    }
    try {
      new URL(urlInput.trim()); // Validate URL format
    } catch (_) {
      setError("آدرس URL وارد شده معتبر نیست. لطفاً فرمت صحیح (مثال: https://example.com) را وارد کنید.");
      return;
    }

    setError(null);
    setProcessingMessage(null);
    setProcessingWarning(null);
    setIsSelfProcessing(true);
    setIsAttemptingCancel(false);

    if (currentOperationAbortControllerRef.current) {
        currentOperationAbortControllerRef.current.abort();
    }
    currentOperationAbortControllerRef.current = new AbortController();
    const { signal } = currentOperationAbortControllerRef.current;
    
    setProcessingMessage("در حال استخراج اطلاعات از URL توسط هوش مصنوعی...");
    try {
      const data = await extractFestivalInfoFromUrlViaGemini(urlInput.trim(), signal);
      if (signal.aborted) {
        throw new DOMException('Operation aborted by user', 'AbortError');
      }
      setInitialModalData({
        id: crypto.randomUUID(),
        fileName: urlInput.trim(), // Use the URL as the file name
        fileType: "url/extracted_info",
        filePreview: 'url_source',
        sourceDataUrl: urlInput.trim(), // Store the input URL here
        extractedText: `اطلاعات از URL زیر استخراج شده است: ${urlInput.trim()}`,
        ...data
      });
      setShowModal(true);
      setProcessingMessage("اطلاعات با موفقیت از URL استخراج شد.");
      setUrlInput(''); 
      const urlInputElement = document.getElementById('url-input') as HTMLInputElement;
      if (urlInputElement) urlInputElement.value = '';
      setTimeout(() => setProcessingMessage(null), 3000);
    } catch (err: any) {
       if (err.name === 'AbortError') {
        setError("عملیات توسط کاربر لغو شد.");
        setProcessingMessage("عملیات لغو شد.");
      } else {
        console.error("Error in Gemini API call for URL input:", err);
        setError(`خطا در استخراج اطلاعات از URL: ${err.message}`);
        setProcessingMessage(`خطا در استخراج اطلاعات از URL.`);
      }
    } finally {
      setIsSelfProcessing(false);
      setIsAttemptingCancel(false);
      currentOperationAbortControllerRef.current = null;
    }
  };

  const handleConfirmWarning = () => {
    if (processingWarning?.type === 'shortImageText' && processingWarning.dataToProcess) {
       handleProcessFiles(); // Re-call with the short text
    } else if (processingWarning?.type === 'shortInputText' && processingWarning.dataToProcess) {
       handleProcessTextInput(); // Re-call with the short text
    }
    setProcessingWarning(null);
  };

  const handleCancelWarning = () => {
    setProcessingWarning(null);
    // Optionally reset inputs or allow user to modify
    setIsSelfProcessing(false);
    if(processingWarning?.type === 'shortImageText') {
        setProcessingMessage("پردازش به دلیل کوتاه بودن متن استخراجی لغو شد. لطفاً کیفیت فایل را بررسی کنید یا متن را دستی وارد نمایید.");
    } else {
        setProcessingMessage("پردازش به دلیل کوتاه بودن متن ورودی لغو شد. لطفاً متن کامل‌تری وارد کنید.");
    }
  };


  const isProcessing = isSelfProcessing || contextIsLoading;
  const commonButtonClasses = "w-full px-6 py-3 text-lg font-semibold rounded-lg shadow-md transition-colors duration-200 flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed";
  const primaryButtonColors = "bg-teal-600 hover:bg-teal-700 text-white";
  const cancelButtonClasses = "px-3 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 flex items-center disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="w-full max-w-2xl mx-auto p-4 sm:p-6 bg-white dark:bg-gray-800 rounded-xl shadow-2xl" id="tour-upload-area">
      <h2 className="text-2xl sm:text-3xl font-bold text-center text-teal-700 dark:text-teal-400 mb-6">
        بارگذاری و تحلیل اطلاعات فراخوان
      </h2>

      {/* File Upload Section */}
      <div 
        id="file-dropzone"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`mb-6 p-4 sm:p-6 border-2 ${isDragging ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/30' : 'border-dashed border-gray-300 dark:border-gray-600'} rounded-lg text-center transition-colors duration-200`}
      >
        <UploadCloud className={`mx-auto h-12 w-12 sm:h-16 sm:w-16 mb-3 ${isDragging ? 'text-teal-600 dark:text-teal-400' : 'text-gray-400 dark:text-gray-500'}`} />
        <label htmlFor="file-upload" className="cursor-pointer text-sm sm:text-base">
          <span className="font-semibold text-teal-600 dark:text-teal-400 hover:underline">فایل خود را انتخاب کنید</span> یا آن را اینجا بکشید و رها کنید.
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            (PDF، JPG یا PNG - برای چندین فایل، همه باید تصویر باشند)
          </p>
        </label>
        <input 
            id="file-upload" 
            type="file" 
            multiple 
            className="hidden" 
            onChange={handleFileChange} 
            accept=".pdf,image/jpeg,image/png"
            disabled={isProcessing}
        />
        {(selectedFiles.length > 0 || pdfPreview) && (
          <div className="mt-4 text-sm text-gray-700 dark:text-gray-300">
            {pdfPreview && selectedFiles[0] && (
              <div className="flex items-center justify-center p-2 bg-gray-100 dark:bg-gray-700 rounded shadow">
                <FileText className="h-5 w-5 text-red-500 me-2" />
                <span>{selectedFiles[0].name} (PDF)</span>
              </div>
            )}
            {filePreviews.length > 0 && selectedFiles.length > 0 && (
              <div className="space-y-1">
                {selectedFiles.map((file, index) => (
                  <div key={file.name + index} className="flex items-center justify-center p-1.5 bg-gray-100 dark:bg-gray-700 rounded text-xs shadow-sm">
                    <ImageIcon className="h-4 w-4 text-blue-500 me-1.5" />
                    <span className="truncate" title={file.name}>{file.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      
      {selectedFiles.length > 0 && (
         <button
            id="tour-process-file-button"
            onClick={handleProcessFiles}
            disabled={isProcessing || isAttemptingCancel}
            className={`${commonButtonClasses} ${primaryButtonColors} mb-6`}
        >
            {isProcessing && !isAttemptingCancel && <LoadingSpinner size="6" className="me-2" />}
            {isProcessing && isAttemptingCancel && <LoadingSpinner size="6" color="text-yellow-300" className="me-2 animate-ping" />}
            پردازش فایل(ها)
        </button>
      )}

      {/* OR Divider */}
      <div className="my-6 flex items-center">
        <hr className="flex-grow border-gray-300 dark:border-gray-600"/>
        <span className="mx-3 text-sm text-gray-500 dark:text-gray-400">یا</span>
        <hr className="flex-grow border-gray-300 dark:border-gray-600"/>
      </div>
      
      {/* Text Input Section */}
      <div className="mb-6">
        <label htmlFor="text-input-area" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          متن کامل فراخوان را اینجا وارد کنید:
        </label>
        <textarea
          id="text-input-area"
          value={textInput}
          onChange={handleTextInputChange}
          placeholder="متن فراخوان را اینجا کپی و الصاق کنید..."
          rows={5}
          className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
          disabled={isProcessing}
        />
      </div>
      {textInput && (
        <button
            onClick={handleProcessTextInput}
            disabled={isProcessing || isAttemptingCancel || !textInput.trim()}
            className={`${commonButtonClasses} ${primaryButtonColors} mb-6`}
        >
            {isProcessing && !isAttemptingCancel && <LoadingSpinner size="6" className="me-2" />}
            {isProcessing && isAttemptingCancel && <LoadingSpinner size="6" color="text-yellow-300" className="me-2 animate-ping" />}
            پردازش متن ورودی
        </button>
      )}

      {/* OR Divider for URL */}
      <div className="my-6 flex items-center">
        <hr className="flex-grow border-gray-300 dark:border-gray-600"/>
        <span className="mx-3 text-sm text-gray-500 dark:text-gray-400">یا</span>
        <hr className="flex-grow border-gray-300 dark:border-gray-600"/>
      </div>

      {/* URL Input Section */}
      <div className="mb-6">
        <label htmlFor="url-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          آدرس وب‌سایت فراخوان را وارد کنید (استخراج با جستجوی عمیق):
        </label>
        <div className="relative">
            <input
              id="url-input"
              type="url"
              value={urlInput}
              onChange={handleUrlInputChange}
              placeholder="مثال: https://www.example.com/festival-call"
              className="w-full p-3 ps-10 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
              disabled={isProcessing}
              dir="ltr"
            />
            <Link2 className="absolute start-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-gray-500 pointer-events-none" />
        </div>
      </div>
      {urlInput && (
        <button
            onClick={handleProcessUrlInput}
            disabled={isProcessing || isAttemptingCancel || !urlInput.trim()}
            className={`${commonButtonClasses} ${primaryButtonColors} mb-6`}
        >
            {isProcessing && !isAttemptingCancel && <LoadingSpinner size="6" className="me-2" />}
            {isProcessing && isAttemptingCancel && <LoadingSpinner size="6" color="text-yellow-300" className="me-2 animate-ping" />}
            پردازش URL و استخراج اطلاعات
        </button>
      )}


      {isProcessing && processingMessage && (
        <div className={`mt-4 p-3 rounded-md text-sm flex items-center justify-between ${isAttemptingCancel ? 'bg-orange-100 dark:bg-orange-800 text-orange-700 dark:text-orange-300' : 'bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300'}`}>
          <div className="flex items-center">
            <LoadingSpinner size="5" className={`me-2 ${isAttemptingCancel ? 'text-orange-500 dark:text-orange-400' :'text-blue-500 dark:text-blue-400'}`} />
            {processingMessage}
          </div>
          {!isAttemptingCancel ? (
             <button onClick={handleCancelProcessing} className={cancelButtonClasses} disabled={isAttemptingCancel}>
                <XCircle size={14} className="me-1"/> لغو
             </button>
          ) : (
            <span className="text-xs text-orange-600 dark:text-orange-400">در حال لغو...</span>
          )}
        </div>
      )}

      {error && (
        <div id="file-upload-error" role="alert" className="mt-4 p-3 bg-red-100 dark:bg-red-800/50 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-600 rounded-md flex items-center text-sm">
          <AlertTriangle className="h-5 w-5 me-2 flex-shrink-0" />
          <span className="flex-grow">{error}</span>
           {error.toLowerCase().includes("api key") && !error.toLowerCase().includes("quota") && (
            <button
                onClick={() => window.location.reload()}
                className="ms-3 px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 flex items-center"
            >
                <RefreshCw size={14} className="me-1"/> بررسی مجدد کلید و رفرش
            </button>
           )}
        </div>
      )}
      
      {processingWarning && (
        <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-800/30 border-l-4 border-yellow-400 dark:border-yellow-500 text-yellow-700 dark:text-yellow-300 rounded-md shadow-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-yellow-500 dark:text-yellow-400" aria-hidden="true" />
            </div>
            <div className="ms-3">
              <p className="text-sm font-medium">{processingWarning.message}</p>
              <div className="mt-3 text-sm md:mt-2 md:flex md:justify-start space-y-2 md:space-y-0 md:space-s-3">
                <button
                  onClick={handleConfirmWarning}
                  className="w-full md:w-auto px-4 py-1.5 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-yellow-600 hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
                >
                  بله، ادامه بده
                </button>
                <button
                  onClick={handleCancelWarning}
                  className="w-full md:w-auto px-4 py-1.5 border border-yellow-300 dark:border-yellow-600 rounded-md shadow-sm text-sm font-medium text-yellow-700 dark:text-yellow-200 bg-yellow-100 dark:bg-yellow-700/50 hover:bg-yellow-200 dark:hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
                >
                  خیر، لغو کن
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


      {!error && !isProcessing && !processingWarning && !selectedFiles.length && !textInput && !urlInput && !processingMessage && (
        <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 rounded-md text-sm text-center">
          <Edit2 className="h-6 w-6 mx-auto mb-2 text-gray-400 dark:text-gray-500" />
          برای شروع، یک فایل (PDF یا تصویر) انتخاب کنید، متن فراخوان را وارد نمایید، یا آدرس وب‌سایت آن را برای استخراج خودکار اطلاعات درج کنید.
        </div>
      )}

      {showModal && initialModalData && (
        <FestivalModal
          isOpen={showModal}
          onClose={() => {
            setShowModal(false);
            setInitialModalData(null);
            resetInputState(); // Reset inputs after modal closes
          }}
          festivalData={initialModalData}
          onSave={async (newFestivalData) => {
            try {
              await addFestival(newFestivalData);
              resetInputState();
            } catch (err: any) {
               setError(`خطا در ذخیره فراخوان: ${err.message}. ${err.name === 'QuotaExceededError' ? 'فضای ذخیره‌سازی مرورگر ممکن است پر باشد.' : ''}`);
            }
          }}
        />
      )}
    </div>
  );
};
