# Phase 2: trip timelines and owner email updates

The owner approved the public/homepage and owner timelines, explicit crew and
passenger availability, and notifications to davseng@gmail.com for submissions
and saved changes. Ship them together, retaining the preceding clarity pass.
No booking/payment/SMS feature or authentication change is included.

## Timeline and availability

- `/sail` embeds a chronological timeline; `/sail/trips` is a full public landing
  page with All trips / Crew / Passenger links. Joining Us uses the same timeline,
  and voyage details show the same remaining availability.
- `/sail/manage` is the owner timeline, including private drafts and a separate
  expandable completed/cancelled history. Public timelines include only published
  active plans, never private drafts, participants, enquiries or owner counts.
- Months, actual departure dates and flexible windows are shown explicitly.
  Undated plans follow dated plans. No departure is invented or converted to a
  fixed date. Estimated arrivals remain estimates. This is an ordered timeline,
  not a booking calendar or a promise that routes/windows cannot overlap.
- Each owner trip editor has a separate Who can join? form. Blank means Ask me;
  zero means no places open; positive counts are remaining crew/passenger places
  explicitly entered by the owner. Notes are public only with a published trip.
- These records have their own optimistic revision; changing remaining places
  does not change the guest-confirmed itinerary revision. Invitations/acceptances
  never silently calculate berth capacity or decrement remaining places.
- Owner summaries separate confirmed crew/passengers on the current plan,
  people needing an invitation, people awaiting a reply, accepted people needing
  reconfirmation, and new enquiries. Those counts never reach public projections.

## Notifications

Migration 031 creates a transactional minimal outbox and triggers for meaningful
changes to voyages, people/invitations, enquiries, ready website photos, position
reports and availability. Triggered rows commit/roll back with the actual change;
there is no application-level gap between saving and queuing. Existing records
are not backfilled and raw guest tokens/audit snapshots are never in the outbox.
No-op saves and repeated revision/delivery updates do not create duplicate intents.

Successful server actions schedule a bounded queue drain through Next.js `after`.
A digest of up to 40 pending events is claimed atomically with SKIP LOCKED. Email
contains short descriptions, current trip titles when applicable and links to the
appropriate authenticated owner workspace. It never contains guest invitation
URLs/tokens or enquiry/private-guidance text. Existing Brevo/SMTP credentials and
TLS/file/URL protections are reused. Guest-facing success is independent of SMTP.
There are no automatic emails to enquirers or guests beyond explicit invitations.

The queue is background operational data, not an owner planning dashboard.
The Crew & spaces page is the owner-facing overview; the previous
/sail/manage/notifications address redirects there. SMTP acceptance is not proof
of inbox receipt. A crash after SMTP acceptance but before receipt persistence
remains uncertain and is NOT automatically resent. Exact-once delivery across
SMTP is not claimed. Failed/uncertain rows are retained for operator review
against provider/inbox evidence before any explicit retry; planning screens do
not ask the owner to monitor email delivery.

No cron is introduced: after-request processing is best effort. Subsequent saved
changes drain remaining pending work, and a deployment kill/time limit cannot
erase committed notification intent. The normal per-action drain is bounded to
40 updates. No-op/retry intent protection plus non-retry of uncertain sends avoids
silent duplicate mail. The application never retries uncertain deliveries without
operator review.

## Recipient and enablement

Set these Vercel values separately for the isolated preview branch and Production:

- `SAIL_NOTIFICATIONS_ENABLED=true`
- `SAIL_NOTIFICATION_EMAIL=davseng@gmail.com`

Keep existing `SAIL_EMAIL_ENABLED=true`, the correct environment-specific
`SAIL_BASE_URL` and working mail-provider settings. Preview retains its test
recipient allowlist; ensure it includes the owner recipient. Do not paste secrets.
The recipient falls back to SAIL_CONTACT_EMAIL if not explicitly supplied, but
using the explicit notification variable is recommended.

By default the configured recipient must match the owning account's users.email.
Other owners' queued changes are not sent to this recipient. If the intended
owner signs in using a different address, set `SAIL_NOTIFICATION_OWNER_EMAIL` to
that actual owner's sign-in email; destination remains the configured recipient.
The override must not be set to another person’s account. Queue operations remain
owner-scoped; private roster data is never included in public timelines.

## Additive rollout

