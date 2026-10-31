# Sail Far Better · first unified-platform release

## Scope and current state

Built in `davseng/Ernest` on `feature/sail-far-better-platform`, based on current
production application commit `6710d1299a208c8905927cdacf8baf59662371f7`.
The Bolt export is a reference only. No Supabase users, data, functions, storage
or configuration are imported. No new infrastructure provider or runtime dependency is
required. Nodemailer already exists; its official TypeScript declarations are
added as a development dependency. Existing Ernest records, authentication configuration and root page
are retained. Its owner navigation gains a link to the voyage workspace.

Initial routes:

- `/sail`: public homepage and published voyages.
- `/sail/voyages/[id]`: public voyage and private-to-owner enquiry submission.
- `/sail/sign-in`: owner sign-in, using the existing Auth.js email provider.
- `/sail/manage`: voyages belonging to the authenticated owner's vessels.
- `/sail/manage/new` and `/sail/manage/[id]`: planning, people and enquiries.
- `/sail/invitations/[token]`: one personal invitation, without an account.

Development does not authorize a production merge, production migration, email
to real crew/passengers, or DNS change. Nothing in this release is deployed yet.

## Product behavior

The owner begins with a name, route and rough timing, saving privately by default.
Planning supports open dates, one target departure or a simple departure window,
an optional estimated arrival, and a short timing note. No six-field date model,
confidence scores, availability matrix or recruitment workflow.

Crew and passenger are roles on a voyage invitation, not global account roles.
The owner edits separate “what to expect” guidance. Initial text is generic,
editable guidance, not a statement about the boat, qualifications, watch rota,
insurance or services. Review it before sending. Private joining details are
shared with invitees, never placed on public pages.

Adding a person, saving a voyage and publishing do not send emails. Send is a
separate owner action. Emails contain the actual voyage name, route, departure,
timing note and link; these are not repurposed login emails. Delivery status
means SMTP acceptance, not proof of inbox delivery. Failures do not claim success.

Guests can accept or decline. Their page always shows the current plan. After
an accepted plan changes they are prompted to review and confirm again. No-op
saves do not change the revision. Saving uses optimistic revisions and audit
snapshots; stale forms cannot overwrite a newer plan. No automatic rescheduling,
booking, vessel-readiness decision or sending is delegated to Ernest.

Owners can correct a name/email/role or reactivate a cancelled invitation. Those
changes revoke the old link and require a fresh invitation. Resending also
replaces the old link; it does not silently undo an existing response.
Cancelling retains the record while immediately removing link access.

Public enquiries appear in the owner's workspace. They do not automatically
become invitations or generate emails. Anonymous submissions have input limits,
a honeypot and database-backed rate checks. Rate keys are hashed using AUTH_SECRET;
raw IP addresses are not stored. Wider public rollout should review abuse volume
and add platform rate protection/CAPTCHA if needed.

Deferred: blog/CMS, photos, maps, SMS, automated reminders, capacities/waitlists,
account-based guest dashboards and crew access to Ernest. There are no fictional
sample voyages or seeded boat facts in live data.

## Permissions and architecture

The existing vessel owner is the administrator. Server actions derive the actor
from the authenticated session, and every management operation checks the vessel
ownership boundary. Owning another vessel does not grant access to this one.
No profile role can be self-assigned through Sail Far Better.

Guest links contain 32 random bytes, expire in 30 days, and are stored only as
SHA-256 hashes. They are bearer credentials: recipients must not forward them.
No raw link token is returned by owner actions or logged. Viewing a link does
not respond to it, so an email scanner GET cannot accept a voyage. Private pages
are dynamic, noindex and no-referrer. Responses require an explicit server action
and current plan/participant revisions. Token possession grants no Auth.js
session and no access to Ernest's records, documents, conversations or tools.

Public data is selected through an explicit projection. It excludes owner IDs,
participant lists/emails, private joining details, role guidance and audit data.
Public descriptions, route and timing notes must themselves be suitable for
publication; they are shared only after the owner checks Publish.

Files: `src/domain/sail.ts`, `src/data/sail-store.ts`, `src/data/sail-mail.ts`,
`src/app/sail`, `src/components/sail`. Four additive tables in migration 027:
`sail_voyages`, `sail_participants`, `sail_changes`, `sail_interest`.
No changes to existing tables or auth adapter. No R2 access or OpenAI calls are
needed by the new Sail Far Better flows.

## Isolated database setup · owner SQL Editor workflow

No database credentials need to be shared with Codex.

1. In Neon, select **ernest-v011-test / neondb**, not production. Database name
   alone does not establish branch identity. Retain a checkpoint of this isolated
   branch before applying new schema.
2. Run all of `scripts/sail/sql-editor/01-preflight.sql`. Expected prerequisites:
   users, assets, update_reviews and maintenance_events exist; assets.id is text,
   assets.owner_id and users.id are UUID. All four sail_* tables must be absent.
   Send results for review before applying the migration. Stop on discrepancies.
3. After review, run the whole `02-apply-027.sql` transaction once. It refuses an
   unexpected database name, missing baseline, incorrect identity types, and
   existing/partial Sail schema. These checks cannot prove the SQL Editor's Neon
   branch selection. On error, run `ROLLBACK;` and report the error.
