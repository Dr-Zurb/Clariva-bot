import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConsultTimelinePane } from "../ConsultTimelinePane";
import {
  getPatientConsultTimeline,
  type ConsultTimelineEntry,
} from "@/lib/api/patients";

vi.mock("@/lib/api/patients", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/patients")>(
    "@/lib/api/patients",
  );
  return {
    ...actual,
    getPatientConsultTimeline: vi.fn(),
  };
});

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: unknown;
  }) => (
    <a href={href} {...rest}>
      {children as never}
    </a>
  ),
}));

const mockedTimeline = vi.mocked(getPatientConsultTimeline);

const PATIENT_ID = "22222222-2222-2222-2222-222222222222";
const APPT_ID = "a1111111-1111-1111-1111-111111111111";

function entry(
  overrides: Partial<ConsultTimelineEntry> = {},
): ConsultTimelineEntry {
  return {
    sessionId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    appointmentId: APPT_ID,
    consultedAt: "2026-08-01T10:00:00.000Z",
    modality: "video",
    durationSeconds: 900,
    artifacts: {
      hasRecording: true,
      recordingDeleted: false,
      hasTranscript: true,
      hasPrescription: false,
      hasSnapshots: false,
    },
    ...overrides,
  };
}

beforeEach(() => {
  mockedTimeline.mockReset();
});

describe("ConsultTimelinePane", () => {
  it("renders an honest empty state when there are no consults", async () => {
    mockedTimeline.mockResolvedValue({ items: [], hasMore: false });
    render(<ConsultTimelinePane patientId={PATIENT_ID} token="t1" />);
    expect(await screen.findByText("No consults yet for this patient.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows artifact chips and reuses the appointment cockpit drill-down", async () => {
    mockedTimeline.mockResolvedValue({ items: [entry()], hasMore: false });
    render(<ConsultTimelinePane patientId={PATIENT_ID} token="t1" />);

    expect(await screen.findByText(/Recording/)).toBeInTheDocument();
    expect(screen.getByText(/Transcript/)).toBeInTheDocument();
    expect(screen.getByText(/15m 00s/)).toBeInTheDocument();

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      `/dashboard/appointments/${APPT_ID}?from=patients-v2&pid=${PATIENT_ID}`,
    );
    expect(screen.queryByRole("button", { name: /delete|hide|remove/i })).not.toBeInTheDocument();
  });

  it("labels a hard-deleted recording instead of pretending it was never recorded", async () => {
    mockedTimeline.mockResolvedValue({
      items: [
        entry({
          artifacts: {
            hasRecording: false,
            recordingDeleted: true,
            hasTranscript: false,
            hasPrescription: false,
            hasSnapshots: false,
          },
        }),
      ],
      hasMore: false,
    });
    render(<ConsultTimelinePane patientId={PATIENT_ID} token="t1" />);
    expect(
      await screen.findByText("Recording deleted (retention)"),
    ).toBeInTheDocument();
  });

  it("shows a consult with no artifacts as present, not as an error", async () => {
    mockedTimeline.mockResolvedValue({
      items: [
        entry({
          artifacts: {
            hasRecording: false,
            recordingDeleted: false,
            hasTranscript: false,
            hasPrescription: false,
            hasSnapshots: false,
          },
        }),
      ],
      hasMore: false,
    });
    render(<ConsultTimelinePane patientId={PATIENT_ID} token="t1" />);
    expect(
      await screen.findByText(
        "No recording, transcript, prescription, or snapshots",
      ),
    ).toBeInTheDocument();
  });

  it("surfaces an error and retries", async () => {
    mockedTimeline
      .mockRejectedValueOnce(new Error("Unable to load consults."))
      .mockResolvedValueOnce({ items: [], hasMore: false });
    render(<ConsultTimelinePane patientId={PATIENT_ID} token="t1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to load consults.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => {
      expect(screen.getByText("No consults yet for this patient.")).toBeInTheDocument();
    });
    expect(mockedTimeline).toHaveBeenCalledTimes(2);
  });
});
