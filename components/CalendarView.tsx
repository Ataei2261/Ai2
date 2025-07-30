import React, { useState, useMemo } from 'react';
import { useFestivals } from '../contexts/FestivalsContext';
import { FestivalInfo, JalaliDate } from '../types';
import { jalaaliToday, jalaaliMonthLength, toJalaali, toGregorian, weekDay, parseJalaliDate, formatGregorianDate } from '../utils/dateConverter';
import { PERSIAN_MONTH_NAMES, PERSIAN_WEEK_DAYS_SHORT } from '../constants';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { FestivalModal } from './FestivalModal';

type DeadlineStatus = 'past' | 'urgent' | 'near' | 'far' | '';

interface DayCell {
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  dateStr: string; // YYYY/MM/DD Jalali
  festivals: FestivalInfo[];
  deadlineStatus: DeadlineStatus; // Overall status for cell text color highlighting
}

const getFestivalDeadlineStatus = (festival: FestivalInfo): DeadlineStatus => {
  let deadlineDateObj: Date | null = null;
  if (festival.submissionDeadlineGregorian) {
    try {
      const [year, month, day] = festival.submissionDeadlineGregorian.split('-').map(Number);
      deadlineDateObj = new Date(year, month - 1, day);
       if (isNaN(deadlineDateObj.getTime())) deadlineDateObj = null;
    } catch (e) { deadlineDateObj = null; }
  } else if (festival.submissionDeadlinePersian) {
    try {
      const jDate = parseJalaliDate(festival.submissionDeadlinePersian);
      if (jDate) {
        const gDate = toGregorian(jDate.jy, jDate.jm, jDate.jd);
        deadlineDateObj = new Date(gDate.gy, gDate.gm - 1, gDate.gd);
        if (isNaN(deadlineDateObj.getTime())) deadlineDateObj = null;
      }
    } catch (e) { deadlineDateObj = null; }
  }

  if (!deadlineDateObj) return '';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  deadlineDateObj.setHours(0, 0, 0, 0);

  const diffTime = deadlineDateObj.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'past';
  if (diffDays < 3) return 'urgent';
  if (diffDays <= 10) return 'near';
  return 'far';
};

const dotStatusClasses: Record<DeadlineStatus, string> = {
  past: 'bg-slate-400 dark:bg-slate-500 border-slate-500 dark:border-slate-600',
  urgent: 'bg-red-500 dark:bg-red-500 border-red-600 dark:border-red-600',
  near: 'bg-amber-400 dark:bg-amber-400 border-amber-500 dark:border-amber-500',
  far: 'bg-green-500 dark:bg-green-500 border-green-600 dark:border-green-600',
  '': 'bg-transparent border-transparent',
};

const getOverallDeadlineStatusForDay = (festivalsOnDay: FestivalInfo[]): DeadlineStatus => {
  if (!festivalsOnDay || festivalsOnDay.length === 0) {
    return '';
  }

  let hasUrgent = false;
  let hasNear = false;
  let hasFar = false;
  let hasPast = false;

  for (const festival of festivalsOnDay) {
    const status = getFestivalDeadlineStatus(festival);
    if (status === 'urgent') hasUrgent = true;
    else if (status === 'near') hasNear = true;
    else if (status === 'far') hasFar = true;
    else if (status === 'past') hasPast = true;
  }

  if (hasUrgent) return 'urgent';
  if (hasNear) return 'near';
  if (hasFar) return 'far';
  if (hasPast) return 'past';
  return '';
};


