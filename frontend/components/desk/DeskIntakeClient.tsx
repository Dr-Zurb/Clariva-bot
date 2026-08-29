"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Pencil, Search, UserPlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DeskPatientFacts } from "@/components/desk/DeskPatientFacts";
import { DeskSplit } from "@/components/desk/DeskSplit";
import { DeskVitalsForm } from "@/components/desk/DeskVitalsForm";
import { cn } from "@/lib/utils";
import {
  createDeskAppointment,
  checkInDeskAppointment,
  archiveDeskPatient,
  createDeskPatient,
  restoreDeskPatient,
  updateDeskPatient,
  deskErrorMessage,
  deskErrorStatus,
  isDeskAbortError,
  getDeskAvailableSlots,
  getDeskClinicContext,
  matchToDeskRef,
  parseAlreadyOnToday,
  parseDuplicateMatches,
  patientToDeskRef,
  searchDeskIdentity,
  searchDeskPatients,
  summaryToDeskRef,
  type CreateDeskPatientBody,
  type DeskClinicContext,
  type DeskDuplicateMatch,
  type DeskPatientCard,
} from "@/lib/desk/api";
import { formatDeskDate, walkInAppointmentIso } from "@/lib/desk/format";
import {
  DESK_SEARCH_FALLBACK_PAGE,
  DESK_SEARCH_HEADER_PX,
  DESK_SEARCH_MOBILE_ROW_PX,
  DESK_SEARCH_ROW_PX,
  deskSearchPageCount,
  deskSearchPageNumbers,
  deskSearchPageSizeFromHeight,
  deskSearchVisibleEnd,
} from "@/lib/desk/search-page";
import { digitsLast10, formatDeskPhone, isCompleteDeskPhone } from "@/lib/desk/phone";
import {
  DESK_GUARDIAN_RELATIONS,
  formatDeskGuardian,
  type DeskGuardianRelation,
} from "@/lib/desk/guardian";
import {
  DESK_AGE_MODE_OPTIONS,
  DESK_AGE_UNIT_LIMITS,
  deskTodayYmd,
  isValidDeskAgeCount,
  isValidDeskDob,
  type DeskAgeMode,
} from "@/lib/desk/age";
import {
  deskSearchAgeYears,
  isDeskIdentitySearchReady,
  mergeDeskPatientIds,
  resolveDeskLookup,
} from "@/lib/desk/identity-search";
import {
  DESK_MATCH_GRID,
  DESK_MATCH_HEADER,
  deskOpdNumber,
  deskQueueBucket,
  findDeskSameDayVisit,
  formatDeskAgeSex,
  isDeskSameDayLockVisit,
} from "@/lib/desk/queue";
import {
  deskFormNameOverridesSearch,
  deskSearchKind,
  deskSearchQuery,
  isSearchableDeskQuery,
} from "@/lib/desk/search";
import { queryKeys } from "@/lib/query/keys";
import { useDeskTodayQuery } from "@/hooks/queries/useDeskTodayQuery";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import type { AvailableSlot } from "@/lib/api";

const NOTICE_MS = 4500;

const GENDER_OPTIONS = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "other", label: "Other" },
] as const;

type DeskGender = (typeof GENDER_OPTIONS)[number]["value"];

const registerFieldClass = "h-9 rounded-lg bg-background";

function choiceChipClass(selected: boolean) {
  return cn(
    "inline-flex h-8 items-center justify-center rounded-md px-2.5 text-sm font-medium whitespace-nowrap transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    selected
      ? "bg-primary/15 text-primary"
      : "text-muted-foreground hover:bg-primary/10 hover:text-foreground"
  );
}

const choiceTrackClass =
  "inline-flex min-h-9 w-fit max-w-full flex-wrap content-start items-center gap-1 rounded-lg bg-primary/5 p-0.5";

const fieldColClass = "flex min-w-0 flex-col gap-1";

const DESK_ADDRESS_MAX = 300;

function titleCaseDeskName(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toLocaleUpperCase() + token.slice(1).toLocaleLowerCase())
    .join(" ");
}

