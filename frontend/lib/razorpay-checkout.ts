"use client";

/**
 * Razorpay Checkout SDK helper (Plan 09 · Task 50 · Decision 11 LOCKED).
 *
 * Dynamically loads `https://checkout.razorpay.com/v1/checkout.js` on
 * first use and exposes a typed `openRazorpayCheckout()` wrapper that
 * returns a promise resolving with `{ status: 'success' }` on the SDK
 * `handler` callback or `{ status: 'dismissed' }` on the `ondismiss`
 * callback.
 *
 * The SDK injects the global `window.Razorpay` constructor. We lazy-
 * load on the first call (avoids blocking the consult page paint for
 * users who never open the upgrade modal) and cache the promise so
 * reopening the modal is instantaneous.
 *
 * **Why not `next/script`:** the script is only needed for the
 * 1-click upgrade path, not for booking (booking uses a server-side
 * payment link redirect). Loading via `next/script` at layout time
 * pays the cost for every consult page view; this helper defers the
 * load to the first tap.
 *
 * @see frontend/components/consultation/ModalityUpgradeRequestModal.tsx
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-50-patient-modality-upgrade-request-modal.md
 */

const RAZORPAY_CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

// ----------------------------------------------------------------------------
// Minimal Razorpay SDK typing.
// ----------------------------------------------------------------------------
//
// The SDK is loaded at runtime (no bundled TS types). We shim only the
// fields we actually pass / read so the modal can compile without
// pulling a global `@types/razorpay` dependency.

export interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, string>;
  theme?: { color?: string };
  handler: (response: RazorpaySuccessResponse) => void;
  modal?: {
    ondismiss?: () => void;
    confirm_close?: boolean;
    escape?: boolean;
  };
}

interface RazorpayInstance {
  open: () => void;
  close: () => void;
}

type RazorpayConstructor = new (options: RazorpayOptions) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

// ----------------------------------------------------------------------------
// Script loader
// ----------------------------------------------------------------------------

let loaderPromise: Promise<RazorpayConstructor> | null = null;

export function loadRazorpayCheckoutSdk(): Promise<RazorpayConstructor> {
  if (typeof window === "undefined") {
    return Promise.reject(
      new Error("Razorpay SDK can only be loaded in the browser."),
    );
  }
  if (window.Razorpay) {
    return Promise.resolve(window.Razorpay);
  }
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise<RazorpayConstructor>((resolve, reject) => {
    // If a prior <script> tag was already appended (e.g. by another
    // feature), wait on its onload instead of appending a duplicate.
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${RAZORPAY_CHECKOUT_SRC}"]`,
    );
    if (existing) {
      const handleLoad = () => {
        if (window.Razorpay) resolve(window.Razorpay);
        else reject(new Error("Razorpay SDK loaded but window.Razorpay is missing."));
      };
      const handleError = () =>
        reject(new Error("Failed to load Razorpay Checkout SDK."));
      existing.addEventListener("load", handleLoad, { once: true });
      existing.addEventListener("error", handleError, { once: true });
      if (existing.getAttribute("data-loaded") === "true" && window.Razorpay) {
        resolve(window.Razorpay);
      }
      return;
    }

    const tag = document.createElement("script");
    tag.src = RAZORPAY_CHECKOUT_SRC;
    tag.async = true;
    tag.onload = () => {
      tag.setAttribute("data-loaded", "true");
      if (window.Razorpay) {
        resolve(window.Razorpay);
      } else {
        reject(new Error("Razorpay SDK loaded but window.Razorpay is missing."));
      }
    };
    tag.onerror = () => {
      loaderPromise = null; // allow retry on network failure
      reject(new Error("Failed to load Razorpay Checkout SDK."));
    };
    document.head.appendChild(tag);
  });

  return loaderPromise;
}

// ----------------------------------------------------------------------------
// Public helper
// ----------------------------------------------------------------------------

export interface OpenRazorpayCheckoutInput {
  /** Razorpay Key ID — public key (starts with `rzp_test_` / `rzp_live_`). */
  keyId: string;
  /** Order id from `modality-billing-service.captureUpgradePayment()`. */
  razorpayOrderId: string;
  /** Order amount in the smallest currency unit (paise). Must match the order. */
  amountPaise: number;
  /** Display copy shown in the Razorpay modal. */
  name: string;
  description: string;
  /** Optional prefill for the Razorpay checkout card form. */
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  /** Hex color matching the parent app's accent. */
  themeColor?: string;
  /** Opaque tags — surfaced in Razorpay dashboard for reconciliation. */
  notes?: Record<string, string>;
  /** Called when the user navigates away before paying. */
  onDismiss?: () => void;
  /** Called as soon as the SDK modal is visible; useful to dim the app. */
  onOpen?: () => void;
}

export type RazorpayCheckoutOutcome =
  | { status: "success"; response: RazorpaySuccessResponse }
  | { status: "dismissed" };

/**
 * Opens the Razorpay Checkout SDK with the given order and resolves
 * when the user either completes payment or dismisses the modal.
 *
 * The caller is expected to:
 *   1. Already hold a Razorpay `order_id` from the backend.
 *   2. Wait for the server-side webhook (`payment.captured`) to
 *      commit the transition — this helper's `status: 'success'` only
 *      confirms the client-side SDK callback fired, NOT that the
 *      server has processed the webhook. The modal transitions to
 *      `applying_transition` after this resolves.
 */
export async function openRazorpayCheckout(
  input: OpenRazorpayCheckoutInput,
): Promise<RazorpayCheckoutOutcome> {
  const RazorpayCtor = await loadRazorpayCheckoutSdk();

  return new Promise<RazorpayCheckoutOutcome>((resolve) => {
    let settled = false;

    const options: RazorpayOptions = {
      key: input.keyId,
      order_id: input.razorpayOrderId,
      amount: input.amountPaise,
      currency: "INR",
      name: input.name,
      description: input.description,
      handler: (response) => {
        if (settled) return;
        settled = true;
        resolve({ status: "success", response });
      },
      modal: {
        ondismiss: () => {
          if (settled) return;
          settled = true;
          resolve({ status: "dismissed" });
        },
        // Confirm-close prompts Razorpay's "Are you sure you want to leave?"
        // which reduces accidental dismissals during 3DS redirect flows.
        confirm_close: true,
        escape: true,
      },
      ...(input.prefill ? { prefill: input.prefill } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
      ...(input.themeColor ? { theme: { color: input.themeColor } } : {}),
    };

    const instance = new RazorpayCtor(options);
    try {
      input.onOpen?.();
    } catch {
      // swallow — UI instrumentation must never block the open().
    }
    instance.open();
  });
}
