# Personal invitation links without email

The owner requested a link they can send themselves through text, WhatsApp or
another app, without configuring SMS. Add a named person with optional email,
then Create invitation link and Copy link in the owner voyage workspace.
A read-only text field supports manual copying if the Clipboard API is unavailable.
The owner must share that personal link directly; the app sends no message.

Only the authenticated vessel owner may create a link. The origin comes from
SAIL_BASE_URL (same public origin as email), never Host/request input. The action
returns a fresh URL only to that owner, and the UI holds it transiently. No raw
link/token is stored in the database, localStorage, public read models, logs or
old invitation lists. Reloading does not retrieve an old link; creating a new one
revokes it, as does editing/cancelling the invitee or sending a fresh email. The
existing 30-day random-token expiry, owner boundary, per-person cooldown, private
role guidance, revision checks and guest acceptance flow apply unchanged. GET
does not accept an invitation. Links grant no Ernest access.

Manual sharing is independent of SMTP enablement and Preview recipient allowlists:
no SMTP request occurs. Email sending is disabled in the UI for someone without
an email and the server rejects that send before issuing a token. Existing emailed
invitations still work. Public enquiries continue requiring a valid email.

Migration 030 relaxes only sail_participants.email NOT NULL. Existing supplied
addresses and uniqueness/check constraints are preserved; multiple unnamed email
values are real SQL NULLs, never fake addresses. No data or invitations are reset.
Take a fresh Production recovery checkpoint. Run the entire guarded
scripts/sail/link-sql-editor/01-apply-030.sql once in ernest-v011-test, then in the
verified Production branch (neondb/public for each). Run 02-verify.sql in each:
expect ledger entry 030_sail_optional_email.sql and email text / is_nullable YES.
On error ROLLBACK and stop. Do not deploy new code before both targets are ready.
No DNS, SMS, new secrets or mail-provider changes are needed. SAIL_BASE_URL must
already be the correct public HTTPS origin for that deployment.

Tests cover NULL/duplicate addresses, public enquiry validation, cross-owner and
unauthenticated link actions, no SMTP invocation, hash-only persistence, cooldown,
fresh-link/cancellation revocation, accept/reconfirm behavior, fixed origin and
migration replay refusal. The existing Sail browser suite now also adds a person
without email, creates/copies the link with the actual Clipboard API, and accepts
it in the guest flow, using synthetic PostgreSQL/session/SMTP boundaries only.

Local validation: all 155 unit/integration tests and four browser suites passed;
lint passed with two existing warnings; TypeScript, final production build and
diff checks passed. No live SQL, emails, links or deployments were created for
this change. Code is held locally until migration 030 is verified in Preview and
Production; existing public deployments remain on 4640771.

The owner subsequently verified migration 030 in both branches: Preview applied
2026-11-01 03:02:14.544661+00 and Production applied
2026-11-01 03:05:44.746551+00. Both reported neondb/public and email text with
is_nullable YES. This satisfies the schema release prerequisite. Application
commit fa54c4d is released to preview and main with this verification note;
no application changes followed its passing checks. Wait for Vercel Ready before
live acceptance. No SMS configuration or automatic message sending is introduced.
