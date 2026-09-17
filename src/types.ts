export type ExamType = 'ol' | 'al';

export interface Subject {
  id: string;
  name: string;      // e.g. "Physics" / "භෞතික විද්‍යාව"
  sinhalaName: string;
  examType: ExamType;
  code: string;       // e.g. "phy", "chem", "science"
  icon: string;       // lucide icon name
  color: string;      // tailwind class e.g. "from-blue-600 to-indigo-700"
}

export interface Paper {
  id: string;
  subjectId: string;
  examType: ExamType;
  title: string;      // e.g. "2024 A/L Physics MCQ"
  sinhalaTitle: string;
  year: number;
  durationMinutes: number;
  questionCount: number;
  studyMaterialHtml?: string; // Themed HTML content uploaded by admin
  language?: 'si' | 'en';     // Paper language
  hidden?: boolean;           // Whether paper is hidden from students
  state?: 'draft' | 'published' | 'archived'; // Lifecycle publishing state
}

export interface Question {
  id: string;
  paperId: string;
  qNumber: number;    // e.g. 1
  questionHtml: string; // The HTML format questions, supports formatting & subscripts/superscripts/symbols
  optionsHtml: [string, string, string, string] | [string, string, string, string, string];
  correctOption: 0 | 1 | 2 | 3 | 4; // Index of correct option (A=0, B=1, C=2, D=3)
  correctOptions?: number[]; // Array of correct option indices
  isAllCorrect?: boolean; // If true, all options are considered correct
  explanationHtml?: string; // Optional explanation/working
}

export interface UserAttempt {
  paperId: string;
  startedAt: number;
  completedAt?: number;
  answers: { [questionId: string]: number }; // Maps question id to selected option index (0-3)
  isCompleted: boolean;
  correctCount?: number;
  totalCount?: number;
}

export interface GalleryPhoto {
  id: string;
  title?: string;
  description?: string;
  imageHex: string;    // Image bytes encoded as a lowercase hex string (e.g. "ffd8ffе0...")
  mimeType: string;   // e.g. "image/jpeg", "image/png", "image/webp"
  sortOrder: number;
  createdAt: string;  // ISO timestamp
  pinned?: boolean;
}

export interface AboutData {
  description?: string;
  image_url?: string;
  facebook_link?: string;
  youtube_link?: string;
  linkedin_link?: string;
  privacy_policy_statement?: string;
  full_privacy_policy_html?: string;
}