import React, { useEffect, useState, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, CheckCircle, Info, Brain, ListChecks } from 'lucide-react';

interface TourStep {
  title: string;
  content: React.ReactNode;
  requiredView?: string;
  highlightElementId?: string;
  spotlightPadding?: number;
}

const SPOTLIGHT_Z_INDEX = 10000;
const TOUR_MODAL_Z_INDEX = 10005; // Higher than spotlight and highlighted element

const tourSteps: TourStep[] = [
  {
    title: "خوش آمدید!",
    content: "به «دستیار هوشمند فراخوان عکاسی» خوش آمدید! این راهنمای تعاملی شما را با امکانات اصلی برنامه آشنا می‌کند. برای ادامه روی «بعدی» کلیک کنید.",
  },
  {
    title: "۱. بارگذاری اطلاعات",
    content: (<span>برای شروع، اطلاعات فراخوان را وارد کنید. می‌توانید از تب <strong className="text-teal-500">«بارگذاری»</strong> (که اکنون هایلایت شده) فایل PDF یا تصویر فراخوان را انتخاب کنید، یا متن آن را مستقیماً وارد نمایید.</span>),
    highlightElementId: 'tour-nav-upload',
    spotlightPadding: 8,
    requiredView: 'upload',
  },
  {
    title: "۲. پردازش هوشمند فایل",
    content: (<span>پس از انتخاب فایل در تب «بارگذاری», روی دکمه <strong className="text-teal-500">«پردازش فایل(ها)»</strong> (که اکنون هایلایت شده) کلیک کنید. هوش مصنوعی اطلاعات کلیدی را استخراج می‌کند.</span>),
    highlightElementId: 'tour-process-file-button',
    spotlightPadding: 10,
    requiredView: 'upload',
  },
  {
    title: "۳. بررسی و ذخیره اطلاعات",
    content: (<span>پس از پردازش، فرمی با اطلاعات استخراج‌شده نمایش داده می‌شود. آن را بررسی، ویرایش و سپس ذخیره کنید. فراخوان ذخیره‌شده به «لیست» اضافه می‌شود.</span>),
    requiredView: 'upload', // Assuming modal appears over upload view
  },
  {
    title: "۴. مدیریت در «لیست»",
    content: (<span>به تب <strong className="text-teal-500">«لیست»</strong> (که اکنون هایلایت شده) بروید. در اینجا می‌توانید فراخوان‌های ذخیره‌شده را مشاهده، ویرایش، حذف و تحلیل هوشمند کنید.</span>),
    highlightElementId: 'tour-nav-list',
    spotlightPadding: 8,
  },
  {
    title: "۵. تحلیل هوشمند جشنواره",
    content: (<span>وقتی در تب «لیست» (هایلایت شده) هستید، برای هر فراخوان دکمه‌ای برای <strong className="text-purple-600">«تحلیل هوشمند جشنواره»</strong> (معمولا با آیکن <Brain size={16} aria-hidden="true" className="inline text-purple-600" />) پیدا خواهید کرد. با کلیک بر روی آن، تحلیل جامعی از جشنواره و ایده‌های عکاسی دریافت می‌کنید.</span>),
    highlightElementId: 'tour-nav-list', 
    spotlightPadding: 8,
    requiredView: 'list',
  },
  {
    title: "۶. تحلیل عکس‌های شما",
    content: (<span>پس از دریافت «تحلیل هوشمند جشنواره»، در همان کارت فراخوان، بخشی برای <strong className="text-indigo-700">«تحلیل عکس‌های شما»</strong> (معمولا با آیکن <ListChecks size={16} aria-hidden="true" className="inline text-indigo-700" />) ظاهر می‌شود. در این بخش می‌توانید عکس‌های خود را بارگذاری کرده و ببینید چقدر با معیارهای آن جشنواره تطابق دارند.</span>),
    highlightElementId: 'tour-nav-list', 
    spotlightPadding: 8,
    requiredView: 'list',
  },
  {
    title: "۷. پیگیری با «تقویم»",
    content: (<span>در تب <strong className="text-teal-500">«تقویم»</strong> (که اکنون هایلایت شده)، مهلت‌های ارسال آثار را به صورت شمسی مشاهده کنید.</span>),
    highlightElementId: 'tour-nav-calendar',
    spotlightPadding: 8,
  },
  {
    title: "۸. هشدارها و یادآوری‌ها",
    content: (<span>برنامه به طور خودکار هشدارهایی برای مهلت‌های نزدیک در بالای صفحه (قسمت هایلایت شده) نمایش می‌دهد و در صورت اعطای دسترسی، یادآوری با نوتیفیکیشن سیستم ارسال می‌کند.</span>),
    highlightElementId: 'tour-notifications-area',
    spotlightPadding: 15,
  },
  {
    title: "پایان راهنما",
    content: (<span>این راهنما به پایان رسید. حالا می‌توانید از امکانات برنامه استفاده کنید. در صورت نیاز به راهنمایی یا بروز مشکل، با طراح برنامه (محمد عطایی - 09112790490) تماس بگیرید. موفق باشید!</span>),
  },
];


