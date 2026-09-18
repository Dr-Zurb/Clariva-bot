# Codex product engineering loop

**Purpose:** let Codex act as the product engineer for Halo Aid by testing the running app, fixing the code, and verifying the same flow again.

## Start a loop

Define one flow in this shape:

- **Actor:** test doctor, test staff member, or dummy patient.
- **Starting state:** route and required dummy records.
- **Goal:** one observable outcome.
- **Safety:** no real patient data and no real clinical or financial action.
- **Done when:** a short, binary acceptance checklist.

If the request is still an idea, use the implementation triage process before coding.

## Execute

1. Reproduce the current behavior in the browser.
2. Record the route, trigger, observed result, and expected result without PII/PHI.
3. Inspect related code and existing patterns before editing.
4. Decide whether the issue is a direct fix or needs System T planning.
5. Apply the smallest coherent change.
6. Run focused type, lint, and test checks appropriate to the changed area.
7. Refresh or restart only what is necessary.
8. Repeat the original browser flow from its starting state.
9. Test the meaningful failure and recovery states.
10. Update affected task and reference docs in the same change-set.

Continue until the acceptance checklist is satisfied or a real product decision blocks progress.

## Browser coverage

For each relevant flow, check:

- happy path;
- empty and first-use state;
- loading and delayed response;
- validation and server failure;
- refresh and back-navigation;
- duplicate submission or rapid repeat action;
- keyboard and focus behavior;
- narrow viewport when the surface is used on smaller screens;
- clear success, failure, and recovery feedback.

Apply only the states that materially affect the flow. Do not expand a focused fix into a full-product audit.

## Product judgment

Evaluate the interface as a busy clinician would:

- Is the next action obvious?
- Is clinical context visible at the moment it is needed?
- Can an accidental action be recovered?
- Does the interface distinguish draft, saved, issued, finished, and failed states?
- Are labels clinically understandable and operationally precise?
- Does the flow avoid unnecessary clicks, waiting, and repeated entry?

Do not invent medical advice or make clinical decisions. Test workflow behavior with dummy content.

## Escalate or plan

Use a durable System T plan when the work has multiple acceptance gates, roughly ten or more tasks, cross-day phases, or an unresolved decision lock. Use the Codex model policy for the planning task, then return implementation to the normal execution tier.

## Completion report

Report:

- behavior fixed or improved;
- browser flow verified;
- focused checks run;
- docs updated;
- residuals or untested states.

“Tests passed” must name the scope. “Shipped” requires the full definition-of-done gate.

**Created:** 2026-09-10
