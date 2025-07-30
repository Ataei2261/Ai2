


import React, { useState, useCallback, useRef, useMemo } from 'react';
import { FestivalInfo, FestivalImageAnalysis } from '../types';
import { Calendar, Edit, Trash2, FileText, Tag, Clock, Image as LucideImage, Link as LinkIcon, Maximize, ChevronDown, ChevronUp, Target, Download, Brain, Zap, ExternalLink, AlertCircle, UploadCloud, CameraOff, Info as InfoIcon, Star, ListChecks, Layers, MessageSquare, Edit3, FilePlus, XCircle, RefreshCw, FileText as FileTextIcon, CheckSquare, Square, DollarSign, CheckCircle } from 'lucide-react'; // Added DollarSign, CheckCircle
import { useFestivals } from '../contexts/FestivalsContext';
import { useAuth } from '../contexts/AuthContext';
import { formatJalaliDate, parseJalaliDate, toGregorian, toJalaali } from '../utils/dateConverter';
import { ConfirmationModal } from './ConfirmationModal';
import { getSmartFestivalAnalysisViaGemini, analyzeImageForFestivalViaGemini, GENERAL_ANALYSIS_TOPIC_VALUE } from '../services/geminiService';
import { LoadingSpinner } from './LoadingSpinner';
import { fileToBase64 } from '../services/fileProcessingService';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, ExternalHyperlink, PageOrientation, convertInchesToTwip, ImageRun, BorderStyle, VerticalAlign } from 'docx';
import saveAs from 'file-saver';


interface FestivalCardProps {
  festival: FestivalInfo;
  onEdit: (festival: FestivalInfo) => void;
}

const MAX_PHOTOS_FOR_ANALYSIS = 10;

const extractTopicsFromSmartAnalysis = (smartAnalysisText?: string): string[] => {
  if (!smartAnalysisText) return [];
  const extractedTopics: string[] = [];

  try {
    const parsed = JSON.parse(smartAnalysisText);
    if (parsed && typeof parsed === 'object' && parsed.suggestedGenres && typeof parsed.suggestedGenres === 'string') {
      const lines = parsed.suggestedGenres.split('\n');
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('* ')) {
          let topic = trimmedLine.substring(2).trim().split(/[:؛(]/)[0].trim();
          if (topic && topic.length > 3 && topic.length < 100) {
            extractedTopics.push(topic);
          }
        }
      }
      if (extractedTopics.length > 0) return extractedTopics;
    }
  } catch (e) {
    // Not a valid JSON, fall back to old string parsing method
  }


  const sectionsToParse = [
    "**ژانرها و سبک‌های عکاسی پیشنهادی:**",
    "**ایده‌ها و مفاهیم کلیدی برای عکاسی (دقیق و کاربردی):**"
  ];

  for (const sectionTitle of sectionsToParse) {
    const sectionStartIndex = smartAnalysisText.indexOf(sectionTitle);
    if (sectionStartIndex === -1) continue;

    let sectionEndIndex = smartAnalysisText.length;
    // Find the start of the next section or end of text
    const nextSectionRegex = /\n\*\*(.+?):\*\*/g;
    nextSectionRegex.lastIndex = sectionStartIndex + sectionTitle.length;
    const nextMatch = nextSectionRegex.exec(smartAnalysisText);
    if (nextMatch) {
      sectionEndIndex = nextMatch.index;
    }
    
    const sectionContent = smartAnalysisText.substring(sectionStartIndex + sectionTitle.length, sectionEndIndex);
    const lines = sectionContent.split('\n');
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('* ')) {
        let topic = trimmedLine.substring(2).trim();
        // Further clean up potential markdown or long descriptions
        topic = topic.split(/[:؛(]/)[0].trim(); // Stop at colons, semicolons, or open parens
        if (topic && topic.length > 3 && topic.length < 100) { // Basic sanity check for topic length
          extractedTopics.push(topic);
        }
      }
    }
  }
  return extractedTopics;
};

const SmartAnalysisDisplay = ({ analysisString, sourceUrls }: { analysisString: string, sourceUrls?: { uri: string; title: string }[] }) => {
    const sourcesNode = sourceUrls && sourceUrls.length > 0 ? (
        <div key="analysis-sources" className="mt-3 pt-2 border-t border-purple-200 dark:border-purple-800/50">
            <strong className="block my-0.5 text-purple-600 dark:text-purple-400">منابع مورد استفاده در تحلیل:</strong>
            <ul className="space-y-0.5 list-none p-0 m-0">
                {sourceUrls.map((source, index) => (
                    <li key={index} className="text-2xs">
                        <a href={source.uri} target="_blank" rel="noopener noreferrer" className="text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline flex items-center" title={source.uri}>
                            <ExternalLink size={10} className="me-1 flex-shrink-0" />
                            <span className="truncate">{source.title || source.uri}</span>
                        </a>
                    </li>
                ))}
            </ul>
        </div>
    ) : null;
    
    const parseMarkdownAnalysis = (markdownText: string): Record<string, any> => {
        if (!markdownText || typeof markdownText !== 'string') return {};
        const sections: Record<string, any> = {};
        const regex = /###(comprehensiveAnalysis|trendAnalysis|judgesAnalysis|suggestedGenres|keyConcepts|technicalNotes|commonMistakes|finalRecommendations|winningImages)\s*\n?([\s\S]*?)(?=###|$)/g;
        
        let match;
        while ((match = regex.exec(markdownText)) !== null) {
            const header = match[1];
            const content = match[2]?.trim() || '';
            if (header === 'winningImages') {
                sections[header] = content.split('\n').map(url => url.trim()).filter(url => url.startsWith('http') && url.length > 10);
            } else {
                sections[header] = content;
            }
        }
        return sections;
    };

    let parsed: Record<string, any> = parseMarkdownAnalysis(analysisString);
    const isNewFormat = Object.keys(parsed).length > 0;

    if (!isNewFormat) {
        try {
            parsed = JSON.parse(analysisString);
        } catch (e) {
            parsed = {};
        }
    }
    
    if (parsed && typeof parsed === 'object' && ('comprehensiveAnalysis' in parsed || 'judgesAnalysis' in parsed)) {
        const sections = [
            { title: "تحلیل جامع جشنواره و سوابق", content: parsed.comprehensiveAnalysis },
            { title: "تحلیل روند تکاملی جشنواره", content: parsed.trendAnalysis },
            { title: "تحلیل داوران و دینامیک گروهی", content: parsed.judgesAnalysis },
            { title: "ژانرها و سبک‌های عکاسی پیشنهادی", content: parsed.suggestedGenres },
            { title: "ایده‌ها و مفاهیم کلیدی برای عکاسی", content: parsed.keyConcepts },
            { title: "نکات فنی و اجرایی برجسته", content: parsed.technicalNotes },
            { title: "اشتباهات رایج / سوءتعبیرهایی که باید از آن‌ها اجتناب کرد", content: parsed.commonMistakes },
            { title: "جمع‌بندی و توصیه‌های نهایی", content: parsed.finalRecommendations },
        ];
        return (
            <div className="prose prose-xs max-w-none text-gray-700 p-2 bg-purple-50 rounded-md border border-purple-100">
                {sections.map(section => section.content && (
                    <div key={section.title} className="mb-2 last:mb-0">
                        <strong className="block my-0.5 text-purple-600">{section.title}:</strong>
                        <div className="whitespace-pre-wrap text-2xs">
                            {String(section.content).split('\n').map((line, index) => {
                                const trimmedLine = line.trim();
                                if (trimmedLine.startsWith('* ')) {
                                    return <li key={index} className="ms-3 list-disc list-inside">{trimmedLine.substring(2)}</li>;
                                }
                                return <p key={index} className="my-0.5">{line}</p>;
                            })}
                        </div>
                    </div>
                ))}
                {parsed.winningImages && Array.isArray(parsed.winningImages) && parsed.winningImages.length > 0 && (
                    <div key="winning-images" className="mb-2 last:mb-0">
                        <strong className="block my-0.5 text-purple-600">نمونه تصاویر برنده از دوره‌های گذشته:</strong>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
                            {parsed.winningImages.map((url: string, index: number) => (
                                <a href={url} key={index} target="_blank" rel="noopener noreferrer" className="block border border-purple-200 dark:border-purple-800 rounded-md overflow-hidden hover:shadow-lg transition-shadow bg-purple-100 dark:bg-purple-900/50">
                                    <img src={url} alt={`Winning image ${index + 1}`} className="w-full h-24 object-cover" loading="lazy" />
                                </a>
                            ))}
                        </div>
                    </div>
                )}
                 {sourcesNode}
            </div>
        );
    }

    // Fallback for old string format
    return (
        <div className="prose prose-xs max-w-none text-gray-700 whitespace-pre-wrap p-2 bg-purple-50 rounded-md border border-purple-100">
           {analysisString.split('\n').map((line, index) => {
              if (line.match(/^\*\*.+:\*\*$/)) { return <strong key={index} className="block my-0.5 text-purple-600">{line.substring(2, line.length - 2)}</strong>; }
              if (line.startsWith('**') && line.endsWith('**')) { return <strong key={index} className="block my-0.5 text-purple-600">{line.substring(2, line.length - 2)}</strong>; }
              if (line.startsWith('* ')) { return <li key={index} className="ms-3 list-disc list-inside text-2xs">{line.substring(2)}</li>; }
              return <p key={index} className="my-0.5 text-2xs">{line}</p>;
           })}
           {sourcesNode && <div className="mt-2 pt-2 border-t border-purple-200">{sourcesNode}</div>}
        </div>
    );
};


