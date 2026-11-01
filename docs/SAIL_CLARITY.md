# Sail clarity pass

The owner approved a clarity pass first and specified a timeline as the next
public/owner landing-page treatment. This release clarifies enquiry, invitation,
response and owner handoff without changing trip capacity or introducing bookings.

## Guest experience

- Public trip enquiry says “Interested in coming?” and explains that a note starts
  a conversation, requires no account and does not reserve a place.
- Successful submission displays a private on-screen receipt with submitted name,
  reply address, role preference and note. Focus moves to its heading. It explains
  that the owner will talk through the trip before sending a personal invitation.
  There is no automatic receipt email or booking promise.
- Valid personal invitations greet the named guest and explain no additional
  sign-in is required. One heading and a trip-summary section establish context.
- Invited, accepted, declined, updated and closed trips have distinct instructions.
  “Count me in” / “I can’t make this one” responses save explicitly; accepted
  responses are visible and can be changed. Updated plans require confirmation.
- Changed-plan labels compare the accepted audit revision to current details.
  Only section labels leave the server. Another role’s guidance, old joining
  values and raw snapshots are not exposed. Missing historical snapshots get a
  generic review-the-plan message rather than invented differences.
- Joining details are always visible to a valid invitee, with an honest fallback
  when not yet written. Closed trips remain readable but cannot take responses.
- “I have a question” opens the chosen email app with the trip title as subject.
  No invitation token or private joining text is placed in the mailto URL. The app
  does not send a message or change their response when that link is clicked.

## Contact configuration

The owner chose email, specifically davseng@gmail.com, for invited guests’ questions.
Set **SAIL_CONTACT_EMAIL=davseng@gmail.com** in Vercel for Production and the
isolated preview branch, then redeploy the affected environments. This is a
contact destination, not a mail-provider credential. The address is read only by
the valid private invitation page. Invalid/missing configuration safely shows
“Message the person who sent you this invitation” instead of a broken button.
No personal address is hardcoded in application source, no public voyage/contact
read model is broadened and no DNS or database migration is needed.

## Owner handoff

Each enquiry offers “Invite this person,” with an explanation that it prepares a
person in the voyage’s People list but sends nothing. The action derives ownership
from the session, locks the owned voyage and enquiry, copies name/email/preferred
role, marks the enquiry reviewed and returns the participant reference. A second
click finds the existing matching-email participant without duplicating it,
changing its role/status, reactivating cancellation or revoking a valid link.
Closed voyages and cross-owner/cross-voyage references are rejected. The owner
can follow “View in People,” review the role, then email an invitation or create a
manual link using the existing explicit actions. Creating/revoking tokens remains
separate from enquiries and saves.

## Timeline next pass

The owner's direction is a timeline for both public/passenger browsing and the
owner view, suitable for the homepage or a dedicated landing page. Keep one
consistent source of trip dates; represent flexible windows honestly. Crew needed
and passenger space must be owner-entered facts, never guessed from photographs,
berths or number of invitations. Distinguish enquiries, invitations and accepted
people. This release does not invent availability counts or ship the timeline.

## Verification

The existing Sail browser harness now renders the actual invitation-content
component, exercises receipt focus, acceptance/reconfirmation/decline, optional-
email manual links, enquiry-to-person creation and repeat refusal without SMTP.
Synthetic PostgreSQL tests verify atomic idempotent handoff, owner boundaries,
accepted-snapshot differences, missing history, role-specific privacy and safe
contact URL construction. No live messages or record edits are made by tests.

Validation: all 159 unit/integration tests and four browser suites passed; lint
passed with the same two existing warnings; TypeScript, production build and
whitespace checks passed. Reviewed synthetic invitation and receipt screenshots.
No live SQL, guest records, SMTP sends, auth changes or DNS changes were made.
