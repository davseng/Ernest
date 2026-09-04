import PostgresAdapter from "@auth/pg-adapter";
import { Pool } from "pg";
import NextAuth from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PostgresAdapter(pool),
  providers: [Nodemailer({
    // Auth.js and many deployment templates provide the complete SMTP URL as
    // EMAIL_SERVER. Keep supporting Ernest's documented split variables too.
    server: process.env.EMAIL_SERVER ?? {
      host: process.env.EMAIL_SERVER_HOST ?? "smtp-relay.brevo.com",
      port: Number(process.env.EMAIL_SERVER_PORT ?? "587"),
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.EMAIL_SERVER_USER,
        pass: process.env.EMAIL_SERVER_PASSWORD,
      },
    },
    from: process.env.EMAIL_FROM,
  })],
  pages: {
    error: "/sign-in",
    signIn: "/sign-in",
    verifyRequest: "/sign-in/check-email",
  },
  session: { strategy: "database" },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
