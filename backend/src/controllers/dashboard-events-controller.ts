/**
 * Dashboard Events Controller (Plan 07 · Task 30).
 *
 * Two endpoints back the doctor dashboard event feed:
 *
 *   - `GET  /api/v1/dashboard/events`              — list events (paginated).
 *   - `POST /api/v1/dashboard/events/:eventId/acknowledge` — mark read.
 *
 * Auth is the standard `authenticateToken` middleware (doctor's
 * Supabase session). The doctor's `req.user.id` is the only thing the
 * service helpers see — they NEVER trust a `doctor_id` from the
 * request body / params.
 *
 * @see backend/src/services/dashboard-events-service.ts
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-30-mutual-replay-notifications.md
 */

import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { UnauthorizedError, ValidationError } from '../utils/errors';
import {
  getDashboardEventsForDoctor,
  markDashboardEventAcknowledged,
  type DashboardEvent,
} from '../services/dashboard-events-service';

interface DashboardEventDto {
  id:              string;
  eventKind:       string;
  sessionId:       string | null;
  payload:         Record<string, unknown>;
  acknowledgedAt:  string | null;
  createdAt:       string;
}

function toDto(event: DashboardEvent): DashboardEventDto {
  return {
    id:              event.id,
    eventKind:       event.eventKind,
    sessionId:       event.sessionId,
    payload:         event.payload as unknown as Record<string, unknown>,
    acknowledgedAt:  event.acknowledgedAt,
    createdAt:       event.createdAt,
  };
}

function parseLimit(raw: unknown): number | undefined {
  if (raw === undefined) return undefined;
  const value = typeof raw === 'string' ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(value) || value <= 0) {
    throw new ValidationError('limit must be a positive integer');
  }
  return value;
}

function parseUnreadOnly(raw: unknown): boolean | undefined {
  if (raw === undefined) return undefined;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  throw new ValidationError('unread must be one of: true, false, 1, 0');
}

/**
 * GET /api/v1/dashboard/events
 *
 * Query params (all optional):
 *   - `unread`  — `'true'` to filter on `acknowledged_at IS NULL`.
 *   - `limit`   — page size (default 20, max 100).
 *   - `cursor`  — opaque pagination cursor returned from a previous
 *                 page's `nextCursor`.
 *
 * Returns `{ events: DashboardEventDto[], nextCursor?: string }`.
 */
export const getDashboardEventsHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const unreadOnly = parseUnreadOnly(req.query.unread);
    const limit      = parseLimit(req.query.limit);
    const cursorRaw  = req.query.cursor;
    const cursor     = typeof cursorRaw === 'string' && cursorRaw.length > 0
      ? cursorRaw
      : undefined;

    const result = await getDashboardEventsForDoctor({
      doctorId:  userId,
      ...(unreadOnly !== undefined ? { unreadOnly } : {}),
      ...(limit !== undefined ? { limit } : {}),
      ...(cursor !== undefined ? { cursor } : {}),
    });

    const events = result.events.map(toDto);
    const data: { events: DashboardEventDto[]; nextCursor?: string } = { events };
    if (result.nextCursor) {
      data.nextCursor = result.nextCursor;
    }

    res.status(200).json(successResponse(data, req));
  },
);

/**
 * POST /api/v1/dashboard/events/:eventId/acknowledge
 *
 * Marks the event read for the calling doctor. 204 on success;
 * `NotFoundError` (→ 404) when the event doesn't exist or doesn't
 * belong to the caller.
 */
export const acknowledgeDashboardEventHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const eventId = req.params.eventId;
    if (!eventId || typeof eventId !== 'string') {
      throw new ValidationError('eventId path param is required');
    }

    await markDashboardEventAcknowledged({
      doctorId: userId,
      eventId,
    });

    res.status(204).end();
  },
);