Application code is held until 031 is verified in both environments. The existing
030 baseline was owner-verified in Preview and Production. Take a fresh Production
Neon recovery checkpoint; run the entire
`scripts/sail/phase2-sql-editor/01-apply-031.sql` once in ernest-v011-test, then once
in the verified Production branch, and run `02-verify.sql` in each. Guards reject
missing 030, unexpected identity types, prior/partial 031 or replay. No seeds,
copying, deletes, publication changes or automatic migration runs are performed.
SQL creates no email sends. Events from subsequent actual edits may begin queuing
before the code release, which is intentional; existing content is untouched.

After verification, release the tested commit to preview and main. Never promote
an isolated Preview deployment with its test bindings. Wait for Vercel Ready,
confirm the homepage/trip landing and owner timeline, enter real remaining spaces,
and verify one owner-controlled enquiry and reply reaches the intended inbox.
A saved change is not proof of inbox delivery; verify one live owner-controlled
notification after enabling the environment.
No DNS or new email/SMS provider is needed.

## Validation scope

Synthetic PostgreSQL tests cover availability ownership/revisions, plan-confirmation
independence, public projection, current-plan attendance summaries, transactional
queueing, no-op/revision deduplication, owner-only claims, injected SMTP delivery,
failed/uncertain behavior, token omission, and guarded migration preservation.
The phase2 browser uses actual public/owner pages, role filters, forms/actions,
queue controls and SQL with synthetic auth/mail boundaries; desktop/mobile
screenshots use synthetic trips, not live private records. Retain the four existing
browser suites and add `test:sail-phase2-browser`. Live provider/Vercel acceptance
remains separate from these local checks.

Release validation: all 165 unit/integration tests and five browser suites passed;
lint passed with two existing warnings; TypeScript, final production build and
whitespace checks passed. Reviewed public/owner desktop and public mobile
screenshots. No live database, inbox, auth session, DNS or SMTP was accessed.
The combined code is held locally pending owner verification of 031 in both
branches and environment enablement; current deployments remain on 97e57c2.

## Preview rollout verified

The owner supplied isolated Preview verification for 031, applied at
2026-11-01 19:39:00.622488+00: neondb/public, sail_availability and
sail_notifications present, all six expected triggers present, and column types /
nullability match. At the owner's request the tested application commit d1d9eac
is now released to preview for review before Production migration/promotion.
Production remains on 97e57c2; its 031 migration is not yet verified. This release
note changes no application code and does not rerun migrations or send email.
Wait for Vercel Ready, then inspect /sail/trips and /sail/manage. Configure Preview
notifications and allowlist separately before exercising live notification sends.

## Owner planning refinements after Preview review

The owner requested remaining spaces in the creation form and clarified that the
owner page should plan people/places, not track mail delivery. The new-trip form
now accepts crew needed, passenger places and a note; the existing voyage save
transaction inserts the initial availability record with the trip and its first
audit entry. Validation or a failing availability write rolls everything back.
Existing trip editing still uses the separate availability form and its revision,
so edits cannot accidentally change accepted guest itinerary confirmations.

`/sail/manage/crew` is the owner-only Crew & spaces table. It shows active trips,
dates/routes, named crew/passengers who accepted the current plan, explicit
remaining places, waiting replies, invitation drafts and people needing to
reconfirm. Declines can be expanded. Completed/cancelled trips stay in timeline
history. Roster reads project names/roles/response states, not email addresses or
raw token/hash values; all joins remain constrained to the authenticated owner.
The mobile table scrolls inside its own labelled keyboard-accessible region.

The owner navigation now says Crew & spaces. The old /manage/notifications URL
redirects to that planning page; its email-status component and manual-send action
were removed. Notifications still queue and send in the background. Queue states
remain internal operational data, not an owner planning task. Earlier instructions
above describing that delivery-status screen apply to the initial Preview only;
they are superseded by this refinement. No additional schema or environment
changes are required beyond the already prepared phase2 migration/configuration.

Refinement validation: all 167 unit/integration tests and five browser suites
passed; lint (two existing warnings), TypeScript, build and whitespace checks
passed. Reviewed the synthetic Crew & spaces table screenshot. New coverage tests
initial-space atomicity and roster projection, and the actual browser creates a
trip with spaces and verifies the owner table on desktop/mobile. No live data or
notification sends were used. This refinement is deployed only to Preview;
Production remains gated on its migration 031 verification.
