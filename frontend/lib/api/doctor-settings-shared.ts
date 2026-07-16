/**
 * Coalesce parallel first-paint `getDoctorSettings` calls (profile page override
 * + Rx form setup + section hydrators often fire in the same tick).
 *
 * Short TTL is enough to collapse the waterfall; PATCH paths still call
 * `getDoctorSettings` / invalidate as they do today.
 */

import {
  getDoctorSettings,
  type ApiSuccess,
  type DoctorSettingsData,
} from "@/lib/api";

const TTL_MS = 8_000;

let inflight: Promise<ApiSuccess<DoctorSettingsData>> | null = null;
let inflightToken: string | null = null;
let cached: {
  token: string;
  data: ApiSuccess<DoctorSettingsData>;
  at: number;
} | null = null;

function freshCache(token: string): ApiSuccess<DoctorSettingsData> | null {
  if (!cached || cached.token !== token) return null;
  if (Date.now() - cached.at >= TTL_MS) {
    cached = null;
    return null;
  }
  return cached.data;
}

/** Sync peek of the shared memory cache (null when cold / expired). */
export function peekDoctorSettingsShared(
  token: string,
): ApiSuccess<DoctorSettingsData> | null {
  return freshCache(token);
}

/** Shared read for doctor settings — in-flight coalesce + brief memory cache. */
export async function getDoctorSettingsShared(
  token: string,
): Promise<ApiSuccess<DoctorSettingsData>> {
  const hit = freshCache(token);
  if (hit) return hit;
  if (inflight && inflightToken === token) {
    return inflight;
  }

  inflightToken = token;
  inflight = getDoctorSettings(token)
    .then((data) => {
      cached = { token, data, at: Date.now() };
      return data;
    })
    .finally(() => {
      if (inflightToken === token) {
        inflight = null;
        inflightToken = null;
      }
    });

  return inflight;
}

/** Test / after PATCH — drop shared cache so the next read hits the network. */
export function clearDoctorSettingsSharedCache(): void {
  cached = null;
  inflight = null;
  inflightToken = null;
}
