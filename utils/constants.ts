// Helper to get today's date in YYYY-MM-DD format
const getTodayString = () => new Date().toISOString().split('T')[0];

export const INITIAL_TEMPLATE = `${getTodayString()}
========================================
[EVENTS]
10:00 AM - Team Standup
02:00 PM - Deep Work Session

[DOING]
- Implement the new dashboard layout
- Review PR #42 for data fetching

[DONE]
x Set up the project repository
x Configure Tailwind CSS
x Initialize TypeScript types

[NOTES]
* Remember to drink water
* Idea: Use local storage for persistence
`;

export const GEMINI_SYSTEM_INSTRUCTION = `You are an expert productivity assistant integrated into a minimalist text-file based task manager. 
The user manages their life in a single text file with sections organized by Date headers (YYYY-MM-DD).
Within each date, there are sections like [EVENTS], [DOING], [DONE].
Your goal is to help them organize, prioritize, and query this text file.
Always be concise. Match the user's existing formatting style.
When asked to modify the file, return the FULL updated file content unless specified otherwise.
`;