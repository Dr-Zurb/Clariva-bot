# Learning assist and autobook (learn-05)

**Audience:** doctors and operators configuring Clariva.

## Assist (inbox)

On **Service match reviews**, when your practice has **prior** staff resolutions stored as learning examples with the **same structured signal pattern** as the current case, the inbox shows a short **Assist** line: how often staff chose each final visit type (counts and catalog labels only). It does **not** change routing; you always **Confirm**, **Reassign**, or **Cancel**.

## Autobook (opt-in)

If you **accepted a policy** from the learning-policy flow (learn-04) and **autobook is enabled** for the deployment, the system may **apply that saved final visit type automatically** when the **same pattern key and proposed service** match the current Instagram DM case. The patient receives the usual **booking link** message (same path as after staff reassignment). No staff review row is created for that conversation turn.

**Kill switch:** set `LEARNING_AUTOBOOK_ENABLED=false` in the API environment to disable autobook immediately while keeping policies on file.

**Disable one policy:** `POST /api/v1/service-match-learning/autobook-policies/:id/disable` (authenticated doctor).

## Safety

- Matching uses **structured** fields only (reason codes, candidate keys, proposed catalog key), not free-text patient messages.
- Autobook requires an **enabled** row in `service_match_autobook_policies` and the global flag above.