export const FestivalCard: React.FC<FestivalCardProps> = ({ festival, onEdit }) => {
  const { activeSession } = useAuth();
  const { deleteFestival, updateFestival } = useFestivals();
  const [isOpen, setIsOpen] = useState(false); // Main toggle for collapsible details
  const [isSmartAnalysisOpen, setIsSmartAnalysisOpen] = useState(false);
  const [isImageAnalysisSectionOpen, setIsImageAnalysisSectionOpen] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [festivalIdToDelete, setFestivalIdToDelete] = useState<string | null>(null);
  
  const [selectedImagesForAnalysis, setSelectedImagesForAnalysis] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [imageUserDescriptions, setImageUserDescriptions] = useState<string[]>([]);
  
  const [selectedAnalysisTopic, setSelectedAnalysisTopic] = useState<string>("تحلیل کلی بر اساس تمام موارد");
  const [isGeneratingDocxAnalysis, setIsGeneratingDocxAnalysis] = useState(false);
  const [footerMessage, setFooterMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const messageTimerRef = useRef<number | null>(null);

  const [isAttemptingSmartAnalysisCancel, setIsAttemptingSmartAnalysisCancel] = useState(false);
  const [smartAnalysisProcessingMessage, setSmartAnalysisProcessingMessage] = useState<string | null>(null);
  
  const [isAttemptingImageAnalysisCancel, setIsAttemptingImageAnalysisCancel] = useState(false);
  const [imageBatchProcessingMessage, setImageBatchProcessingMessage] = useState<string | null>(null);
  const [imageAnalysisBatchError, setImageAnalysisBatchError] = useState<string | null>(null);

  const smartAnalysisAbortControllerRef = useRef<AbortController | null>(null);
  const imageAnalysisAbortControllerRef = useRef<AbortController | null>(null);

  const [showDeleteAnalysisConfirmModal, setShowDeleteAnalysisConfirmModal] = useState(false);

  const isAdmin = activeSession.role === 'admin';

  const showFooterMessage = (text: string, type: 'success' | 'error', duration: number = 4000) => {
    if (messageTimerRef.current) {
        clearTimeout(messageTimerRef.current);
    }
    setFooterMessage({ text, type });
    messageTimerRef.current = window.setTimeout(() => {
        setFooterMessage(null);
    }, duration);
  };


  const dynamicAnalysisTopics = useMemo(() => {
    const topics = new Set<string>();
    topics.add("تحلیل کلی بر اساس تمام موارد");

    if (Array.isArray(festival.topics)) {
      festival.topics.forEach(topic => topic && topics.add(topic.trim()));
    }

    if (festival.smartAnalysis) {
      const extracted = extractTopicsFromSmartAnalysis(festival.smartAnalysis);
      extracted.forEach(topic => topic && topics.add(topic.trim()));
    }
    
    if (festival.objectives && festival.objectives.length < 100 && !festival.objectives.includes('\n') && !topics.has(festival.objectives.trim())) {
        // topics.add(`هدف اصلی: ${festival.objectives.trim()}`); 
    }

    return Array.from(topics);
  }, [festival.topics, festival.smartAnalysis, festival.objectives]);


  const toggleOpen = (event: React.MouseEvent<HTMLDivElement>) => {
    const targetElement = event.target as HTMLElement;
    // Allow clicks on buttons/links within header if any were added (currently none)
    if (targetElement.closest('button') || targetElement.closest('a') || targetElement.closest('input') || targetElement.closest('select') || targetElement.closest('details') || targetElement.closest('summary')) {
      return; 
    }
    // Check if the click is on the intended clickable header area
    if (event.currentTarget.classList.contains('festival-card-header-clickable-area')) {
        setIsOpen(!isOpen);
    }
  };
  
  const handleFetchSmartAnalysis = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (festival.isAnalyzing || isAttemptingSmartAnalysisCancel) return;

    if (smartAnalysisAbortControllerRef.current) {
        smartAnalysisAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    smartAnalysisAbortControllerRef.current = controller;

    setIsAttemptingSmartAnalysisCancel(false);
    setSmartAnalysisProcessingMessage("در حال دریافت تحلیل هوشمند...");
    const smartAnalysisToKeep = festival.analysisError ? undefined : festival.smartAnalysis;
    const analysisSourceUrlsToKeep = festival.analysisError ? undefined : festival.analysisSourceUrls;

    updateFestival({ 
        ...festival, 
        isAnalyzing: true, 
        analysisError: undefined, 
        smartAnalysis: smartAnalysisToKeep,
        analysisSourceUrls: analysisSourceUrlsToKeep
    });

    try {
      const { analysisText, sourceUrls } = await getSmartFestivalAnalysisViaGemini(
        festival.festivalName,
        festival.topics,
        festival.objectives,
        festival.userNotesForSmartAnalysis, 
        controller.signal
      );
      if (controller.signal.aborted) {
         const cancelMsg = "عملیات تحلیل هوشمند توسط کاربر لغو شد.";
         setSmartAnalysisProcessingMessage(cancelMsg);
         updateFestival({ ...festival, smartAnalysis: undefined, analysisSourceUrls: undefined, analysisError: cancelMsg, isAnalyzing: false });
      } else {
        setSmartAnalysisProcessingMessage("تحلیل هوشمند با موفقیت دریافت شد.");
        updateFestival({ 
          ...festival, 
          smartAnalysis: analysisText, 
          analysisSourceUrls: sourceUrls, 
          isAnalyzing: false 
        });
        if (!isSmartAnalysisOpen) setIsSmartAnalysisOpen(true);
        setTimeout(() => setSmartAnalysisProcessingMessage(null), 3000); 
      }
    } catch (err: any) {
      let errorMessage = "خطا در دریافت تحلیل";
      if (err.name === 'AbortError' || (err.message && err.message.includes("Operation aborted"))) {
        errorMessage = "عملیات تحلیل هوشمند توسط کاربر لغو شد.";
      } else if (err.message && typeof err.message === 'string' && (err.message.toLowerCase().includes("api_key") || err.message.toLowerCase().includes("not initialized"))) {
         errorMessage = `Gemini API error: ${err.message}. Make sure API_KEY is configured.`;
      } else {
         errorMessage = `Gemini API error during smart analysis: ${err.message}`;
      }
      setSmartAnalysisProcessingMessage(errorMessage);
      updateFestival({ ...festival, smartAnalysis: undefined, analysisSourceUrls: undefined, analysisError: errorMessage, isAnalyzing: false });
    } finally {
        smartAnalysisAbortControllerRef.current = null;
        setIsAttemptingSmartAnalysisCancel(false);
    }
  };

  const handleCancelSmartAnalysis = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (smartAnalysisAbortControllerRef.current && festival.isAnalyzing && !isAttemptingSmartAnalysisCancel) {
        setIsAttemptingSmartAnalysisCancel(true);
        setSmartAnalysisProcessingMessage("درخواست لغو ارسال شد. منتظر پاسخ سرویس...");
        smartAnalysisAbortControllerRef.current.abort();
    }
  };
  
  const handleDeleteSmartAnalysisRequest = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteAnalysisConfirmModal(true);
  };

  const confirmSmartAnalysisDeletion = () => {
    updateFestival({
      ...festival,
      smartAnalysis: undefined,
      analysisSourceUrls: undefined, // Assuming analysisSourceUrls are specifically for smartAnalysis
      analysisError: undefined, // Clear any previous smart analysis error
      isAnalyzing: false, // Ensure this is reset
    });
    setShowDeleteAnalysisConfirmModal(false);
    setSmartAnalysisProcessingMessage("تحلیل هوشمند فعلی با موفقیت حذف شد.");
    setTimeout(() => setSmartAnalysisProcessingMessage(null), 3000);
  };


  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(festival);
  };

  const handleDeleteRequest = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFestivalIdToDelete(festival.id);
    setShowConfirmModal(true);
  };

  const confirmDeletion = () => {
    if (festivalIdToDelete) {
      deleteFestival(festivalIdToDelete);
    }
  };
  
  const handleDownloadClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (festival.fileType === 'text/plain') {
      if (festival.extractedText) {
        const blob = new Blob([festival.extractedText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const fileName = festival.festivalName ? `${festival.festivalName.replace(/[^a-z0-9آ-ی_.-]/gi, '_')}.txt` : 'متن_فراخوان.txt';
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showFooterMessage('دانلود فایل متنی با موفقیت آغاز شد.', 'success');
      } else {
        showFooterMessage('متن برای دانلود موجود نیست.', 'error');
      }
    } else if (festival.sourceDataUrl) {
      const link = document.createElement('a');
      link.href = festival.sourceDataUrl;
      link.download = festival.fileName || 'فایل_فراخوان';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showFooterMessage('دانلود فایل اصلی با موفقیت آغاز شد.', 'success');
    } else {
      showFooterMessage('فایل منبع برای دانلود موجود نیست.', 'error');
    }
  };

  const canDownload = (): boolean => {
    if (festival.fileType === 'text/plain') {
      return !!festival.extractedText;
    }
    return !!festival.sourceDataUrl;
  };

  const handleDownloadAnalysisAsTxt = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!festival.smartAnalysis) {
      showFooterMessage("تحلیلی برای دانلود وجود ندارد.", 'error');
      return;
    }

    try {
      let contentToDownload = "";
      if (festival.userNotesForSmartAnalysis) {
        contentToDownload += `یادداشت‌های کاربر برای تحلیل:\n${festival.userNotesForSmartAnalysis}\n\n---\n\n`;
      }

      try {
        const parsed = JSON.parse(festival.smartAnalysis);
        if (parsed && typeof parsed === 'object') {
            const sections = [
                { title: "تحلیل جامع جشنواره و سوابق", content: parsed.comprehensiveAnalysis },
                { title: "تحلیل روند تکاملی جشنواره", content: parsed.trendAnalysis },
                { title: "تحلیل داوران و دینامیک گروهی", content: parsed.judgesAnalysis },
                { title: "ژانرها و سبک‌های عکاسی پیشنهادی", content: parsed.suggestedGenres },
                { title: "ایده‌ها و مفاهیم کلیدی برای عکاسی", content: parsed.keyConcepts },
                { title: "نکات فنی و اجرایی برجسته", content: parsed.technicalNotes },
                { title: "اشتباهات رایج / سوءتعبیرهایی که باید از آن‌ها اجتناب کرد", content: parsed.commonMistakes },
                { title: "جمع‌بندی و توصیه‌های نهایی", content: parsed.finalRecommendations },
            ];
            contentToDownload += "تحلیل هوشمند جشنواره:\n\n";
            sections.forEach(section => {
                if (section.content) {
                    contentToDownload += `** ${section.title} **\n${section.content}\n\n`;
                }
            });
        } else {
           throw new Error("Parsed data is not an object.");
        }
      } catch (parseError) {
        // Fallback for old string format
        contentToDownload += `تحلیل هوشمند جشنواره:\n${festival.smartAnalysis}`;
      }

      const blob = new Blob([contentToDownload], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const txtFileName = `تحلیل_هوشمند_${(festival.festivalName || 'فراخوان').replace(/[^a-z0-9آ-ی_.-]/gi, '_')}.txt`;
      link.download = txtFileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showFooterMessage('دانلود فایل TXT تحلیل با موفقیت آغاز شد.', 'success');
    } catch (error) {
      console.error("Error generating TXT for analysis:", error);
      showFooterMessage(`خطا در ایجاد فایل TXT: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  };

  const handleDownloadAnalysisAsDocx = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!festival.smartAnalysis) {
        showFooterMessage("تحلیلی برای دانلود فایل Word وجود ندارد.", 'error');
        return;
    }
    if (isGeneratingDocxAnalysis) return;

    setIsGeneratingDocxAnalysis(true);
    try {
        const docChildren: any[] = [];
        const fontName = "Vazir";
        const defaultFontSize = 11 * 2;
        const headingFontSize = 14 * 2;
        const sectionHeadingFontSize = 12 * 2;

        docChildren.push(new Paragraph({
            text: `تحلیل هوشمند جشنواره: ${festival.festivalName || 'فراخوان بدون نام'}`,
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            run: { font: fontName, size: 18 * 2, bold: true },
            spacing: { after: 300 },
        }));

        if (festival.userNotesForSmartAnalysis) {
            docChildren.push(new Paragraph({
                text: "یادداشت‌های کاربر برای تحلیل:",
                heading: HeadingLevel.HEADING_2,
                alignment: AlignmentType.RIGHT,
                run: { font: fontName, size: headingFontSize, bold: true },
                spacing: { before: 200, after: 100 },
            }));
            docChildren.push(new Paragraph({
                text: festival.userNotesForSmartAnalysis,
                alignment: AlignmentType.RIGHT,
                run: { font: fontName, size: defaultFontSize },
                spacing: { after: 200 },
            }));
        }

        docChildren.push(new Paragraph({
            text: "تحلیل هوشمند:",
            heading: HeadingLevel.HEADING_2,
            alignment: AlignmentType.RIGHT,
            run: { font: fontName, size: headingFontSize, bold: true },
            spacing: { before: 200, after: 100 },
        }));
        
        try {
            const parsed = JSON.parse(festival.smartAnalysis);
            if (parsed && typeof parsed === 'object') {
                const sections = [
                    { title: "تحلیل جامع جشنواره و سوابق", content: parsed.comprehensiveAnalysis },
                    { title: "تحلیل روند تکاملی جشنواره", content: parsed.trendAnalysis },
                    { title: "تحلیل داوران و دینامیک گروهی", content: parsed.judgesAnalysis },
                    { title: "ژانرها و سبک‌های عکاسی پیشنهادی", content: parsed.suggestedGenres },
                    { title: "ایده‌ها و مفاهیم کلیدی برای عکاسی", content: parsed.keyConcepts },
                    { title: "نکات فنی و اجرایی برجسته", content: parsed.technicalNotes },
                    { title: "اشتباهات رایج / سوءتعبیرهایی که باید از آن‌ها اجتناب کرد", content: parsed.commonMistakes },
                    { title: "جمع‌بندی و توصیه‌های نهایی", content: parsed.finalRecommendations },
                ];
                
                sections.forEach(section => {
                    if (section.content) {
                        docChildren.push(new Paragraph({
                            text: section.title,
                            alignment: AlignmentType.RIGHT,
                            run: { font: fontName, size: sectionHeadingFontSize, bold: true },
                            spacing: { before: 150, after: 80 },
                        }));
                        String(section.content).split('\n').forEach(line => {
                             const trimmedLine = line.trim();
                             if (trimmedLine.startsWith('* ')) {
                                 docChildren.push(new Paragraph({
                                    text: trimmedLine.substring(2),
                                    bullet: { level: 0 },
                                    alignment: AlignmentType.RIGHT,
                                    run: { font: fontName, size: defaultFontSize },
                                    spacing: { after: 50 },
                                 }));
                             } else if (trimmedLine) {
                                 docChildren.push(new Paragraph({
                                    text: trimmedLine,
                                    alignment: AlignmentType.RIGHT,
                                    run: { font: fontName, size: defaultFontSize },
                                    spacing: { after: 80 },
                                }));
                             }
                        });
                    }
                });

                if (parsed.winningImages && Array.isArray(parsed.winningImages) && parsed.winningImages.length > 0) {
                     docChildren.push(new Paragraph({
                        text: "نمونه تصاویر برنده از دوره‌های گذشته:",
                        alignment: AlignmentType.RIGHT,
                        run: { font: fontName, size: sectionHeadingFontSize, bold: true },
                        spacing: { before: 150, after: 80 },
                    }));
                     // Note: Embedding remote images in docx is complex and not directly supported by docx.js
                     // We will list the URLs instead.
                     parsed.winningImages.forEach((url: string) => {
                         docChildren.push(new Paragraph({
                            children: [
                                new ExternalHyperlink({
                                    children: [new TextRun({
                                        text: url,
                                        style: "Hyperlink",
                                        font: fontName,
                                        size: defaultFontSize,
                                    })],
                                    link: url,
                                }),
                            ],
                            bullet: { level: 0 },
                            alignment: AlignmentType.LEFT,
                            spacing: { after: 50 },
                        }));
                     });
                }

            } else {
                throw new Error("Parsed data is not an object.");
            }
        } catch (parseError) {
             // Fallback for old string format
            const analysisLines = festival.smartAnalysis.split('\n');
            analysisLines.forEach(line => {
                const trimmedLine = line.trim();
                if (trimmedLine.match(/^\*\*.+:\*\*$/)) { 
                    docChildren.push(new Paragraph({
                        text: trimmedLine.substring(2, trimmedLine.length - 2),
                        alignment: AlignmentType.RIGHT,
                        run: { font: fontName, size: sectionHeadingFontSize, bold: true },
                        spacing: { before: 150, after: 80 },
                    }));
                } else if (trimmedLine.startsWith('* ')) { 
                    docChildren.push(new Paragraph({
                        text: trimmedLine.substring(2),
                        bullet: { level: 0 },
                        alignment: AlignmentType.RIGHT,
                        run: { font: fontName, size: defaultFontSize },
                        spacing: { after: 50 },
                    }));
                } else if (trimmedLine) { 
                    docChildren.push(new Paragraph({
                        text: trimmedLine,
                        alignment: AlignmentType.RIGHT,
                        run: { font: fontName, size: defaultFontSize },
                        spacing: { after: 80 },
                    }));
                }
            });
        }
        
        if (festival.analysisSourceUrls && festival.analysisSourceUrls.length > 0) {
            docChildren.push(new Paragraph({ text: "", spacing: { after: 200 } })); 
            docChildren.push(new Paragraph({
                text: "منابع مورد استفاده در تحلیل هوشمند:",
                heading: HeadingLevel.HEADING_2,
                alignment: AlignmentType.RIGHT,
                run: { font: fontName, size: headingFontSize, bold: true },
                spacing: { before: 200, after: 100 },
            }));
            festival.analysisSourceUrls.forEach(source => {
                docChildren.push(new Paragraph({
                    children: [
                        new ExternalHyperlink({
                            children: [new TextRun({
                                text: source.title || source.uri,
                                style: "Hyperlink",
                                font: fontName,
                                size: defaultFontSize,
                            })],
                            link: source.uri,
                        }),
                    ],
                    alignment: AlignmentType.RIGHT,
                    spacing: { after: 50 },
                }));
            });
        }

        const doc = new Document({
            creator: "Photo Contest Analyzer App",
            title: `تحلیل هوشمند: ${festival.festivalName || 'فراخوان'}`,
            styles: {
                paragraphStyles: [{
                    id: "common",
                    name: "Common Paragraph",
                    run: { font: fontName, size: defaultFontSize },
                    paragraph: { 
                        alignment: AlignmentType.RIGHT,
                    },
                }],
            },
            sections: [{
                properties: {
                    page: {
                        margin: {
                            top: convertInchesToTwip(0.75), right: convertInchesToTwip(0.75),
                            bottom: convertInchesToTwip(0.75), left: convertInchesToTwip(0.75),
                        },
                        size: { orientation: PageOrientation.PORTRAIT },
                    },
                },
                children: docChildren,
            }],
        });

        const blob = await Packer.toBlob(doc);
        const docxFileName = `تحلیل_هوشمند_${(festival.festivalName || 'فراخوان').replace(/[^a-z0-9آ-ی_.-]/gi, '_')}.docx`;
        saveAs(blob, docxFileName);
        showFooterMessage('دانلود فایل Word تحلیل با موفقیت آغاز شد.', 'success');
    } catch (error) {
        console.error("Error creating DOCX for analysis:", error);
        showFooterMessage(`خطا در ایجاد فایل Word: ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
        setIsGeneratingDocxAnalysis(false);
    }
  };

  const handleImageFilesForAnalysisChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setImageAnalysisBatchError(null); 
    setImageBatchProcessingMessage(null);
    if (imageAnalysisAbortControllerRef.current) {
        imageAnalysisAbortControllerRef.current.abort(); 
    }
    const files = event.target.files;
    if (files && files.length > 0) {
        if (files.length > MAX_PHOTOS_FOR_ANALYSIS) {
            setImageAnalysisBatchError(`حداکثر ${MAX_PHOTOS_FOR_ANALYSIS} تصویر قابل انتخاب است.`);
            setSelectedImagesForAnalysis([]);
            setImagePreviews([]);
            setImageUserDescriptions([]);
            event.target.value = ''; 
            return;
        }
        const validImageTypes = ['image/jpeg', 'image/png'];
        const newFilesArray = Array.from(files).filter(file => validImageTypes.includes(file.type));

        if (newFilesArray.length !== files.length) {
            setImageAnalysisBatchError('فقط فایل‌های JPG یا PNG مجاز هستند. برخی فایل‌ها نادیده گرفته شدند.');
        }
        if (newFilesArray.length === 0 && files.length > 0) {
             setImageAnalysisBatchError('هیچ فایل تصویر معتبری (JPG/PNG) انتخاب نشد.');
        }
        
        setSelectedImagesForAnalysis(newFilesArray);
        setImageUserDescriptions(new Array(newFilesArray.length).fill('')); 
        const previewsPromise = newFilesArray.map(file => fileToBase64(file));
        const previews = await Promise.all(previewsPromise);
        setImagePreviews(previews);
    } else {
        setSelectedImagesForAnalysis([]);
        setImagePreviews([]);
        setImageUserDescriptions([]);
    }
  };

  const handleImageDescriptionChange = (index: number, description: string) => {
    const newDescriptions = [...imageUserDescriptions];
    newDescriptions[index] = description;
    setImageUserDescriptions(newDescriptions);
  };


  const handleStartImageAnalysis = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (imageAnalysisBatchError) setImageAnalysisBatchError(null);

    if (selectedImagesForAnalysis.length === 0 || !festival.smartAnalysis || festival.isAnalyzingFestivalImages || isAttemptingImageAnalysisCancel) return;

    if (imageAnalysisAbortControllerRef.current) {
        imageAnalysisAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    imageAnalysisAbortControllerRef.current = controller;

    setIsAttemptingImageAnalysisCancel(false);
    setImageBatchProcessingMessage("در حال آماده‌سازی برای تحلیل عکس‌ها...");
    
    const existingAnalyzedImages = festival.analyzedFestivalImages ? [...festival.analyzedFestivalImages] : [];
    updateFestival({ ...festival, isAnalyzingFestivalImages: true }); 
    
    let currentBatchAnalyzedImages: FestivalImageAnalysis[] = [];

    const focusedTopicForGemini = (selectedAnalysisTopic === "تحلیل کلی بر اساس تمام موارد" || selectedAnalysisTopic.trim() === "")
                                  ? GENERAL_ANALYSIS_TOPIC_VALUE
                                  : selectedAnalysisTopic;

    try {
        for (let i = 0; i < selectedImagesForAnalysis.length; i++) {
            if (controller.signal.aborted) {
                throw new DOMException('Image analysis batch aborted by user.', 'AbortError');
            }
            setImageBatchProcessingMessage(`در حال تحلیل عکس ${i + 1} از ${selectedImagesForAnalysis.length}...`);

            const file = selectedImagesForAnalysis[i];
            const imageDataUrl = imagePreviews[i];
            const userDescription = imageUserDescriptions[i];

            const tempImageAnalysisEntry: FestivalImageAnalysis = {
                id: crypto.randomUUID(),
                sourceImageName: file.name,
                sourceImageType: file.type,
                sourceImageDataUrl: imageDataUrl,
                userDescription: userDescription || undefined,
                isAnalyzingImage: true,
            };
            currentBatchAnalyzedImages.push(tempImageAnalysisEntry);
            updateFestival({ ...festival, isAnalyzingFestivalImages: true, analyzedFestivalImages: [...existingAnalyzedImages, ...currentBatchAnalyzedImages] });


            try {
                const base64Data = imageDataUrl.split(',')[1];
                const analysisResult = await analyzeImageForFestivalViaGemini(
                    base64Data,
                    file.type,
                    {
                        festivalName: festival.festivalName,
                        topics: festival.topics,
                        objectives: festival.objectives,
                        smartAnalysisText: festival.smartAnalysis!,
                        focusedTopic: focusedTopicForGemini,
                        userImageDescription: userDescription || undefined
                    },
                    controller.signal
                );

                currentBatchAnalyzedImages[currentBatchAnalyzedImages.length - 1] = { 
                    ...tempImageAnalysisEntry,
                    geminiAnalysisText: analysisResult.imageCritique,
                    geminiScore: analysisResult.suitabilityScoreOutOf10,
                    geminiScoreReasoning: analysisResult.scoreReasoning,
                    editingCritiqueAndSuggestions: analysisResult.editingCritiqueAndSuggestions,
                    isAnalyzingImage: false,
                };

            } catch (imgErr: any) {
                const errorMsg = (controller.signal.aborted || (typeof imgErr.message === 'string' && imgErr.message.includes("Operation aborted")))
                                 ? "تحلیل این عکس توسط کاربر لغو شد."
                                 : `Gemini API error: ${imgErr.message}` || "خطا در تحلیل تصویر";
                console.error(`Error analyzing image ${file.name}:`, imgErr);
                currentBatchAnalyzedImages[currentBatchAnalyzedImages.length - 1] = { 
                    ...tempImageAnalysisEntry, 
                    imageAnalysisError: errorMsg, 
                    isAnalyzingImage: false 
                };
            }
            updateFestival({ ...festival, isAnalyzingFestivalImages: true, analyzedFestivalImages: [...existingAnalyzedImages, ...currentBatchAnalyzedImages] });
        }
        setImageBatchProcessingMessage("تحلیل همه عکس‌ها با موفقیت انجام شد.");
        updateFestival({ ...festival, isAnalyzingFestivalImages: false, analyzedFestivalImages: [...existingAnalyzedImages, ...currentBatchAnalyzedImages] });
        setSelectedImagesForAnalysis([]);
        setImagePreviews([]);
        setImageUserDescriptions([]);
        setTimeout(() => setImageBatchProcessingMessage(null), 3000);

    } catch (batchError: any) {
        let batchErrorMessage = `خطای کلی در تحلیل دسته‌ای عکس‌ها: ${batchError.message}`;
        if (batchError.name === 'AbortError' || (typeof batchError.message === 'string' && batchError.message.includes("Operation aborted"))) {
            currentBatchAnalyzedImages = currentBatchAnalyzedImages.map(img => img.isAnalyzingImage ? { ...img, isAnalyzingImage: false, imageAnalysisError: "تحلیل توسط کاربر لغو شد." } : img);
            batchErrorMessage = "عملیات تحلیل عکس‌ها توسط کاربر لغو شد.";
        } else {
            batchErrorMessage = `Gemini API error: ${batchError.message}`;
        }
        setImageAnalysisBatchError(batchErrorMessage);
        setImageBatchProcessingMessage(batchErrorMessage);
        updateFestival({ 
            ...festival, 
            isAnalyzingFestivalImages: false, 
            analyzedFestivalImages: [...existingAnalyzedImages, ...currentBatchAnalyzedImages.map(img => img.isAnalyzingImage ? { ...img, isAnalyzingImage: false, imageAnalysisError: "خطا در عملیات دسته‌ای" } : img)]
        });
    } finally {
        imageAnalysisAbortControllerRef.current = null;
        setIsAttemptingImageAnalysisCancel(false);
    }
  };
  
  const handleCancelImageAnalysis = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (imageAnalysisAbortControllerRef.current && festival.isAnalyzingFestivalImages && !isAttemptingImageAnalysisCancel) {
        setIsAttemptingImageAnalysisCancel(true);
        setImageBatchProcessingMessage("درخواست لغو ارسال شد. منتظر پاسخ سرویس...");
        imageAnalysisAbortControllerRef.current.abort();
    }
  };

  const handleDeleteAnalyzedImage = (e: React.MouseEvent, imageId: string) => {
    e.stopPropagation();
    const updatedAnalyzedImages = festival.analyzedFestivalImages?.filter(img => img.id !== imageId) || [];
    updateFestival({ ...festival, analyzedFestivalImages: updatedAnalyzedImages });
  };

  const getDaysRemaining = () => {
    let deadline: Date | null = null;
    if (festival.submissionDeadlineGregorian) {
        try {
            const [year, month, day] = festival.submissionDeadlineGregorian.split('-').map(Number);
            deadline = new Date(year, month - 1, day);
            if (isNaN(deadline.getTime())) deadline = null;
        } catch (e) { console.error("Error parsing Gregorian deadline for card:", e); deadline = null; }
    } else if (festival.submissionDeadlinePersian) {
        try {
            const jDate = parseJalaliDate(festival.submissionDeadlinePersian);
            if (jDate) {
                const gDate = toGregorian(jDate.jy, jDate.jm, jDate.jd);
                deadline = new Date(gDate.gy, gDate.gm - 1, gDate.gd);
                 if (isNaN(deadline.getTime())) deadline = null;
            }
        } catch (e) { console.error("Error parsing Persian deadline for card:", e); deadline = null; }
    }

    if (!deadline) return { text: "نامشخص", color: "text-gray-500" };

    const today = new Date();
    today.setHours(0,0,0,0);
    deadline.setHours(0,0,0,0);

    const diffTime = deadline.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { text: "مهلت تمام شده", color: "text-red-700 font-semibold" };
    if (diffDays === 0) return { text: "امروز آخرین مهلت!", color: "text-orange-600 font-bold" };
    if (diffDays < 3) return { text: `${diffDays} روز باقی مانده`, color: "text-red-600 font-semibold" };
    if (diffDays <= 10) return { text: `${diffDays} روز باقی مانده`, color: "text-yellow-600 font-semibold" };
    return { text: `${diffDays} روز باقی مانده`, color: "text-green-600" };
  };

  const deadlineStatus = getDaysRemaining();

  const getFormattedDeadlineString = (festival: FestivalInfo): string => {
    if (festival.submissionDeadlinePersian) {
      return `${formatJalaliDate(festival.submissionDeadlinePersian)} شمسی`;
    } else if (festival.submissionDeadlineGregorian) {
      try {
        const [gy, gm, gd] = festival.submissionDeadlineGregorian.split('-').map(Number);
        const jalali = toJalaali(gy, gm, gd);
        return `${formatJalaliDate(`${jalali.jy}/${jalali.jm}/${jalali.jd}`)} شمسی`;
      } catch (e) {
        return "خطا در تاریخ";
      }
    }
    return "مهلت نامشخص";
  };
  
  const getFeeDisplayInfo = () => {
    if (festival.feeStatusFree === true && festival.feeStatusPaid !== true) {
      return { text: "رایگان", color: "text-green-600" };
    } else if (festival.feeStatusPaid === true && festival.feeStatusFree !== true) {
      if (festival.feeDescription && festival.feeDescription.trim() !== "") {
        return { text: festival.feeDescription.substring(0, 25) + (festival.feeDescription.length > 25 ? '...' : ''), color: "text-orange-600" };
      }
      return { text: "دارای هزینه", color: "text-orange-600" };
    } else if (festival.feeStatusFree === true && festival.feeStatusPaid === true) {
      return { text: "ترکیبی (رایگان/پولی)", color: "text-blue-600" };
    }
    return { text: "نامشخص", color: "text-gray-500" };
  };
  const feeDisplay = getFeeDisplayInfo();


  const renderDetail = (IconComponent: React.ElementType, label: string, value?: string | string[] | number | null, isLink: boolean = false, className?: string) => {
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) return null;
    
    let displayValueNode: React.ReactNode;
    if (Array.isArray(value)) {
      displayValueNode = (
        <div className="block"> 
          {value.map((item, index) => (
            <span key={index} className="inline-block bg-teal-100 text-teal-700 text-xs font-medium me-2 mb-1 px-2.5 py-0.5 rounded-full">
              {item}
            </span>
          ))}
        </div>
      );
    } else if (isLink && typeof value === 'string') {
      const trimmedValue = value.trim();
      if (trimmedValue.startsWith('http') || trimmedValue.startsWith('mailto:')) {
        displayValueNode = (
          <a href={trimmedValue} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:text-blue-800 hover:underline break-all">
            {trimmedValue} <LinkIcon size={12} className="inline ms-1" />
          </a>
        );
      } else {
        displayValueNode = <span className={`text-xs text-gray-700 break-words whitespace-pre-wrap ${className || ''}`}>{String(value)}</span>; 
      }
    } else { 
      displayValueNode = <span className={`text-xs text-gray-700 break-words whitespace-pre-wrap ${className || ''}`}>{String(value)}</span>;
    }

    return (
      <div className="flex items-start mt-1.5">
        <IconComponent className="h-4 w-4 text-teal-600 me-2 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-xs font-medium text-gray-500">{label}</p>
          {displayValueNode}
        </div>
      </div>
    );
  };


  const sortedAnalyzedImages = festival.analyzedFestivalImages
    ?.slice() 
    .sort((a, b) => (b.geminiScore ?? -1) - (a.geminiScore ?? -1));

  const topScoringImages = sortedAnalyzedImages?.filter(img => img.geminiScore && img.geminiScore >= 7) 
                                               .map(img => img.sourceImageName);

  const canShowSmartAnalysisRetryButton = festival.analysisError && !festival.isAnalyzing && !isAttemptingSmartAnalysisCancel;
  let showSpecificSmartAnalysisRetryButton = false;
  if (canShowSmartAnalysisRetryButton && festival.analysisError) {
      const isCancelError = festival.analysisError.includes("لغو شد") || festival.analysisError.includes("Operation aborted");
      const isNotApiKeyRelatedError = !festival.analysisError.toLowerCase().includes("api_key") &&
                                      !festival.analysisError.toLowerCase().includes("api key") &&
                                      !festival.analysisError.toLowerCase().includes("environment") &&
                                      !festival.analysisError.toLowerCase().includes("gemini api client is not initialized");
      showSpecificSmartAnalysisRetryButton = isCancelError || isNotApiKeyRelatedError;
  }

  const canShowImageAnalysisRetryButton = imageAnalysisBatchError && !festival.isAnalyzingFestivalImages && !isAttemptingImageAnalysisCancel;
  let showSpecificImageAnalysisRetryButton = false;
  if (canShowImageAnalysisRetryButton && imageAnalysisBatchError) {
    const isCancelError = imageAnalysisBatchError.includes("لغو شد") || imageAnalysisBatchError.includes("Operation aborted");
     const isNotApiKeyRelatedError = !imageAnalysisBatchError.toLowerCase().includes("api_key") &&
                                      !imageAnalysisBatchError.toLowerCase().includes("api key") &&
                                      !imageAnalysisBatchError.toLowerCase().includes("environment") &&
                                      !imageAnalysisBatchError.toLowerCase().includes("gemini api client is not initialized");
    showSpecificImageAnalysisRetryButton = isCancelError || isNotApiKeyRelatedError;
  }

  const handleToggleSubmitted = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateFestival({ ...festival, hasSubmitted: !festival.hasSubmitted });
  };
  
  const titleColorClass = festival.hasSubmitted
    ? 'text-green-700 dark:text-green-500 font-semibold'
    : 'text-red-700 dark:text-red-500 font-semibold';

  return (
    <>
      <div className="bg-white rounded-lg shadow-lg overflow-hidden flex flex-col transition-all duration-300 ease-in-out hover:shadow-xl">
        {/* Clickable Header Area */}
        <div 
          className="p-3 cursor-pointer festival-card-header-clickable-area" 
          onClick={toggleOpen} 
          role="button" 
          tabIndex={0} 
          aria-expanded={isOpen} 
          aria-controls={`festival-details-${festival.id}`}
        >
          {/* Line 1: Festival Name & Toggle Icon */}
          <div className="flex justify-between items-center">
            <h3 
              className={`text-md ${titleColorClass} flex-grow`} 
              title={festival.festivalName}
            >
              {festival.festivalName || 'فراخوان بدون نام'}
            </h3>
            {isOpen ? <ChevronUp size={18} className="text-teal-600 ms-2 flex-shrink-0" /> : <ChevronDown size={18} className="text-teal-600 ms-2 flex-shrink-0" />}
          </div>
          
          {/* Line 2: Deadline Info & Fee Info */}
          <div className="flex flex-wrap items-baseline text-xs mt-1 gap-x-3 gap-y-0.5">
            <div className="flex items-baseline">
                <Calendar className="h-3.5 w-3.5 text-gray-500 me-1.5 flex-shrink-0" />
                <span className="text-gray-600">
                {getFormattedDeadlineString(festival)}
                </span>
                {(festival.submissionDeadlineGregorian || festival.submissionDeadlinePersian) && (
                <span className={`ms-2 font-medium ${deadlineStatus.color}`}>{deadlineStatus.text}</span>
                )}
            </div>
            <div className="flex items-baseline">
                <DollarSign className="h-3.5 w-3.5 text-gray-500 me-1.5 flex-shrink-0" />
                <span className="text-gray-600">هزینه: </span>
                <span className={`ms-1 font-medium ${feeDisplay.color}`}>{feeDisplay.text}</span>
            </div>
          </div>
        </div>

        {/* Collapsible Content Area */}
        {isOpen && (
          <div id={`festival-details-${festival.id}`} className="px-3 pt-2 pb-3 border-t border-gray-200 space-y-3">
            {/* File Preview and Name */}
            {(festival.filePreview || festival.fileName) && (
                <div className="text-center my-2">
                {festival.filePreview && festival.filePreview !== 'pdf' && festival.filePreview !== 'text_input' && (
                    <img src={festival.filePreview} alt={festival.festivalName || 'پیش‌نمایش'} className="w-full h-28 object-contain rounded-md border mx-auto" />
                )}
                {festival.filePreview === 'pdf' && (
                    <div className="w-full h-28 bg-gray-100 flex items-center justify-center rounded-md border mx-auto">
                    <FileText className="h-14 w-14 text-red-500" />
                    </div>
                )}
                <p className="text-xs text-gray-500 mt-1 truncate" title={festival.fileName}>
                    فایل: {festival.fileName}
                </p>
                </div>
            )}
            
            {renderDetail(Target, "اهداف جشنواره", festival.objectives)}
            {renderDetail(Tag, "موضوعات / دسته‌بندی‌ها", festival.topics)}
            {renderDetail(Maximize, "حداکثر تعداد عکس", festival.maxPhotos)}
            {renderDetail(LucideImage, "مشخصات تصویر", festival.imageSize)}
            {renderDetail(LinkIcon, "روش ارسال / لینک", festival.submissionMethod, true)}
            {renderDetail(DollarSign, "جزئیات هزینه شرکت", festival.feeDescription, false, festival.feeDescription && festival.feeDescription.length > 50 ? 'whitespace-pre-wrap break-words' : '')}

            {/* Smart Analysis Section: Visible to admin, or to viewer if analysis exists */}
            {(isAdmin || festival.smartAnalysis) && (
              <div className="pt-2 mt-2 border-t border-gray-100">
                <div 
                    className="flex justify-between items-center cursor-pointer py-1"
                    onClick={(e) => { e.stopPropagation(); setIsSmartAnalysisOpen(!isSmartAnalysisOpen); }}
                    role="button"
                    tabIndex={0}
                    aria-expanded={isSmartAnalysisOpen}
                    aria-controls={`smart-analysis-${festival.id}`}
                >
                    <h4 className="text-sm font-semibold text-purple-700 flex items-center">
                        <Brain size={16} className="me-1.5" /> تحلیل هوشمند جشنواره
                    </h4>
                    {isSmartAnalysisOpen ? <ChevronUp size={18} className="text-purple-600" /> : <ChevronDown size={18} className="text-purple-600" />}
                </div>

                {isSmartAnalysisOpen && (
                  <div id={`smart-analysis-${festival.id}`} className="mt-2 space-y-2 text-xs">
                    {/* Admin-only controls for generating, cancelling, and seeing errors */}
                    {isAdmin && (
                      <>
                        {festival.isAnalyzing && (
                            <div className={`flex items-center justify-between p-2 rounded-md ${isAttemptingSmartAnalysisCancel ? 'bg-orange-50 text-orange-600' : 'bg-purple-50 text-purple-600'}`}>
                              <div className="flex items-center">
                                  <LoadingSpinner size="4" className={`me-1.5 ${isAttemptingSmartAnalysisCancel ? 'text-orange-500' : 'text-purple-500'}`} />
                                  {smartAnalysisProcessingMessage || "در حال دریافت تحلیل..."}
                              </div>
                              {!isAttemptingSmartAnalysisCancel ? (
                                  <button onClick={handleCancelSmartAnalysis} className="ms-2 px-1.5 py-0.5 bg-red-500 text-white text-2xs rounded hover:bg-red-600 flex items-center"><XCircle size={12} className="me-0.5" /> لغو</button>
                              ) : (
                                  <button disabled className="ms-2 px-1.5 py-0.5 bg-gray-300 text-gray-600 text-2xs rounded flex items-center"><LoadingSpinner size="3" color="text-gray-600" className="me-0.5 animate-none" /> لغو...</button>
                              )}
                            </div>
                        )}
                        {festival.analysisError && !festival.isAnalyzing && (
                            <div className="p-2 bg-red-50 text-red-600 rounded-md">
                                <div className="flex items-center"><AlertCircle size={14} className="me-1 flex-shrink-0" /><div><span className="font-medium">خطا:</span> {festival.analysisError}</div></div>
                                {showSpecificSmartAnalysisRetryButton && (<button onClick={(e) => { e.stopPropagation(); handleFetchSmartAnalysis(e); }} className="mt-1 text-blue-500 hover:text-blue-700 underline flex items-center"><RefreshCw size={12} className="me-1"/> تلاش مجدد</button>)}
                            </div>
                        )}
                        {smartAnalysisProcessingMessage && !festival.isAnalyzing && !festival.analysisError && (festival.smartAnalysis || smartAnalysisProcessingMessage.includes("حذف شد")) && (<div className="p-2 bg-green-50 text-green-600 rounded-md">{smartAnalysisProcessingMessage}</div>)}
                        
                        {festival.userNotesForSmartAnalysis && !festival.isAnalyzing && (
                            <div className="p-2 bg-yellow-50 border border-yellow-200 rounded-md"><h5 className="text-xs font-semibold text-yellow-700 flex items-center mb-0.5"><FilePlus size={14} className="me-1" /> یادداشت‌های شما:</h5><p className="text-2xs text-yellow-600 whitespace-pre-wrap">{festival.userNotesForSmartAnalysis}</p></div>
                        )}
                      </>
                    )}
                    
                    {/* Analysis content, visible to all if it exists */}
                    {festival.smartAnalysis && !festival.isAnalyzing && (
                        <>
                            <SmartAnalysisDisplay analysisString={festival.smartAnalysis} sourceUrls={festival.analysisSourceUrls} />
                            <div className={`grid grid-cols-1 ${isAdmin ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-1.5 mt-1.5`}>
                                <button onClick={handleDownloadAnalysisAsTxt} className="px-3 py-1 bg-sky-500 text-white font-semibold rounded-md shadow-xs hover:bg-sky-600 flex items-center justify-center text-2xs"><Download size={12} className="me-1" /> TXT</button>
                                <button onClick={handleDownloadAnalysisAsDocx} disabled={isGeneratingDocxAnalysis} className="px-3 py-1 bg-blue-500 text-white font-semibold rounded-md shadow-xs hover:bg-blue-600 flex items-center justify-center text-2xs disabled:bg-gray-300">{isGeneratingDocxAnalysis ? <LoadingSpinner size="3" className="me-1"/> : <FileTextIcon size={12} className="me-1" />} {isGeneratingDocxAnalysis ? "ایجاد..." : "Word"}</button>
                                {isAdmin && (
                                  <button onClick={handleDeleteSmartAnalysisRequest} className="px-3 py-1 bg-red-500 text-white font-semibold rounded-md shadow-xs hover:bg-red-600 flex items-center justify-center text-2xs"><Trash2 size={12} className="me-1" /> حذف تحلیل</button>
                                )}
                            </div>
                        </>
                    )}
                                        
                    {/* Admin-only "Get Analysis" button */}
                    {isAdmin && !festival.smartAnalysis && !festival.isAnalyzing && !festival.analysisError && (
                      <button onClick={handleFetchSmartAnalysis} className="w-full mt-1.5 px-3 py-1 bg-purple-500 text-white font-semibold rounded-md shadow-xs hover:bg-purple-600 flex items-center justify-center text-2xs"><Zap size={12} className="me-1" /> دریافت تحلیل</button>
                    )}
                    
                    {/* Viewer-only message if no analysis exists */}
                    {!isAdmin && !festival.smartAnalysis && (
                      <div className="p-2 bg-gray-50 text-gray-500 rounded-md text-center text-xs">
                          <Brain size={16} className="mx-auto mb-1 text-gray-400" />
                          تحلیل هوشمندی برای این فراخوان منتشر نشده است.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Image Analysis Section: remains admin-only */}
            {isAdmin && festival.smartAnalysis && !festival.isAnalyzing && (
                <div className="pt-2 mt-2 border-t border-gray-100">
                    <div 
                        className="flex justify-between items-center cursor-pointer py-1"
                        onClick={(e) => { e.stopPropagation(); setIsImageAnalysisSectionOpen(!isImageAnalysisSectionOpen); }}
                        role="button" tabIndex={0} aria-expanded={isImageAnalysisSectionOpen} aria-controls={`image-analysis-user-${festival.id}`}
                    >
                        <h4 className="text-sm font-semibold text-indigo-700 flex items-center">
                            <ListChecks size={16} className="me-1.5" /> تحلیل عکس‌های شما
                        </h4>
                        {isImageAnalysisSectionOpen ? <ChevronUp size={18} className="text-indigo-600" /> : <ChevronDown size={18} className="text-indigo-600" />}
                    </div>
                    {isImageAnalysisSectionOpen && (
                        <div id={`image-analysis-user-${festival.id}`} className="mt-2 space-y-3 text-xs">
                            {/* Image Analysis Content from original card, adapted for smaller text */}
                             <div className="mb-2">
                                <label htmlFor={`analysis-topic-input-${festival.id}`} className="block text-2xs font-medium text-gray-600 mb-0.5"><Layers size={12} className="inline me-1 text-indigo-500" /> موضوع تحلیل:</label>
                                <input type="text" id={`analysis-topic-input-${festival.id}`} list={`analysis-topic-datalist-${festival.id}`} value={selectedAnalysisTopic} onChange={(e) => setSelectedAnalysisTopic(e.target.value)} placeholder="انتخاب/تایپ موضوع" className="w-full p-1.5 border border-gray-200 rounded-md shadow-xs focus:ring-indigo-400 focus:border-indigo-400 text-2xs bg-white text-gray-800 placeholder-gray-400 disabled:opacity-70" disabled={festival.isAnalyzingFestivalImages || isAttemptingImageAnalysisCancel || dynamicAnalysisTopics.length <=1 } title={festival.isAnalyzingFestivalImages ? "تحلیل درحال انجام..." : (dynamicAnalysisTopics.length <=1 ? "ابتدا «تحلیل هوشمند جشنواره» را انجام دهید." : "")} />
                                <datalist id={`analysis-topic-datalist-${festival.id}`}>{dynamicAnalysisTopics.map(topic => (topic && <option key={topic} value={topic} />))}</datalist>
                                {dynamicAnalysisTopics.length <= 1 && !festival.isAnalyzingFestivalImages && (<p className="text-3xs text-gray-400 mt-0.5">برای پیشنهادات، <button onClick={(e) => {e.stopPropagation(); if (!isSmartAnalysisOpen) setIsSmartAnalysisOpen(true); document.getElementById(`smart-analysis-${festival.id}`)?.scrollIntoView({behavior: 'smooth'}); }} className="text-indigo-500 hover:underline">تحلیل هوشمند</button> را انجام دهید.</p>)}
                            </div>
                            <div>
                                <label htmlFor={`image-upload-${festival.id}`} className="block text-2xs font-medium text-gray-600 mb-0.5">بارگذاری تصاویر (حداکثر {MAX_PHOTOS_FOR_ANALYSIS}):</label>
                                <input type="file" id={`image-upload-${festival.id}`} multiple accept="image/jpeg,image/png" onChange={handleImageFilesForAnalysisChange} className="block w-full text-2xs text-gray-500 file:me-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-2xs file:font-semibold file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100 disabled:opacity-50" disabled={festival.isAnalyzingFestivalImages || isAttemptingImageAnalysisCancel || selectedImagesForAnalysis.length >= MAX_PHOTOS_FOR_ANALYSIS} />
                                {imageAnalysisBatchError && !festival.isAnalyzingFestivalImages && (<div className="p-1 mt-0.5 bg-red-50 text-red-500 text-3xs rounded-md flex items-center justify-between"><div className="flex items-center"><AlertCircle size={10} className="me-0.5"/> {imageAnalysisBatchError}</div>{showSpecificImageAnalysisRetryButton && selectedImagesForAnalysis.length > 0 && (<button onClick={(e) => { e.stopPropagation(); handleStartImageAnalysis(e); }} className="ms-1 text-2xs text-blue-500 hover:underline flex items-center"><RefreshCw size={10} className="me-0.5"/> تلاش مجدد</button>)}</div>)}
                            </div>
                            {imagePreviews.length > 0 && !festival.isAnalyzingFestivalImages && (
                                <div className="mt-2 space-y-2">{imagePreviews.map((preview, index) => (<div key={`preview-desc-${index}`} className="p-1.5 border rounded-md bg-indigo-50"><div className="flex gap-1.5 items-start"><img src={preview} alt={`Preview ${index + 1}`} className="h-14 w-14 object-cover rounded border border-gray-200 flex-shrink-0" /><div className="flex-grow"><label htmlFor={`img-desc-${index}-${festival.id}`} className="block text-3xs font-medium text-gray-600 mb-0.5">توضیح برای "{selectedImagesForAnalysis[index]?.name.substring(0,15)}..." (اختیاری):</label><textarea id={`img-desc-${index}-${festival.id}`} value={imageUserDescriptions[index]} onChange={(e) => handleImageDescriptionChange(index, e.target.value)} placeholder="مثال: تکنیک نوردهی طولانی..." rows={1} maxLength={200} className="w-full p-1 border border-gray-200 rounded-md shadow-xs text-3xs focus:ring-1 focus:ring-indigo-400 bg-white" disabled={festival.isAnalyzingFestivalImages || isAttemptingImageAnalysisCancel} /></div></div></div>))}</div>
                            )}
                            {festival.isAnalyzingFestivalImages && (<div className={`p-2 rounded-md flex items-center justify-between ${isAttemptingImageAnalysisCancel ? 'bg-orange-50 text-orange-600' : 'bg-indigo-50 text-indigo-600'}`}><div className="flex items-center"><LoadingSpinner size="4" className={`me-1.5 ${isAttemptingImageAnalysisCancel ? 'text-orange-500' : 'text-indigo-500'}`} /> <span>{imageBatchProcessingMessage || "در حال تحلیل..."}</span></div>{!isAttemptingImageAnalysisCancel ? (<button onClick={handleCancelImageAnalysis} className="ms-2 px-1.5 py-0.5 bg-red-500 text-white text-2xs rounded hover:bg-red-600 flex items-center"><XCircle size={12} className="me-0.5" /> لغو</button>) : (<button disabled className="ms-2 px-1.5 py-0.5 bg-gray-300 text-gray-600 text-2xs rounded flex items-center"><LoadingSpinner size="3" color="text-gray-600" className="me-0.5 animate-none" /> لغو...</button>)}</div>)}
                            {imageBatchProcessingMessage && !festival.isAnalyzingFestivalImages && !imageAnalysisBatchError && festival.analyzedFestivalImages && festival.analyzedFestivalImages.length > 0 && (<div className="p-2 bg-green-50 text-green-600 rounded-md">{imageBatchProcessingMessage}</div>)}
                            {!festival.isAnalyzingFestivalImages && (<div className="flex items-center gap-1.5"><button onClick={handleStartImageAnalysis} disabled={selectedImagesForAnalysis.length === 0 || !festival.smartAnalysis || festival.isAnalyzingFestivalImages || isAttemptingImageAnalysisCancel || dynamicAnalysisTopics.length <=1} className="flex-1 px-3 py-1 bg-indigo-500 text-white font-semibold rounded-md shadow-xs hover:bg-indigo-600 flex items-center justify-center text-2xs disabled:bg-gray-300"><UploadCloud size={12} className="me-1" /> شروع تحلیل</button></div>)}
                            {sortedAnalyzedImages && sortedAnalyzedImages.length > 0 && (
                                <div className="mt-2 space-y-2">
                                    <h5 className="text-2xs font-semibold text-gray-700">نتایج تحلیل عکس‌ها:</h5>
                                    {topScoringImages && topScoringImages.length > 0 && (<div className="p-1.5 bg-green-50 border border-green-100 rounded-md text-3xs text-green-600"><InfoIcon size={10} className="inline me-0.5" /> بهترین‌ها: <strong>{topScoringImages.join(', ').substring(0,100)}{topScoringImages.join(', ').length > 100 ? '...' : ''}</strong></div>)}
                                    {sortedAnalyzedImages.map(imgAnalysis => (
                                        <div key={imgAnalysis.id} className="p-1.5 border rounded-md bg-gray-50 relative">
                                            <div className="flex gap-2">
                                                <img src={imgAnalysis.sourceImageDataUrl} alt={imgAnalysis.sourceImageName} className="w-14 h-14 object-cover rounded border flex-shrink-0"/>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-2xs font-semibold text-indigo-600 truncate" title={imgAnalysis.sourceImageName}>{imgAnalysis.sourceImageName}</p>
                                                    {imgAnalysis.userDescription && (<p className="text-3xs text-gray-500 mt-0.5 mb-0.5 italic bg-gray-100 p-0.5 rounded border-gray-200"><MessageSquare size={10} className="inline me-0.5 opacity-60"/> {imgAnalysis.userDescription.substring(0,50)}{imgAnalysis.userDescription.length > 50 ? '...' : ''}</p>)}
                                                    {imgAnalysis.isAnalyzingImage && (<div className="flex items-center text-2xs text-indigo-500 mt-0.5"><LoadingSpinner size="3" className="me-1" color="text-indigo-500" /> در حال تحلیل...</div>)}
                                                    {imgAnalysis.imageAnalysisError && !imgAnalysis.isAnalyzingImage && (<div className="text-3xs text-red-500 mt-0.5 bg-red-50 p-0.5 rounded flex items-center"><AlertCircle size={10} className="me-0.5"/> خطا: {imgAnalysis.imageAnalysisError}</div>)}
                                                    {imgAnalysis.geminiScore !== undefined && !imgAnalysis.isAnalyzingImage && (<p className="text-xs font-bold text-amber-500 my-0.5 flex items-center"><Star size={12} className="me-0.5 text-amber-400" /> {imgAnalysis.geminiScore}/10</p>)}
                                                    {imgAnalysis.geminiAnalysisText && !imgAnalysis.isAnalyzingImage && (<details className="text-3xs text-gray-600"><summary className="cursor-pointer hover:text-indigo-500">نقد کلی</summary><div className="mt-0.5 whitespace-pre-wrap bg-white p-1 rounded border text-indigo-800 text-opacity-90"><p><strong>نقد:</strong> {imgAnalysis.geminiAnalysisText}</p>{imgAnalysis.geminiScoreReasoning && <p className="mt-0.5"><strong>دلیل امتیاز:</strong> {imgAnalysis.geminiScoreReasoning}</p>}</div></details>)}
                                                    {imgAnalysis.editingCritiqueAndSuggestions && !imgAnalysis.isAnalyzingImage && (<details className="text-3xs text-gray-600 mt-1"><summary className="cursor-pointer hover:text-green-600 text-green-500 font-medium flex items-center"><Edit3 size={10} className="me-0.5" /> نقد و ویرایش</summary><div className="mt-0.5 whitespace-pre-wrap bg-green-50 p-1 rounded border border-green-100 text-green-800 text-opacity-90">{imgAnalysis.editingCritiqueAndSuggestions.split('\n').map((line, idx) => { if (line.match(/^\s*([a-zA-Z\d۰-۹]+[.)])\s+/)) { return <p key={idx} className="ms-1 my-px">{line}</p>; } if (line.toLowerCase().includes("نقد ویرایش فعلی عکس") || line.toLowerCase().includes("critique of current editing")) { return <strong key={idx} className="block my-0.5 text-green-600">{line.replace(/Critique of current editing:?/i, 'نقد ویرایش فعلی:')}</strong>; } if (line.toLowerCase().includes("پیشنهادات دقیق برای بهتر شدن ویرایش") || line.toLowerCase().includes("specific suggestions for improving the edit")) { return <strong key={idx} className="block my-0.5 text-green-600">{line.replace(/Specific suggestions for improving the edit:?/i, 'پیشنهادات ویرایش:')}</strong>; } return <p key={idx} className="my-px">{line}</p>; })}</div></details>)}
                                                </div>
                                            </div>
                                            {!imgAnalysis.isAnalyzingImage && (<button onClick={(e) => handleDeleteAnalyzedImage(e, imgAnalysis.id)} className="absolute top-1 start-1 p-0.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full"><Trash2 size={12} /></button>)}
                                        </div>
                                    ))}
                                </div>
                            )}
                            {festival.analyzedFestivalImages && festival.analyzedFestivalImages.length === 0 && !festival.isAnalyzingFestivalImages && selectedImagesForAnalysis.length === 0 && !imageBatchProcessingMessage && !imageAnalysisBatchError &&(<p className="text-center text-3xs text-gray-400 mt-1">هنوز عکسی برای تحلیل بارگذاری نشده است.</p>)}
                        </div>
                    )}
                </div>
            )}
          </div>
        )}
        
        {/* Line 3: Action Buttons (Footer) */}
        <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center gap-2 mt-auto">
          <div className="flex-grow me-2">
            {footerMessage && (
              <div className={`p-1.5 rounded-md text-xs flex items-center transition-opacity duration-300 ${footerMessage.type === 'success' ? 'bg-green-100 dark:bg-green-800/40 text-green-700 dark:text-green-200' : 'bg-red-100 dark:bg-red-800/40 text-red-700 dark:text-red-200'}`}>
                  {footerMessage.type === 'success' ? <CheckCircle size={14} className="me-1" /> : <AlertCircle size={14} className="me-1" />}
                  {footerMessage.text}
              </div>
            )}
          </div>
          <div className="flex items-center space-s-1.5 flex-shrink-0">
            {isAdmin && (
              <button
                onClick={handleToggleSubmitted}
                className={`p-1.5 rounded-full transition-colors 
                            ${festival.hasSubmitted 
                                ? 'text-green-500 hover:text-green-700 hover:bg-green-50' 
                                : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'}`}
                title={festival.hasSubmitted ? 'علامت به عنوان ارسال نشده' : 'علامت به عنوان ارسال شده'}
                aria-label={festival.hasSubmitted ? `علامتگذاری فراخوان ${festival.festivalName || 'بدون نام'} به عنوان ارسال نشده` : `علامتگذاری فراخوان ${festival.festivalName || 'بدون نام'} به عنوان ارسال شده`}
                aria-pressed={festival.hasSubmitted}
              >
                {festival.hasSubmitted ? <CheckSquare size={18} /> : <Square size={18} />}
              </button>
            )}
            <button
              onClick={handleDownloadClick}
              disabled={!canDownload()}
              className="p-1.5 text-green-500 hover:text-green-700 hover:bg-green-50 rounded-full transition-colors disabled:text-gray-300 disabled:hover:bg-transparent"
              title="دانلود فایل اصلی یا متن"
              aria-label={`دانلود منبع فراخوان ${festival.festivalName || 'بدون نام'}`}
            >
              <Download size={18} />
            </button>
            {isAdmin && (
              <>
                <button
                  onClick={handleEditClick}
                  className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-full transition-colors"
                  title="ویرایش"
                  aria-label={`ویرایش فراخوان ${festival.festivalName || 'بدون نام'}`}
                >
                  <Edit size={18} />
                </button>
                <button
                  onClick={handleDeleteRequest} 
                  className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-full transition-colors"
                  title="حذف"
                  aria-label={`حذف فراخوان ${festival.festivalName || 'بدون نام'}`}
                >
                  <Trash2 size={18} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <ConfirmationModal
        isOpen={showConfirmModal}
        onClose={() => {
          setShowConfirmModal(false);
          setFestivalIdToDelete(null);
        }}
        onConfirm={confirmDeletion}
        title="تایید حذف فراخوان"
        message={
          <>
            <p>آیا از حذف فراخوان <strong className="text-gray-800">"{festival.festivalName || 'بدون نام'}"</strong> مطمئن هستید؟</p>
            <p className="text-xs text-gray-500 mt-2">این عملیات قابل بازگشت نیست.</p>
          </>
        }
      />
      <ConfirmationModal
        isOpen={showDeleteAnalysisConfirmModal}
        onClose={() => setShowDeleteAnalysisConfirmModal(false)}
        onConfirm={confirmSmartAnalysisDeletion}
        title="تایید حذف تحلیل هوشمند"
        message={
          <>
            <p>آیا از حذف تحلیل هوشمند فعلی برای جشنواره <strong className="text-gray-800">"{festival.festivalName || 'بدون نام'}"</strong> مطمئن هستید؟</p>
            <p className="text-xs text-gray-500 mt-2">پس از حذف، می‌توانید مجدداً درخواست تحلیل دهید.</p>
          </>
        }
      />
    </>
  );
};