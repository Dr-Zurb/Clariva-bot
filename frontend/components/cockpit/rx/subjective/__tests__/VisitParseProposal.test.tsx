import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { VisitParseProposal } from "@/components/cockpit/rx/subjective/VisitParseProposal";
import {
  emptyVisitParseProposal,
  type VisitParseProposal as VisitParseProposalDto,
} from "@/lib/cockpit/visit-parse-orchestrator";

const proposal: VisitParseProposalDto = {
  ...emptyVisitParseProposal("Complaint: fever. Plan: azithro 500."),
  subjective: [
    { name: "Fever", patch: { duration: "3 days" }, associated: [] },
    { name: "Cough", patch: {}, associated: [] },
  ],
  plan: [
    { name: "Azithromycin", strengthValue: 500, strengthUnit: "mg" },
    { name: "Paracetamol", strengthValue: 650, strengthUnit: "mg" },
  ],
  subjectiveSource: ["ai", "ai"],
  planSource: ["ai", "ai"],
  planParsed: [null, null],
};

function renderReady(
  overrides: Partial<ComponentProps<typeof VisitParseProposal>> = {}
) {
  const onAdd = vi.fn();
  const onAddTab = vi.fn();
  const onDismiss = vi.fn();
  render(
    <VisitParseProposal
      status="ready"
      proposal={proposal}
      onAdd={onAdd}
      onAddTab={onAddTab}
      onDismiss={onDismiss}
      {...overrides}
    />
  );
  return { onAdd, onAddTab, onDismiss };
}

