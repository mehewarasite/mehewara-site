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
    color: 'from-emerald-600 via-teal-700 to-teal-900 border-emerald-500/30 shadow-[0_4px_20px_rgba(16,185,129,0.15)]'
  },
  {
    id: 'ol-maths',
    name: 'Mathematics',
    sinhalaName: 'ගණිතය',
    examType: 'ol',
    code: 'Maths',
    icon: 'Infinity',
    color: 'from-indigo-600 via-violet-700 to-purple-900 border-indigo-500/30 shadow-[0_4px_20px_rgba(99,102,241,0.15)]'
  },
  {
    id: 'ol-sinhala',
    name: 'Sinhala Language',
    sinhalaName: 'සිංහල භාෂාව',
    examType: 'ol',
    code: 'Sinhala',
    icon: 'BookOpen',
    color: 'from-amber-600 via-orange-600 to-red-800 border-orange-500/30 shadow-[0_4px_20px_rgba(249,115,22,0.15)]'
  },
  {
    id: 'ol-history',
    name: 'History',
    sinhalaName: 'ඉතිහාසය',
    examType: 'ol',
    code: 'Hist',
    icon: 'Compass',
    color: 'from-amber-700 via-amber-800 to-stone-900 border-amber-600/30 shadow-[0_4px_20px_rgba(217,119,6,0.15)]'
  },
  {
    id: 'ol-ict',
    name: 'ICT',
    sinhalaName: 'තොරතුරු තාක්ෂණය',
    examType: 'ol',
    code: 'ICT',
    icon: 'Cpu',
    color: 'from-purple-600 via-fuchsia-700 to-indigo-900 border-purple-500/30 shadow-[0_4px_20px_rgba(168,85,247,0.15)]'
  },
  {
    id: 'ol-civic',
    name: 'Civic Education',
    sinhalaName: 'පුරවැසි අධ්‍යාපනය',
    examType: 'ol',
    code: 'Civic',
    icon: 'Landmark',
    color: 'from-pink-600 via-rose-700 to-purple-950 border-rose-500/30 shadow-[0_4px_20px_rgba(244,63,94,0.15)]'
  }
];

export const INITIAL_PAPERS: Paper[] = [];

export const INITIAL_QUESTIONS: Question[] = [];