4. Run `03-verify.sql`. Expect ledger entry `027_sail_far_better.sql`, all four
   tables and zero rows initially. Departure dates and arrival estimate are nullable;
   published/revision are not. Invitation hash/expiry/accepted_revision are nullable.
5. Do not replay historical migrations, run db:migrate/db:seed or alter production.

Only Git branch `preview` has the owner's isolated Neon/R2 bindings. Do not push
this feature branch: Vercel can inherit production services. After schema review,
integrate with any newer preview changes and push only preview without force.
Use https://preview.ernest.sailfarbetter.com/sail for public acceptance and
https://preview.ernest.sailfarbetter.com/sail/manage for owner acceptance.
Verify deployment branch, commit and Ready status before testing. Vercel's own
Preview protection may require Vercel sign-in; that is separate from app access.

## Invitation email configuration

Delivery is disabled unless explicitly enabled. For Preview, configure these
variables **only for Preview, Git branch preview** in the existing Vercel project:

| Variable | Value |
| --- | --- |
| `SAIL_BASE_URL` | `https://preview.ernest.sailfarbetter.com` (origin only, no /sail path) |
| `SAIL_TEST_RECIPIENTS` | Comma-separated exact email addresses controlled by the owner for testing |
| `SAIL_EMAIL_ENABLED` | `true`, only after the allowlist is configured |

Reuse existing Preview `EMAIL_SERVER_*` and `EMAIL_FROM` if approved for manual
owner tests. No SMTP credentials should be pasted into chat or committed. AUTH_URL
and AUTH_SECRET remain the existing values. Do not change Production settings.
Email content is generated as plain text, with file/URL fetching disabled in the
mailer and TLS required for SMTP. The invitation origin is configured, never
copied from an incoming request's Origin/Host header.

New/changed Vercel variables require a new Preview deployment. With email disabled,
planning and adding people still work; Send explains that nothing was sent.
A one-minute cooldown applies per person. Guests have no sign-in/account requirement.

## Acceptance walkthrough

1. Open `/sail` and the owner workspace. Confirm Ernest at `/` still works and
   existing documents, inventory and maintenance remain intact.
2. Create a private voyage. Leave dates open, then use a target date or window.
   Save/reopen. Try an invalid window or arrival before departure; expect validation.
3. Edit crew/passenger guidance with clearly different text and add private joining
   notes. Publish explicitly. In the public page, verify only public fields appear.
4. Add crew and a passenger using two test addresses you control and allowlisted.
   Nothing should send until Send. Verify actual SMTP delivery and latest plan text.
5. Open each email's link: role guidance must differ, no owner/participant email
   list or Ernest link/tools should be exposed to the guest. Viewing is not acceptance.
6. Accept one invitation and decline the other. Owner list must reflect both.
7. Change timing because of weather or repairs. The accepted guest reloads and sees
   that another review is needed. Confirm again. An unchanged save should not prompt it.
8. Edit a person's role/email or cancel/resend. Old link must stop working. Test
   reopening an invitation with no app session. Never forward a real invitation link.
9. Submit a public enquiry. See it privately under Enquiries and mark reviewed;
   it must not create an invitation or send mail. Three/hour is the submission cap
   per rate identity; do not spam the live form to load-test it.
10. Repeat key steps on a phone. Report confusing labels, missing guidance, blocked
    paths or unintended email; do not bypass permission failures for acceptance.

## Final domain plan · deliberately not activated

The target is `sailfarbetter.com` for the public homepage and
`ernest.sailfarbetter.com` for the existing private Ernest application. Keep owner
voyage administration on the existing authenticated host if convenient; guests
need only their own invitation host/link, not shared authentication cookies.

At a separately approved release, implement and test exact host-based public
root routing (or a dedicated public deployment root rewrite), retaining the
existing Ernest root. The current root is deliberately unchanged; DNS alone is
not the full cutover. Validate domain ownership, invitation base URL, HTTPS,
canonical/www behavior, email links and public metadata before switching DNS.
Do not broaden authentication cookie domains to make this work. Keep old hosting
available as a recovery path during domain cutover; no old data migration is needed.

Before any production release, separately review production schema, create a fresh
recovery branch, apply the approved additive migration through owner SQL Editor,
then release tested code using existing Production service bindings. Do not copy
Preview rows, tokens, SMTP allowlists or credentials into production. Never merge
or change DNS without explicit release approval.

## Validation and remaining live checks

Local checks passed: 137 tests with zero failures/skips, lint with the two
pre-existing warnings, type checking, Ernest browser regression, new Sail browser
acceptance, Next.js production build and git diff checks. Browser tests use real React/forms/actions and PostgreSQL semantics
with synthetic sessions and SMTP. SSR tests cover actual public/invitation page
rendering. Migration tests cover preservation/replay/name guards. Mobile layout
was inspected with synthetic data.

These do not prove live Neon schema, Auth.js magic-link delivery/callbacks, SMTP
inbox receipt, Vercel deployment or DNS. Those checks remain pending after the
owner completes isolated setup. No live emails, migrations, deployments or
production changes were performed while implementing this release.
