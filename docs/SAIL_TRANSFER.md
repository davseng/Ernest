# Transfer completed — tool retired

The owner confirmed the Preview-to-Production copy succeeded. The temporary
Content transfer page, server actions, supporting modules and dedicated tests
have been removed. The imported plans, photos, publication choices and position
report remain untouched. No database or storage cleanup is needed.

The code and its tests are recoverable from Git commit b663108 if a future,
explicitly authorized transfer is needed. The instructions below describe the
completed historical process; those transfer URLs are no longer active.
Delete the downloaded sail-content.json file and any spare local copies once
production content is verified; it can contain private joining notes.

---

# Owner-mediated Preview → Production content copy

The owner requested copying Preview Sail content into Production. This workspace
has neither database nor R2 credentials and no callable deployment/storage
connector. Do not request secrets or clone the database. The owner-only Content
transfer tool moves content using the existing authenticated app and signed R2
upload flow instead. No new schema or configuration is required.

1. Once the release is Ready, open
   https://preview.ernest.sailfarbetter.com/sail/manage/transfer and sign in.
   Select the source vessel and Download Sail content.
2. Open https://ernest.sailfarbetter.com/sail/manage/transfer and sign in to
   Production. Select the destination vessel, choose the downloaded file, review
   counts and public/private choices, check the confirmation and Copy Sail content.
3. Review production pages, covers and position before switching DNS. Keep the
   export file private: it includes draft plans and private Sail joining/role
   notes. Delete the local copy when it is no longer needed.

Scope: up to 20 voyage plans, 50 ready website photographs and one latest position
report per vessel, including captions/order/cover choices and explicit publication
flags. Normalized website photos are downloaded through authenticated owner image
routes; private Ernest evidence and original uploads are never exported. Photos
are validated/normalized again by the existing upload pipeline on import. Source
content is unchanged. Private/unpublished source content remains private; a stale
nonpublic position-photo reference is omitted while its report text is retained.

The metadata manifest explicitly projects allowed fields. It excludes source
owner/asset IDs, R2 keys, credentials, signed URLs, guests, participants, invitation
tokens, enquiries, sessions and old audit snapshots. Reference IDs are remapped
to fresh destination IDs; all ownership derives from the destination session and
selected owned vessel. New plans receive a fresh initial audit entry. No email is
sent, no acceptance/confirmed guest state is copied and no existing Ernest data
is touched. A previously sent Preview invitation is not a Production invitation.

The browser file may be up to 80 MB; its embedded images stay in the browser.
Images PUT directly into destination R2 using existing signed uploads, avoiding
Vercel request-body limits. Only bounded metadata reaches the final server action.
Each image remains private while staged. A single database transaction creates
plans, links staged photos, preserves publication/cover flags and saves the report.
The destination is checked before upload and under an owned asset lock at commit.
Existing voyages, reports or unrelated photo uploads cause refusal rather than
merge/overwrite. Duplicate/repeated imports are refused.

If upload fails before final submission, the UI attempts to remove only its own
new private uploads. If final submission or its acknowledgement fails, it retains
uploads and asks the owner to inspect the workspace before retrying; it never
risks deleting content that may have committed. Pending private uploads are visible
in Website photos and can be removed there. Database rollback preserves all
existing records and publication flags on any transaction failure.

Unit/integration coverage exercises owner isolation, duplicate/partial target
refusal, fresh reference mapping, private field projection, guest omission and
transaction rollback. The transfer browser test uses two synthetic PGlite databases,
two storage maps, actual React/actions/stores/image validation and authenticated
boundary stubs. It downloads a bundle, uploads into the second environment and
verifies linked records/source preservation/repeat refusal. It neither copies live
content nor verifies the owner's provider credentials/CORS/deployment. Live copy
is performed only by the owner using the two pages above.

Validation for this release: all 157 unit/integration tests and all five browser
suites passed; lint passed with the same two existing warnings; TypeScript,
production build and whitespace checks passed. Tests use synthetic data only.

Retirement verification: the retained 152 tests and four browser suites passed,
as did lint (two existing warnings), TypeScript, build and whitespace checks.
No transfer imports or routes remain under src, tests or active CI scripts.
