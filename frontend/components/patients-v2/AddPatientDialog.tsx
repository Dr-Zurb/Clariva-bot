"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createManualPatient,
  ManualPatientConflictError,
  type ManualPatientMatch,
} from "@/lib/api/patients";
import { digitsLast10, isCompleteDeskPhone } from "@/lib/desk/phone";

export function AddPatientDialog({
  token,
  open,
  onOpenChange,
}: {
  token: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<ManualPatientMatch[] | null>(null);
  const [saving, setSaving] = useState(false);

  function reset() {
    setName("");
    setPhone("");
    setAge("");
    setGender("");
    setError(null);
    setMatches(null);
  }

  async function submit(confirmNew: boolean) {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!isCompleteDeskPhone(phone)) {
      setError("Enter a 10-digit mobile number");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const ageNum = age.trim() ? Number(age) : undefined;
      const patient = await createManualPatient(token, {
        name: name.trim(),
        phone: digitsLast10(phone),
        ...(ageNum && ageNum >= 1 && ageNum <= 120 ? { age: ageNum } : {}),
        ...(gender.trim() ? { gender: gender.trim() } : {}),
        ...(confirmNew ? { confirmNew: true } : {}),
      });
      onOpenChange(false);
      reset();
      router.push(`/dashboard/patients-v2/${patient.id}`);
    } catch (err) {
      if (err instanceof ManualPatientConflictError) {
        setMatches(err.matches);
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Could not add patient");
      }
    } finally {
      setSaving(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add patient</DialogTitle>
          <DialogDescription>
            This record is marked as added by you, not the front desk.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="add-patient-name">Name</Label>
            <Input
              id="add-patient-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-patient-phone">Mobile number</Label>
            <Input
              id="add-patient-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="add-patient-age">Age (optional)</Label>
              <Input
                id="add-patient-age"
                type="number"
                min={1}
                max={120}
                value={age}
                onChange={(event) => setAge(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-patient-gender">Gender (optional)</Label>
              <select
                id="add-patient-gender"
                value={gender}
                onChange={(event) => setGender(event.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">—</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          {matches && matches.length > 0 ? (
            <ul className="space-y-1 rounded-md border border-border p-3 text-sm">
              {matches.map((row) => (
                <li key={row.patientId}>
                  <button
                    type="button"
                    className="text-left text-primary underline-offset-4 hover:underline"
                    onClick={() => {
                      onOpenChange(false);
                      reset();
                      router.push(`/dashboard/patients-v2/${row.patientId}`);
                    }}
                  >
                    {row.name}
                    {row.medicalRecordNumber ? ` · ${row.medicalRecordNumber}` : ""}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            {matches ? (
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => void submit(true)}
              >
                {saving ? "Saving…" : "Create anyway"}
              </Button>
            ) : (
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Add patient"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