export const CalendarView: React.FC = () => {
  const { festivals } = useFestivals();
  const todayJalali = jalaaliToday();
  const [currentMonth, setCurrentMonth] = useState<JalaliDate>({ jy: todayJalali.jy, jm: todayJalali.jm, jd: 1 });
  const [selectedDayFestivals, setSelectedDayFestivals] = useState<FestivalInfo[]>([]);
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [festivalForModal, setFestivalForModal] = useState<FestivalInfo | null>(null);

  const festivalsByDeadline = useMemo(() => {
    const map = new Map<string, FestivalInfo[]>();
    festivals.forEach(festival => {
      let deadlineJalaliStr: string | null = null;
      if (festival.submissionDeadlinePersian) {
        const parsed = parseJalaliDate(festival.submissionDeadlinePersian);
        if(parsed) deadlineJalaliStr = `${parsed.jy}/${String(parsed.jm).padStart(2, '0')}/${String(parsed.jd).padStart(2, '0')}`;

      } else if (festival.submissionDeadlineGregorian) {
        try {
            const [gy, gm, gd] = festival.submissionDeadlineGregorian.split('-').map(Number);
            const jalali = toJalaali(gy, gm, gd);
            deadlineJalaliStr = `${jalali.jy}/${String(jalali.jm).padStart(2, '0')}/${String(jalali.jd).padStart(2, '0')}`;
        } catch (e) {
            // console.error("Error converting Gregorian to Jalali for calendar:", e);
        }
      }
      
      if (deadlineJalaliStr) {
        if (!map.has(deadlineJalaliStr)) {
          map.set(deadlineJalaliStr, []);
        }
        map.get(deadlineJalaliStr)?.push(festival);
      }
    });
    return map;
  }, [festivals]);

  const generateCalendarGrid = (year: number, month: number): DayCell[][] => {
    const monthLength = jalaaliMonthLength(year, month);
    const firstDayOfMonthGregorian = toGregorian(year, month, 1);
    const firstDayOfWeek = weekDay(firstDayOfMonthGregorian.gy, firstDayOfMonthGregorian.gm, firstDayOfMonthGregorian.gd); 
    
    const grid: DayCell[][] = [];
    let dayCells: DayCell[] = [];
    let currentDay = 1;

    for (let i = 0; i < firstDayOfWeek; i++) {
      dayCells.push({ day: 0, isCurrentMonth: false, isToday: false, dateStr: '', festivals: [], deadlineStatus: '' });
    }

    while (currentDay <= monthLength) {
      if (dayCells.length === 7) {
        grid.push(dayCells);
        dayCells = [];
      }
      const dateStr = `${year}/${String(month).padStart(2, '0')}/${String(currentDay).padStart(2, '0')}`;
      const isToday = year === todayJalali.jy && month === todayJalali.jm && currentDay === todayJalali.jd;
      const festivalsOnThisDay = festivalsByDeadline.get(dateStr) || [];
      const overallStatus = getOverallDeadlineStatusForDay(festivalsOnThisDay);
      
      dayCells.push({
        day: currentDay,
        isCurrentMonth: true,
        isToday: isToday,
        dateStr: dateStr,
        festivals: festivalsOnThisDay,
        deadlineStatus: overallStatus
      });
      currentDay++;
    }

    while (dayCells.length < 7 && dayCells.length > 0) {
      dayCells.push({ day: 0, isCurrentMonth: false, isToday: false, dateStr: '', festivals: [], deadlineStatus: '' });
    }
    if (dayCells.length > 0) {
        grid.push(dayCells);
    }
    
    return grid;
  };
  
  const grid = generateCalendarGrid(currentMonth.jy, currentMonth.jm);

  const changeMonth = (delta: number) => {
    let newJy = currentMonth.jy;
    let newJm = currentMonth.jm + delta;
    if (newJm > 12) {
      newJm = 1;
      newJy++;
    } else if (newJm < 1) {
      newJm = 12;
      newJy--;
    }
    setCurrentMonth({ jy: newJy, jm: newJm, jd: 1 });
    setSelectedDayFestivals([]);
    setSelectedDateStr(null);
  };

  const handleDayClick = (dayCell: DayCell) => {
    if (!dayCell.isCurrentMonth) { 
        setSelectedDayFestivals([]);
        setSelectedDateStr(null);
        return;
    }
    setSelectedDayFestivals(dayCell.festivals);
    setSelectedDateStr(dayCell.dateStr);
  };

  const openFestivalModal = (festival: FestivalInfo) => {
    setFestivalForModal(festival);
    setIsModalOpen(true);
  };

  const closeFestivalModal = () => {
    setIsModalOpen(false);
    setFestivalForModal(null);
  };


  return (
    <div className="p-4 sm:p-6 rounded-xl shadow-xl w-full bg-gradient-to-br from-slate-900 via-purple-900 to-indigo-900 text-gray-200">
      <div className="bg-slate-950/50 dark:bg-black/60 backdrop-blur-md p-3 sm:p-4 rounded-t-lg shadow-lg">
        <h2 className="text-2xl sm:text-3xl font-semibold text-gray-100 mb-1 text-center flex items-center justify-center">
          <CalendarDays className="me-3 h-7 w-7 sm:h-8 sm:w-8" /> تقویم شمسی فراخوان‌ها
        </h2>
        <div className="flex justify-between items-center mt-3 px-1 sm:px-2">
          <button 
            onClick={() => changeMonth(-1)} 
            className="p-2 sm:p-2.5 rounded-lg bg-slate-700/50 hover:bg-slate-600/50 dark:bg-slate-800/50 dark:hover:bg-slate-700/50 text-gray-100 shadow-sm hover:shadow-md transition-all duration-200" 
            aria-label="ماه قبل"
          >
            <ChevronRight className="h-6 w-6 sm:h-7 sm:w-7" />
          </button>
          <div 
            className="text-xl sm:text-2xl font-bold text-gray-100 [text-shadow:1px_1px_2px_rgba(0,0,0,0.2)]"
          >
            {PERSIAN_MONTH_NAMES[currentMonth.jm - 1]} {currentMonth.jy}
          </div>
          <button 
            onClick={() => changeMonth(1)} 
            className="p-2 sm:p-2.5 rounded-lg bg-slate-700/50 hover:bg-slate-600/50 dark:bg-slate-800/50 dark:hover:bg-slate-700/50 text-gray-100 shadow-sm hover:shadow-md transition-all duration-200" 
            aria-label="ماه بعد"
          >
            <ChevronLeft className="h-6 w-6 sm:h-7 sm:w-7" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px sm:gap-0.5 bg-slate-700/50 dark:bg-slate-800/40 border border-slate-700/50 dark:border-slate-600/40 rounded-b-md overflow-hidden mt-0">
        {PERSIAN_WEEK_DAYS_SHORT.map(dayName => (
          <div key={dayName} className="text-center py-2 sm:py-2.5 font-semibold text-xs sm:text-sm bg-slate-800/60 text-slate-300 dark:bg-slate-900/50 dark:text-slate-400 tracking-wide uppercase">
            {dayName}
          </div>
        ))}
        {grid.flat().map((cell, index) => {
          const baseCellClasses = [
            'jalali-calendar-day',
            'relative p-1 pt-1.5 sm:p-1.5 sm:pt-2 min-h-[6.5rem] sm:min-h-[7.5rem]',
            'flex flex-col items-center', 
            'transition-all duration-200 ease-in-out',
          ];
          
          let daySpecificClasses: string[] = [];
          let dayNumberClasses = 'text-xs sm:text-sm font-medium mb-0.5 text-gray-200 dark:text-gray-300';
          let cellContent: React.ReactNode = null;
          let flexJustifyClass = 'justify-start'; 
          let cursorClass = 'cursor-pointer';

          if (!cell.isCurrentMonth) {
            daySpecificClasses.push('bg-black/20 dark:bg-black/30 text-gray-500 dark:text-gray-600');
            cursorClass = 'cursor-default';
            
            const rowIndex = Math.floor(index / 7);
            const isCellInFirstGridRow = rowIndex === 0;
            const isCellInLastGridRow = grid.length > 0 && rowIndex === grid.length - 1;

            if (isCellInFirstGridRow || isCellInLastGridRow) {
              flexJustifyClass = 'justify-center'; 
              cellContent = (
                <img 
                  src="https://i.postimg.cc/c4qbFYRR/image.png" 
                  alt="" 
                  className="w-10 h-10 sm:w-12 sm:h-12 object-contain opacity-30 dark:opacity-20"
                />
              );
            } else {
              cellContent = null; 
            }
          } else { // cell.isCurrentMonth
            daySpecificClasses.push('bg-white/5 dark:bg-black/10 backdrop-filter backdrop-blur-sm hover:bg-white/10 dark:hover:bg-black/20');
            if (cell.isToday) {
              daySpecificClasses.push('today !bg-sky-500/50 dark:!bg-sky-600/40 border-2 border-sky-400 dark:border-sky-500 rounded-sm shadow-inner');
              dayNumberClasses = '!text-sky-100 dark:!text-sky-50 font-bold';
            }
            // Note: Order matters for `!` classes; selected should override today's background if both are true.
            if (selectedDateStr === cell.dateStr) {
              daySpecificClasses.push('!bg-pink-500/50 dark:!bg-pink-600/40 ring-2 ring-pink-400 dark:ring-pink-500 rounded-sm shadow-lg');
              dayNumberClasses = `!text-pink-100 dark:!text-pink-50 font-bold`;
            } else if (!cell.isToday) { 
              switch (cell.deadlineStatus) {
                case 'urgent': dayNumberClasses += ' text-red-400 dark:text-red-300 font-semibold'; break;
                case 'near': dayNumberClasses += ' text-amber-400 dark:text-amber-300 font-semibold'; break;
                case 'far': dayNumberClasses += ' text-green-400 dark:text-green-300'; break;
                case 'past': dayNumberClasses += ' text-gray-400 dark:text-gray-500 line-through'; break;
              }
            }

            cellContent = (
              <>
                <span className={dayNumberClasses}>{cell.day}</span>
                {cell.festivals.length > 0 && (
                  <div 
                      className="absolute bottom-1 sm:bottom-1.5 start-0 end-0 px-1 flex flex-wrap justify-center items-start gap-1 max-h-[calc(100%-2.5rem)] sm:max-h-[calc(100%-2.75rem)] overflow-y-auto simple-scrollbar"
                      style={{ lineHeight: 'normal' }} 
                  >
                    {cell.festivals.map((festival, dotIndex) => {
                      const dotStatus = getFestivalDeadlineStatus(festival);
                      return (
                        <span
                          key={`${festival.id}-${dotIndex}`}
                          className={`deadline-dot flex-shrink-0 w-2.5 h-2.5 border-slate-900/50 dark:border-black/50 shadow-xs rounded-full ${dotStatusClasses[dotStatus]} ${dotStatus === 'urgent' ? 'animate-pulse' : ''}`}
                          title={festival.festivalName || 'فراخوان'}
                        ></span>
                      );
                    })}
                  </div>
                )}
              </>
            );
          }
          
          const finalCellClasses = [...baseCellClasses, ...daySpecificClasses, flexJustifyClass, cursorClass].join(' ');
          
          return (
            <div
              key={`${cell.dateStr}-${index}`}
              className={finalCellClasses}
              onClick={() => handleDayClick(cell)}
              role="button"
              tabIndex={cell.isCurrentMonth ? 0 : -1}
              aria-label={cell.isCurrentMonth ? `روز ${cell.day}${cell.festivals.length > 0 ? ', ' + cell.festivals.length + ' مهلت' : ''}` : 'روز خارج از ماه جاری'}
            >
              {cellContent}
            </div>
          );
        })}
      </div>

      {selectedDateStr && (
        <div className="mt-6 sm:mt-8 p-4 sm:p-5 bg-slate-800/60 dark:bg-black/50 backdrop-blur-sm rounded-lg shadow-lg border border-slate-700 dark:border-slate-600">
          <h4 className="text-base sm:text-lg font-semibold text-gray-200 dark:text-gray-300 mb-3">
            مهلت‌های ارسال در تاریخ {selectedDateStr}:
          </h4>
          {selectedDayFestivals.length > 0 ? (
            <ul className="space-y-1.5">
              {selectedDayFestivals.map(f => (
                <li key={f.id} className="text-sm flex justify-between items-center gap-2 py-2 border-b border-slate-700/70 dark:border-slate-600/70 last:border-b-0">
                  <button
                    onClick={() => openFestivalModal(f)}
                    className="text-gray-300 hover:text-pink-400 dark:text-gray-200 dark:hover:text-pink-300 font-medium focus:outline-none text-right truncate flex-1 min-w-0"
                    aria-label={`نمایش جزئیات ${f.festivalName || 'فراخوان'}`}
                    title={f.festivalName || "فراخوان بدون نام"}
                  >
                    {f.festivalName || "فراخوان بدون نام"}
                  </button>
                  
                </li>
              ))}
            </ul>
          ) : (
             <p className="text-center text-gray-400 dark:text-gray-500 py-3">
                هیچ مهلتی برای تاریخ {selectedDateStr} ثبت نشده است.
             </p>
          )}
        </div>
      )}

      {isModalOpen && festivalForModal && (
        <FestivalModal
          isOpen={isModalOpen}
          onClose={closeFestivalModal}
          festivalData={festivalForModal}
          isEditing={true} 
        />
      )}
    </div>
  );
};