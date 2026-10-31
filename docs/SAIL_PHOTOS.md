# Sail Far Better · boat and voyage photographs

## Implemented

- `/sail/boat`: published boat, berth and living-space galleries.
- `/sail/manage/photos`: owner uploads, captions, accessible descriptions, grouping,
  ordering, publish/unpublish, homepage/voyage cover selection and removal.
- Homepage: owner-selected cover photo, The Boat navigation and a boat-page link.
- Voyages: optional cover photos on cards and photo galleries on detail pages.
- Private original evidence in Ernest is not imported, listed or made public.

The sunrise is the proposed homepage cover; the owner chooses it explicitly in
the photo manager. Gallery images preserve their aspect ratio, including the
portrait exterior photo and mast. Covers may crop for the layout; full web copies
remain available through gallery links. Berth capacity, guest availability and
privacy arrangements are not inferred or added.

## Photo selections supplied in chat

| Photo | Suggested section/caption |
| --- | --- |
| Deck view with warm sky | Exterior · A view from Far Better's deck |
| Portrait alongside dock | Exterior · Far Better alongside the dock |
| Forward cabin with drawers below berth | Forward / Main Berth |
| Cabin with cabinet beside berth | Aft Berth |
| Interior seating area | Salon |
| Helm, cockpit seating and table | Cockpit |
| Stove, oven and double sink | Galley |
| Orange sunrise viewed through cockpit enclosure | Sailing & sunrise · Sunrise while heading out |
| Forward washroom/shower | Forward Lav / Shower |

These are nine distinct photographs; repeated berth uploads are not additional
photos. The user explicitly identified the two berths. The originals from inline
chat images were not available as workspace files or downloadable attachment IDs.
No image bytes have been recovered, committed or uploaded from that chat. The
owner can upload originals directly through the new page after isolated setup;
no storage credentials need to be shared with Codex.

## Storage and privacy

Uses existing branch-specific R2 credentials/bucket. No new bucket, public-bucket
setting or provider is required. JPEG, PNG and WebP files up to 10 MB are uploaded
using owner-scoped tickets under `sail-uploads/`. Actual bytes and dimensions are
validated, then Sharp creates a WebP with the correct orientation, a maximum
2000-pixel dimension and no EXIF/location metadata. Oversized streams/pixel counts
and SVG/unsupported signatures are rejected before publication.

The separate normalised key under `sail-public/` is written by the server, not
by the browser's temporary upload URL. Finalisation locks the metadata record
and is idempotent, preventing a retry from overwriting an approved image. The
public-sounding prefix does not grant bucket access. Temporary uploads are
removed after processing; source photographs on the owner's device and existing
Ernest evidence remain unchanged. Failed uploads can be removed in the owner UI.

Uploads default to private. Explicit owner publication is required, including
before selecting a cover. A photo assigned to a voyage also requires that voyage
to be published. The public gateway verifies current publication/ownership and
streams only the normalised image, with no-store and nosniff headers. Unpublish
or removal denies subsequent gateway requests. It cannot recall copies already
viewed/downloaded. Private previews require the authenticated vessel owner.

No raw R2 keys or presigned reads are exposed in public metadata. Storage errors
are generic; expected validation errors use a dedicated safe error type. No raw
credentials, provider errors, upload URLs or photo contents are logged.

Removal revokes site access first, then removes the dedicated website objects.
If storage cleanup fails, the UI reports that a private copy may remain; it does
not restore public access or delete unrelated Ernest files. There is no public
upload, external-image URL import, AI image generation, background email or DNS
operation in this release.

## Isolated database rollout

New migration 028 adds **one photo metadata table**. It does not update or copy
existing records. Only the owner runs the SQL Editor scripts.

1. Select `ernest-v011-test / neondb`, not production. Keep a checkpoint of this
   isolated branch. Run `scripts/sail/photos-sql-editor/01-preflight.sql` and
   provide results. Expect users/assets and Sail 027 tables, text asset IDs,
   UUID owner/user/voyage IDs, and no sail_media table.
2. After review, run the complete `02-apply-028.sql` transaction once. It checks
   the database name, identity types, existing Sail baseline and absent photo
   schema. It cannot prove the Neon branch selected in the UI. On error run
   `ROLLBACK;` and stop. Do not replay historical migrations or seed data.
3. Run `03-verify.sql`: expect ledger entry `028_sail_photos.sql`, sail_media,
   zero initial rows, private/not-ready defaults and nullable dimensions/voyage.
4. After verification, publish code only to `preview`, preserving newer remote
   changes; do not push the feature branch or main. Verify Vercel Ready status.
5. Use `/sail/manage/photos`. Add the original files, captions and categories.
   Publish selected photos, choose the sunrise as homepage cover, and choose a
   voyage cover if desired. No new environment variables are needed.

R2 upload CORS must allow the existing Preview origin and PUT/Content-Type, as
for Ernest's existing direct uploads. Do not make the bucket public to fix CORS.
There is no live storage/database access from Codex during implementation.

## Acceptance

- Upload one photo; public pages must not show it yet.
- Publish it; check its caption/description and full framing on The Boat page.
- Select a homepage cover and inspect desktop/phone crops.
- Attach a photo to a private voyage: public requests must still be denied.
- Publish that voyage; check its card cover and detail gallery.
- Correct captions, category and order; check the saved result.
- Unpublish, then remove a test photo; verify a fresh public request no longer
  displays it and unrelated private Ernest documents/photos still work.
- Upload each of the nine originals and confirm the berth labels and crops.
  Confirm any berth/guest arrangements separately before publishing such claims.

All live image delivery, R2 permissions/CORS and the actual owner photographs
remain acceptance checks. Local tests use synthetic in-memory PostgreSQL, storage
and session boundaries; no real photo or email is used by those tests.

## Local verification

144 tests passed, zero failures/skips. Lint passed with only the two pre-existing
warnings; type checking, Next.js build and diff checks passed. All three browser
suites passed (Ernest, Sail voyages/invitations, and the new photo manager).
Photo tests exercise actual image processing, metadata removal, role/ownership
boundaries, private/public gates, stale edits, finalisation retry/failure, stream
limits, publication-aware image responses and guarded migration rollout.

This is a local implementation awaiting isolated preflight/migration and live R2
acceptance. No production, DNS, bucket permissions or live data were changed.
The chat photographs remain labelled references until their original files are
uploaded through the owner UI; no claim is made that they are already on the site.

## Preview handoff · October 31, 2026

Owner verified migration 028 on the isolated branch at
2026-10-31 22:38:10.753663+00: sail_media present and empty, text asset IDs,
UUID ownership/voyage fields, private/not-ready defaults, nullable dimensions,
and revision 1. Published accepted application commit
adcf40576a125559d898fce8c69cea15d69c6575 to preview only. Main remains
6710d1299a208c8905927cdacf8baf59662371f7.

GitHub API and Preview HTTPS checks remain blocked by the execution proxy (403),
so Ready status and live R2 uploads are not yet verified. Owner should wait for
Preview / adcf405 / Ready, then upload the original photographs privately and
explicitly publish/select covers in /sail/manage/photos. No production or DNS
change and no live photo upload was performed by Codex.