interface SpotlightRect { top: number; left: number; width: number; height: number; }

interface InteractiveTourProps {
  isOpen: boolean;
  currentStepIndex: number;
  setCurrentStepIndex: (index: number) => void;
  onComplete: () => void;
  currentAppView: string;
}

export const InteractiveTour: React.FC<InteractiveTourProps> = ({
  isOpen,
  currentStepIndex,
  setCurrentStepIndex,
  onComplete,
  currentAppView,
}) => {
  const [highlightedElement, setHighlightedElement] = useState<HTMLElement | null>(null);
  const [spotlightPosition, setSpotlightPosition] = useState<SpotlightRect | null>(null);
  const [modalPositionStyle, setModalPositionStyle] = useState<React.CSSProperties>({});
  const originalStylesRef = useRef<{ element: HTMLElement; position: string; zIndex: string } | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const currentStepData = tourSteps[currentStepIndex];

  useEffect(() => {
    if (!isOpen) {
      if (originalStylesRef.current) {
        originalStylesRef.current.element.style.position = originalStylesRef.current.position;
        originalStylesRef.current.element.style.zIndex = originalStylesRef.current.zIndex;
        originalStylesRef.current = null;
      }
      setHighlightedElement(null);
      setSpotlightPosition(null);
      setModalPositionStyle({}); // Reset modal position
      return;
    }

    const { highlightElementId, spotlightPadding = 0 } = currentStepData;

    // Clear previous highlight
    if (originalStylesRef.current) {
      originalStylesRef.current.element.style.position = originalStylesRef.current.position;
      originalStylesRef.current.element.style.zIndex = originalStylesRef.current.zIndex;
      originalStylesRef.current = null;
    }
    setSpotlightPosition(null);
    let targetElement: HTMLElement | null = null;

    if (highlightElementId) {
      targetElement = document.getElementById(highlightElementId);
      if (targetElement) {
        setHighlightedElement(targetElement);
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        
        originalStylesRef.current = {
          element: targetElement,
          position: targetElement.style.position,
          zIndex: targetElement.style.zIndex,
        };
        targetElement.style.position = 'relative'; // Ensure it's above the spotlight overlay parts
        targetElement.style.zIndex = `${SPOTLIGHT_Z_INDEX + 1}`;

        const timeoutId = setTimeout(() => {
          const rect = targetElement!.getBoundingClientRect();
          const newSpotlightPos = {
            top: rect.top - spotlightPadding,
            left: rect.left - spotlightPadding,
            width: rect.width + (spotlightPadding * 2),
            height: rect.height + (spotlightPadding * 2),
          };
          setSpotlightPosition(newSpotlightPos);

          // Adjust modal position based on highlighted element
          const viewportHeight = window.innerHeight;
          const elementCenterY = rect.top + rect.height / 2;
          
          if (elementCenterY < viewportHeight * 0.6) { // Element in top 60%
            setModalPositionStyle({ 
              top: 'auto', bottom: '2rem', 
              left: '50%', transform: 'translateX(-50%)' 
            });
          } else { // Element in bottom 40%
            setModalPositionStyle({ 
              top: '2rem', bottom: 'auto',
              left: '50%', transform: 'translateX(-50%)'
            });
          }

        }, 200); // Increased delay for better scroll/layout settlement
        return () => clearTimeout(timeoutId);
      } else {
        console.warn(`Tour: Element with ID "${highlightElementId}" not found.`);
        setHighlightedElement(null);
        setModalPositionStyle({ // Center if no highlight
            top: '50%', left: '50%', transform: 'translate(-50%, -50%)'
        });
      }
    } else {
      setHighlightedElement(null);
      setModalPositionStyle({ // Center if no highlight
        top: '50%', left: '50%', transform: 'translate(-50%, -50%)'
      });
    }
  }, [isOpen, currentStepIndex, currentStepData]);


  if (!isOpen) return null;

  const handleNext = () => {
    if (currentStepIndex < tourSteps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  const isNextDisabled = currentStepData.requiredView && currentStepData.requiredView !== currentAppView;

  const overlayBaseStyle: React.CSSProperties = {
    position: 'fixed',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    zIndex: SPOTLIGHT_Z_INDEX,
    transition: 'all 0.3s ease-in-out',
  };

  return (
    <>
      {/* Spotlight Overlays */}
      {spotlightPosition && highlightedElement && (
        <>
          <div style={{ ...overlayBaseStyle, top: 0, left: 0, width: '100vw', height: `${spotlightPosition.top}px` }} />
          <div style={{ ...overlayBaseStyle, top: `${spotlightPosition.top + spotlightPosition.height}px`, left: 0, width: '100vw', height: `calc(100vh - ${spotlightPosition.top + spotlightPosition.height}px)` }} />
          <div style={{ ...overlayBaseStyle, top: `${spotlightPosition.top}px`, left: 0, width: `${spotlightPosition.left}px`, height: `${spotlightPosition.height}px` }} />
          <div style={{ ...overlayBaseStyle, top: `${spotlightPosition.top}px`, left: `${spotlightPosition.left + spotlightPosition.width}px`, width: `calc(100vw - ${spotlightPosition.left + spotlightPosition.width}px)`, height: `${spotlightPosition.height}px` }} />
        </>
      )}

      {/* Tour Modal Backdrop (only if no spotlight, or to catch clicks outside modal) */}
      {!highlightedElement && (
         <div 
            className="fixed inset-0 bg-black bg-opacity-50" 
            style={{ zIndex: TOUR_MODAL_Z_INDEX -1 }}
            onClick={onComplete}
         />
      )}

      {/* Tour Modal */}
      <div 
        ref={modalRef}
        className="fixed bg-white rounded-xl shadow-2xl w-full max-w-md transform transition-all duration-300 ease-in-out" 
        style={{ 
            ...modalPositionStyle,
            zIndex: TOUR_MODAL_Z_INDEX,
            maxHeight: 'calc(100vh - 4rem)', // Ensure modal fits on screen
            display: 'flex',
            flexDirection: 'column'
        }} 
        dir="rtl"
        role="dialog"
        aria-labelledby="tour-modal-title"
        aria-describedby="tour-modal-content"
      >
        <div className="p-6 flex-shrink-0">
            <button
                onClick={onComplete}
                className="absolute top-3 end-3 text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="بستن راهنما"
            >
                <X size={24} />
            </button>

            <div className="text-center mb-4">
                <Info size={28} className="mx-auto text-teal-500 mb-1" />
                <h3 id="tour-modal-title" className="text-lg font-bold text-teal-700">{currentStepData.title}</h3>
            </div>
        </div>

        <div id="tour-modal-content" className="text-gray-700 text-sm leading-relaxed mb-2 px-6 pb-2 overflow-y-auto flex-grow">
            {currentStepData.content}
            {isNextDisabled && currentStepData.requiredView && (
            <p className="mt-3 text-xs text-orange-600 bg-orange-50 p-2 rounded-md border border-orange-200">
                <Info size={14} className="inline me-1" />
                برای ادامه راهنما، لطفاً ابتدا به تب <strong className="font-semibold">«{currentStepData.requiredView === 'upload' ? 'بارگذاری' : currentStepData.requiredView === 'list' ? 'لیست' : 'تقویم'}»</strong> بروید.
            </p>
            )}
        </div>

        <div className="flex justify-between items-center border-t p-4 mt-auto flex-shrink-0">
            <div className="text-xs text-gray-500">
                مرحله {currentStepIndex + 1} از {tourSteps.length}
            </div>
            <div className="flex gap-3">
            {currentStepIndex > 0 && (
                <button
                onClick={handlePrev}
                className="px-3 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-md transition-colors flex items-center"
                >
                <ChevronRight size={16} className="ms-1 order-last sm:size-18" /> قبلی
                </button>
            )}
            {currentStepIndex < tourSteps.length - 1 ? (
                <button
                onClick={handleNext}
                disabled={isNextDisabled}
                className="px-3 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-md transition-colors flex items-center disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                بعدی <ChevronLeft size={16} className="me-1 order-first sm:size-18" />
                </button>
            ) : (
                <button
                onClick={onComplete}
                className="px-3 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors flex items-center"
                >
                <CheckCircle size={16} className="me-2 sm:size-18" /> اتمام راهنما
                </button>
            )}
            </div>
        </div>
      </div>
    </>
  );
};
