import React, { useState, useEffect, useMemo } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  ArrowLeft, 
  ArrowRight, 
  Clock, 
  Flag, 
  RefreshCw, 
  Check, 
  Bookmark, 
  Award, 
  BookOpen, 
  Sparkles,
  FileText
} from 'lucide-react';
import { Paper, Question, UserAttempt } from '../types';
import { useTheme } from '../ThemeContext';

interface PracticeSessionProps {
  paper: Paper;
  questions: Question[];
  onSaveAttempt: (attempt: UserAttempt) => void;
  savedAttempt?: UserAttempt;
  onClose: () => void;
}

export default function PracticeSession({
  paper,
  questions: questionsProp,
  onSaveAttempt,
  savedAttempt,
  onClose
}: PracticeSessionProps) {
  
  const { theme } = useTheme();
  const isDark = theme === 'dark';

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
  // 'mcq' | 'study' — tab within the active practice view
  const [activeView, setActiveView] = useState<'mcq' | 'study'>('mcq');

  // Practice Mode States
  const [examMode, setExamMode] = useState<'strict' | 'practice'>('practice');
  const [verifiedAnswers, setVerifiedAnswers] = useState<Record<string, boolean>>({});

  // Practice Mode Live Score Calculations
  const totalAttempted = Object.keys(verifiedAnswers).length;
  const correctCountLive = Object.values(verifiedAnswers).filter(Boolean).length;
  const percentageLive = totalAttempted > 0 ? Math.round((correctCountLive / totalAttempted) * 100) : 0;

  const handleCheckAnswer = (questionId: string, correctOptionIndex: number) => {
    const selectedOptionIndex = answers[questionId];
    if (selectedOptionIndex === undefined) {
      alert("කරුණාකර පිළිතුරක් තෝරන්න! (Please select an answer first!)");
      return;
    }
    
    const isCorrect = selectedOptionIndex === correctOptionIndex;
    
    setVerifiedAnswers(prev => ({
      ...prev,
      [questionId]: isCorrect
    }));
  };

  const activeQuestion = questions[currentQIndex];
  const totalQuestions = questions.length;

  // ── Theme shortcut classes ──
  const pageBg      = isDark ? 'bg-[#030304]'           : 'bg-[#f0f4f8]';
  const headerBg    = isDark ? 'bg-[#030304]/95'         : 'bg-[#f0f4f8]/95';
  const headerBdr   = isDark ? 'border-slate-900'        : 'border-slate-200';
  const cardBg      = isDark ? 'bg-slate-950/80'         : 'bg-white/90';
  const cardBdr     = isDark ? 'border-slate-900'        : 'border-slate-200';
  const surfaceBg   = isDark ? 'bg-slate-950'            : 'bg-white';
  const surfaceBdr  = isDark ? 'border-slate-800'        : 'border-slate-200';
  const textPrimary = isDark ? 'text-white'              : 'text-slate-900';
  const textMuted   = isDark ? 'text-slate-400'          : 'text-slate-500';
  const textFaint   = isDark ? 'text-slate-500'          : 'text-slate-400';
  const dividerBdr  = isDark ? 'border-slate-900'        : 'border-slate-200';
  const subtleBg    = isDark ? 'bg-slate-900'            : 'bg-slate-100';
  const subtleBdr   = isDark ? 'border-slate-800'        : 'border-slate-200';
  const ghostBg     = isDark ? 'bg-slate-950/40'         : 'bg-slate-50';
  const ghostBdr    = isDark ? 'border-slate-900'        : 'border-slate-200';

  // Countdown Timer
  useEffect(() => {
    if (isSubmitted || !isTimerActive) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmit();
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
    const qId = activeQuestion.id;
    setAnswers(prev => ({
      ...prev,
      [qId]: optionIndex
    }));
  };

  // Toggle flag/review status
  const toggleFlag = () => {
    if (isSubmitted) return;
    const qId = activeQuestion.id;
    setFlaggedQuestions(prev => ({
      ...prev,
      [qId]: !prev[qId]
    }));
  };

  // Clear answer
  const clearAnswer = () => {
    if (isSubmitted) return;
    const qId = activeQuestion.id;
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
  const handleSubmit = () => {
    if (isSubmitted) return;
    
    setIsSubmitted(true);
    setIsTimerActive(false);

    const attempt: UserAttempt = {
      paperId: paper.id,
      startedAt: Date.now() - (paper.durationMinutes * 60 - timeLeft) * 1000,
      completedAt: Date.now(),
      answers: answers,
      isCompleted: true
    };

    onSaveAttempt(attempt);
  };

  // Reset / Retry
  const handleRetry = () => {
    if (confirm('ඔබට මෙම ප්‍රශ්න පත්‍රය නැවත කිරීමට අවශ්‍යද? සියලුම පිළිතුරු මකා දැමෙනු ඇත. (Are you sure you want to retry this paper?)')) {
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
      if (answers[q.id] === q.correctOption) {
        correctCount++;
      }
    });

    const unansweredCount = questions.filter(q => answers[q.id] === undefined).length;
    const incorrectCount = totalQuestions - correctCount - unansweredCount;
    const percentage = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

    let performanceMessage = '';
    let performanceColor = '';

    if (percentage >= 75) {
      performanceMessage = 'විශිෂ්ටයි! ඔබ විශිෂ්ට මට්ටමක පසුවේ. (Excellent representation!)';
      performanceColor = isDark
        ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
        : 'text-emerald-700 bg-emerald-50 border-emerald-200';
    } else if (percentage >= 50) {
      performanceMessage = 'ඉතා හොඳයි. තව උත්සාහය වැඩි කරන්න. (Very good effort!)';
      performanceColor = isDark
        ? 'text-sky-400 bg-sky-500/10 border-sky-500/20'
        : 'text-sky-700 bg-sky-50 border-sky-200';
    } else {
      performanceMessage = 'වැඩිපුර පුහුණු වන්න. ඔබට මීට වඩා දක්ෂ විය හැක. (Keep practicing!)';
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
        <AlertCircle className={`w-14 h-14 ${textFaint} mb-4 animate-bounce`} />
        <h2 className={`text-xl font-bold ${textPrimary} mb-2`}>ප්‍රශ්න කිසිවක් නැත</h2>
        <p className={`${textMuted} text-sm max-w-sm mb-6`}>
          මෙම ප්‍රශ්න පත්‍රය සඳහා ප්‍රශ්න කිසිවක් ඇතුළත් කර නොමැත. කරුණාකර පාලක පැනලයෙන් ප්‍රශ්න එකතු කරන්න.
        </p>
        <button
          onClick={onClose}
          className={`px-6 py-2.5 ${subtleBg} hover:opacity-80 border ${subtleBdr} rounded-xl text-xs font-bold ${textMuted} transition-all cursor-pointer`}
        >
          ආපසු යන්න (Back to Papers)
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
              <h2 className={`text-sm sm:text-base md:text-lg font-extrabold ${textPrimary} font-sans mt-0.5 line-clamp-2 leading-snug`}>{paper.sinhalaTitle}</h2>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 sm:gap-4">
            
            {/* Elegant Digital Timer */}
            <div className={`p-2 px-4 rounded-xl flex items-center gap-2.5 font-mono text-xs border ${
              isSubmitted 
                ? `${ghostBg} ${ghostBdr} ${textMuted}` 
                : timeLeft < 300 
                  ? 'bg-red-500/10 border-red-500/20 text-red-400 animate-pulse'
                  : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
            }`}>
              <Clock className="w-4 h-4" />
              <span className="font-semibold tracking-wider">
                {isSubmitted ? 'අවසන් කරන ලදී' : formatTime(timeLeft)}
              </span>
              {!isSubmitted && (
                <button
                  onClick={() => setIsTimerActive(!isTimerActive)}
                  className={`text-[10px] ${surfaceBg} ${isDark ? 'hover:bg-slate-900' : 'hover:bg-slate-100'} ${textMuted} ${isDark ? 'hover:text-white' : 'hover:text-slate-900'} px-2 py-0.5 rounded border ${surfaceBdr} transition-colors`}
                >
                  {isTimerActive ? 'Pause' : 'Resume'}
                </button>
              )}
            </div>

            {/* Top-Right primary Action button */}
            {!isSubmitted ? (
              <button
                onClick={handleSubmit}
                className="shrink-0 min-h-[44px] px-3 sm:px-5 py-2.5 bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-450 hover:to-sky-500 text-white rounded-xl text-[11px] sm:text-xs font-bold font-sans sm:tracking-widest shadow-[0_0_15px_rgba(56,189,248,0.2)] hover:shadow-[0_0_20px_rgba(56,189,248,0.35)] transition-all cursor-pointer active:scale-[0.98]"
              >
                <span className="sm:hidden">ඉදිරිපත් කරන්න</span>
                <span className="hidden sm:inline">ප්‍රකාශ කරන්න (Submit Paper)</span>
              </button>
            ) : (
                <button
                  onClick={handleRetry}
                  className={`flex items-center gap-1.5 min-h-[44px] px-3 py-2 ${subtleBg} ${isDark ? 'hover:bg-slate-850' : 'hover:bg-slate-200'} border ${subtleBdr} ${textMuted} ${isDark ? 'hover:text-white' : 'hover:text-slate-900'} rounded-xl text-xs font-semibold cursor-pointer transition-colors`}
                >
                  <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">නැවත කරන්න (Retry Test)</span>
                  <span className="sm:hidden">නැවත</span>
                </button>
            )}
          </div>

        </div>
      </div>

      {/* TAB SWITCHER — only shows when study material exists and session is live */}
      {paper.studyMaterialHtml && !isSubmitted && (
        <div className={`sticky top-[72px] z-30 ${headerBg} backdrop-blur-md border-b ${headerBdr} px-3 sm:px-4 md:px-8`}>
          <div className="max-w-6xl mx-auto flex gap-1 py-2">
            <button
              onClick={() => setActiveView('mcq')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeView === 'mcq'
                  ? 'bg-sky-500 text-white'
                  : `${textMuted} ${isDark ? 'hover:text-white hover:bg-slate-900' : 'hover:text-slate-900 hover:bg-white'}`
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              MCQ ප්‍රශ්න
            </button>
          </div>
        </div>
      )}
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
              <span className={`text-[10px] uppercase tracking-[0.25em] ${textMuted} font-mono font-bold mb-3`}>ඔබේ ලකුණු (YOUR SCORE)</span>
              
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
                    {scoreDetails.correctCount} / {totalQuestions} නිවැරදියි
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
                <span className="text-[10px] tracking-wider text-cyan-400 font-mono uppercase font-bold">දත්ත සාරාංශය (Stats breakdown)</span>
                <h3 className={`text-xl font-extrabold ${textPrimary} mt-1`}>විෂය ප්‍රශස්තකරණ වාර්තාව</h3>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <div className={`${isDark ? 'bg-slate-900/40 border-slate-800/40' : 'bg-emerald-50 border-emerald-100'} border rounded-xl p-3 flex flex-col`}>
                  <span className={`text-[10px] ${textMuted} font-medium`}>නිවැරදි පිළිතුරු</span>
                  <span className="text-xl font-bold text-emerald-400 font-mono mt-1 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    {scoreDetails.correctCount}
                  </span>
                </div>
                <div className={`${isDark ? 'bg-slate-900/40 border-slate-800/40' : 'bg-red-50 border-red-100'} border rounded-xl p-3 flex flex-col`}>
                  <span className={`text-[10px] ${textMuted} font-medium`}>වැරදි පිළිතුරු</span>
                  <span className="text-xl font-bold text-red-400 font-mono mt-1 flex items-center gap-1.5">
                    <XCircle className="w-4 h-4 text-red-400" />
                    {scoreDetails.incorrectCount}
                  </span>
                </div>
                <div className={`${isDark ? 'bg-slate-900/40 border-slate-800/40' : 'bg-slate-50 border-slate-200'} border rounded-xl p-3 flex flex-col`}>
                  <span className={`text-[10px] ${textMuted} font-medium`}>නොකළ ප්‍රශ්න</span>
                  <span className={`text-xl font-bold ${textMuted} font-mono mt-1 flex items-center gap-1.5`}>
                    <AlertCircle className={`w-4 h-4 ${textMuted}`} />
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
                    ? 'නියමයි! ඔබ සර්ථකව ශතකය සම්පූර්ණ කළා' 
                    : 'පහත ඇති විවරණ පරිශීලනයෙන් නිවැරදි සාක්ෂි උගන්වන්න'}
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
                  ප්‍රශ්න විවරණය සහ විවරණ සහිත පිළිතුරු
                </h3>
                <p className={`text-xs ${textMuted} mt-1`}>තනි තනි ප්‍රශ්න සඳහා හේතු සහිත නිවැරදි පිළිතුරු අධ්‍යයනය කරන්න</p>
              </div>

              {/* Selection dots for reviewing questions */}
              <div className="flex flex-wrap gap-1.5">
                {questions.map((q, idx) => {
                  const isCorrect = answers[q.id] === q.correctOption;
                  const isUnanswered = answers[q.id] === undefined;
                  
                  return (
                    <button
                      key={q.id}
                      onClick={() => setReviewQIndex(idx)}
                      className={`w-8 h-8 rounded-lg font-mono text-xs font-bold border transition-all cursor-pointer flex items-center justify-center ${
                        reviewQIndex === idx 
                          ? 'ring-2 ring-sky-500 border-sky-400' 
                          : ''
                      } ${
                        isUnanswered 
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
              const userAns = answers[rQ.id];
              const isCorrectAtReview = userAns === rQ.correctOption;
              
              return (
                <div className="space-y-6 animate-fade-in">
                  
                  {/* Status header inside reviewer */}
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${subtleBg} border ${subtleBdr} ${textMuted} px-2.5 py-1 rounded-lg font-mono font-bold`}>
                      QUESTION {rQ.qNumber}
                    </span>
                    {userAns === undefined ? (
                      <span className={`text-[11px] ${subtleBg} ${textMuted} border ${subtleBdr} px-2 py-0.5 rounded-md font-semibold`}>
                        නොකළ ප්‍රශ්නයකි
                      </span>
                    ) : isCorrectAtReview ? (
                      <span className="text-[11px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 px-2 py-0.5 rounded-md font-semibold flex items-center gap-1">
                        ✓ පිළිතුර නිවැරදියි (Correct)
                      </span>
                    ) : (
                      <span className="text-[11px] bg-red-500/15 text-red-405 border border-red-500/25 px-2 py-0.5 rounded-md font-semibold flex items-center gap-1">
                        ✗ පිළිතුර වැරදියි (Incorrect)
                      </span>
                    )}
                  </div>

                  {/* Question HTML Area */}
                  <div className={`${isDark ? 'bg-slate-900/35 border-slate-900' : 'bg-slate-50 border-slate-200'} border rounded-2xl p-5 text-[15px] leading-relaxed ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                    <div dangerouslySetInnerHTML={{ __html: rQ.questionHtml }} />
                  </div>

                  {/* MCQ Options with detailed highlighting */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {rQ.optionsHtml.map((opt, optIdx) => {
                      const isCorrectChoice = optIdx === rQ.correctOption;
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
                          <span className={textColor} dangerouslySetInnerHTML={{ __html: opt }} />
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
                        <h4 className="text-xs font-bold tracking-wider font-sans uppercase">ප්‍රශ්නයේ සත්‍ය විස්තරය සහ විවරණය (Explaining Steps)</h4>
                      </div>
                      <div 
                        className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'} leading-relaxed font-sans`}
                        dangerouslySetInnerHTML={{ __html: rQ.explanationHtml }}
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
              <span className="sm:hidden">ප්‍රධාන පිටුවට</span>
              <span className="hidden sm:inline">ප්‍රධාන පිටුවට (Exit review &amp; Back to Subjects)</span>
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
                <h3 className={`text-sm font-bold ${textPrimary}`}>{paper.sinhalaTitle} — අධ්‍යයන ද්‍රව්‍ය</h3>
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
          <div className="lg:col-span-4 order-1 lg:order-2 space-y-4 sm:space-y-6">
            
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
                ප්‍රශ්න සිතියම
              </h3>

              <div className="grid grid-cols-6 sm:grid-cols-5 gap-1.5 sm:gap-2.5">
                {questions.map((q, idx) => {
                  const isCurrent = currentQIndex === idx;
                  const isAnswered = answers[q.id] !== undefined;
                  const isFlagged = flaggedQuestions[q.id];
                  const isVerified = verifiedAnswers[q.id] !== undefined;
                  const isCorrect = verifiedAnswers[q.id] === true;

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
                      className={`min-h-[40px] sm:min-h-[44px] rounded-lg sm:rounded-xl font-mono text-xs font-bold border transition-all cursor-pointer flex items-center justify-center ${borderStyle} ${
                        isCurrent ? `ring-2 ring-sky-500 ring-offset-2 ${isDark ? 'ring-offset-slate-950' : 'ring-offset-white'}` : ''
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
                    <span>නිවැරදියි (Correct)</span>
                    <span className="w-2.5 h-2.5 bg-red-500/20 border border-red-500/50 rounded-md ml-2" />
                    <span>වැරදියි (Incorrect)</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 bg-sky-500/10 border border-sky-500/20 rounded-md" />
                  <span>පිළිතුරු සපයන ලද (Answered)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 bg-amber-500/5 border border-amber-500/40 rounded-md animate-pulse" />
                  <span>සමාලෝචනයට වෙන්කළ (Flagged for Review)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 ${isDark ? 'bg-slate-950 border-slate-850' : 'bg-slate-50 border-slate-200'} rounded-md`} />
                  <span>පිළිතුරු නොදුන් (Unanswered)</span>
                </div>
              </div>
            </div>

            <div className={`hidden lg:block ${ghostBg} border ${ghostBdr} rounded-3xl p-5 text-xs ${textMuted} space-y-2 leading-relaxed`}>
              <span className={`font-extrabold ${isDark ? 'text-slate-350' : 'text-slate-600'} text-xs block mb-1`}>💡 විභාග උපදෙස් (Exam tips)</span>
              <p>උසස් පෙළ සහ සාමාන්‍ය පෙළ MCQ විභාගවලදී එක් ප්‍රශ්නයක් සඳහා සාමාන්‍යයෙන් සාධාරණ කාලය මිනිත්තු 2-3ක් පමණ වේ.</p>
            </div>

          </div>

          {/* Main Question Panel (Col-8) */}
          <div className="lg:col-span-8 order-2 lg:order-1 space-y-4 sm:space-y-6">
            
            {/* Nav metadata */}
            <div className="flex items-center justify-between">
              <span className={`text-xs ${subtleBg} border ${subtleBdr} ${textMuted} px-2.5 py-1 rounded-xl font-mono tracking-wide font-bold`}>
                මට්ටම {currentQIndex + 1} / {totalQuestions}
              </span>

              <button
                onClick={toggleFlag}
                className={`flex items-center gap-1 min-h-[44px] px-3 py-2 rounded-lg border text-xs font-semibold select-none cursor-pointer transition-all ${
                  flaggedQuestions[activeQuestion.qNumber]
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-450'
                    : `${subtleBg} ${subtleBdr} ${textMuted} ${isDark ? 'hover:text-white' : 'hover:text-slate-900'}`
                }`}
              >
                <Flag className="w-3.5 h-3.5 shrink-0" />
                {flaggedQuestions[activeQuestion.qNumber] ? (
                  <>
                    <span className="sm:hidden">ලකුණු කළ</span>
                    <span className="hidden sm:inline">සමාලෝචනයට ලකුණු කර ඇත</span>
                  </>
                ) : (
                  <>
                    <span className="sm:hidden">ලකුණු කරන්න</span>
                    <span className="hidden sm:inline">සමාලෝචනය සඳහා ලකුණු කරන්න</span>
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
                <div dangerouslySetInnerHTML={{ __html: activeQuestion.questionHtml }} />
              </div>
            </div>

            {/* Answer Options cards - grid styled to match sketches */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {activeQuestion.optionsHtml.map((option, optIdx) => {
                const isSelected = answers[activeQuestion.id] === optIdx;
                const isVerified = verifiedAnswers[activeQuestion.id] !== undefined;
                const isCorrectAnswer = activeQuestion.correctOption === optIdx;

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
                    onClick={() => {
                      if (!isVerified || examMode !== 'practice') {
                        handleSelectOption(optIdx);
                      }
                    }}
                    disabled={isVerified && examMode === 'practice'}
                    className={`w-full text-left min-h-[52px] p-4 md:p-5 rounded-2xl border transition-all duration-200 cursor-pointer flex items-center gap-3 sm:gap-4 ${isVerified && examMode === 'practice' ? '' : 'active:scale-[0.99]'} ${cardStyle}`}
                  >
                    {/* Glowing A/B/C/D key labels */}
                    <span className={`w-9 h-9 sm:w-8 sm:h-8 shrink-0 rounded-lg font-mono text-sm font-bold flex items-center justify-center transition-all ${badgeStyle}`}>
                      {String.fromCharCode(65 + optIdx)}
                    </span>
                    <span className="text-[13px] md:text-[14px] leading-snug" dangerouslySetInnerHTML={{ __html: option }} />
                  </button>
                );
              })}
            </div>

            {/* Practice Mode Check Button & Explanation */}
            {examMode === 'practice' && (
              <div className="pt-2 animate-fade-in">
                {verifiedAnswers[activeQuestion.id] === undefined ? (
                  <button 
                    onClick={() => handleCheckAnswer(activeQuestion.id, activeQuestion.correctOption)}
                    className="w-full sm:w-auto px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.25)] transition-all active:scale-[0.98] cursor-pointer"
                  >
                    Check Answer
                  </button>
                ) : (
                  <div className={`p-5 rounded-2xl border ${verifiedAnswers[activeQuestion.id] ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                    <h4 className={`font-bold mb-3 flex items-center gap-2 ${verifiedAnswers[activeQuestion.id] ? 'text-emerald-500' : 'text-red-500'}`}>
                      {verifiedAnswers[activeQuestion.id] ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                      {verifiedAnswers[activeQuestion.id] ? 'නිවැරදියි! (Correct!)' : 'වැරදියි! (Incorrect.)'}
                    </h4>
                    {activeQuestion.explanationHtml && (
                      <div className={`mt-3 pt-4 border-t ${verifiedAnswers[activeQuestion.id] ? 'border-emerald-500/20' : 'border-red-500/20'}`}>
                        <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>විවරණය (Explanation)</p>
                        <div 
                          className={`text-sm leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}
                          dangerouslySetInnerHTML={{ __html: activeQuestion.explanationHtml }} 
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Bottom Controls */}
            <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t ${dividerBdr}`}>
              <button
                type="button"
                onClick={clearAnswer}
                disabled={answers[activeQuestion.id] === undefined}
                className={`min-h-[44px] px-3.5 py-2 ${subtleBg} ${isDark ? 'hover:bg-slate-850' : 'hover:bg-slate-200'} border ${subtleBdr} disabled:opacity-30 disabled:pointer-events-none ${textMuted} ${isDark ? 'hover:text-white' : 'hover:text-slate-900'} rounded-lg text-xs font-semibold tracking-wider transition-colors cursor-pointer`}
              >
                පිළිතුර මකන්න (Clear)
              </button>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={handlePrev}
                  disabled={currentQIndex === 0}
                  className={`min-h-[44px] px-4 py-2 ${surfaceBg} ${isDark ? 'hover:bg-slate-900 border-slate-900' : 'hover:bg-slate-100 border-slate-200'} border disabled:opacity-20 disabled:pointer-events-none ${isDark ? 'text-slate-300' : 'text-slate-600'} rounded-xl text-xs font-bold font-sans flex items-center justify-center gap-1 cursor-pointer`}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  පෙර (Prev)
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={currentQIndex === totalQuestions - 1}
                  className={`min-h-[44px] px-4 py-2 ${surfaceBg} ${isDark ? 'hover:bg-slate-900 border-slate-900' : 'hover:bg-slate-100 border-slate-200'} border disabled:opacity-20 disabled:pointer-events-none ${isDark ? 'text-slate-300' : 'text-slate-600'} rounded-xl text-xs font-bold font-sans flex items-center justify-center gap-1 cursor-pointer`}
                >
                  ඊළඟ (Next)
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