export function DeskIntakeClient({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const { rows: todayRows, loading: todayLoading } = useDeskTodayQuery(token);
  const [context, setContext] = useState<DeskClinicContext | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [phone, setPhone] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [matches, setMatches] = useState<DeskPatientCard[] | null>(null);
  const [matchTotal, setMatchTotal] = useState<number | null>(null);
  const [matchPage, setMatchPage] = useState(1);
  const [pageSize, setPageSize] = useState(DESK_SEARCH_FALLBACK_PAGE);
  const listViewportRef = useRef<HTMLDivElement>(null);

  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [ageMode, setAgeMode] = useState<DeskAgeMode>("years");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState<DeskGender | "">("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dupes, setDupes] = useState<DeskDuplicateMatch[] | null>(null);
  const [guardianName, setGuardianName] = useState("");
  const [guardianRelation, setGuardianRelation] = useState<DeskGuardianRelation>("father");
  const [altPhone, setAltPhone] = useState("");
  const [address, setAddress] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [ageError, setAgeError] = useState<string | null>(null);
  const [guardianError, setGuardianError] = useState<string | null>(null);
  const [relationError, setRelationError] = useState<string | null>(null);
  const [genderError, setGenderError] = useState<string | null>(null);
  const [altPhoneError, setAltPhoneError] = useState<string | null>(null);
  const [liveHits, setLiveHits] = useState<DeskPatientCard[]>([]);
  const [liveTotal, setLiveTotal] = useState<number | null>(null);
  const [livePage, setLivePage] = useState(1);
  const [liveSearching, setLiveSearching] = useState(false);
  const liveQueryKeyRef = useRef("");

  const [patient, setPatient] = useState<DeskPatientCard | null>(null);
  const [formMode, setFormMode] = useState<"register" | "edit">("register");
  const liveAbortRef = useRef<AbortController | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const [slotDate, setSlotDate] = useState("");
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const [showBook, setShowBook] = useState(false);
  const [vitalsAppointmentId, setVitalsAppointmentId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await getDeskClinicContext(token);
        if (!active) return;
        setContext(res.data);
        setSlotDate(res.data.today);
      } catch (err) {
        if (!active) return;
        setContextError(deskErrorMessage(err, "Could not load desk context"));
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(id);
  }, [notice]);

  function clearFormFields() {
    setPhone("");
    setName("");
    setAge("");
    setAgeMode("years");
    setDateOfBirth("");
    setGender("");
    setGuardianName("");
    setGuardianRelation("father");
    setAltPhone("");
    setAddress("");
    setNameError(null);
    setPhoneError(null);
    setAgeError(null);
    setGuardianError(null);
    setRelationError(null);
    setGenderError(null);
    setAltPhoneError(null);
    setLiveHits([]);
    setLiveTotal(null);
    setLivePage(1);
    setSaveError(null);
  }

  function fillFormFromPatient(row: DeskPatientCard) {
    setName(titleCaseDeskName(row.name));
    setPhone(digitsLast10(row.phone));
    const dob = row.date_of_birth?.slice(0, 10) ?? "";
    if (dob && isValidDeskDob(dob)) {
      setAgeMode("dob");
      setDateOfBirth(dob);
      setAge("");
    } else if (row.age != null && row.age >= 1) {
      setAgeMode("years");
      setAge(String(row.age));
      setDateOfBirth("");
    } else {
      setAgeMode("years");
      setAge("");
      setDateOfBirth("");
    }
    setGender(
      row.gender === "female" || row.gender === "male" || row.gender === "other"
        ? row.gender
        : ""
    );
    setGuardianName(titleCaseDeskName(row.guardian_name ?? ""));
    setGuardianRelation(
      DESK_GUARDIAN_RELATIONS.some((item) => item.value === row.guardian_relation)
        ? (row.guardian_relation as DeskGuardianRelation)
        : "father"
    );
    setAltPhone(row.alt_phone ? digitsLast10(row.alt_phone) : "");
    setAddress(row.address ?? "");
    setNameError(null);
    setPhoneError(null);
    setAgeError(null);
    setGuardianError(null);
    setRelationError(null);
    setGenderError(null);
    setAltPhoneError(null);
    setSaveError(null);
    setDupes(null);
    setLiveHits([]);
    setLiveTotal(null);
    setLivePage(1);
  }

  function startEdit() {
    if (!patient) return;
    fillFormFromPatient(patient);
    setFormMode("edit");
  }

  function cancelEdit() {
    setFormMode("register");
    clearFormFields();
    setDupes(null);
  }

  function resetSearch() {
    setQuery("");
    setMatches(null);
    setMatchTotal(null);
    setMatchPage(1);
    setPatient(null);
    setFormMode("register");
    setDupes(null);
    setSearchError(null);
    setBookError(null);
    setArchiveError(null);
    setShowBook(false);
    setVitalsAppointmentId(null);
    clearFormFields();
  }

  function selectPatient(row: DeskPatientCard) {
    setPatient(row);
    setFormMode("register");
    setDupes(null);
    setShowBook(false);
    setBookError(null);
    setArchiveError(null);
    setVitalsAppointmentId(null);
  }

  function backToResults() {
    setPatient(null);
    setFormMode("register");
    setShowBook(false);
    setBookError(null);
    setArchiveError(null);
    setVitalsAppointmentId(null);
  }

  async function onSearch(event: React.FormEvent) {
    event.preventDefault();
    const q = deskSearchQuery(query);
    if (!isSearchableDeskQuery(query)) {
      setSearchError("Enter a mobile, MRN, or name");
      return;
    }
    liveAbortRef.current?.abort();
    setSearching(true);
    setSearchError(null);
    setSaveError(null);
    setDupes(null);
    setNameError(null);
    setPhoneError(null);
    setLiveHits([]);
    setLiveTotal(null);
    setLivePage(1);
    setPatient(null);
    const kind = deskSearchKind(query);
    if (kind === "phone" && isCompleteDeskPhone(query)) {
      setPhone(digitsLast10(query));
    }
    if (kind === "name") {
      setName(titleCaseDeskName(q));
    }
    try {
      const res = await searchDeskPatients(token, q, includeArchived, undefined, {
        page: 1,
        pageSize,
      });
      setMatches(res.data.patients.map(summaryToDeskRef));
      setMatchTotal(res.data.total);
      setMatchPage(res.data.page);
    } catch (err) {
      setSearchError(deskErrorMessage(err, "Search failed"));
      setMatches(null);
      setMatchTotal(null);
      setMatchPage(1);
    } finally {
      setSearching(false);
    }
  }

  async function goToMatchPage(nextPage: number) {
    const q = deskSearchQuery(query);
    if (!isSearchableDeskQuery(query)) return;
    const lastPage = deskSearchPageCount(matchTotal ?? 0, pageSize);
    if (nextPage < 1 || nextPage > lastPage) return;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await searchDeskPatients(token, q, includeArchived, undefined, {
        page: nextPage,
        pageSize,
      });
      setMatches(res.data.patients.map(summaryToDeskRef));
      setMatchTotal(res.data.total);
      setMatchPage(res.data.page);
    } catch (err) {
      setSearchError(deskErrorMessage(err, "Search failed"));
    } finally {
      setSearching(false);
    }
  }

  function goToLivePage(nextPage: number) {
    const lastPage = deskSearchPageCount(liveTotal ?? 0, pageSize);
    if (nextPage < 1 || nextPage > lastPage) return;
    setLivePage(nextPage);
  }

  function deskFormBody(confirmNew: boolean) {
    const trimmed = titleCaseDeskName(name);
    const missingName = !trimmed;
    const q = digitsLast10(phone);
    const missingPhone = q.length < 10;
    const ageNum = Number.parseInt(age.trim(), 10);
    const countOk = ageMode !== "dob" && isValidDeskAgeCount(ageMode, age);
    const dobOk = isValidDeskDob(dateOfBirth);
    const missingAge = ageMode === "dob" ? !dobOk : !countOk;
    const guardian = titleCaseDeskName(guardianName);
    const missingGuardian = !guardian;
    const missingRelation = !guardianRelation;
    const missingGender = !gender;
    const altDigits = digitsLast10(altPhone);
    const altIncomplete = altDigits.length > 0 && altDigits.length < 10;
    if (missingName) setNameError("Name is required");
    if (missingPhone) setPhoneError("Enter a 10-digit mobile number");
    if (missingAge) {
      setAgeError(
        ageMode === "dob" ? "Enter a valid date of birth" : DESK_AGE_UNIT_LIMITS[ageMode].error
      );
    } else setAgeError(null);
    if (missingGuardian) setGuardianError("Relative name is required");
    if (missingRelation) setRelationError("Select a relation");
    if (missingGender) setGenderError("Gender is required");
    if (altIncomplete) setAltPhoneError("Enter a 10-digit alternate mobile, or leave blank");
    else setAltPhoneError(null);
    if (
      missingName ||
      missingPhone ||
      missingAge ||
      missingGuardian ||
      missingRelation ||
      missingGender ||
      altIncomplete ||
      !gender
    ) {
      return null;
    }
    const addressTrimmed = address.trim();
    const body: CreateDeskPatientBody = {
      name: trimmed,
      phone: q,
      ...(ageMode === "dob" ? { dateOfBirth } : { age: ageNum, ageUnit: ageMode }),
      gender,
      guardianName: guardian,
      guardianRelation,
      ...(altDigits.length === 10 ? { altPhone: altDigits } : {}),
      ...(addressTrimmed ? { address: addressTrimmed } : {}),
      ...(confirmNew ? { confirmNew: true } : {}),
    };
    return body;
  }

  async function register(confirmNew = false) {
    const body = deskFormBody(confirmNew);
    if (!body) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await createDeskPatient(token, body);
      setDupes(null);
      setMatches([]);
      setMatchTotal(0);
      setMatchPage(1);
      setFormMode("register");
      clearFormFields();
      setPatient(patientToDeskRef(res.data.patient));
      setNotice(`${body.name} added`);
    } catch (err) {
      if (deskErrorStatus(err) === 409) {
        const found = parseDuplicateMatches(err);
        setDupes(found);
        setSaveError("Possible existing patient. Pick them or create a new record.");
      } else {
        setSaveError(deskErrorMessage(err, "Could not register patient"));
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(confirmNew = false) {
    if (!patient) return;
    const body = deskFormBody(confirmNew);
    if (!body) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await updateDeskPatient(token, patient.id, body);
      setDupes(null);
      setMatches([]);
      setMatchTotal(0);
      setMatchPage(1);
      setFormMode("register");
      clearFormFields();
      setPatient({
        ...patient,
        ...patientToDeskRef(res.data.patient),
        last_appointment_date: patient.last_appointment_date,
        next_appointment_date: patient.next_appointment_date,
      });
      setNotice(`${body.name} updated`);
    } catch (err) {
      if (deskErrorStatus(err) === 409) {
        const found = parseDuplicateMatches(err);
        setDupes(found);
        setSaveError("Possible existing patient. Pick them or keep this record.");
      } else {
        setSaveError(deskErrorMessage(err, "Could not update patient"));
      }
    } finally {
      setSaving(false);
    }
  }

  async function archiveSelected() {
    if (!patient) return;
    const confirmed = window.confirm(
      "Hide this record from search? You can find it under Show archived."
    );
    if (!confirmed) return;
    setArchiving(true);
    setArchiveError(null);
    const archivedName = patient.name;
    try {
      await archiveDeskPatient(token, patient.id);
      setNotice(`${archivedName} archived`);
      resetSearch();
    } catch (err) {
      setArchiveError(deskErrorMessage(err, "Could not archive patient"));
    } finally {
      setArchiving(false);
    }
  }

  async function restoreSelected() {
    if (!patient) return;
    setArchiving(true);
    setArchiveError(null);
    try {
      const res = await restoreDeskPatient(token, patient.id);
      setPatient({
        ...patient,
        ...patientToDeskRef(res.data.patient),
        last_appointment_date: patient.last_appointment_date,
        next_appointment_date: patient.next_appointment_date,
      });
      setNotice(`${patient.name} restored`);
    } catch (err) {
      setArchiveError(deskErrorMessage(err, "Could not restore patient"));
    } finally {
      setArchiving(false);
    }
  }

  async function loadSlots(date: string) {
    if (!context) return;
    setSlotsLoading(true);
    setSlotsError(null);
    try {
      const res = await getDeskAvailableSlots(context.doctorId, date);
      setSlots(res.data.slots);
    } catch (err) {
      setSlotsError(deskErrorMessage(err, "Could not load slots"));
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }

  useEffect(() => {
    if (!showBook || !patient || !slotDate || !context) return;
    if (
      slotDate === context.today &&
      todayRows.some((row) => row.patient_id === patient.id && isDeskSameDayLockVisit(row))
    ) {
      return;
    }
    void loadSlots(slotDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when date/patient/context change
  }, [showBook, patient?.id, slotDate, context?.doctorId]);

  function finishDeskVisit(
    bookedName: string,
    action: "checked in" | "added" | "booked",
    tokenNo: number | null | undefined,
    appointmentId?: string
  ) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.desk.all });
    if (action === "checked in" && appointmentId) {
      setVitalsAppointmentId(appointmentId);
      setShowBook(false);
      return;
    }
    setNotice(tokenNo != null ? `${bookedName} ${action} · Token ${tokenNo}` : `${bookedName} ${action}`);
    resetSearch();
  }

  function finishVitalsAfterCheckIn() {
    const bookedName = patient?.name.trim();
    setNotice(bookedName ? `${bookedName} checked in for today` : "Checked in for today");
    resetSearch();
  }

  async function markArrived(appointmentId: string) {
    if (!patient) return;
    setBooking(true);
    setBookError(null);
    try {
      const arrived = await checkInDeskAppointment(token, appointmentId);
      finishDeskVisit(
        patient.name,
        "checked in",
        arrived.data.appointment.opd_token_number,
        arrived.data.appointment.id
      );
    } catch (err) {
      setBookError(deskErrorMessage(err, "Could not check in"));
    } finally {
      setBooking(false);
    }
  }

  async function book(opts: {
    appointmentDate: string;
    origin: "walk_in" | "booked";
    arrive: boolean;
  }) {
    if (!patient) return;
    setBooking(true);
    setBookError(null);
    try {
      const created = await createDeskAppointment(token, {
        patientId: patient.id,
        appointmentDate: opts.appointmentDate,
        bookingOrigin: opts.origin,
        reasonForVisit: opts.origin === "walk_in" ? "Walk-in" : "Front desk booking",
        ...(opts.arrive ? { checkIn: true } : {}),
      });
      const appointment = created.data.appointment;
      const action = opts.arrive ? "checked in" : opts.origin === "walk_in" ? "added" : "booked";
      finishDeskVisit(patient.name, action, appointment.opd_token_number, appointment.id);
    } catch (err) {
      const lock = deskErrorStatus(err) === 409 ? parseAlreadyOnToday(err) : null;
      void queryClient.invalidateQueries({ queryKey: queryKeys.desk.all });
      if (lock && opts.arrive && lock.bucket === "waiting") {
        try {
          const arrived = await checkInDeskAppointment(token, lock.appointmentId);
          finishDeskVisit(
            patient.name,
            "checked in",
            arrived.data.appointment.opd_token_number,
            arrived.data.appointment.id
          );
          return;
        } catch (checkInErr) {
          setBookError(deskErrorMessage(checkInErr, "Could not check in"));
          return;
        }
      }
      if (lock?.bucket === "arrived") {
        setBookError(
          lock.token != null ? `Already arrived · Token ${lock.token}` : "Already arrived"
        );
      } else if (lock?.bucket === "seen") {
        setBookError("Seen today");
      } else if (lock) {
        setBookError(deskErrorMessage(err, "Already on today's list"));
      } else {
        setBookError(deskErrorMessage(err, "Could not book"));
      }
      if (deskErrorStatus(err) === 409 && slotDate) {
        void loadSlots(slotDate);
      }
    } finally {
      setBooking(false);
    }
  }

  const findQueryRef = useRef(query);
  findQueryRef.current = query;

  useEffect(() => {
    if (patient || formMode === "edit") return;
    if (matches === null) return;
    if (!deskFormNameOverridesSearch(name, findQueryRef.current)) return;
    setMatches(null);
    setMatchTotal(null);
    setMatchPage(1);
    setQuery("");
    setSearchError(null);
  }, [name, matches, patient, formMode]);

  useEffect(() => {
    if (patient || formMode === "edit") return;
    const identity = {
      name: name.trim(),
      guardianName: guardianName.trim() || undefined,
      age: deskSearchAgeYears(ageMode, age, dateOfBirth),
      gender: gender || undefined,
    };
    const phoneReady = isCompleteDeskPhone(phone);
    const identityReady = isDeskIdentitySearchReady(identity);
    if (!phoneReady && !identityReady) {
      setLiveHits([]);
      setLiveTotal(null);
      setLivePage(1);
      setLiveSearching(false);
      return;
    }
    const queryKey = [
      name.trim(),
      guardianName.trim(),
      age.trim(),
      ageMode,
      dateOfBirth,
      gender,
      phone,
      includeArchived,
    ].join("|");
    const keyChanged = liveQueryKeyRef.current !== queryKey;
    liveQueryKeyRef.current = queryKey;
    if (keyChanged && livePage !== 1) {
      setLivePage(1);
      return;
    }
    const page = keyChanged ? 1 : livePage;
    setLiveSearching(true);
    let cancelled = false;
    const abort = new AbortController();
    liveAbortRef.current = abort;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const [byPhone, byIdentity] = await Promise.all([
            phoneReady
              ? searchDeskPatients(token, digitsLast10(phone), includeArchived, abort.signal, {
                  page,
                  pageSize,
                })
              : Promise.resolve(null),
            identityReady
              ? searchDeskIdentity(token, identity, includeArchived, abort.signal, {
                  page,
                  pageSize,
                })
              : Promise.resolve(null),
          ]);
          if (cancelled) return;
          const merged = mergeDeskPatientIds(
            (byPhone?.data.patients ?? []).map(summaryToDeskRef),
            (byIdentity?.data.patients ?? []).map(summaryToDeskRef)
          );
          setLiveHits(merged);
          setLiveTotal(Math.max(byPhone?.data.total ?? 0, byIdentity?.data.total ?? 0));
          setLivePage(byIdentity?.data.page ?? byPhone?.data.page ?? page);
        } catch (err) {
          if (cancelled || isDeskAbortError(err)) return;
          setLiveHits([]);
          setLiveTotal(null);
        } finally {
          if (!cancelled) setLiveSearching(false);
        }
      })();
    }, keyChanged ? 80 : 0);
    return () => {
      cancelled = true;
      abort.abort();
      window.clearTimeout(timer);
    };
  }, [
    name,
    guardianName,
    age,
    ageMode,
    dateOfBirth,
    gender,
    phone,
    patient,
    formMode,
    token,
    includeArchived,
    livePage,
    pageSize,
  ]);

  useEffect(() => {
    const el = listViewportRef.current;
    if (!el || patient) return;
    const apply = () => {
      const header = el.querySelector("[role='columnheader']")?.parentElement;
      const headerPx =
        header instanceof HTMLElement
          ? header.getBoundingClientRect().height
          : DESK_SEARCH_HEADER_PX;
      let rowPx = isDesktop ? DESK_SEARCH_ROW_PX : DESK_SEARCH_MOBILE_ROW_PX;
      let measured = 0;
      el.querySelectorAll("button[role='row']").forEach((node) => {
        if (node instanceof HTMLElement) {
          measured = Math.max(measured, node.getBoundingClientRect().height);
        }
      });
      if (measured > 0) rowPx = measured;
      const next = deskSearchPageSizeFromHeight(el.clientHeight, rowPx, headerPx);
      setPageSize((prev) => (prev === next ? prev : next));
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, [context, isDesktop, patient, matches?.length, liveHits.length]);

  const activeSearchRef = useRef({ query, includeArchived, hasSearch: matches !== null });
  activeSearchRef.current = { query, includeArchived, hasSearch: matches !== null };

  useEffect(() => {
    const { query: qRaw, includeArchived: archived, hasSearch } = activeSearchRef.current;
    if (!hasSearch || !isSearchableDeskQuery(qRaw)) return;
    const q = deskSearchQuery(qRaw);
    let cancelled = false;
    void (async () => {
      try {
        const res = await searchDeskPatients(token, q, archived, undefined, {
          page: 1,
          pageSize,
        });
        if (cancelled) return;
        setMatches(res.data.patients.map(summaryToDeskRef));
        setMatchTotal(res.data.total);
        setMatchPage(res.data.page);
      } catch {
        /* keep the current page */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pageSize, token]);

  if (contextError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {contextError}
      </p>
    );
  }

  if (!context) {
    return <p className="text-sm text-muted-foreground">Loading desk…</p>;
  }

  const lookup = resolveDeskLookup(matches, liveHits);
  const identityHintReady = isDeskIdentitySearchReady({
    name: name.trim(),
    guardianName: guardianName.trim() || undefined,
    age: deskSearchAgeYears(ageMode, age, dateOfBirth),
    gender: gender || undefined,
  });

  const noticeBanner = notice ? (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-24 right-4 z-50 w-[min(calc(100vw-2rem),22rem)] lg:bottom-6 lg:right-6"
    >
      <div className="pointer-events-auto flex animate-slide-in-from-right items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5 shadow-lg ring-1 ring-black/5">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
          aria-hidden
        >
          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
        </span>
        <p className="min-w-0 flex-1 text-sm font-medium leading-none text-foreground">
          {notice}
        </p>
        <button
          type="button"
          className="shrink-0 rounded-md p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setNotice(null)}
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  ) : null;

  const formColumn = (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const confirmNew = Boolean(dupes && dupes.length > 0);
        if (formMode === "edit") void saveEdit(confirmNew);
        else void register(confirmNew);
      }}
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-primary/25 bg-card shadow-sm"
    >
      <div className="flex shrink-0 items-start gap-3 rounded-t-xl border-b border-primary/15 bg-primary/5 px-4 py-2.5">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
          aria-hidden
        >
          {formMode === "edit" ? <Pencil className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {formMode === "edit" ? "Edit patient" : "New patient"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formMode === "edit"
              ? "Save changes to this record. Mobile collisions will ask before overwrite."
              : "We'll look for an existing record as you type."}
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-auto px-4 py-3">
        <div className={fieldColClass}>
          <Label htmlFor="desk-name">
            Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="desk-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (nameError && event.target.value.trim()) setNameError(null);
            }}
            onBlur={() => {
              const next = titleCaseDeskName(name);
              if (next !== name) setName(next);
            }}
            autoComplete="name"
            placeholder="Full name"
            aria-invalid={nameError ? true : undefined}
            className={registerFieldClass}
          />
          {nameError ? (
            <p role="alert" className="text-xs text-destructive">
              {nameError}
            </p>
          ) : null}
        </div>
        <div className={fieldColClass}>
          <Label htmlFor={ageMode === "dob" ? "desk-dob" : "desk-age"}>
            Age <span className="text-destructive">*</span>
          </Label>
          <div className="flex min-w-0 flex-nowrap items-center gap-1.5">
            {ageMode === "dob" ? (
              <Input
                id="desk-dob"
                type="date"
                max={deskTodayYmd()}
                value={dateOfBirth}
                onChange={(event) => {
                  setDateOfBirth(event.target.value);
                  if (ageError) setAgeError(null);
                }}
                aria-invalid={ageError ? true : undefined}
                className={cn(
                  registerFieldClass,
                  "w-auto shrink-0 px-2 tabular-nums [&::-webkit-calendar-picker-indicator]:ml-0 [&::-webkit-datetime-edit]:p-0"
                )}
              />
            ) : (
              <Input
                id="desk-age"
                type="number"
                min={DESK_AGE_UNIT_LIMITS[ageMode].min}
                max={DESK_AGE_UNIT_LIMITS[ageMode].max}
                placeholder={DESK_AGE_UNIT_LIMITS[ageMode].placeholder}
                value={age}
                onChange={(event) => {
                  setAge(event.target.value);
                  if (ageError) setAgeError(null);
                }}
                onWheel={(event) => event.currentTarget.blur()}
                aria-invalid={ageError ? true : undefined}
                className={cn(registerFieldClass, "w-24 shrink-0 tabular-nums")}
              />
            )}
            <div className={choiceTrackClass} role="radiogroup" aria-label="Age unit">
              {DESK_AGE_MODE_OPTIONS.map((option) => {
                const selected = ageMode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={choiceChipClass(selected)}
                    onClick={() => {
                      setAgeMode(option.value);
                      if (option.value === "dob") setAge("");
                      else setDateOfBirth("");
                      setAgeError(null);
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
          {ageError ? (
            <p role="alert" className="text-xs text-destructive">
              {ageError}
            </p>
          ) : null}
        </div>
        <fieldset className={fieldColClass}>
          <Label>
            Gender <span className="text-destructive">*</span>
          </Label>
          <div className={choiceTrackClass} role="radiogroup" aria-label="Gender">
            {GENDER_OPTIONS.map((option) => {
              const selected = gender === option.value;
              return (
                <button
                  key={option.label}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={choiceChipClass(selected)}
                  onClick={() => {
                    setGender(option.value);
                    setGenderError(null);
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          {genderError ? (
            <p role="alert" className="text-xs text-destructive">
              {genderError}
            </p>
          ) : null}
        </fieldset>
        <div className={fieldColClass}>
          <Label htmlFor="desk-guardian-name">
            Relative name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="desk-guardian-name"
            value={guardianName}
            onChange={(event) => {
              setGuardianName(event.target.value);
              if (guardianError && event.target.value.trim()) setGuardianError(null);
            }}
            onBlur={() => {
              const next = titleCaseDeskName(guardianName);
              if (next !== guardianName) setGuardianName(next);
            }}
            autoComplete="off"
            placeholder="Relative name"
            aria-invalid={guardianError ? true : undefined}
            className={registerFieldClass}
          />
          {guardianError ? (
            <p role="alert" className="text-xs text-destructive">
              {guardianError}
            </p>
          ) : null}
        </div>
        <fieldset className={fieldColClass}>
          <Label>
            Relation <span className="text-destructive">*</span>
          </Label>
          <div className={choiceTrackClass} role="radiogroup" aria-label="Relation">
            {DESK_GUARDIAN_RELATIONS.map((option) => {
              const selected = guardianRelation === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={choiceChipClass(selected)}
                  onClick={() => {
                    setGuardianRelation(option.value);
                    setRelationError(null);
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          {relationError ? (
            <p role="alert" className="text-xs text-destructive">
              {relationError}
            </p>
          ) : null}
        </fieldset>
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
          <div className={fieldColClass}>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="desk-register-phone">
                Mobile <span className="text-destructive">*</span>
              </Label>
              <span
                className={cn(
                  "text-xs tabular-nums",
                  phoneError ? "text-destructive" : "text-muted-foreground"
                )}
              >
                {digitsLast10(phone).length}/10
              </span>
            </div>
            <Input
              id="desk-register-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="10-digit mobile"
              value={formatDeskPhone(phone)}
              onChange={(event) => {
                const next = event.target.value.replace(/\D/g, "").slice(0, 10);
                setPhone(next);
                if (phoneError && next.length === 10) setPhoneError(null);
              }}
              onBlur={() => {
                if (phoneError && isCompleteDeskPhone(phone)) setPhoneError(null);
              }}
              aria-invalid={phoneError ? true : undefined}
              className={cn(registerFieldClass, "tabular-nums")}
            />
            {phoneError ? (
              <p role="alert" className="text-xs text-destructive">
                {phoneError}
              </p>
            ) : null}
          </div>
          <div className={fieldColClass}>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="desk-alt-phone">Alternate mobile</Label>
              <span
                className={cn(
                  "text-xs tabular-nums",
                  altPhoneError ? "text-destructive" : "text-muted-foreground"
                )}
              >
                {digitsLast10(altPhone).length}/10
              </span>
            </div>
            <Input
              id="desk-alt-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Optional"
              value={formatDeskPhone(altPhone)}
              onChange={(event) => {
                const next = event.target.value.replace(/\D/g, "").slice(0, 10);
                setAltPhone(next);
                if (altPhoneError && (next.length === 0 || next.length === 10)) {
                  setAltPhoneError(null);
                }
              }}
              aria-invalid={altPhoneError ? true : undefined}
              className={cn(registerFieldClass, "tabular-nums")}
            />
            {altPhoneError ? (
              <p role="alert" className="text-xs text-destructive">
                {altPhoneError}
              </p>
            ) : null}
          </div>
        </div>
        <div className={fieldColClass}>
          <Label htmlFor="desk-address">Address</Label>
          <Input
            id="desk-address"
            value={address}
            onChange={(event) => setAddress(event.target.value.slice(0, DESK_ADDRESS_MAX))}
            autoComplete="street-address"
            placeholder="Optional"
            className={registerFieldClass}
          />
        </div>
      </div>

      {saveError ? (
        <p role="alert" className="shrink-0 px-4 pb-1 text-sm text-destructive">
          {saveError}
        </p>
      ) : null}

      <div className="mt-auto flex shrink-0 justify-end border-t border-border/60 px-4 py-2">
        <div className="flex w-fit flex-wrap items-center justify-end gap-2">
          {formMode === "edit" ? (
            <Button type="button" variant="ghost" className="h-9" disabled={saving} onClick={cancelEdit}>
              Cancel
            </Button>
          ) : null}
          <Button
            type="submit"
            className="h-9 px-4"
            disabled={
              saving ||
              !name.trim() ||
              !isCompleteDeskPhone(phone) ||
              !(ageMode === "dob"
                ? isValidDeskDob(dateOfBirth)
                : isValidDeskAgeCount(ageMode, age)) ||
              !guardianName.trim() ||
              !guardianRelation ||
              !gender
            }
          >
            {saving
              ? "Saving…"
              : formMode === "edit"
                ? dupes && dupes.length > 0
                  ? "Keep this record"
                  : "Save"
                : dupes && dupes.length > 0
                  ? "Create new anyway"
                  : "Register"}
          </Button>
        </div>
      </div>
    </form>
  );

  const isArchived = Boolean(patient?.archived_at);
  const canGoBack = (matches !== null && matches.length > 0) || liveHits.length > 0;
  const todayVisit = patient ? findDeskSameDayVisit(todayRows, patient.id) : null;
  const todayBucket = todayVisit ? deskQueueBucket(todayVisit) : null;
  const todayToken = todayVisit ? deskOpdNumber(todayVisit, todayRows) : null;
  const lockBookToday = Boolean(todayVisit) && slotDate === context.today;
  const todayStatusCopy =
    todayBucket === "arrived"
      ? todayToken != null
        ? `Already arrived · Token ${todayToken}`
        : "Already arrived"
      : todayBucket === "seen"
        ? "Seen today"
        : null;
  const deskVitalsAppointmentId: string | null = isArchived
    ? null
    : (vitalsAppointmentId ??
      (todayVisit && (todayBucket === "arrived" || todayBucket === "seen")
        ? todayVisit.id
        : null));
  const showArrive =
    !isArchived &&
    !deskVitalsAppointmentId &&
    todayBucket !== "arrived" &&
    todayBucket !== "seen";

  const patientCard = patient ? (
    <div className="w-full self-start space-y-3">
      <button
        type="button"
        className="-ml-1 flex h-8 items-center gap-1.5 rounded-md px-1 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={canGoBack ? backToResults : resetSearch}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {canGoBack ? "Back" : "Search another"}
      </button>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="p-5">
          <DeskPatientFacts
            patient={patient}
            timezone={context.timezone}
            size="hero"
            archived={isArchived}
          />
          {archiveError ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {archiveError}
            </p>
          ) : null}
          {bookError ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {bookError}
            </p>
          ) : null}
        </div>

        {deskVitalsAppointmentId ? (
          <div className="border-t border-border/60 px-5 py-4">
            <DeskVitalsForm
              token={token}
              appointmentId={deskVitalsAppointmentId}
              onFinished={vitalsAppointmentId ? finishVitalsAfterCheckIn : undefined}
              skipFetch={Boolean(vitalsAppointmentId)}
            />
          </div>
        ) : null}

        {showBook && !isArchived ? (
          <div className="space-y-3 border-t border-border/60 px-5 py-4">
            {!lockBookToday && slots.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                We&apos;ll text {formatDeskPhone(patient.phone) || "them"} this time. Walk-ins
                at the desk are not notified.
              </p>
            ) : null}
            <div className="w-fit space-y-1.5">
              <Label htmlFor="desk-slot-date">Date</Label>
              <Input
                id="desk-slot-date"
                type="date"
                value={slotDate}
                min={context.today}
                onChange={(event) => setSlotDate(event.target.value)}
                className="w-40"
              />
            </div>
            {lockBookToday ? (
              <p className="text-sm text-muted-foreground">
                Already on today&apos;s list. Pick another date to book ahead.
              </p>
            ) : slotsLoading ? (
              <p className="text-sm text-muted-foreground">Loading times…</p>
            ) : null}
            {slotsError && !lockBookToday ? (
              <p role="alert" className="text-sm text-destructive">
                {slotsError}
              </p>
            ) : null}
            {!lockBookToday && !slotsLoading && slots.length === 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  No clock slots. Add to today&apos;s list without arriving.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={booking}
                  onClick={() =>
                    void book({
                      appointmentDate: walkInAppointmentIso(),
                      origin: "walk_in",
                      arrive: false,
                    })
                  }
                >
                  Add to today
                </Button>
              </div>
            ) : null}
            {!lockBookToday && slots.length > 0 ? (
              <ul className="flex flex-wrap gap-2" aria-label="Available times">
                {slots.map((slot) => (
                  <li key={slot.start}>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-11 rounded-full px-4 lg:h-8 lg:px-3"
                      disabled={booking}
                      onClick={() =>
                        void book({
                          appointmentDate: slot.start,
                          origin: "booked",
                          arrive: false,
                        })
                      }
                    >
                      {new Intl.DateTimeFormat("en-IN", {
                        timeZone: context.timezone,
                        hour: "numeric",
                        minute: "2-digit",
                      }).format(new Date(slot.start))}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className={cn("border-t border-border/60 px-5 py-3", isArchived && "max-lg:hidden")}>
          {isArchived ? (
            <Button
              type="button"
              className="h-10 w-full"
              disabled={archiving}
              onClick={() => void restoreSelected()}
            >
              {archiving ? "Restoring…" : "Restore"}
            </Button>
          ) : (
            <div className="space-y-2">
              {todayStatusCopy ? (
                <p className="text-sm text-muted-foreground">{todayStatusCopy}</p>
              ) : null}
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 px-2 text-muted-foreground"
                    disabled={booking}
                    onClick={startEdit}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 px-2 text-muted-foreground"
                    disabled={archiving}
                    onClick={() => void archiveSelected()}
                  >
                    {archiving ? "Hiding…" : "Archive"}
                  </Button>
                </div>
                <div className="flex min-w-0 shrink-0 items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 shrink-0"
                    disabled={booking}
                    onClick={() => setShowBook((open) => !open)}
                    aria-expanded={showBook}
                  >
                    {showBook ? "Hide times" : "Book a time"}
                  </Button>
                  {showArrive ? (
                    <Button
                      type="button"
                      className="hidden h-10 shrink-0 lg:inline-flex"
                      disabled={booking || todayLoading}
                      onClick={() =>
                        todayVisit
                          ? void markArrived(todayVisit.id)
                          : void book({
                              appointmentDate: walkInAppointmentIso(),
                              origin: "walk_in",
                              arrive: true,
                            })
                      }
                    >
                    {booking ? "Checking in…" : "Check in"}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {isArchived || showArrive ? (
        <div
          className={cn(
            "sticky bottom-0 z-20 -mx-4 mt-2 flex gap-2 border-t border-border bg-background px-4 py-3",
            "lg:hidden"
          )}
        >
          {isArchived ? (
            <Button
              type="button"
              className="h-11 flex-1 px-5"
              disabled={archiving}
              onClick={() => void restoreSelected()}
            >
              {archiving ? "Restoring…" : "Restore"}
            </Button>
          ) : (
            <Button
              type="button"
              className="h-11 flex-1 px-5"
              disabled={booking || todayLoading}
              onClick={() =>
                todayVisit
                  ? void markArrived(todayVisit.id)
                  : void book({
                      appointmentDate: walkInAppointmentIso(),
                      origin: "walk_in",
                      arrive: true,
                    })
              }
            >
              {booking ? "Checking in…" : "Check in"}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  ) : null;

  const resultList =
    lookup.rows.length > 0 ? (
      <>
        <div
          className="hidden h-full min-h-0 overflow-hidden rounded-xl border border-border bg-card lg:flex lg:flex-col"
          role="table"
          aria-label="Matching patients"
        >
          <div
            className="sticky top-0 z-10 grid shrink-0 border-b border-border/50 bg-muted/60 backdrop-blur"
            style={{ gridTemplateColumns: DESK_MATCH_GRID }}
            role="row"
          >
            {DESK_MATCH_HEADER.map((col) => (
              <div
                key={col.key}
                role="columnheader"
                className="min-w-0 truncate px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {col.srOnly ? <span className="sr-only">{col.label}</span> : col.label}
              </div>
            ))}
          </div>
          <div className="min-h-0">
          {lookup.rows.map((row) => {
            const guardian = formatDeskGuardian(
              row.guardian_name,
              row.guardian_relation,
              row.gender
            );
            return (
              <button
                key={row.id}
                type="button"
                role="row"
                className="grid w-full items-center border-b border-border/30 text-left text-sm last:border-b-0 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ gridTemplateColumns: DESK_MATCH_GRID }}
                onClick={() => selectPatient(row)}
              >
                <span className="self-stretch bg-primary/50" aria-hidden />
                <span className="px-2 py-2 tabular-nums text-xs text-muted-foreground">
                  {row.medical_record_number ?? "—"}
                </span>
                <span className="flex min-w-0 items-center gap-1.5 px-2 py-2">
                  <span className="truncate font-medium">{row.name}</span>
                  {row.archived_at ? (
                    <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Archived
                    </span>
                  ) : todayRows.some(
                      (visit) => visit.patient_id === row.id && isDeskSameDayLockVisit(visit)
                    ) ? (
                    <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-primary">
                      Today
                    </span>
                  ) : null}
                </span>
                <span className="px-2 py-2 tabular-nums text-xs text-muted-foreground">
                  {formatDeskAgeSex(row.age, row.gender)}
                </span>
                <span className="min-w-0 px-2 py-2 text-xs text-muted-foreground">
                  <span className="block truncate">{guardian || "—"}</span>
                </span>
                <span className="px-2 py-2 tabular-nums text-xs text-muted-foreground">
                  {formatDeskPhone(row.phone) || "—"}
                </span>
                <span className="px-2 py-2 text-xs text-muted-foreground">
                  {row.last_appointment_date
                    ? formatDeskDate(row.last_appointment_date, context.timezone)
                    : "No visits yet"}
                </span>
              </button>
            );
          })}
          </div>
        </div>
        <ul
          className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:hidden"
          aria-label="Matching patients"
        >
          {lookup.rows.map((row) => {
            const guardian = formatDeskGuardian(
              row.guardian_name,
              row.guardian_relation,
              row.gender
            );
            return (
              <li key={row.id}>
                <button
                  type="button"
                  className="flex w-full items-stretch text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => selectPatient(row)}
                >
                  <span className="w-1 shrink-0 bg-primary/50" aria-hidden />
                  <div className="min-w-0 flex-1 px-3 py-3">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {row.name}
                      {row.archived_at ? (
                        <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Archived
                        </span>
                      ) : todayRows.some(
                          (visit) => visit.patient_id === row.id && isDeskSameDayLockVisit(visit)
                        ) ? (
                        <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-primary">
                          Today
                        </span>
                      ) : null}
                    </p>
                    {guardian ? (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{guardian}</p>
                    ) : null}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {formatDeskPhone(row.phone) || "No mobile"}
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {row.medical_record_number ?? "MRN pending"}
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {formatDeskAgeSex(row.age, row.gender)}
                      </span>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </>
    ) : null;

  const lookupColumn = (
    <div className="flex h-full min-h-0 flex-col">
      {patient ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-auto">{patientCard}</div>
      ) : (
        <>
          <form onSubmit={(event) => void onSearch(event)} className="shrink-0 space-y-2">
            <Label
              htmlFor="desk-search"
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              Find a patient
            </Label>
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="desk-search"
                  type="search"
                  autoComplete="off"
                  autoFocus={isDesktop}
                  placeholder="Mobile, MRN, or name"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label="Mobile, MRN, or name"
                  aria-invalid={searchError ? true : undefined}
                  className="h-11 pl-8 [-webkit-appearance:none] focus-visible:ring-inset lg:h-9 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
                />
              </div>
              <Button
                type="submit"
                className="h-11 px-4 lg:h-9"
                disabled={searching || !isSearchableDeskQuery(query)}
              >
                {searching ? "Searching…" : "Search"}
              </Button>
            </div>
            {searchError ? (
              <p role="alert" className="w-full text-sm text-destructive">
                {searchError}
              </p>
            ) : null}
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(event) => {
                  const next = event.target.checked;
                  setIncludeArchived(next);
                  if (matches === null || !isSearchableDeskQuery(query)) return;
                  const q = deskSearchQuery(query);
                  void (async () => {
                    try {
                      const res = await searchDeskPatients(token, q, next, undefined, {
                        page: 1,
                        pageSize,
                      });
                      setMatches(res.data.patients.map(summaryToDeskRef));
                      setMatchTotal(res.data.total);
                      setMatchPage(res.data.page);
                    } catch (err) {
                      setSearchError(deskErrorMessage(err, "Search failed"));
                    }
                  })();
                }}
                className="h-4 w-4 accent-primary"
              />
              Show archived
            </label>
          </form>

          <p className="mt-3 min-h-5 shrink-0 text-sm text-muted-foreground">
            {lookup.source === "search" ? (
              <>
                {(() => {
                  const total = matchTotal ?? lookup.rows.length;
                  const last = deskSearchPageCount(total, pageSize);
                  const start = total === 0 ? 0 : (matchPage - 1) * pageSize + 1;
                  const end = deskSearchVisibleEnd(
                    matchPage,
                    pageSize,
                    lookup.rows.length,
                    total
                  );
                  const noun = total === 1 ? "patient" : "patients";
                  const count =
                    last > 1 ? `Showing ${start}–${end} of ${total}` : String(total);
                  return `${count} ${noun} `;
                })()}
                {deskSearchKind(query) === "phone" ? (
                  <>
                    on{" "}
                    <span className="tabular-nums text-foreground">
                      {formatDeskPhone(lookup.rows[0]?.phone ?? query) || "this number"}
                    </span>
                  </>
                ) : (
                  <>
                    matching{" "}
                    <span className="text-foreground">{deskSearchQuery(query)}</span>
                  </>
                )}
              </>
            ) : null}
            {lookup.source === "live" ? (
              <>
                {(() => {
                  const total = liveTotal ?? lookup.rows.length;
                  const last = deskSearchPageCount(total, pageSize);
                  const start = total === 0 ? 0 : (livePage - 1) * pageSize + 1;
                  const end = deskSearchVisibleEnd(
                    livePage,
                    pageSize,
                    lookup.rows.length,
                    total
                  );
                  const noun = total === 1 ? "patient" : "patients";
                  const count =
                    last > 1 ? `Showing ${start}–${end} of ${total}` : String(total);
                  const label = deskSearchQuery(query) || deskSearchQuery(name) || "this name";
                  return (
                    <>
                      {count} {noun} matching{" "}
                      <span className="text-foreground">{label}</span>
                    </>
                  );
                })()}
              </>
            ) : null}
            {lookup.source === "empty-search" ? (
              <>
                No patients for{" "}
                <span className="text-foreground">{deskSearchQuery(query)}</span>. Fill in
                the form to register.
              </>
            ) : null}
          </p>

          <div className="mt-3 flex min-h-0 flex-1 flex-col">
            <div
              ref={listViewportRef}
              className="min-h-0 flex-1 overflow-hidden max-h-[min(28rem,55vh)] lg:max-h-none"
            >
            {lookup.source === "idle" ? (
              <div
                role="status"
                className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-4 py-8 text-center"
              >
                {searching || liveSearching ? (
                  <p className="text-base font-medium text-foreground">Searching…</p>
                ) : (
                  <>
                    <p className="text-base font-medium text-foreground">
                      Search a mobile, MRN, or name
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {isCompleteDeskPhone(phone) || identityHintReady
                        ? "None yet. Register will create a new record."
                        : "Or type a name to search. Age and relative narrow the list."}
                    </p>
                  </>
                )}
              </div>
            ) : null}

            {resultList}

            {dupes && dupes.length > 0 ? (
              <div className="mt-3 space-y-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
                <p className="text-xs font-medium text-warning">Possible existing patient</p>
                <ul className="space-y-2" aria-label="Possible existing patients">
                  {dupes.map((row) => (
                    <li key={row.patientId}>
                      <button
                        type="button"
                        className="w-full rounded-lg border border-border bg-card p-3 text-left hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => selectPatient(matchToDeskRef(row))}
                      >
                        <p className="text-sm font-medium text-foreground">This is {row.name}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {formatDeskPhone(row.phone) || "No mobile"}
                          {row.medicalRecordNumber ? ` · ${row.medicalRecordNumber}` : ""}
                          {formatDeskGuardian(row.guardianName, row.guardianRelation, row.gender)
                            ? ` · ${formatDeskGuardian(row.guardianName, row.guardianRelation, row.gender)}`
                            : ""}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            </div>
            {(() => {
              const paged =
                lookup.source === "search" && matchTotal != null
                  ? {
                      total: matchTotal,
                      page: matchPage,
                      go: goToMatchPage,
                      busy: searching,
                    }
                  : lookup.source === "live" && liveTotal != null
                    ? {
                        total: liveTotal,
                        page: livePage,
                        go: goToLivePage,
                        busy: liveSearching,
                      }
                    : null;
              const last = paged ? deskSearchPageCount(paged.total, pageSize) : 1;
              return (
                <div className="mt-3 flex h-8 shrink-0 items-center justify-center">
                  {paged && last > 1 ? (
                    <nav
                      className="flex flex-wrap items-center justify-center gap-1"
                      aria-label="Search result pages"
                    >
                      {deskSearchPageNumbers(paged.page, last).map(
                        (item, index) =>
                          item === "ellipsis" ? (
                            <span
                              key={`e-${index}`}
                              className="px-1.5 text-sm text-muted-foreground"
                              aria-hidden
                            >
                              …
                            </span>
                          ) : (
                            <Button
                              key={item}
                              type="button"
                              variant={item === paged.page ? "default" : "outline"}
                              size="sm"
                              className="h-8 min-w-8 px-2 tabular-nums"
                              disabled={paged.busy}
                              aria-current={item === paged.page ? "page" : undefined}
                              onClick={() => void paged.go(item)}
                            >
                              {item}
                            </Button>
                          )
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-3"
                        disabled={paged.busy || paged.page >= last}
                        onClick={() => void paged.go(paged.page + 1)}
                      >
                        Next
                      </Button>
                    </nav>
                  ) : null}
                </div>
              );
            })()}
          </div>
        </>
      )}
    </div>
  );

  if (!isDesktop) {
    if (formMode === "edit") {
      return (
        <div className="mx-auto flex w-full max-w-xl flex-col">
          {formColumn}
          {noticeBanner}
        </div>
      );
    }
    if (patient) {
      return (
        <div className="mx-auto flex w-full max-w-xl flex-col">
          {patientCard}
          {noticeBanner}
        </div>
      );
    }
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        {lookupColumn}
        {formColumn}
        {noticeBanner}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DeskSplit
        left={formColumn}
        right={<div className="flex h-full min-h-0 flex-col">{lookupColumn}</div>}
      />
      {noticeBanner}
    </div>
  );
}
