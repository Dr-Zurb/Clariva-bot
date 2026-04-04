/**
 * e-task-dm-03: Per-inbound DM turn — assemble thread-derived inputs once for fee narrowing,
 * classification memory, and future consumers. No logging of patient text here.
 */

import { redactPhiForAI } from '../services/ai-service';
import type { ConversationState } from '../types/conversation';
import { isRecentMedicalDeflectionWindow } from '../types/conversation';
import { shouldOmitPatientLineFromFeeCatalogMatchContent } from './reason-first-triage';

export interface DmTurnContext {
  /** Redacted patient lines + current message for teleconsult fee catalog narrowing. */
  feeCatalogMatchText: string | undefined;
  /** Active routing memory from last idle medical deflection (timestamp in state). */
  recentMedicalDeflection: boolean;
}

type RecentDmMessage = { sender_type: string; content: string };

/**
 * Concatenate recent patient content + current line, redacted — feeds fee/matcher narrowing (e-task-dm-02/03).
 */
export function buildFeeCatalogMatchText(text: string, recentMessages: RecentDmMessage[]): string | undefined {
  const lines: string[] = [];
  for (const m of recentMessages) {
    if (m.sender_type !== 'patient') continue;
    const c = typeof m.content === 'string' ? m.content.trim() : '';
    if (c && !shouldOmitPatientLineFromFeeCatalogMatchContent(c)) lines.push(c);
  }
  const t = text.trim();
  if (
    t &&
    !shouldOmitPatientLineFromFeeCatalogMatchContent(t) &&
    lines[lines.length - 1] !== t &&
    !lines.includes(t)
  ) {
    lines.push(t);
  }
  const raw = lines.join('\n').trim();
  if (raw.length < 2) return undefined;
  return redactPhiForAI(raw);
}

export function buildDmTurnContext(
  text: string,
  recentMessages: RecentDmMessage[],
  state: ConversationState
): DmTurnContext {
  return {
    feeCatalogMatchText: buildFeeCatalogMatchText(text, recentMessages),
    recentMedicalDeflection: isRecentMedicalDeflectionWindow(state),
  };
}
