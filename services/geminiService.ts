import { GoogleGenAI, GenerateContentResponse, Chat } from "@google/genai";
import { GEMINI_SYSTEM_INSTRUCTION } from '../utils/constants';

let aiInstance: GoogleGenAI | null = null;

const getAI = (): GoogleGenAI => {
  if (!aiInstance) {
    // In a real scenario, we might want to prompt for key if missing, 
    // but per instructions we assume process.env.API_KEY is available.
    // If not, we'll initialize with a dummy to prevent crashes until the user provides one (though prompt says don't ask user).
    // The prompt explicitly says: "Assume this variable is pre-configured".
    aiInstance = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  }
  return aiInstance;
};

export const generatePlan = async (currentContent: string): Promise<string> => {
  const ai = getAI();
  const prompt = `
    Here is my current productivity text file:
    
    \`\`\`text
    ${currentContent}
    \`\`\`
    
    Please analyze the [BACKLOG] and [DOING] sections. 
    1. Move high-priority sounding items from Backlog to Doing if Doing is empty or light.
    2. Sort [EVENTS] chronologically if they have times.
    3. Ensure the formatting is consistent.
    
    Return ONLY the full updated text content. Do not wrap in markdown code blocks.
  `;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: GEMINI_SYSTEM_INSTRUCTION,
      }
    });
    return response.text?.trim() || currentContent;
  } catch (error) {
    console.error("Gemini Plan Error:", error);
    throw error;
  }
};

export const summarizeProgress = async (currentContent: string): Promise<string> => {
  const ai = getAI();
  const prompt = `
    Here is my current productivity text file:
    
    \`\`\`text
    ${currentContent}
    \`\`\`
    
    Look at the [DONE] section. Write a short, encouraging summary of what has been accomplished. 
    Also, identify if there are any overdue items or [EVENTS] that might have been missed based on the current date.
  `;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: "You are a helpful and motivating productivity coach.",
      }
    });
    return response.text || "Could not generate summary.";
  } catch (error) {
    console.error("Gemini Summary Error:", error);
    throw error;
  }
};

export const createChatSession = (): Chat => {
  const ai = getAI();
  return ai.chats.create({
    model: 'gemini-2.5-flash',
    config: {
      systemInstruction: GEMINI_SYSTEM_INSTRUCTION,
    }
  });
};
