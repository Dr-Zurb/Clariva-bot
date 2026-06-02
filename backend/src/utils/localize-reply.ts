/**
 * Language mirroring helper: translates a template English string into
 * the patient's language using the LLM. For structured data (prices,
 * dates, URLs), the template uses {{placeholders}} that are preserved
 * as-is in the output.
 *
 * Falls back to the original English template on LLM failure.
 */

import { logger } from '../config/logger';

let _getOpenAIClient: (() => import('openai').default | null) | undefined;
let _getOpenAIConfig: (() => { model: string }) | undefined;

async function ensureImports() {
  if (!_getOpenAIClient) {
    const mod = await import('../services/ai-service');
    _getOpenAIClient = (mod as unknown as { getOpenAIClient: () => import('openai').default | null }).getOpenAIClient;
    _getOpenAIConfig = (mod as unknown as { getOpenAIConfig: () => { model: string } }).getOpenAIConfig;
  }
}

/**
 * Detect the likely language of patient text (simple heuristic).
 * Returns ISO 639-1 code hint for the LLM.
 */
export function detectPatientLanguageHint(text: string): string {
  if (/[\u0900-\u097F]/.test(text)) return 'hi';
  if (/[\u0A00-\u0A7F]/.test(text)) return 'pa';
  if (/[\u0980-\u09FF]/.test(text)) return 'bn';
  if (/[\u0B80-\u0BFF]/.test(text)) return 'ta';
  if (/[\u0C00-\u0C7F]/.test(text)) return 'te';
  if (/[\u0D00-\u0D7F]/.test(text)) return 'ml';
  if (/[\u0C80-\u0CFF]/.test(text)) return 'kn';
  if (/[\u0B00-\u0B7F]/.test(text)) return 'or';
  if (/[\u0600-\u06FF]/.test(text)) return 'ur';
  // Roman Hindi heuristic
  if (/\b(kya|kaise|mujhe|kitna|kitni|kitne|chahiye|appointment|doctor|book)\b/i.test(text) &&
      /\b(hai|hain|ka|ki|ke|se|mein|ko)\b/i.test(text)) return 'hi-Latn';
  return 'en';
}

/**
 * Localize a template English message to the patient's language.
 * @param englishTemplate - The message in English (may contain {{var}} placeholders)
 * @param variables - Key-value map for placeholder substitution (injected after LLM)
 * @param patientLanguageHint - ISO 639-1 or 'hi-Latn' for romanized Hindi
 * @param correlationId - For logging
 */
export async function localizeReply(
  englishTemplate: string,
  variables: Record<string, string>,
  patientLanguageHint: string,
  correlationId: string
): Promise<string> {
  // Substitute variables first for the English fallback.
  let fallback = englishTemplate;
  for (const [k, v] of Object.entries(variables)) {
    fallback = fallback.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
  }

  if (patientLanguageHint === 'en') return fallback;

  try {
    await ensureImports();
    const client = _getOpenAIClient?.();
    const config = _getOpenAIConfig?.();
    if (!client || !config) return fallback;

    const systemPrompt =
      `You are a clinic assistant localization engine. Translate the following message into the patient's language (${patientLanguageHint}). ` +
      `Keep all {{placeholders}}, markdown formatting (**bold**, URLs, ₹ amounts), and proper nouns exactly as-is. ` +
      `Output ONLY the translated message, nothing else.`;

    const resp = await client.chat.completions.create({
      model: config.model,
      temperature: 0.3,
      max_tokens: 500,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: englishTemplate },
      ],
    });

    let translated = resp.choices?.[0]?.message?.content?.trim() ?? '';
    if (!translated) return fallback;

    // Substitute variables into translated text.
    for (const [k, v] of Object.entries(variables)) {
      translated = translated.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
    }
    return translated;
  } catch (err) {
    logger.warn({ err, correlationId }, 'localizeReply LLM call failed; using English fallback');
    return fallback;
  }
}
