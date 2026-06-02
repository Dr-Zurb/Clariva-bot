"use client";

/**
 * Sub-batch B · task-video-B1 — clinic-branded lobby header for the
 * patient pre-call screen.
 *
 * Renders ABOVE A7's `<VideoConsultPreCall>` (camera + mic check) on
 * the patient join page. Self-contained, presentational, takes a
 * resolved `ClinicBranding` (not the raw API payload — branding lib
 * normalisation lives in `frontend/lib/clinic/branding.ts`).
 *
 * Layout (single full-width card):
 *
 *   ┌──────────────────────────────────────────────┐
 *   │  [logo]  Practice name                       │
 *   │          Fri, 1 May 2026 · 14:30             │
 *   └──────────────────────────────────────────────┘
 *
 * The logo slot today is always the initials placeholder
 * (`'CC'` for "Clariva Clinic"); when voice B2 ships the `logo_url`
 * column + backend pipe, the same slot renders the `<img>` (handled
 * inside this component, transparent to callers).
 *
 * Doctor variant deferred — A7 only ships a patient-side pre-call;
 * the doctor side mounts `<VideoRoom>` directly with no pre-call
 * gate, so there's no place to render this header doctor-side. When
 * a doctor pre-call lands, this component reuses unchanged with a
 * `role='doctor'` variant added (different practice = doctor's own).
 */

import Image from "next/image";
import { useState } from "react";
import type { ClinicBranding } from "@/lib/clinic/branding";

export interface VideoConsultLobbyHeaderProps {
  /** Resolved branding (always non-null after `resolveClinicBranding`). */
  branding: ClinicBranding;
  /**
   * Pre-formatted appointment time. Pass the output of
   * `formatAppointmentTimeEnGB()`. `null` hides the time line entirely
   * (drop-in / instant consults with no scheduled time — falls back to
   * just the practice name + logo).
   */
  appointmentTime: { dateLine: string; timeLine: string } | null;
}

export default function VideoConsultLobbyHeader({
  branding,
  appointmentTime,
}: VideoConsultLobbyHeaderProps) {
  // Track logo load failure so we degrade to the initials placeholder
  // without leaving a broken-image icon on screen. Initialised true
  // when no logoUrl was provided (so the logical state lines up: "no
  // image to show, fall back to initials").
  const [logoFailed, setLogoFailed] = useState<boolean>(false);
  const showInitials = !branding.logoUrl || logoFailed;

  return (
    <div
      className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
      data-testid="video-consult-lobby-header"
      data-fallback={branding.isFallback ? "true" : "false"}
    >
      {/* Logo slot — initials avatar today; <img> when voice B2
          introduces the URL. The aria-hidden on initials is fine
          because the practice name is already exposed in the heading
          below; redundant for a screen reader. */}
      {showInitials ? (
        <div
          aria-hidden
          className={
            "flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-base font-semibold text-white " +
            branding.initialsBgClass
          }
        >
          {branding.initials}
        </div>
      ) : (
        // next/image with `unoptimized` — logoUrl is an arbitrary
        // external URL the doctor may have configured (S3, Imgur,
        // Cloudinary, or even a Wix CDN); we don't want to push it
        // through Next's optimiser without an allow-list. Future:
        // when voice B2 ships the proper logo upload pipeline (most
        // likely Supabase Storage), swap to optimised loading.
        <Image
          src={branding.logoUrl as string}
          alt={`${branding.practiceName} logo`}
          width={48}
          height={48}
          unoptimized
          onError={() => setLogoFailed(true)}
          className="h-12 w-12 flex-shrink-0 rounded-full object-cover"
        />
      )}

      <div className="min-w-0 flex-1">
        <h2
          className={
            "truncate text-base font-semibold " +
            (branding.isFallback ? "text-gray-500" : "text-gray-900")
          }
          // The full name (untruncated) for accessibility tooltips.
          title={branding.practiceName}
        >
          {branding.practiceName}
        </h2>
        {appointmentTime ? (
          // Inline date · time on wide screens, stacked on narrow.
          // `flex-wrap` lets the time wrap below the date when the
          // viewport pinches; the centre-dot separator hides itself
          // automatically (CSS `:has()` would be cleaner but isn't
          // worth a polyfill — the dot just sits on its own short
          // line on the rare narrow case, which is harmless).
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-sm text-gray-600">
            <span>{appointmentTime.dateLine}</span>
            <span aria-hidden className="text-gray-400">
              ·
            </span>
            <span>{appointmentTime.timeLine}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
