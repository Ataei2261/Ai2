
export interface FestivalSourceFile {
  name: string;      // Original name of the file
  dataUrl: string;   // base64 data URL of the file
  type: string;      // MIME type of the file
}

export interface FestivalImageAnalysis {
  id: string; // UUID for this analysis entry
  sourceImageName: string;
  sourceImageType: string;
  sourceImageDataUrl: string; // base64 data URL of the uploaded image for display
  userDescription?: string; // Optional user-provided description for the image

  geminiAnalysisText?: string;
  geminiScore?: number; // e.g., 0-10
  geminiScoreReasoning?: string;
  editingCritiqueAndSuggestions?: string; // Detailed editing critique for high-scoring images

  isAnalyzingImage?: boolean;
  imageAnalysisError?: string;
}

export interface FestivalInfo {
  id: string; // UUID
  fileName: string; // Display name, could be "image1.jpg (+2 more)" for multi-image, or URL for URL source
  fileType: string; // 'application/pdf', 'image/jpeg', 'image/png', 'text/plain', 'image/multiple', 'url/extracted_info'
  filePreview?: 'pdf' | 'text_input' | 'url_source' | string; // base64 data URL for images, or type identifiers

  sourceDataUrl?: string; // For PDF/single image, this is its data URL. For URL source, this is the input URL.
  sourceFiles?: FestivalSourceFile[]; // For multi-image uploads

  festivalName?: string;
  topics?: string[];
  objectives?: string;
  maxPhotos?: string | number;
  submissionDeadlineGregorian?: string;
  submissionDeadlinePersian?: string;
  imageSize?: string;
  submissionMethod?: string;

  // New fields for fee information
  feeStatusFree?: boolean;
  feeStatusPaid?: boolean;
  feeDescription?: string; // e.g., "Free", "$20 per entry", "First entry free, $10 for additional"

  extractedText?: string; // Text extracted from PDF/image, or a note for URL source
  extractionSourceUrls?: { uri: string; title: string }[];

  // Fields for Smart Analysis
  userNotesForSmartAnalysis?: string; // User-provided notes to help with smart analysis
  smartAnalysis?: string;
  analysisSourceUrls?: { uri: string; title: string }[];
  isAnalyzing?: boolean;
  analysisError?: string;

  // New fields for individual image analysis against festival criteria
  analyzedFestivalImages?: FestivalImageAnalysis[];
  isAnalyzingFestivalImages?: boolean; // Overall status for the batch analysis of user's images

  hasSubmitted?: boolean; // New field to track if submitted to the festival

  // UI state, not persisted typically unless for drafts
  isProcessing?: boolean; // For initial file processing
  error?: string; // For initial file processing errors
}

export interface ExtractedData {
  festivalName?: string;
  topics?: string[];
  objectives?: string;
  maxPhotos?: string | number;
  submissionDeadlineGregorian?: string;
  submissionDeadlinePersian?: string;
  imageSize?: string;
  submissionMethod?: string;
  extractionSourceUrls?: { uri: string; title: string }[];
  // New fields for fee information
  feeStatusFree?: boolean;
  feeStatusPaid?: boolean;
  feeDescription?: string;
}

// For jalaali-js conversions
export interface JalaliDate {
  jy: number;
  jm: number;
  jd: number;
}

export interface GregorianDate {
  gy: number;
  gm: number;
  gd: number;
}

// Authentication Types
export interface ActiveSession {
  isAuthenticated: boolean;
  userIdentifier?: string;
  sessionStartedAt?: number; // Fallback client-side session start time (less relevant with activation tokens)
  sessionExpiresAt?: number; // Key's original expiry from server (less relevant now)
  activationToken?: string; // New: Token received after successful activation
  activationTokenExpiresAt?: number; // New: Timestamp for when the activationToken expires
  role?: 'admin' | 'viewer';
}

export interface AuthContextType {
  activeSession: ActiveSession;
  login: (password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  authError: string | null;
}


// Backup Structure Types
export interface AppBackup {
  festivals: FestivalInfo[];
}
