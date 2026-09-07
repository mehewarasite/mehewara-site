import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  CircleCheck,
  CircleX,
  CircleAlert,
  ArrowLeft,
  ArrowRight,
  Clock,
  Flag,
  RefreshCw,
  Bookmark,
  Award,
  BookOpen,
  Sparkles,
  FileText
} from 'lucide-react';
import { Paper, Question, UserAttempt } from '../types';
import { useTheme } from '../ThemeContext';
import { useLanguage } from '../LanguageContext';
import { renderMathInHtml } from '../utils/parseTxt';

interface PracticeSessionProps {
  paper: Paper;
  questions: Question[];
  onSaveAttempt: (attempt: UserAttempt) => void;
  savedAttempt?: UserAttempt;
  onClose: () => void;
  onLoadStudyMaterial: (paperId: string) => Promise<void>;
}

export default function PracticeSession({
  paper,
  questions: questionsProp,
  onSaveAttempt,
  savedAttempt,
  onClose,
  onLoadStudyMaterial
}: PracticeSessionProps) {

  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { language } = useLanguage();
  const isEn = language === 'en';

  const questions = useMemo(
    () => [...questionsProp].sort((a, b) => a.qNumber - b.qNumber),
    [questionsProp]
  );

  // State variables
  const [currentQIndex, setCurrentQIndex] = useState<number>(0);
  const [answers, setAnswers] = useState<{ [questionId: string]: number }>(
    savedAttempt?.answers || {}
  );
  const [flaggedQuestions, setFlaggedQuestions] = useState<{ [questionId: string]: boolean }>({});
  const [timeLeft, setTimeLeft] = useState<number>(paper.durationMinutes * 60);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(savedAttempt?.isCompleted || false);
  const [isTimerActive, setIsTimerActive] = useState<boolean>(!savedAttempt?.isCompleted);
  const [reviewQIndex, setReviewQIndex] = useState<number>(0);
  const [activeView] = useState<'mcq' | 'study'>('mcq');

  useEffect(() => {
    if (activeView === 'study' && paper.studyMaterialHtml === undefined) {
      onLoadStudyMaterial(paper.id);
    }
  }, [activeView, paper.studyMaterialHtml, paper.id, onLoadStudyMaterial]);

  // Practice Mode States
  const [examMode, setExamMode] = useState<'strict' | 'practice'>('practice');
  const [verifiedAnswers, setVerifiedAnswers] = useState<Record<string, boolean>>({});

  // Practice Mode Live Score Calculations
  const totalAttempted = Object.keys(verifiedAnswers).length;
  const correctCountLive = Object.values(verifiedAnswers).filter(Boolean).length;
  const percentageLive = totalAttempted > 0 ? Math.round((correctCountLive / totalAttempted) * 100) : 0;

  const handleCheckAnswer = (questionId: string, q: Question) => {
    const selectedOptionIndex = answers[questionId];
    if (selectedOptionIndex === undefined) {
      alert(isEn ? "Please select an answer first!" : "කරුණාකර පිළිතුරක් තෝරන්න!");
      return;
    }

    const isCorrect = q.isAllCorrect || (q.correctOptions?.includes(selectedOptionIndex) ?? selectedOptionIndex === q.correctOption);

    setVerifiedAnswers(prev => ({
      ...prev,
      [questionId]: isCorrect
    }));
  };

  const activeQuestion = questions[currentQIndex];
  const totalQuestions = questions.length;

  // ── Theme shortcut classes ──
  const pageBg = isDark ? 'bg-[#030304]' : 'bg-[#f0f4f8]';
  const headerBg = isDark ? 'bg-[#030304]/95' : 'bg-[#f0f4f8]/95';
  const headerBdr = isDark ? 'border-slate-900' : 'border-slate-200';
  const cardBg = isDark ? 'bg-slate-950/80' : 'bg-white/90';
  const cardBdr = isDark ? 'border-slate-900' : 'border-slate-200';
  const surfaceBg = isDark ? 'bg-slate-950' : 'bg-white';
  const surfaceBdr = isDark ? 'border-slate-800' : 'border-slate-200';
  const textPrimary = isDark ? 'text-white' : 'text-slate-900';
  const textMuted = isDark ? 'text-slate-400' : 'text-slate-500';
  const textFaint = isDark ? 'text-slate-500' : 'text-slate-400';
  const dividerBdr = isDark ? 'border-slate-900' : 'border-slate-200';
  const subtleBg = isDark ? 'bg-slate-900' : 'bg-slate-100';
  const subtleBdr = isDark ? 'border-slate-800' : 'border-slate-200';
  const ghostBg = isDark ? 'bg-slate-950/40' : 'bg-slate-50';
  const ghostBdr = isDark ? 'border-slate-900' : 'border-slate-200';

  // Use a ref to always have the latest handleSubmit for the timer
  const handleSubmitRef = useRef<() => void>(() => {});

  // Countdown Timer
  useEffect(() => {
    if (isSubmitted || !isTimerActive) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmitRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isSubmitted, isTimerActive]);

  // Handle option selection
  const handleSelectOption = (optionIndex: number) => {
    if (isSubmitted) return;
    const qId = activeQuestion.id || activeQuestion.qNumber.toString();
    setAnswers(prev => ({
      ...prev,
      [qId]: optionIndex
    }));
  };

  // Toggle flag/review status
  const toggleFlag = () => {
    if (isSubmitted) return;
    const qId = activeQuestion.id || activeQuestion.qNumber.toString();
    setFlaggedQuestions(prev => ({
      ...prev,
      [qId]: !prev[qId]
    }));
  };

  // Clear answer
  const clearAnswer = () => {
    if (isSubmitted) return;
    const qId = activeQuestion.id || activeQuestion.qNumber.toString();
    setAnswers(prev => {
      const copy = { ...prev };
      delete copy[qId];
      return copy;
    });
  };

  // Next and Prev handlers
  const handleNext = () => {
    if (currentQIndex < totalQuestions - 1) {
      setCurrentQIndex(currentQIndex + 1);
    }
  };

  const handlePrev = () => {
    if (currentQIndex > 0) {
      setCurrentQIndex(currentQIndex - 1);
    }
  };

  // Submit Paper MCQ
  const handleSubmit = useCallback(() => {
    if (isSubmitted) return;

    setIsSubmitted(true);
    setIsTimerActive(false);

    let correctCount = 0;
    questions.forEach((q) => {
      const qId = q.id || q.qNumber.toString();
      if (answers[qId] !== undefined && (q.isAllCorrect || (q.correctOptions?.includes(answers[qId]) ?? answers[qId] === q.correctOption))) {
        correctCount++;
      }
    });

    const attempt: UserAttempt = {
      paperId: paper.id,
      startedAt: Date.now() - (paper.durationMinutes * 60 - timeLeft) * 1000,
      completedAt: Date.now(),
      answers: answers,
      isCompleted: true,
      correctCount,
      totalCount: totalQuestions
    };

    onSaveAttempt(attempt);
  }, [isSubmitted, answers, questions, paper, timeLeft, totalQuestions, onSaveAttempt]);

  // Keep the ref up-to-date so the timer always calls the latest version
  useEffect(() => {
    handleSubmitRef.current = handleSubmit;
  }, [handleSubmit]);

  // Reset / Retry
  const handleRetry = () => {
    if (confirm(isEn ? 'Are you sure you want to retry this paper? All answers will be cleared.' : 'ඔබට මෙම ප්‍රශ්න පත්‍රය නැවත කිරීමට අවශ්‍යද? සියලුම පිළිතුරු මකා දැමෙනු ඇත.')) {
      setAnswers({});
      setFlaggedQuestions({});
      setTimeLeft(paper.durationMinutes * 60);
      setIsSubmitted(false);
      setIsTimerActive(true);
      setCurrentQIndex(0);
      setReviewQIndex(0);
    }
  };

  // Calculate scores
  const getScoreDetails = () => {
    let correctCount = 0;
    questions.forEach((q) => {
      const qId = q.id || q.qNumber.toString();
      if (answers[qId] !== undefined && (q.isAllCorrect || (q.correctOptions?.includes(answers[qId]) ?? answers[qId] === q.correctOption))) {
        correctCount++;
      }
    });

    const unansweredCount = questions.filter(q => {
      const qId = q.id || q.qNumber.toString();
      return answers[qId] === undefined;
    }).length;
    const incorrectCount = totalQuestions - correctCount - unansweredCount;
    const percentage = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

    let performanceMessage = '';
    let performanceColor = '';

    if (percentage >= 75) {
      performanceMessage = isEn ? 'Excellent! You are doing great.' : 'විශිෂ්ටයි! ඔබ විශිෂ්ට මට්ටමක පසුවේ.';
      performanceColor = isDark
        ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
        : 'text-emerald-700 bg-emerald-50 border-emerald-200';
    } else if (percentage >= 50) {
      performanceMessage = isEn ? 'Very good effort! Keep practicing.' : 'ඉතා හොඳයි. තව උත්සාහය වැඩි කරන්න.';
      performanceColor = isDark
        ? 'text-sky-400 bg-sky-500/10 border-sky-500/20'
        : 'text-sky-700 bg-sky-50 border-sky-200';
    } else {
      performanceMessage = isEn ? 'Keep practicing! You can do better.' : 'වැඩිපුර පුහුණු වන්න. ඔබට මීට වඩා දක්ෂ විය හැක.';
      performanceColor = isDark
        ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
        : 'text-amber-700 bg-amber-50 border-amber-200';
    }

    return {
      correctCount,
      incorrectCount,
      unansweredCount,
      percentage,
      performanceMessage,
      performanceColor
    };
  };

  // Render timer text
  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const pad = (num: number) => String(num).padStart(2, '0');
    return hours > 0
      ? `${pad(hours)}:${pad(mins)}:${pad(secs)}`
      : `${pad(mins)}:${pad(secs)}`;
  };

  const scoreDetails = getScoreDetails();

  // If there are no questions loaded for this paper
  if (totalQuestions === 0) {
    return (
      <div className={`min-h-[80vh] flex flex-col items-center justify-center text-center p-4 ${pageBg}`}>
        <CircleAlert className={`w-14 h-14 ${textFaint} mb-4 animate-bounce`} />
        <h2 className={`text-xl font-bold ${textPrimary} mb-2`}>{isEn ? 'No questions found' : 'ප්‍රශ්න කිසිවක් නැත'}</h2>
        <p className={`${textMuted} text-sm max-w-sm mb-6`}>
          {isEn ? 'No questions have been added to this paper yet. Please add them via the Admin Panel.' : 'මෙම ප්‍රශ්න පත්‍රය සඳහා ප්‍රශ්න කිසිවක් ඇතුළත් කර නොමැත. කරුණාකර පාලක පැනලයෙන් ප්‍රශ්න එකතු කරන්න.'}
        </p>
        <button
          onClick={onClose}
          className={`px-6 py-2.5 ${subtleBg} hover:opacity-80 border ${subtleBdr} rounded-xl text-xs font-bold ${textMuted} transition-all cursor-pointer`}
        >
          {isEn ? 'Back to Papers' : 'ආපසු යන්න'}
        </button>
      </div>
    );
  }

  return (
    <div className={`w-full min-h-[100dvh] pb-6 sm:pb-12 safe-bottom ${pageBg}`}>

      {/* PRACTICE SESSION TIMER & CONTROLS HEADER */}
      <div className={`sticky top-0 z-40 ${headerBg} backdrop-blur-md border-b ${headerBdr} py-3 sm:py-4 px-3 sm:px-4 md:px-8 mb-4 sm:mb-6 safe-top`}>
        <div className="max-w-6xl mx-auto flex flex-col gap-3 sm:gap-4">

          <div className="flex items-start gap-2.5 sm:gap-3 min-w-0">
            <button
              onClick={onClose}
              aria-label="Back to papers"
              className={`shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center ${isDark ? 'hover:bg-slate-900 border-slate-800/80' : 'hover:bg-slate-100 border-slate-200'} border rounded-xl ${textMuted} ${isDark ? 'hover:text-white' : 'hover:text-slate-900'} transition-all cursor-pointer`}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className={`text-[10px] ${subtleBg} ${textMuted} px-2 py-0.5 rounded-full font-mono font-semibold tracking-wider uppercase`}>
                  {paper.examType.toUpperCase()} Exam
                </span>
                {isSubmitted && (
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 px-2 py-0.5 rounded-full font-semibold">
                    Completed
                  </span>
                )}
              </div>
              <h2 className={`text-sm sm:text-base md:text-lg font-extrabold ${textPrimary} font-sans mt-0.5 line-clamp-2 leading-snug`}>{isEn ? paper.title : paper.sinhalaTitle}</h2>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 sm:gap-4">

            {/* Elegant Digital Timer */}
            <div className={`p-2 px-4 rounded-xl flex items-center gap-2.5 font-mono text-xs border ${isSubmitted
                ? `${ghostBg} ${ghostBdr} ${textMuted}`
                : timeLeft < 300
                  ? 'bg-red-500/10 border-red-500/20 text-red-400 animate-pulse'
                  : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
              }`}>
              <Clock className="w-4 h-4" />
              <span className="font-semibold tracking-wider">
                {isSubmitted ? (isEn ? 'Completed' : 'අවසන් කරන ලදී') : formatTime(timeLeft)}
              </span>
              {!isSubmitted && (
                <button
                  onClick={() => setIsTimerActive(!isTimerActive)}
                  className={`text-[10px] ${surfaceBg} ${isDark ? 'hover:bg-slate-900' : 'hover:bg-slate-100'} ${textMuted} ${isDark ? 'hover:text-white' : 'hover:text-slate-900'} px-2 py-0.5 rounded border ${surfaceBdr} transition-colors`}
                >
                  {isTimerActive ? (isEn ? 'Pause' : 'Pause') : (isEn ? 'Resume' : 'Resume')}
                </button>
              )}
            </div>

            {/* Top-Right primary Action button */}
            {!isSubmitted ? (
              <button
                onClick={() => {
                  const unanswered = questions.filter(q => answers[q.id || q.qNumber.toString()] === undefined).length;
                  const msg = unanswered > 0
                    ? (isEn ? `You have ${unanswered} unanswered question(s). Submit anyway?` : `ඔබට නොපිළිතුරු දුන් ප්‍රශ්න ${unanswered}ක් ඇත. කෙසේ වුවත් ඉදිරිපත් කරන්නද?`)
                    : (isEn ? 'Are you sure you want to submit?' : 'ඔබට ඉදිරිපත් කිරීමට අවශ්‍ය බව විශ්වාසද?');
                  if (confirm(msg)) handleSubmit();
                }}
                className="shrink-0 min-h-[44px] px-3 sm:px-5 py-2.5 bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-450 hover:to-sky-500 text-white rounded-xl text-[11px] sm:text-xs font-bold font-sans sm:tracking-widest shadow-[0_0_15px_rgba(56,189,248,0.2)] hover:shadow-[0_0_20px_rgba(56,189,248,0.35)] transition-all cursor-pointer active:scale-[0.98]"
              >
                <span className="sm:hidden">{isEn ? 'Submit' : 'ඉදිරිපත් කරන්න'}</span>
                <span className="hidden sm:inline">{isEn ? 'Submit Paper' : 'ප්‍රකාශ කරන්න'}</span>
              </button>
            ) : (
              <button
                onClick={handleRetry}
                className={`flex items-center gap-1.5 min-h-[44px] px-3 py-2 ${subtleBg} ${isDark ? 'hover:bg-slate-850' : 'hover:bg-slate-200'} border ${subtleBdr} ${textMuted} ${isDark ? 'hover:text-white' : 'hover:text-slate-900'} rounded-xl text-xs font-semibold cursor-pointer transition-colors`}
              >
                <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">{isEn ? 'Retry Test' : 'නැවත කරන්න'}</span>
                <span className="sm:hidden">{isEn ? 'Retry' : 'නැවත'}</span>
              </button>
            )}
          </div>

        </div>
      </div>


      {isSubmitted ? (
        <div className="max-w-4xl mx-auto px-3 sm:px-4 space-y-6 sm:space-y-8 animate-fade-in">

          {/* Bento Grid Scorecard Top Panel */}
          <div className={`grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-6 ${isDark ? 'bg-slate-950/60 border-slate-900' : 'bg-white border-slate-200 shadow-lg'} border rounded-2xl sm:rounded-3xl p-4 sm:p-6 relative overflow-hidden`}>

            {/* Floating Background Sparkles */}
            <div className={`absolute top-0 right-0 p-8 ${isDark ? 'text-sky-500/5' : 'text-sky-500/10'} select-none pointer-events-none`}>
              <Sparkles className="w-32 h-32" />
            </div>

            {/* Score circle (Col 5) */}
            <div className={`md:col-span-5 flex flex-col items-center justify-center text-center p-4 border-b md:border-b-0 md:border-r ${dividerBdr}`}>
              <span className={`text-[10px] uppercase tracking-[0.25em] ${textMuted} font-mono font-bold mb-3`}>{isEn ? 'YOUR SCORE' : 'ඔබේ ලකුණු'}</span>

              <div className={`relative w-36 h-36 flex items-center justify-center rounded-full border-4 ${isDark ? 'border-slate-900 bg-slate-950' : 'border-slate-200 bg-slate-50'}`}>

                {/* SVG Progress Arc */}
                <svg className="absolute inset-0 w-full h-full -rotate-90">
                  <circle
                    cx="72"
                    cy="72"
                    r="66"
                    className={`${isDark ? 'stroke-slate-900' : 'stroke-slate-200'} stroke-[5] fill-none`}
                  />
                  <circle
                    cx="72"
                    cy="72"
                    r="66"
                    className="stroke-sky-500 stroke-[5] fill-none transition-all duration-1000"
                    strokeDasharray={414}
                    strokeDashoffset={414 - (414 * scoreDetails.percentage) / 100}
                    strokeLinecap="round"
                  />
                </svg>

                <div className="flex flex-col items-center z-10">
                  <span className={`text-4xl font-extrabold ${textPrimary} font-mono`}>{scoreDetails.percentage}%</span>
                  <span className={`text-xs ${textMuted} font-sans mt-0.5 font-bold`}>
                    {scoreDetails.correctCount} / {totalQuestions} {isEn ? 'Correct' : 'නිවැරදියි'}
                  </span>
                </div>
              </div>

              <div className={`mt-5 p-2 px-4 text-xs font-semibold rounded-xl text-center border ${scoreDetails.performanceColor}`}>
                {scoreDetails.performanceMessage}
              </div>
            </div>

            {/* Statistics details (Col 7) */}
            <div className="md:col-span-7 flex flex-col justify-center space-y-6 p-2 md:pl-6">
              <div>
                <span className="text-[10px] tracking-wider text-cyan-400 font-mono uppercase font-bold">{isEn ? 'Stats Breakdown' : 'දත්ත සාරාංශය'}</span>
                <h3 className={`text-xl font-extrabold ${textPrimary} mt-1`}>{isEn ? 'Performance Report' : 'විෂය ප්‍රශස්තකරණ වාර්තාව'}</h3>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <div className={`${isDark ? 'bg-slate-900/40 border-slate-800/40' : 'bg-emerald-50 border-emerald-100'} border rounded-xl p-3 flex flex-col`}>
                  <span className={`text-[10px] ${textMuted} font-medium`}>{isEn ? 'Correct' : 'නිවැරදි පිළිතුරු'}</span>
                  <span className="text-xl font-bold text-emerald-400 font-mono mt-1 flex items-center gap-1.5">
                    <CircleCheck className="w-4 h-4 text-emerald-400" />
                    {scoreDetails.correctCount}
                  </span>
                </div>
                <div className={`${isDark ? 'bg-slate-900/40 border-slate-800/40' : 'bg-red-50 border-red-100'} border rounded-xl p-3 flex flex-col`}>
                  <span className={`text-[10px] ${textMuted} font-medium`}>{isEn ? 'Incorrect' : 'වැරදි පිළිතුරු'}</span>
                  <span className="text-xl font-bold text-red-400 font-mono mt-1 flex items-center gap-1.5">
                    <CircleX className="w-4 h-4 text-red-400" />
                    {scoreDetails.incorrectCount}
                  </span>
                </div>
                <div className={`${isDark ? 'bg-slate-900/40 border-slate-800/40' : 'bg-slate-50 border-slate-200'} border rounded-xl p-3 flex flex-col`}>
                  <span className={`text-[10px] ${textMuted} font-medium`}>{isEn ? 'Unanswered' : 'නොකළ ප්‍රශ්න'}</span>
                  <span className={`text-xl font-bold ${textMuted} font-mono mt-1 flex items-center gap-1.5`}>
                    <CircleAlert className={`w-4 h-4 ${textMuted}`} />
                    {scoreDetails.unansweredCount}
                  </span>
                </div>
              </div>

              <div className={`pt-2 border-t ${dividerBdr} flex items-center gap-3`}>
                <div className="flex -space-x-1">
                  {[...Array(Math.min(scoreDetails.correctCount, 4))].map((_, i) => (
                    <span
                      key={i}
                      className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold flex items-center justify-center"
                    >
                      ✓
                    </span>
                  ))}
                </div>
                <p className={`text-xs ${textMuted}`}>
                  {scoreDetails.correctCount === totalQuestions
                    ? (isEn ? 'Awesome! You got a perfect score.' : 'නියමයි!')
                    : (isEn ? 'Study the explanations below to correct your mistakes.' : 'පහත ඇති පැහැදිලි කිරීම් අධ්යයනය කරන්න')}
                </p>
              </div>

            </div>
          </div>

          {/* Interactive Question-by-Question Review Panel */}
          <div className={`${isDark ? 'bg-slate-950/25 border-slate-900' : 'bg-white border-slate-200 shadow-lg'} border rounded-3xl p-6 space-y-6`}>

            <div className={`flex flex-col md:flex-row md:items-center justify-between border-b ${dividerBdr} pb-4 gap-2`}>
              <div>
                <h3 className={`text-lg font-bold ${textPrimary} flex items-center gap-1.5`}>
                  <BookOpen className="w-4 h-4 text-sky-400" />
                  {isEn ? 'Question Review & Explanations' : 'ප්‍රශ්න විවරණය සහ විවරණ සහිත පිළිතුරු'}
                </h3>
                <p className={`text-xs ${textMuted} mt-1`}>{isEn ? 'Study correct answers with detailed reasoning for each question.' : 'තනි තනි ප්‍රශ්න සඳහා හේතු සහිත නිවැරදි පිළිතුරු අධ්‍යයනය කරන්න'}</p>
              </div>

              {/* Selection dots for reviewing questions */}
              <div className="flex flex-wrap gap-1.5">
                {questions.map((q, idx) => {
                  const qId = q.id || q.qNumber.toString();
                  const isCorrect = q.isAllCorrect || (q.correctOptions?.includes(answers[qId]) ?? answers[qId] === q.correctOption);
                  const isUnanswered = answers[qId] === undefined;

                  return (
                    <button
                      key={q.id}
                      onClick={() => setReviewQIndex(idx)}
                      className={`w-8 h-8 rounded-lg font-mono text-xs font-bold border transition-all cursor-pointer flex items-center justify-center ${reviewQIndex === idx
                          ? 'ring-2 ring-sky-500 border-sky-400'
                          : ''
                        } ${isUnanswered
                          ? `${subtleBg} ${textMuted} ${subtleBdr}`
                          : isCorrect
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                            : 'bg-red-500/15 border-red-500/30 text-red-400'
                        }`}
                    >
                      {q.qNumber}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Review Card active question details */}
            {questions[reviewQIndex] && (() => {
              const rQ = questions[reviewQIndex];
              const qId = rQ.id || rQ.qNumber.toString();
              const userAns = answers[qId];
              const isCorrectAtReview = rQ.isAllCorrect || (rQ.correctOptions?.includes(userAns) ?? userAns === rQ.correctOption);

              return (
                <div className="space-y-6 animate-fade-in">

                  {/* Status header inside reviewer */}
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${subtleBg} border ${subtleBdr} ${textMuted} px-2.5 py-1 rounded-lg font-mono font-bold`}>
                      QUESTION {rQ.qNumber}
                    </span>
                    {userAns === undefined ? (
                      <span className={`text-[11px] ${subtleBg} ${textMuted} border ${subtleBdr} px-2 py-0.5 rounded-md font-semibold`}>
                        {isEn ? 'Unanswered' : 'නොකළ ප්‍රශ්නයකි'}
                      </span>
                    ) : isCorrectAtReview ? (
                      <span className="text-[11px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 px-2 py-0.5 rounded-md font-semibold flex items-center gap-1">
                        {isEn ? '✓ Correct Answer' : '✓ පිළිතුර නිවැරදියි'}
                      </span>
                    ) : (
                      <span className="text-[11px] bg-red-500/15 text-red-405 border border-red-500/25 px-2 py-0.5 rounded-md font-semibold flex items-center gap-1">
                        {isEn ? '✗ Incorrect Answer' : '✗ පිළිතුර වැරදියි'}
                      </span>
                    )}
                  </div>

                  {/* Question HTML Area */}
                  <div className={`${isDark ? 'bg-slate-900/35 border-slate-900' : 'bg-slate-50 border-slate-200'} border rounded-2xl p-5 text-[15px] leading-relaxed ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                    <div dangerouslySetInnerHTML={{ __html: renderMathInHtml(rQ.questionHtml) }} />
                  </div>

                  {/* MCQ Options with detailed highlighting */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {rQ.optionsHtml.map((opt, optIdx) => {
                      const isCorrectChoice = rQ.isAllCorrect || (rQ.correctOptions?.includes(optIdx) ?? optIdx === rQ.correctOption);
                      const isUserChoice = optIdx === userAns;

                      let borderStyle = `${ghostBdr} ${ghostBg}`;
                      let labelStyle = `${subtleBg} ${textMuted}`;
                      let textColor = isDark ? 'text-slate-300' : 'text-slate-600';
                      let badge = null;

                      if (isCorrectChoice) {
                        borderStyle = 'border-emerald-500/40 bg-emerald-500/5 shadow-[0_0_10px_rgba(16,185,129,0.02)]';
                        labelStyle = 'bg-emerald-500 text-white font-bold';
                        textColor = isDark ? 'text-white font-medium' : 'text-emerald-900 font-medium';
                        badge = (
                          <span className="text-[9px] bg-emerald-500 text-white px-1.5 py-0.5 rounded font-bold font-sans tracking-wide uppercase ml-auto">
                            Correct Answer
                          </span>
                        );
                      } else if (isUserChoice) {
                        borderStyle = 'border-red-500/40 bg-red-500/5';
                        labelStyle = 'bg-red-500 text-white font-bold';
                        textColor = isDark ? 'text-slate-100' : 'text-red-900';
                        badge = (
                          <span className="text-[9px] bg-red-500 text-white px-1.5 py-0.5 rounded font-bold font-sans tracking-wide uppercase ml-auto">
                            Your Choice
                          </span>
                        );
                      }

                      return (
                        <div
                          key={optIdx}
                          className={`flex items-center gap-3 p-4 rounded-xl border text-xs transition-colors ${borderStyle}`}
                        >
                          <span className={`w-6 h-6 rounded-lg text-[11px] font-bold font-mono flex items-center justify-center ${labelStyle}`}>
                            {String.fromCharCode(65 + optIdx)}
                          </span>
                          <span className={textColor} dangerouslySetInnerHTML={{ __html: renderMathInHtml(opt) }} />
                          {badge}
                        </div>
                      );
                    })}
                  </div>

                  {/* Explanations section */}
                  {rQ.explanationHtml && (
                    <div className={`p-5 ${isDark ? 'bg-sky-500/5 border-sky-500/10' : 'bg-sky-50 border-sky-200'} border rounded-2xl space-y-2`}>
                      <div className="flex items-center gap-1.5 text-cyan-400 mb-2">
                        <Bookmark className="w-4 h-4 text-cyan-400" />
                        <h4 className="text-xs font-bold tracking-wider font-sans uppercase">{isEn ? 'Explanation & Steps' : 'ප්‍රශ්නයේ සත්‍ය විස්තරය සහ විවරණය'}</h4>
                      </div>
                      <div
                        className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'} leading-relaxed font-sans`}
                        dangerouslySetInnerHTML={{ __html: renderMathInHtml(rQ.explanationHtml) }}
                      />
                    </div>
                  )}

                </div>
              );
            })()}

          </div>

          <div className="flex justify-center px-1">
            <button
              onClick={onClose}
              className="w-full sm:w-auto min-h-[48px] px-6 sm:px-8 py-3 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-450 hover:to-indigo-500 text-white rounded-xl text-xs font-bold tracking-wide sm:tracking-widest uppercase cursor-pointer active:scale-[0.98]"
            >
              <span className="sm:hidden">{isEn ? 'Exit' : 'ප්‍රධාන පිටුවට'}</span>
              <span className="hidden sm:inline">{isEn ? 'Exit review & Back to Subjects' : 'ප්‍රධාන පිටුවට'}</span>
            </button>
          </div>

        </div>
      ) : (
        /* ACTIVE PRACTICE RUN SCREENS (Page 4 Sketch Layout) */
        <>
          {/* STUDY MATERIAL VIEW */}
          {activeView === 'study' && paper.studyMaterialHtml && (
            <div className="max-w-4xl mx-auto px-3 sm:px-4 py-6">
              <div className={`rounded-2xl border ${isDark ? 'bg-slate-950/40 border-slate-900' : 'bg-white border-slate-200 shadow-sm'} p-5 sm:p-8`}>
                <div className={`flex items-center gap-2 mb-5 pb-4 border-b ${dividerBdr}`}>
                  <FileText className="w-4 h-4 text-sky-400 shrink-0" />
                  <h3 className={`text-sm font-bold ${textPrimary}`}>{isEn ? paper.title : paper.sinhalaTitle} — {isEn ? 'Study Material' : 'අධ්‍යයන ද්‍රව්‍ය'}</h3>
                </div>
                <div
                  className="mehewara-content"
                  dangerouslySetInnerHTML={{ __html: paper.studyMaterialHtml }}
                />
              </div>
            </div>
          )}

          {/* MCQ SESSION VIEW */}
          {(activeView === 'mcq' || !paper.studyMaterialHtml) && (
            <div className="max-w-6xl mx-auto px-3 sm:px-4 flex flex-col lg:grid lg:grid-cols-12 gap-4 sm:gap-6 lg:gap-8">

              {/* Question map — shown first on mobile for quick navigation */}
              <div className="lg:col-span-4 order-2 space-y-4 sm:space-y-6">

                {/* Mode Toggle & Live Scoreboard */}
                <div className={`${cardBg} border ${cardBdr} rounded-2xl sm:rounded-3xl p-4 sm:p-6 ${isDark ? 'shadow-lg' : 'shadow-md'} space-y-4`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-bold uppercase tracking-widest flex items-center gap-2 ${textPrimary}`}>
                      <Award className="w-4 h-4 text-emerald-400" />
                      Exam Mode
                    </span>
                    <div className={`flex p-1 ${isDark ? 'bg-slate-900' : 'bg-slate-100'} rounded-lg border ${subtleBdr}`}>
                      <button
                        onClick={() => setExamMode('strict')}
                        className={`px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${examMode === 'strict' ? 'bg-sky-500 text-white shadow-sm shadow-sky-500/20' : `${textMuted} hover:text-slate-900 dark:hover:text-white`}`}
                      >
                        STRICT
                      </button>
                      <button
                        onClick={() => setExamMode('practice')}
                        className={`px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${examMode === 'practice' ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/20' : `${textMuted} hover:text-slate-900 dark:hover:text-white`}`}
                      >
                        PRACTICE
                      </button>
                    </div>
                  </div>

                  {examMode === 'practice' && (
                    <div className={`flex items-center justify-between p-3.5 rounded-xl border ${subtleBdr} ${isDark ? 'bg-slate-900/50' : 'bg-slate-50'}`}>
                      <div className="flex flex-col">
                        <span className={`text-[10px] uppercase font-bold tracking-wider mb-0.5 ${textMuted}`}>Correct</span>
                        <span className="text-xl font-bold font-mono text-emerald-400 leading-none">
                          {correctCountLive} <span className={`text-sm ${textFaint}`}>/ {totalAttempted}</span>
                        </span>
                      </div>
                      <div className="flex flex-col text-right">
                        <span className={`text-[10px] uppercase font-bold tracking-wider mb-0.5 ${textMuted}`}>Accuracy</span>
                        <span className={`text-xl font-bold font-mono leading-none ${percentageLive >= 75 ? 'text-emerald-400' : percentageLive >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                          {percentageLive}%
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className={`${cardBg} border ${cardBdr} rounded-2xl sm:rounded-3xl p-4 sm:p-6 ${isDark ? 'shadow-lg' : 'shadow-md'}`}>
                  <h3 className={`text-xs font-mono font-bold tracking-[0.2em] ${textMuted} uppercase mb-3 sm:mb-4 flex items-center gap-1`}>
                    <Bookmark className="w-4 h-4 text-sky-400 shrink-0" />
                    {isEn ? 'Question Map' : 'ප්‍රශ්න සිතියම'}
                  </h3>

                  <div className="grid grid-cols-6 sm:grid-cols-5 gap-1.5 sm:gap-2.5">
                    {questions.map((q, idx) => {
                      const qId = q.id || q.qNumber.toString();
                      const isCurrent = currentQIndex === idx;
                      const isAnswered = answers[qId] !== undefined;
                      const isFlagged = flaggedQuestions[qId];
                      const isVerified = verifiedAnswers[qId] !== undefined;
                      const isCorrect = verifiedAnswers[qId] === true;

                      let borderStyle = isDark
                        ? 'border-slate-850 bg-slate-950 text-slate-500'
                        : 'border-slate-200 bg-slate-50 text-slate-400';

                      if (examMode === 'practice' && isVerified) {
                        if (isCorrect) {
                          borderStyle = 'border-emerald-500/60 bg-emerald-500/15 text-emerald-400 font-bold';
                        } else {
                          borderStyle = 'border-red-500/60 bg-red-500/15 text-red-400 font-bold';
                        }
                      } else if (isFlagged) {
                        borderStyle = 'border-amber-500/40 bg-amber-500/5 text-amber-400 animate-pulse';
                      } else if (isAnswered) {
                        borderStyle = 'border-sky-500/30 bg-sky-500/10 text-sky-400 font-semibold';
                      }

                      return (
                        <button
                          key={q.id}
                          onClick={() => setCurrentQIndex(idx)}
                          className={`min-h-[40px] sm:min-h-[44px] rounded-lg sm:rounded-xl font-mono text-xs font-bold border transition-all cursor-pointer flex items-center justify-center ${borderStyle} ${isCurrent ? `ring-2 ring-sky-500 ring-offset-2 ${isDark ? 'ring-offset-slate-950' : 'ring-offset-white'}` : ''
                            }`}
                        >
                          {q.qNumber}
                        </button>
                      );
                    })}
                  </div>

                  <div className={`hidden sm:block mt-6 pt-4 border-t ${dividerBdr} text-[11px] ${textFaint} space-y-2`}>
                    {examMode === 'practice' && (
                      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-dashed border-slate-700/50">
                        <span className="w-2.5 h-2.5 bg-emerald-500/20 border border-emerald-500/50 rounded-md" />
                        <span>{isEn ? 'Correct' : 'නිවැරදියි'}</span>
                        <span className="w-2.5 h-2.5 bg-red-500/20 border border-red-500/50 rounded-md ml-2" />
                        <span>{isEn ? 'Incorrect' : 'වැරදියි'}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 bg-sky-500/10 border border-sky-500/20 rounded-md" />
                      <span>{isEn ? 'Answered' : 'පිළිතුරු සපයන ලද'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 bg-amber-500/5 border border-amber-500/40 rounded-md animate-pulse" />
                      <span>{isEn ? 'Flagged for Review' : 'සමාලෝචනයට වෙන්කළ'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 ${isDark ? 'bg-slate-950 border-slate-850' : 'bg-slate-50 border-slate-200'} rounded-md`} />
                      <span>{isEn ? 'Unanswered' : 'පිළිතුරු නොදුන්'}</span>
                    </div>
                  </div>
                </div>

                <div className={`hidden lg:block ${ghostBg} border ${ghostBdr} rounded-3xl p-5 text-xs ${textMuted} space-y-2 leading-relaxed`}>
                  <span className={`font-extrabold ${isDark ? 'text-slate-350' : 'text-slate-600'} text-xs block mb-1`}>💡 {isEn ? 'Exam Tips' : 'විභාග උපදෙස්'}</span>
                  <p>{isEn ? 'In O/L and A/L MCQ exams, the average reasonable time per question is around 2-3 minutes.' : 'උසස් පෙළ සහ සාමාන්‍ය පෙළ MCQ විභාගවලදී එක් ප්‍රශ්නයක් සඳහා සාමාන්‍යයෙන් සාධාරණ කාලය මිනිත්තු 2-3ක් පමණ වේ.'}</p>
                </div>

              </div>

              {/* Main Question Panel (Col-8) */}
              <div className="lg:col-span-8 order-1 space-y-4 sm:space-y-6">

                {/* Nav metadata */}
                <div className="flex items-center justify-between">
                  <span className={`text-xs ${subtleBg} border ${subtleBdr} ${textMuted} px-2.5 py-1 rounded-xl font-mono tracking-wide font-bold`}>
                    {isEn ? 'Question' : 'මට්ටම'} {currentQIndex + 1} / {totalQuestions}
                  </span>

                  <button
                    onClick={toggleFlag}
                    className={`flex items-center gap-1 min-h-[44px] px-3 py-2 rounded-lg border text-xs font-semibold select-none cursor-pointer transition-all ${flaggedQuestions[activeQuestion.id || activeQuestion.qNumber.toString()]
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-450'
                        : `${subtleBg} ${subtleBdr} ${textMuted} ${isDark ? 'hover:text-white' : 'hover:text-slate-900'}`
                      }`}
                  >
                    <Flag className="w-3.5 h-3.5 shrink-0" />
                    {flaggedQuestions[activeQuestion.id || activeQuestion.qNumber.toString()] ? (
                      <>
                        <span className="sm:hidden">{isEn ? 'Flagged' : 'ලකුණු කළ'}</span>
                        <span className="hidden sm:inline">{isEn ? 'Flagged for Review' : 'සමාලෝචනයට ලකුණු කර ඇත'}</span>
                      </>
                    ) : (
                      <>
                        <span className="sm:hidden">{isEn ? 'Flag' : 'ලකුණු කරන්න'}</span>
                        <span className="hidden sm:inline">{isEn ? 'Flag for Review' : 'සමාලෝචනය සඳහා ලකුණු කරන්න'}</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Rendered Question Card holding raw text/HTML formulas */}
                <div className={`${cardBg} border ${cardBdr} rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 space-y-4 sm:space-y-6 min-h-[120px] sm:min-h-[160px] flex flex-col justify-center ${isDark ? 'shadow-lg' : 'shadow-md'} relative overflow-hidden`}>

                  {/* Question Number background emblem */}
                  <div className={`absolute top-2 left-4 sm:top-4 sm:left-6 ${isDark ? 'text-slate-800/10' : 'text-slate-200/60'} text-5xl sm:text-7xl font-mono font-bold select-none pointer-events-none`}>
                    {String(activeQuestion.qNumber).padStart(2, '0')}
                  </div>

                  <div className={`relative z-10 text-[15px] sm:text-[16px] md:text-[17px] leading-relaxed ${isDark ? 'text-slate-100' : 'text-slate-800'} font-sans break-words`}>
                    <div dangerouslySetInnerHTML={{ __html: renderMathInHtml(activeQuestion.questionHtml) }} />
                  </div>
                </div>

                {/* Answer Options cards - grid styled to match sketches */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  {activeQuestion.optionsHtml.map((option, optIdx) => {
                    const qId = activeQuestion.id || activeQuestion.qNumber.toString();
                    const isSelected = answers[qId] === optIdx;
                    const isVerified = verifiedAnswers[qId] !== undefined;
                    const isCorrectAnswer = activeQuestion.isAllCorrect || (activeQuestion.correctOptions?.includes(optIdx) ?? activeQuestion.correctOption === optIdx);

                    // Determine dynamic styles based on Practice Mode verification
                    let cardStyle = "";
                    let badgeStyle = "";

                    if (isVerified && examMode === 'practice') {
                      if (isCorrectAnswer) {
                        cardStyle = `bg-emerald-500/10 border-emerald-500/80 ${isDark ? 'text-white' : 'text-emerald-900'} shadow-[0_0_20px_rgba(16,185,129,0.15)]`;
                        badgeStyle = 'bg-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.3)]Scale-95';
                      } else if (isSelected && !isCorrectAnswer) {
                        cardStyle = `bg-red-500/10 border-red-500/80 ${isDark ? 'text-white' : 'text-red-900'} shadow-[0_0_20px_rgba(239,68,68,0.15)]`;
                        badgeStyle = 'bg-red-500 text-white shadow-[0_0_10px_rgba(239,68,68,0.3)]Scale-95';
                      } else {
                        cardStyle = `${ghostBg} ${ghostBdr} text-slate-500 opacity-50`;
                        badgeStyle = `${subtleBg} ${textMuted}`;
                      }
                    } else if (isSelected) {
                      cardStyle = `bg-sky-500/10 border-sky-500/80 ${isDark ? 'text-white' : 'text-sky-900'} shadow-[0_0_20px_rgba(14,165,233,0.1)]`;
                      badgeStyle = 'bg-sky-500 text-white shadow-[0_0_10px_rgba(14,165,233,0.3)]Scale-95';
                    } else {
                      cardStyle = `${ghostBg} ${ghostBdr} ${isDark ? 'text-slate-300 hover:bg-slate-900 hover:border-slate-800' : 'text-slate-600 hover:bg-white hover:border-slate-300'}`;
                      badgeStyle = `${subtleBg} ${textMuted}`;
                    }

                    return (
                      <button
                        key={optIdx}
                        type="button"
                        onClick={() => {
                          if (!isVerified || examMode !== 'practice') {
                            handleSelectOption(optIdx);
                          }
                        }}
                        disabled={isVerified && examMode === 'practice'}
                        className={`w-full text-left min-h-[52px] p-4 md:p-5 rounded-2xl border transition-all duration-200 cursor-pointer flex items-center gap-3 sm:gap-4 ${isVerified && examMode === 'practice' ? '' : 'active:scale-[0.99]'} ${cardStyle}`}
                      >
                        {/* Glowing A/B/C/D key labels */}
                        <span className={`w-9 h-9 sm:w-8 sm:h-8 shrink-0 rounded-lg font-mono text-sm font-bold flex items-center justify-center transition-all pointer-events-none ${badgeStyle}`}>
                          {String.fromCharCode(65 + optIdx)}
                        </span>
                        <span className="text-[13px] md:text-[14px] leading-snug pointer-events-none" dangerouslySetInnerHTML={{ __html: renderMathInHtml(option) }} />
                      </button>
                    );
                  })}
                </div>

                {/* Practice Mode Check Button & Explanation */}
                {examMode === 'practice' && (() => {
                  const qId = activeQuestion.id || activeQuestion.qNumber.toString();
                  return (
                    <div className="pt-2 animate-fade-in">
                      {verifiedAnswers[qId] === undefined ? (
                        <button
                          type="button"
                          onClick={() => handleCheckAnswer(qId, activeQuestion)}
                          className="w-full sm:w-auto px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.25)] transition-all active:scale-[0.98] cursor-pointer"
                        >
                          Check Answer
                        </button>
                      ) : (
                        <div className={`p-5 rounded-2xl border ${verifiedAnswers[qId] ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                          <h4 className={`font-bold mb-3 flex items-center gap-2 ${verifiedAnswers[qId] ? 'text-emerald-500' : 'text-red-500'}`}>
                            {verifiedAnswers[qId] ? <CircleCheck className="w-5 h-5" /> : <CircleX className="w-5 h-5" />}
                            {verifiedAnswers[qId] ? (isEn ? 'Correct!' : 'නිවැරදියි!') : (isEn ? 'Incorrect.' : 'වැරදියි!')}
                          </h4>
                          {activeQuestion.explanationHtml && (
                            <div className={`mt-3 pt-4 border-t ${verifiedAnswers[qId] ? 'border-emerald-500/20' : 'border-red-500/20'}`}>
                              <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{isEn ? 'Explanation' : 'විවරණය'}</p>
                              <div
                                className={`text-sm leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}
                                dangerouslySetInnerHTML={{ __html: renderMathInHtml(activeQuestion.explanationHtml) }}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Bottom Controls */}
                <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t ${dividerBdr}`}>
                  <button
                    type="button"
                    onClick={clearAnswer}
                    disabled={answers[activeQuestion.id || activeQuestion.qNumber.toString()] === undefined}
                    className={`min-h-[44px] px-3.5 py-2 ${subtleBg} ${isDark ? 'hover:bg-slate-850' : 'hover:bg-slate-200'} border ${subtleBdr} disabled:opacity-30 disabled:pointer-events-none ${textMuted} ${isDark ? 'hover:text-white' : 'hover:text-slate-900'} rounded-lg text-xs font-semibold tracking-wider transition-colors cursor-pointer`}
                  >
                    {isEn ? 'Clear' : 'පිළිතුර මකන්න'}
                  </button>

                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={handlePrev}
                      disabled={currentQIndex === 0}
                      className={`min-h-[44px] px-4 py-2 ${surfaceBg} ${isDark ? 'hover:bg-slate-900 border-slate-900' : 'hover:bg-slate-100 border-slate-200'} border disabled:opacity-20 disabled:pointer-events-none ${isDark ? 'text-slate-300' : 'text-slate-600'} rounded-xl text-xs font-bold font-sans flex items-center justify-center gap-1 cursor-pointer`}
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      {isEn ? 'Prev' : 'පෙර'}
                    </button>
                    <button
                      type="button"
                      onClick={handleNext}
                      disabled={currentQIndex === totalQuestions - 1}
                      className={`min-h-[44px] px-4 py-2 ${surfaceBg} ${isDark ? 'hover:bg-slate-900 border-slate-900' : 'hover:bg-slate-100 border-slate-200'} border disabled:opacity-20 disabled:pointer-events-none ${isDark ? 'text-slate-300' : 'text-slate-600'} rounded-xl text-xs font-bold font-sans flex items-center justify-center gap-1 cursor-pointer`}
                    >
                      {isEn ? 'Next' : 'ඊළඟ'}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

              </div>

            </div>
          )}
        </>
      )}

    </div>
  );
}