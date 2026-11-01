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

Owner queue: `/sail/manage/notifications`. It shows pending, sending/uncertain,
accepted-for-delivery and failed counts for the authenticated owner only. Pending
updates can be sent manually; failed updates require explicit retry confirmation.
SMTP acceptance is not proof of inbox receipt. A crash after SMTP acceptance but
before acknowledgement persistence remains uncertain and is NOT automatically
resent. Exact-once delivery across SMTP is not claimed. No-op/retry intent
protection plus non-retry of uncertain sends avoids silent duplicate mail.

No cron is introduced: after-request processing is best effort, and a later saved
change or the owner’s Send pending updates action drains remaining pending work.
A deployment kill/time limit cannot erase committed notification intent. Old
sending/uncertain records should be reviewed against provider/inbox evidence
before any operator-authorized reset; they are not retried automatically.

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
The owner page warns on account mismatch. The override must not be set to another
person's account. Manual sends and failed resets remain session-owner scoped.

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
Check the queue on disabled/failed delivery rather than assuming a save sent mail.
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
