# Sail: a personal invitation

The Boat page is a photographic walk around the cockpit, living spaces, berths
and shower. Joining Us has conversational crew/passenger introductions, practical
questions and links into a voyage enquiry with the chosen role preselected.
The role is a preference, never a permission or confirmed invitation.
The home page begins “Come sailing with me.” Copy addresses friends and family;
there are no bookings, invented capacities or claims about qualifications.
Existing private role guidance stays private. Updated expectation templates apply
only to new blank voyages; existing owner-written guidance is preserved.

Published website photographs already uploaded through the owner workspace are
used automatically. No reupload is required. The viewer supports next/previous,
arrow keys, Escape, focus restoration and a full image without cropping. The
existing publication-aware image gateway remains the source for every image.

## Position report

`/sail/manage/position` allows a vessel owner to save one latest report: place,
report date, note, optional coordinates and an optional published website photo.
Publication is explicit and defaults off. The public home page identifies it as
a dated report, not live tracking. Planned voyages remain separate links; no
route, arrival or current location is inferred. Place-only reports are supported.
No GPS, EXIF, private operating logs, geocoding or old Bolt data is read.

Leaflet loads only after the visitor opens the map. OpenStreetMap supplies tiles
with visible attribution; there is no paid map account or API key. Owners can
click a pin or type coordinates. Photos must belong to the same owned vessel;
private/unready photos and photos of unpublished voyages cannot be selected or
read publicly. Later photo unpublication removes it from the public report.
Authenticated ownership and optimistic revisions protect saves. Saves send no
email and change no voyage or operating record.

## Preview rollout

Visual pages and photo viewer work with verified migration 028. Migration 029
is optional at deployment: public reads check availability and hide the position
section until a published report exists; the owner page explains pending setup.
No automatic migration runs in install, build or start.

The owner uses Neon SQL Editor, branch **ernest-v011-test**, database **neondb**,
public schema. Run `scripts/sail/position-sql-editor/01-preflight.sql` first and
review the results. Only after verifying this isolated target and absence of 029,
run `02-apply-029.sql`, then `03-verify.sql`. The guarded additive script requires
028, refuses a different database/schema shape or replay, and records 029 in the
migration ledger. It neither seeds a location nor modifies existing boat data.
Never run the historical migration sequence or supply database credentials.

Push only to `preview`, which has isolated Neon/R2 overrides. Feature branch
Vercel deployments may inherit production bindings. No production, main merge or
DNS changes are part of this work.

## Verification and acceptance

The unit/integration suite and browser harnesses use synthetic PGlite records,
injected sessions and simulated images/provider boundaries. The design browser
exercises actual page composition, gallery controls, role links, owner position
form/actions/store and real Leaflet; OSM tile requests are intercepted locally.
Desktop and 375px screenshots check layout. These checks do not establish live
Neon/R2/Vercel acceptance or show the owner's real images.

After Vercel Preview is Ready, inspect `/sail`, `/sail/boat`, `/sail/join` and the
owner workspace using the existing uploaded published photographs. After 029,
save a private report, publish it, check its dated public rendering, then hide it.
Live guest invitation acceptance remains pending behind Vercel Preview protection;
the owner previously confirmed invitation email delivery. No live mail is sent
by these tests.

Local validation for this change: lint passed with two pre-existing warnings;
TypeScript passed; all 150 unit/integration tests passed; review, Sail invitation,
Sail photo and Sail design browser suites passed; production build and diff
whitespace checks passed. No live database migrations were executed.

## Subsequent owner verification

The owner supplied migration 029 ledger/table/column verification: applied at
2026-11-01 00:47:00.73685+00, empty sail_positions, correct types/defaults. This
verifies the isolated Preview only. The owner subsequently reported acceptance
tests passed and requested production preparation. Production schema and domain
cutover remain separate; see SAIL_PRODUCTION.md.
