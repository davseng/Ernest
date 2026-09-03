# Authentication decision

Ernest uses **Auth.js (`next-auth`) with the PostgreSQL adapter and its
Nodemailer email provider, delivered through Brevo SMTP**. Auth.js is the
conventional authentication integration for a Next.js App Router application
and runs in the same Vercel deployment as the app. Its PostgreSQL adapter keeps
users, sessions, and single-use verification tokens in the existing Neon
database, while Brevo sends passwordless magic links. This avoids a separate
identity service, custom password storage, and a second persistence system.

This is the lowest-complexity MVP choice because Ernest already requires
PostgreSQL, the adapter schema is small and migration-controlled, and the app
only needs one sign-in method. Auth.js owns token generation, expiry, session
cookies, and callback validation; Ernest only supplies the email provider and
uses the authenticated user ID as the asset owner ID. Additional providers or
roles can be added later without changing the ownership boundary.

The trade-off is one external transactional-email dependency. Ernest connects
to Brevo's authenticated SMTP relay on port 587 and requires STARTTLS; sender
addresses use the already authenticated `sailfarbetter.com` domain. Local
development can still validate the UI and authorization flow, but delivery of
a sign-in link requires Brevo SMTP credentials.
