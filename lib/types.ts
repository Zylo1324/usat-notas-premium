export type GradeItem = {
  key: string;
  unit: string;
  unitTitle: string;
  label: string;
  weight: number;
  grade: number | null;
  pending: boolean;
  kind: string;
};

export type CourseState = {
  name: string;
  formula: string;
  capturedAt: string;
  passing: number;
  now: number;
  max: number;
  pendingWeight: number;
  averageRequired: number | null;
  items: GradeItem[];
};

export type AppState = {
  passing: number;
  semester: string;
  gradesPath: string;
  syllabusDir: string;
  syllabusCount: number;
  syllabusFiles: string[];
  courses: CourseState[];
};

export type DesktopApi = {
  updateCampus: (credentials: { user: string; password: string }) => Promise<{
    ok: boolean;
    state?: AppState;
    message?: string;
  }>;
  closeApp: () => Promise<void>;
  exportSummary: (payload: { fileName: string; text: string }) => Promise<{ ok: boolean; filePath?: string; message?: string }>;
};

declare global {
  interface Window {
    usatDesktop?: DesktopApi;
  }
}
