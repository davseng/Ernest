# Sail production cutover

The owner reports Preview acceptance tests passed and has requested moving toward
production. This authorizes production preparation; do not skip verifying the
production database or point DNS at an unprepared deployment.

## Domain routing

Use the existing Ernest Vercel project and its Production environment:

- `sailfarbetter.com`: root internally rewrites to `/sail` only for this exact host.
- `www.sailfarbetter.com`: permanent redirect to the apex, preserving the path.
- `ernest.sailfarbetter.com`: existing Ernest root and authentication remain intact.
- `preview.ernest.sailfarbetter.com`: remains on the isolated `preview` Git branch.
- On the public host, `/sail/manage/*` and `/sail/sign-in` redirect to the existing
  Ernest host. No cross-domain session sharing is introduced.
- Public links continue to work under `/sail`; invitation URLs remain
  `/sail/invitations/<token>`. No invitation tokens are moved or copied.

Only host-conditioned rules in next.config.ts change. No Auth.js implementation,
production authentication variables, cookie domains or database bindings change.

## Required production preparation

1. In Neon select the branch currently used by **Production**, not
   `ernest-v011-test`. Create a fresh recovery branch/checkpoint before mutations.
   Run `scripts/sail/production-sql-editor/01-preflight.sql` (read-only) and review
   results before preparing exact additive apply scripts. `neondb` is not proof
   of branch identity. Preview 029 verification does not establish Production
   schema. Do not run the Preview apply scripts against Production or replay
   historical migrations. No seeds, resets or private-record replacements.
2. Retain the current Production Git SHA/deployment and the existing DNS records.
   Review the final code diff against current main. Merge/release only after the
   production schema and environment dependencies are ready. Do not promote the
   Preview deployment with its isolated database/storage bindings.
3. Keep the existing Production DATABASE_URL, R2 bindings, Auth.js origin and
   secrets. Set Production `SAIL_BASE_URL=https://sailfarbetter.com`. Initially keep
   `SAIL_EMAIL_ENABLED=false`; enable only once final host/HTTPS works, then send
   a newly issued owner-controlled invitation as a live check. Do not paste secret
   values into chat. The non-production recipient allowlist is not a Production
   restriction. Preserve the existing mail sender/provider setup.
4. Populate Production intentionally: owner sign-in at the Ernest host, upload
   website photos and explicitly publish them, recreate approved voyage plans
   and the position report. Preview metadata alone does not move R2 objects.
   Do not copy database branches, authentication sessions, private records,
   participants or invitation tokens. Original photos can be reuploaded from the
   owner's files; a bulk website-photo transfer requires a separately reviewed
   metadata/object-only process. Keep the R2 bucket private. Browser photo uploads
   run on the Ernest host, so preserve that host's upload CORS permissions.
5. Validate the Production deployment, photos, root routing and owner sign-in
   before completing DNS cutover. Preserve the previous public site/deployment
   for rollback. Inspect the actual final-host guest flow after HTTPS activates.

## Owner DNS steps

In Vercel → existing Ernest project → Settings → Domains, add the apex and www
as **Production** domains (not Preview/branch domains). Do not reassign Ernest or
Preview. Record the exact record types/names/targets and any ownership TXT
verification that Vercel shows; targets may be project-specific.

In the authoritative DNS provider, after the deployment/data are ready:

| Name | Intended action |
| --- | --- |
| `@` / `sailfarbetter.com` | Replace only the old website A/AAAA/CNAME/ALIAS records with the exact apex record(s) shown by Vercel. |
| `www` | Set the exact CNAME (or other record type) shown by Vercel, replacing any conflicting old website record. |
| Ownership TXT | Add only if Vercel requests it; preserve existing TXT records. |
| `ernest`, `preview.ernest` | Leave existing records unchanged. |
| MX, SPF, DKIM, DMARC and unrelated records | Leave unchanged; these support email and other services. |

Do not change nameservers just to attach the site. If Cloudflare manages DNS,
start the new website records as **DNS only** while Vercel validates the domain
and provisions HTTPS. Use Vercel's exact values, not a guessed generic Vercel IP
or hostname. A CNAME cannot coexist with other record types at the same name;
replace only conflicting website records. If using apex flattening/ALIAS, follow
Vercel and the DNS provider's displayed instructions.

After DNS propagates, Vercel should show Valid Configuration and issue HTTPS.
Check apex home, www redirect, Boat, Joining Us, images, new guest invitation
acceptance and unchanged Ernest sign-in. Keep mail disabled until the public
host is working. Confirm invites never link to Preview or require Vercel login.

## Rollback

Before launch retain old website DNS targets, old hosting and the previous Ernest
Production deployment. If cutover fails, restore only the changed website DNS
records and redeploy the prior code as appropriate. Leave additive schema and
new owner data intact; do not drop tables or restore over newer production data.
No DNS, production migration, mail enablement or production release was executed
while preparing this document.

## Preparation validation

151 unit/integration tests and all four browser suites passed. Lint passed with
two existing warnings, TypeScript and the final production build passed. A local
built-app HTTP check with synthetic auth configuration and DATABASE_URL empty
verified apex returns Sail (200), www preserves path/query in its 308 redirect,
public owner routes redirect to Ernest (307), and both Ernest and isolated
Preview retain their original root sign-in behavior. No live database or storage
was accessed by that HTTP check. Exact-host routing rejects lookalike hosts;
the root rewrite runs before filesystem routes so it takes precedence over the
existing Ernest root only on the intended public domain.
