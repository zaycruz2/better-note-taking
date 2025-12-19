export enum ViewMode {
  EDITOR = 'EDITOR',
  SPLIT = 'SPLIT',
  PREVIEW = 'PREVIEW'
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface GeminiConfig {
  apiKey: string;
}

export enum SectionType {
  EVENTS = 'EVENTS',
  DOING = 'DOING',
  DONE = 'DONE',
  NOTES = 'NOTES',
  UNKNOWN = 'UNKNOWN'
}

export interface ParsedItem {
  text: string;
  raw: string;
  children: ParsedItem[];
  isCompleted: boolean;
}

export interface ParsedSection {
  type: SectionType;
  title: string;
  items: ParsedItem[];
}

export interface ParsedDay {
  date: string;
  sections: ParsedSection[];
  startIndex: number; // For scrolling
}

// ===== Projects =====

export type ProjectStatus = 'active' | 'shipped' | 'paused' | 'killed';

export interface ProjectRecord {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  blocking_or_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
