import { Subject, Paper, Question } from './types';

export const INITIAL_SUBJECTS: Subject[] = [
  // A/L Subjects
  {
    id: 'aa2aabf6-65f9-51d0-a993-4d385208c245',
    name: 'Physics',
    sinhalaName: 'භෞතික විද්‍යාව',
    examType: 'al',
    code: 'al-phy',
    icon: 'Atom',
    color: 'from-amber-650 to-orange-700 bg-amber-500/10 border-amber-500/30 text-amber-450 hover:bg-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.05)]'
  },
  {
    id: '9115cadf-011b-508a-ba48-6ced5cb75a05',
    name: 'Chemistry',
    sinhalaName: 'රසායනික විද්‍යාව',
    examType: 'al',
    code: 'al-chem',
    icon: 'FlaskConical',
    color: 'from-cyan-650 to-blue-700 bg-cyan-500/10 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.05)]'
  },
  {
    id: 'cf2019b1-4121-5f26-866c-dc2e992e8244',
    name: 'Biology',
    sinhalaName: 'ජීව විද්‍යාව',
    examType: 'al',
    code: 'al-bio',
    icon: 'Dna',
    color: 'from-emerald-650 to-teal-700 bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]'
  },
  {
    id: '5329a153-b09c-597e-9e30-37f4f0339213',
    name: 'Combined Mathematics',
    sinhalaName: 'සංයුක්ත ගණිතය',
    examType: 'al',
    code: 'al-cmaths',
    icon: 'Calculator',
    color: 'from-blue-650 to-indigo-700 bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.05)]'
  },
  {
    id: '1128871a-03d8-5251-bca3-d8b476d56e89',
    name: 'ICT',
    sinhalaName: 'තොරතුරු තාක්ෂණය',
    examType: 'al',
    code: 'al-ict',
    icon: 'Cpu',
    color: 'from-purple-650 to-fuchsia-700 bg-purple-500/10 border-purple-500/30 text-purple-400 hover:bg-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.05)]'
  },
  {
    id: 'edfa8733-a1c6-4b44-826a-3641209e6d7d',
    name: 'Science',
    sinhalaName: 'විද්‍යාව',
    examType: 'al',
    code: 'science',
    icon: 'BookOpen',
    color: 'from-teal-650 to-emerald-700 bg-teal-500/10 border-teal-500/30 text-teal-400 hover:bg-teal-500/20 shadow-[0_0_15px_rgba(20,184,166,0.05)]'
  },

  // O/L Subjects
  {
    id: '2d525961-5e47-517a-9afe-27525e46dbb8',
    name: 'Science',
    sinhalaName: 'විද්‍යාව',
    examType: 'ol',
    code: 'ol-sci',
    icon: 'Lightbulb',
    color: 'from-emerald-600 via-teal-700 to-teal-900 border-emerald-500/30 shadow-[0_4px_20px_rgba(16,185,129,0.15)]'
  },
  {
    id: 'd61493fa-a854-53fd-83e8-57e99c85aad5',
    name: 'Mathematics',
    sinhalaName: 'ගණිතය',
    examType: 'ol',
    code: 'ol-maths',
    icon: 'Infinity',
    color: 'from-indigo-600 via-violet-700 to-purple-900 border-indigo-500/30 shadow-[0_4px_20px_rgba(99,102,241,0.15)]'
  },
  {
    id: 'c3d9ea08-548a-5b9f-b434-ce6e8eb7bc31',
    name: 'Sinhala Language',
    sinhalaName: 'සිංහල භාෂාව',
    examType: 'ol',
    code: 'ol-sinhala',
    icon: 'BookOpen',
    color: 'from-amber-600 via-orange-600 to-red-800 border-orange-500/30 shadow-[0_4px_20px_rgba(249,115,22,0.15)]'
  },
  {
    id: '19e7a0fe-dc35-5d85-be49-83fc260f6b36',
    name: 'History',
    sinhalaName: 'ඉතිහාසය',
    examType: 'ol',
    code: 'ol-hist',
    icon: 'Compass',
    color: 'from-amber-700 via-amber-800 to-stone-900 border-amber-600/30 shadow-[0_4px_20px_rgba(217,119,6,0.15)]'
  },
  {
    id: 'ff68db84-2003-597e-9ac1-df665344a348',
    name: 'ICT',
    sinhalaName: 'තොරතුරු තාක්ෂණය',
    examType: 'ol',
    code: 'ol-ict',
    icon: 'Cpu',
    color: 'from-purple-600 via-fuchsia-700 to-indigo-900 border-purple-500/30 shadow-[0_4px_20px_rgba(168,85,247,0.15)]'
  },
  {
    id: '655b9d9a-f257-5574-8d14-24546b8152f7',
    name: 'Civic Education',
    sinhalaName: 'පුරවැසි අධ්‍යාපනය',
    examType: 'ol',
    code: 'ol-civic',
    icon: 'Landmark',
    color: 'from-pink-600 via-rose-700 to-purple-950 border-rose-500/30 shadow-[0_4px_20px_rgba(244,63,94,0.15)]'
  }
];

export const INITIAL_PAPERS: Paper[] = [];

export const INITIAL_QUESTIONS: Question[] = [];