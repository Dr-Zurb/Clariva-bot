import type { Response } from 'express';
import {
  OPD_LEGACY_SESSION_DEPRECATION_DOC_LINK,
  OPD_LEGACY_SESSION_SUCCESSOR,
  OPD_LEGACY_SESSION_SUNSET,
} from '../config/deprecations';
import { setSunsetHeaders } from './http';

/** Deprecation headers for legacy `/opd/slot-session` and `/opd/queue-session` (pdm-02, pdm-12). */
export function setOpdLegacySessionDeprecationHeaders(res: Response): void {
  setSunsetHeaders(res, {
    sunsetDate: OPD_LEGACY_SESSION_SUNSET,
    successor: OPD_LEGACY_SESSION_SUCCESSOR,
    link: OPD_LEGACY_SESSION_DEPRECATION_DOC_LINK,
  });
}
