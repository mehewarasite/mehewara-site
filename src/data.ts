import { Subject, Paper, Question } from './types';

export const INITIAL_SUBJECTS: Subject[] = [
  // A/L Subjects
  {
    id: 'al-physics',
    name: 'Physics',
    sinhalaName: 'භෞතික විද්‍යාව',
    examType: 'al',
    code: 'Phy',
    icon: 'Atom',
    color: 'from-amber-650 to-orange-700 bg-amber-500/10 border-amber-500/30 text-amber-450 hover:bg-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.05)]'
  },
  {
    id: 'al-chemistry',
    name: 'Chemistry',
    sinhalaName: 'රසායනික විද්‍යාව',
    examType: 'al',
    code: 'Chem',
    icon: 'FlaskConical',
    color: 'from-cyan-650 to-blue-700 bg-cyan-500/10 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.05)]'
  },
  {
    id: 'al-biology',
    name: 'Biology',
    sinhalaName: 'ජීව විද්‍යාව',
    examType: 'al',
    code: 'Bio',
    icon: 'Dna',
    color: 'from-emerald-650 to-teal-700 bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]'
  },
  {
    id: 'al-combined-maths',
    name: 'Combined Mathematics',
    sinhalaName: 'සංයුක්ත ගණිතය',
    examType: 'al',
    code: 'CMaths',
    icon: 'Calculator',
    color: 'from-rose-650 to-red-700 bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.05)]'
  },
  {
    id: 'al-ict',
    name: 'ICT',
    sinhalaName: 'තොරතුරු තාක්ෂණය',
    examType: 'al',
    code: 'ICT',
    icon: 'Cpu',
    color: 'from-purple-650 to-fuchsia-700 bg-purple-500/10 border-purple-500/30 text-purple-400 hover:bg-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.05)]'
  },

  // O/L Subjects
  {
    id: 'ol-science',
    name: 'Science',
    sinhalaName: 'විද්‍යාව',
    examType: 'ol',
    code: 'Sci',
    icon: 'Lightbulb',
    color: 'from-emerald-650 to-teal-700 bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]'
  },
  {
    id: 'ol-maths',
    name: 'Mathematics',
    sinhalaName: 'ගණිතය',
    examType: 'ol',
    code: 'Maths',
    icon: 'Infinity',
    color: 'from-indigo-650 to-violet-700 bg-indigo-500/10 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.05)]'
  },
  {
    id: 'ol-sinhala',
    name: 'Sinhala Language',
    sinhalaName: 'සිංහල භාෂාව',
    examType: 'ol',
    code: 'Sinhala',
    icon: 'BookOpen',
    color: 'from-orange-600 to-red-650 bg-red-500/10 border-red-500/30 text-orange-400 hover:bg-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.05)]'
  },
  {
    id: 'ol-history',
    name: 'History',
    sinhalaName: 'ඉතිහාසය',
    examType: 'ol',
    code: 'Hist',
    icon: 'Compass',
    color: 'from-bronze-650 to-amber-800 bg-amber-600/10 border-amber-600/30 text-amber-550 hover:bg-amber-600/20 shadow-[0_0_15px_rgba(217,119,6,0.05)]'
  }
];

export const INITIAL_PAPERS: Paper[] = [];

export const INITIAL_QUESTIONS: Question[] = [];