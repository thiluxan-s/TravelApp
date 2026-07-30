import { buildClassifierSystemPrompt } from '@/lib/ai/booking-types';

export const classifierSystemPrompt = buildClassifierSystemPrompt();

export function classifierUserPrompt(fileName: string): string {
  return `Please classify this booking document: ${fileName}`;
}
