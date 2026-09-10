"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsPageShell } from "@/components/settings/SettingsPageShell";
import { useSessionAccessToken } from "@/hooks/useSessionAccessToken";
import {
  connectDoctorGateway,
  getDoctorGateway,
  setPaymentCollectionMode,
  type DoctorGatewayStatus,
} from "@/lib/api";

/**
 * Settings → Payments (P2b). Doctor-owned Razorpay only.
 * Money never touches Halo Aid.
 */
export default function PaymentsSettingsPage() {
  const { token, isLoading } = useSessionAccessToken();
  const [data, setData] = useState<DoctorGatewayStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keyId, setKeyId] = useState("");
  const [keySecret, setKeySecret] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const res = await getDoctorGateway(token);
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load payments");
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleConnect() {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      const res = await connectDoctorGateway(
        token,
        keyId,
        keySecret,
        webhookSecret || undefined,
      );
      setData(res.data);
      setKeySecret("");
      setWebhookSecret("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect Razorpay");
    } finally {
      setSaving(false);
    }
  }

  async function handleMode(mode: "bookings_only" | "prepaid") {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      const res = await setPaymentCollectionMode(token, mode);
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update mode");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading || !token || (!data && !error)) {
    return (
      <SettingsPageShell
        title="Payments"
        description="How patients pay you for a booking."
        isLoading
      />
    );
  }

  if (error && !data) {
    return (
      <SettingsPageShell
        title="Payments"
        description="How patients pay you for a booking."
        loadError={error}
        onRetry={() => void load()}
      />
    );
  }

  const connected = data?.connected === true;

  return (
    <SettingsPageShell
      title="Payments"
      description="Patients who pay when they book show up. Connect your own Razorpay account and we will send the payment link automatically. The money goes straight to you — it never touches Halo Aid."
      saveError={error}
    >
      <div className="mt-6 space-y-6">
        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <h2 className="text-base font-medium text-foreground">Razorpay</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Paste keys from your Razorpay dashboard. We store the secret
            encrypted and never show it again.
          </p>
          {connected ? (
            <p className="mt-3 text-sm text-foreground">
              Connected · {data?.maskedKeyId}
            </p>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Not connected</p>
          )}
          <div className="mt-4 space-y-3">
            <div>
              <Label htmlFor="rzp-key-id">Key id</Label>
              <Input
                id="rzp-key-id"
                value={keyId}
                onChange={(e) => setKeyId(e.target.value)}
                autoComplete="off"
                placeholder="rzp_live_…"
              />
            </div>
            <div>
              <Label htmlFor="rzp-key-secret">Key secret</Label>
              <Input
                id="rzp-key-secret"
                type="password"
                value={keySecret}
                onChange={(e) => setKeySecret(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div>
              <Label htmlFor="rzp-webhook-secret">Webhook secret</Label>
              <Input
                id="rzp-webhook-secret"
                type="password"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                autoComplete="new-password"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Razorpay Dashboard → Webhooks. Point the URL at Halo Aid, then
                paste the signing secret here. Needed for prepaid so we can
                confirm the patient paid.
              </p>
              {data?.webhookUrl ? (
                <p className="mt-1 break-all text-xs text-foreground">
                  {data.webhookUrl}
                </p>
              ) : null}
              {data?.webhookConfigured ? (
                <p className="mt-1 text-xs text-foreground">Webhook secret saved</p>
              ) : null}
            </div>
            <Button
              type="button"
              onClick={() => void handleConnect()}
              disabled={saving || !keyId || !keySecret}
            >
              {connected ? "Replace keys" : "Connect"}
            </Button>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <h2 className="text-base font-medium text-foreground">Collection</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Bookings-only is a full mode. Patients book the slot and pay you
            at the clinic if you prefer.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              variant={
                data?.paymentCollectionMode === "bookings_only"
                  ? "default"
                  : "outline"
              }
              disabled={saving}
              onClick={() => void handleMode("bookings_only")}
            >
              Bookings only
            </Button>
            <Button
              type="button"
              variant={
                data?.paymentCollectionMode === "prepaid" ? "default" : "outline"
              }
              disabled={saving || !connected || !data?.webhookConfigured}
              onClick={() => void handleMode("prepaid")}
            >
              Prepaid bookings
            </Button>
          </div>
        </section>
      </div>
    </SettingsPageShell>
  );
}
