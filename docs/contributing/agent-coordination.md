# Manual shared-account agent coordination

This runbook is the interim operator procedure for concurrent agents using the
same GitHub account. It implements the manual phase of
[ADR-0005](../adr/0005-concurrent-agent-development.md). It is deliberately
cooperative and fail-closed; it is not an exclusive lock and does not replace
the serialized controller planned in
[#140](https://github.com/Tigon32/archimate-js/issues/140).

## Authority and record format

The authoritative state is a sequence of issue comments containing exactly one
fenced JSON object per record:

````
```json
{ ... }
```
````

Comment IDs are GitHub comment identifiers represented as **decimal strings**;
do not emit JSON numbers for IDs. Timestamps are UTC RFC 3339 strings with a
`Z` suffix. The record schema is `archimate-js.agent-claim/v1`.

Any record that establishes a new lease (`claim` or active `takeover`) always
has `"claim_comment_id": null`: a comment cannot contain its own GitHub ID
before it is posted, and the record is never edited to add that ID. After
GitHub assigns the comment ID, that ID becomes the authoritative original
claim ID in the operator's external fence state. A release, supersede, or
handoff references the existing lease's original ID and does not try to
predict its own comment ID. Every later heartbeat repeats the lease's
authoritative ID. The operator must re-read after posting and stop if the ID or
any field is unavailable or ambiguous.

### Record contract

The following table is normative. `common` means the field is required for the
record type; `optional` means it may be omitted or set to `null`. No other
fields are allowed.

| Field | `claim` | `heartbeat` | `release` | `supersede` | `takeover` | `handoff` |
| --- | --- | --- | --- | --- | --- | --- |
| `schema`, `record_type`, `issue` | common | common | common | common | common | common |
| `claim_comment_id` | always `null` in the record | common decimal string for the existing lease | common decimal string | common decimal string for the resolved claim | always `null` in the record | common decimal string |
| `actor_id`, `github_login`, `lease_id`, `epoch`, `branch` | common | common | common | common | common | common |
| `state` | `active` | `active` | `released` | `superseded` | `takeover-requested` or `active` | `released` |
| `claimed_at` | common | — | — | — | common when active | — |
| `heartbeat_at` | common | common | — | — | common when active | — |
| `expires_at` | common | common | — | — | common when active | — |
| `lease_started_at`, `last_work_observed_at` | common | common | optional | optional | common for `active`; optional for `takeover-requested` | optional |
| `maintainer_reack_comment_id` | optional decimal string | optional decimal string | — | — | optional decimal string | — |
| `supersedes_claim_comment_id` | optional `null` | optional `null` | optional `null` | common decimal string | common decimal string | optional `null` |
| transition/acknowledgement fields | — | — | `released_at` common | `superseded_at`, `reason` common | `takeover-requested`: `observed_expired_at`, `observation_started_at` common; `active`: those plus `observation_ended_at`, `maintainer_ack_comment_id`, `claimed_at`, `heartbeat_at`, `expires_at`, `lease_started_at`, `last_work_observed_at` common | `handoff_at`, `handoff_summary`, `commit_sha`, `changed_files`, `checks`, `risks` common |

For `claim`, `heartbeat`, and `takeover` with `state: "active"`,
`expires_at` must be no later than `heartbeat_at + 2 hours`. `lease_started_at`
is immutable for a lease. A heartbeat cannot extend the total lease beyond
`lease_started_at + 8 hours` unless a maintainer posts an acknowledgement
comment that names the lease and the reason; the next heartbeat must include
that decimal comment ID in `maintainer_reack_comment_id`. The acknowledgement
starts the next maximum window and must not change the epoch. A heartbeat also
requires
`last_work_observed_at` to be no older than 30 minutes. If the operator has
not observed active work progress, cannot verify the local run is alive, or
has handed off, it must stop heartbeats and release or hand off.

`issue` is a positive integer. `epoch` is a positive integer fencing value:
the first claim uses 1, every replacement or receiver claim uses exactly the
previous valid epoch plus 1, and heartbeats, releases, supersedes, and handoffs
for that lease repeat the same epoch. A record with a non-integer or
non-monotonic epoch is invalid. A `takeover-requested` record reserves no
ownership and does not permit writes. `actor_id`, `github_login`, `lease_id`,
and `branch` must be non-empty strings.

`supersedes_claim_comment_id` is the only spelling for replacement lineage. It
names the prior lease's authoritative original claim comment, never the current
transition comment. `supersede` is a maintainer resolution record: its
`claim_comment_id` and `supersedes_claim_comment_id` both identify the
resolved prior claim, while its `actor_id` and `lease_id` identify the
maintainer action. The superseded claim remains resolvable by its original ID
and is not treated as active after the record.
A maintainer may self-release an ambiguous claim only when the record names
the same `claim_comment_id`, `actor_id`, `lease_id`, and `epoch`, and includes
`released_at` plus a reason; this narrowly permitted self-release is not a
claim of ownership or a winner selection.

Unknown fields, duplicate keys, invalid JSON, invalid record-type fields, or a
record outside the fenced JSON block invalidate that record. Do not silently
ignore unknown fields. If an invalid record could affect ownership, treat the
issue as ambiguous and fail closed until a maintainer posts a valid
`supersede` or release record.

### TypeScript parser boundary

`src/coordination/agent-claim-record.mts` provides a side-effect-free parser for
one issue comment. It distinguishes unrelated prose, invalid protocol attempts,
and one valid record. It checks the documented record fields, duplicate JSON
keys, UTC timestamp syntax, and record-local lease/takeover timing constraints.
Synthetic deterministic cases live in
`test/unit/agent-claim-record.fixtures.mts` and
`test/unit/agent-claim-record.test.mts`.

`src/coordination/agent-claim-history.mts` resolves a complete, caller-fetched
comment history to `unclaimed`, `active`, `expired`, `released`, or
`ambiguous`. It checks comment identity, lease transitions, monotonically
increasing epochs, takeover lineage, and acknowledgement-comment presence.
Deterministic synthetic cases live in
`test/unit/agent-claim-history.test.mts`.

The history resolver does not read GitHub, verify the author or authority of
an acknowledgement, detect a closed/merged issue, serialize operations, or
perform automatic expiry. Callers must fetch the complete history and still
apply the complete fail-closed procedure above. The serialized controller and
automatic expiry planned for
[#140](https://github.com/Tigon32/archimate-js/issues/140) remain unimplemented.

## Operator procedure

### Claim

1. Read the issue, all claim-protocol comments, state, assignees, linked PRs,
   and branches.
2. Parse every `archimate-js.agent-claim/v1` record. Ignore unrelated prose,
   but never ignore a malformed or unknown-field record that presents itself as
   a protocol record.
3. If there is one valid, unexpired `active` claim, do not edit or claim the
   issue. If there are multiple active-looking records, stop.
4. Post one initial `claim` with a fresh unpredictable `lease_id`, unique
   `actor_id`, the next epoch, `"claim_comment_id": null`, and valid lease
   timestamps.
5. Re-read the issue and posted comment immediately. The returned decimal
   comment ID becomes the authoritative `claim_comment_id` for subsequent
   records. Continue only if this claim is the sole live claim and every field
   still matches.

### Fence validation

Perform a fresh read immediately before **every** edit, commit, push, PR
creation/update, merge, issue mutation, and heartbeat. The fence is valid only
when the issue is open; exactly one valid live claim exists; its
`claim_comment_id`, `actor_id`, `lease_id`, `epoch`, and branch match; no later
release, supersede, takeover, or handoff invalidates it; expiry is in the
future; and the lease has not exceeded its total window.

For a local edit batch, revalidate before the first edit and at least every
five minutes or 20 files, whichever comes first. No mutation may use a fence
read older than 60 seconds. If a mutation is delayed beyond that limit,
re-read immediately before performing it. These limits make fencing practical
without removing the required check at every mutation boundary.

If a read fails, a field is ambiguous, the issue closes, expiry passes, work
goes idle, or any fence check fails, stop all writes. Determine liveness from
the **newest valid record for the lease**: a malformed, stale, or older record
cannot revive it, and a newer valid release/supersede/takeover/handoff wins
over older heartbeats. Preserve local work as a handoff artifact; never
force-push, edit another claimant's branch, or choose a winner by timestamp,
lexical order, assignee, or comment order.

### Heartbeats and scheduled jobs

A heartbeat is a new comment, never an edit to the original claim. It repeats
the authoritative claim ID, lease identity, epoch, branch, current expiry,
`lease_started_at`, and recent `last_work_observed_at`. A scheduled heartbeat
must self-stop when a fence check fails, the issue is closed or merged, a
release/supersede/takeover/handoff is observed, the lease expires, work has
been idle for 30 minutes, the eight-hour total window is reached, or the run
has been handed off. A delayed scheduler does not extend a lease
retroactively. Only a maintainer acknowledgement can authorize another total
window.

### Release and safe handoff

Before stopping, merging, or handing work to another operator, fence-validate
and post `release` or `handoff`. A safe handoff records the branch, commit SHA,
changed files, checks, and risks; its `handoff_summary` states the remaining
work and exact next action.
The receiver starts a new claim only after reading the handoff and confirming
the old lease is released. The receiver derives its next epoch as exactly
`epoch + 1`, uses a new lease ID, and creates its own authoritative claim
comment. Do not delete or overwrite the old branch.

### Expiry and manual takeover

Expiry is a necessary condition, not permission to seize work. A prospective
operator must:

1. Observe the expired claim and post a `takeover` record with
   `state: "takeover-requested"` and a new lease ID; do not edit yet.
2. Re-read after an observation window of at least 15 minutes, recording UTC
   start and end. Any valid heartbeat or transition cancels takeover.
3. Obtain explicit maintainer acknowledgement naming the expired
   `claim_comment_id`, proposed actor/lease, and observation window.
4. Re-read once more, then post the active `takeover` with `claim_comment_id`
   set to `null`, `epoch` incremented, and a new lease ID. After posting,
   re-read and adopt that comment's decimal ID as the new authoritative claim
   ID. Set `supersedes_claim_comment_id` to the prior original claim ID.

If history is ambiguous, the issue is closed, or acknowledgement is missing,
remain stopped. A maintainer resolves ambiguity with a valid `supersede` or
narrowly permitted self-release; no operator invents a winner.

## PR state and safe recovery

The issue lease and the PR branch are separate records: a valid lease does not
make a PR healthy, and a PR does not prove ownership. Classify the PR before
touching it:

- **Active:** exactly one valid lease is live; the owner is responding; the
  claimed branch is unchanged by others; and commits or checks are progressing.
- **Waiting:** the lease is valid and the owner has documented a bounded wait
  for review, CI, a dependency, or a maintainer decision. The owner keeps
  heartbeats and does not use waiting to extend an idle lease indefinitely.
- **Stalled:** the lease is still valid, but the owner has missed the required
  15-minute heartbeat or no work progress has been observed for 30 minutes, or
  the PR has a repeated failure/no-change condition. Stalled is a
  notification state, not permission for another operator to edit.
- **Orphaned:** no valid live owner remains because the lease was released,
  handed off, or superseded; an expired lease is orphaned only after the
  required takeover path is complete. Absence of a recent commit alone never
  proves orphaning.

### Automatic merge policy

The trusted PR drain may automatically merge only its explicitly allowlisted
Dependabot groups after their required checks pass. `agent/*` PRs are ineligible
for automatic merge. CI success is not evidence of independent review, and an
API review snapshot cannot make review state atomic with a merge request.
Merge an agent PR only after appropriate independent human review and the
repository's required branch protections are in force. Re-enable agent PR
auto-drain only after those protections enforce review at merge time and the
drain policy and tests are updated together.

Before any recovery decision, re-read the issue and PR and verify the lease
record, owner/actor, branch and worktree, commit ancestry, check results,
review state, linked dependencies, and file overlap with other active PRs.
If there is no valid lease or the PR cannot be classified unambiguously, fail
closed: treat the branch as live-owned, escalate to a maintainer, and do not
edit, claim, force-push, close, or change its checks.
If the owner is live and the PR is stalled, notify that owner with the
observed failure and stop; do not claim the issue, edit the branch, force-push,
close the PR, or change its checks. If the owner is waiting, record the
dependency and wait for the declared event or maintainer decision.

For an expired or otherwise orphaned PR, preserve the original branch and
history. Use the takeover or handoff procedure above, or open a new recovery
issue when the original scope is no longer safely actionable. The receiver
must create a new branch and lease; it may then choose one of these explicit
paths:

1. **Rebase:** create a recovery branch from the preserved branch, rebase it
   onto current `main`, resolve conflicts without weakening tests, and retain
   the original PR as an audit link.
2. **Cherry-pick:** create a branch from current `main` and cherry-pick only
   verified commits, documenting omissions and conflict resolutions.
3. **Supersede:** open a replacement PR linked to the original, validate it
   against current `main`, and close the original only after the replacement
   has the required checks and review.
4. **Close:** close the original when it is obsolete, duplicate, or
   unrepairable, preserving its branch and recording the reason and any
   follow-up issue.

Every recovery path validates the complete change on current `main` with the
repository's required checks. Never weaken or delete tests, lower a required
check, bypass branch protection, or merge around a failed check to make a
recovery appear green. The future serialized controller in
[#140](https://github.com/Tigon32/archimate-js/issues/140) should automate
these classifications, fencing checks, notifications, and audit transitions;
until then, this manual procedure is fail-closed.

### Recovery examples

- A PR owner has a valid lease but CI has failed twice on the same external
  service. Mark it **waiting** only if the owner documents the service and
  keeps heartbeats; otherwise notify the live owner as **stalled**. No second
  operator edits the branch.
- A lease expired after the owner stopped responding. The prospective operator
  posts `takeover-requested`, observes the required 15-minute window, and
  obtains maintainer acknowledgement naming the expired claim and observation
  window. Only then does the receiver create a new branch from current `main`,
  cherry-pick the verified commits, run all required checks, and link the
  preserved original branch and PR. The original is superseded or closed only
  after that audit trail is complete.

## Independent worked examples

These examples are independent scenarios. Their timestamps and lease
identities must not be combined into one history.

### Initial claim before comment acknowledgement

```json
{
  "schema": "archimate-js.agent-claim/v1",
  "record_type": "claim",
  "issue": 141,
  "claim_comment_id": null,
  "actor_id": "run-a-20260924T170000Z",
  "github_login": "Tigon32",
  "lease_id": "lease-a-001",
  "epoch": 1,
  "claimed_at": "2026-09-24T17:00:00Z",
  "heartbeat_at": "2026-09-24T17:00:00Z",
  "expires_at": "2026-09-24T19:00:00Z",
  "lease_started_at": "2026-09-24T17:00:00Z",
  "last_work_observed_at": "2026-09-24T17:00:00Z",
  "supersedes_claim_comment_id": null,
  "branch": "agent/run-a/issue-141",
  "state": "active"
}
```

After posting, GitHub assigns decimal comment ID `"7000000001"`. That ID is
authoritative for later records; it is not edited into the original comment.

### Heartbeat after active work

```json
{
  "schema": "archimate-js.agent-claim/v1",
  "record_type": "heartbeat",
  "issue": 141,
  "claim_comment_id": "7000000101",
  "actor_id": "run-b-20260924T180000Z",
  "github_login": "Tigon32",
  "lease_id": "lease-b-001",
  "epoch": 1,
  "heartbeat_at": "2026-09-24T18:10:00Z",
  "expires_at": "2026-09-24T20:10:00Z",
  "lease_started_at": "2026-09-24T18:00:00Z",
  "last_work_observed_at": "2026-09-24T18:09:00Z",
  "supersedes_claim_comment_id": null,
  "branch": "agent/run-b/issue-141",
  "state": "active"
}
```

GitHub assigns this heartbeat comment its own distinct ID, for example
`"7000000102"`; that ID is not written as `claim_comment_id`, which remains
the original claim ID `"7000000101"`.

### Release

```json
{
  "schema": "archimate-js.agent-claim/v1",
  "record_type": "release",
  "issue": 141,
  "claim_comment_id": "7000000010",
  "actor_id": "run-c-20260924T120000Z",
  "github_login": "Tigon32",
  "lease_id": "lease-c-001",
  "epoch": 3,
  "released_at": "2026-09-24T13:30:00Z",
  "supersedes_claim_comment_id": null,
  "branch": "agent/run-c/issue-141",
  "state": "released"
}
```

### Maintainer supersede resolving ambiguity

```json
{
  "schema": "archimate-js.agent-claim/v1",
  "record_type": "supersede",
  "issue": 141,
  "claim_comment_id": "7000000090",
  "actor_id": "maintainer-resolution-20260924T140000Z",
  "github_login": "Tigon32",
  "lease_id": "resolution-001",
  "epoch": 4,
  "supersedes_claim_comment_id": "7000000090",
  "superseded_at": "2026-09-24T14:00:00Z",
  "reason": "Maintainer rejected the duplicate claim identified in comment 7000000090.",
  "branch": "agent/run-d/issue-141",
  "state": "superseded"
}
```

The maintainer's own comment ID is authoritative for the resolution after the
comment is posted and re-read. The old claim remains searchable by
`"7000000090"` and is inactive because this valid record names it in
`supersedes_claim_comment_id`.

### Structured handoff

```json
{
  "schema": "archimate-js.agent-claim/v1",
  "record_type": "handoff",
  "issue": 141,
  "claim_comment_id": "7000000200",
  "actor_id": "run-e-20260924T150000Z",
  "github_login": "Tigon32",
  "lease_id": "lease-e-001",
  "epoch": 5,
  "supersedes_claim_comment_id": null,
  "handoff_at": "2026-09-24T16:00:00Z",
  "commit_sha": "0123456789abcdef0123456789abcdef01234567",
  "changed_files": ["docs/adr/0005-concurrent-agent-development.md"],
  "checks": ["npm test"],
  "handoff_summary": "ADR edits are complete. Receiver must review the runbook, run the docs checks, and address any schema findings before push.",
  "risks": ["Documentation review may identify schema wording changes."],
  "branch": "agent/run-e/issue-141",
  "state": "released"
}
```

The receiver reads this record, verifies the old lease is released, and claims
with epoch `6`; it never reuses epoch `5` or the old lease ID.

### Expiry and takeover

```json
{
  "schema": "archimate-js.agent-claim/v1",
  "record_type": "takeover",
  "issue": 141,
  "claim_comment_id": null,
  "actor_id": "run-f-20260924T190000Z",
  "github_login": "Tigon32",
  "lease_id": "lease-f-001",
  "epoch": 7,
  "supersedes_claim_comment_id": "7000000290",
  "observed_expired_at": "2026-09-24T18:00:00Z",
  "observation_started_at": "2026-09-24T18:01:00Z",
  "observation_ended_at": "2026-09-24T18:16:00Z",
  "maintainer_ack_comment_id": "7000000299",
  "claimed_at": "2026-09-24T18:16:30Z",
  "heartbeat_at": "2026-09-24T18:16:30Z",
  "expires_at": "2026-09-24T20:16:30Z",
  "lease_started_at": "2026-09-24T18:16:30Z",
  "last_work_observed_at": "2026-09-24T18:16:30Z",
  "branch": "agent/run-f/issue-141",
  "state": "active"
}
```

The takeover record is posted only after the observation window and
acknowledgement. After GitHub assigns the takeover comment ID, that ID becomes
the authoritative original claim ID for epoch 7. A `takeover-requested` record
is not permission to write.