describe("VisitParseProposal (vnb-04)", () => {
  it("renders Subjective and Medications groups and scopes Add all to one tab", () => {
    const { onAdd, onAddTab } = renderReady();

    expect(screen.getByTestId("visit-parse-group-subjective")).toHaveTextContent(
      "2 items for Subjective →"
    );
    expect(screen.getByTestId("visit-parse-group-plan")).toHaveTextContent(
      "2 items for Medications →"
    );
    expect(screen.getByText("Fever")).toBeInTheDocument();
    expect(screen.getByText("Azithromycin")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add all Subjective" }));
    expect(onAddTab).toHaveBeenCalledTimes(1);
    expect(onAddTab).toHaveBeenCalledWith("subjective");

    fireEvent.click(screen.getByRole("button", { name: "Add Fever" }));
    expect(onAdd).toHaveBeenCalledWith("subjective", 0);
  });

  it("has no global Add all that spans tabs", () => {
    renderReady();
    expect(
      screen.queryByRole("button", { name: /^Add all$/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add all Subjective" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add all Medications" })
    ).toBeInTheDocument();
  });

  it("hides an empty group and does not offer Add all for a single item", () => {
    renderReady({
      proposal: {
        ...proposal,
        subjective: [{ name: "Fever", patch: {}, associated: [] }],
        plan: [],
        subjectiveSource: ["ai"],
        planSource: [],
        planParsed: [],
      },
    });
    expect(screen.getByTestId("visit-parse-group-subjective")).toHaveTextContent(
      "1 item for Subjective →"
    );
    expect(
      screen.queryByTestId("visit-parse-group-plan")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Add all/i })
    ).not.toBeInTheDocument();
  });

  it("renders Vitals / Assessment / Investigations groups without Add all", () => {
    const { onAdd } = renderReady({
      proposal: {
        ...emptyVisitParseProposal("mixed"),
        vitals: [
          {
            source: "ai",
            option: {
              id: "set:vitalsSpo2:98",
              label: "Set SpO₂ to 98",
              focusField: "vitalsSpo2",
              writes: [{ key: "vitalsSpo2", value: 98 }],
            },
          },
        ],
        assessment: [
          { source: "ai", suggestion: { code: "1A00", title: "Viral fever" } },
        ],
        investigations: [
          {
            source: "ai",
            term: "LFT",
            catalogValue: "panel:lft",
            label: "LFT",
          },
        ],
      },
    });

    expect(screen.getByTestId("visit-parse-group-vitals")).toBeInTheDocument();
    expect(screen.getByTestId("visit-parse-group-assessment")).toBeInTheDocument();
    expect(
      screen.getByTestId("visit-parse-group-investigations")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Add all/i })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add Viral fever" }));
    expect(onAdd).toHaveBeenCalledWith("assessment", 0);
  });

  it("shows applied summary without re-confirm buttons for deterministic items", () => {
    const applied = {
      ...emptyVisitParseProposal("spo2 98"),
      vitals: [
        {
          source: "deterministic" as const,
          option: {
            id: "set:vitalsSpo2:98",
            label: "Set SpO₂ to 98",
            focusField: "vitalsSpo2" as const,
            writes: [{ key: "vitalsSpo2" as const, value: 98 }],
          },
        },
      ],
    };
    renderReady({
      proposal: emptyVisitParseProposal("spo2 98"),
      applied,
    });
    expect(screen.getByTestId("visit-parse-applied-summary")).toHaveTextContent(
      "Applied: Set SpO₂ to 98"
    );
    expect(screen.getByText("Added to this visit")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Add Set SpO/i })
    ).not.toBeInTheDocument();
  });

  it("Keep as typed and dismiss only call the provided callbacks", () => {
    const onKeepAsTyped = vi.fn();
    const { onDismiss } = renderReady({ onKeepAsTyped });
    fireEvent.click(screen.getByRole("button", { name: /Keep as typed/i }));
    expect(onKeepAsTyped).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("loading copy is non-blocking and shows no groups", () => {
    render(
      <VisitParseProposal
        status="loading"
        proposal={null}
        onAdd={vi.fn()}
        onAddTab={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(screen.getByText(/Reading this visit/i)).toBeInTheDocument();
    expect(
      screen.queryByTestId("visit-parse-group-subjective")
    ).not.toBeInTheDocument();
  });
});

describe("VisitParseProposal (vnt-03)", () => {
  const transcript =
    "Patient said I think I have dengue and spo2 was ninety eight.";
  const dengueStart = transcript.indexOf("I think I have dengue");
  const dengueEnd = dengueStart + "I think I have dengue".length;
  const dengueQuote = transcript.slice(dengueStart, dengueEnd);

  const transcriptProposal: VisitParseProposalDto = {
    ...emptyVisitParseProposal(transcript),
    subjective: [
      { name: "Dengue", patch: {}, associated: [] },
      { name: "Fever", patch: {}, associated: [] },
    ],
    subjectiveSource: ["transcript", "transcript"],
    subjectiveEvidence: [
      { transcriptId: "tr-1", spanStart: dengueStart, spanEnd: dengueEnd },
      {
        transcriptId: "tr-1",
        spanStart: dengueStart,
        spanEnd: dengueEnd,
      },
    ],
  };

  it("renders the verbatim transcript slice as the quote", () => {
    renderReady({
      proposal: transcriptProposal,
      transcriptText: transcript,
    });
    const quotes = screen.getAllByTestId("visit-parse-quote");
    expect(quotes[0]?.textContent).toBe(`“${dengueQuote}”`);
    expect(quotes[0]?.textContent?.slice(1, -1)).toBe(dengueQuote);
  });

  it("does not offer Add all for a transcript group", () => {
    const { onAddTab, onAdd } = renderReady({
      proposal: transcriptProposal,
      transcriptText: transcript,
    });
    expect(
      screen.queryByRole("button", { name: /Add all/i })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add Dengue" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith("subjective", 0);
    expect(onAddTab).not.toHaveBeenCalled();
  });

  it("drops a row whose span does not resolve — never renders a blank quote", () => {
    renderReady({
      proposal: {
        ...emptyVisitParseProposal(transcript),
        vitals: [
          {
            source: "transcript",
            option: {
              id: "set:vitalsSpo2:98",
              label: "Set SpO₂ to 98",
              focusField: "vitalsSpo2",
              writes: [{ key: "vitalsSpo2", value: 98 }],
            },
            evidence: {
              transcriptId: "tr-1",
              spanStart: 0,
              spanEnd: transcript.length + 40,
            },
          },
        ],
      },
      transcriptText: transcript,
    });
    expect(screen.queryByTestId("visit-parse-quote")).not.toBeInTheDocument();
    expect(screen.queryByTestId("visit-parse-group-vitals")).not.toBeInTheDocument();
    expect(screen.queryByText("Set SpO₂ to 98")).not.toBeInTheDocument();
  });

  it("renders markup-like quote characters as literal text", () => {
    const raw = "said <img src=x onerror=alert(1)> today";
    const start = raw.indexOf("<img");
    const end = raw.indexOf(">") + 1;
    const slice = raw.slice(start, end);
    renderReady({
      proposal: {
        ...emptyVisitParseProposal(raw),
        subjective: [{ name: "Note", patch: {}, associated: [] }],
        subjectiveSource: ["transcript"],
        subjectiveEvidence: [
          { transcriptId: "tr-1", spanStart: start, spanEnd: end },
        ],
      },
      transcriptText: raw,
    });
    const quote = screen.getByTestId("visit-parse-quote");
    expect(quote.textContent).toBe(`“${slice}”`);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(quote.querySelector("img")).toBeNull();
  });
});
