import PostgresAdapter from "@auth/pg-adapter";
import { Pool } from "pg";
import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PostgresAdapter(pool),
  providers: [Resend({
    apiKey: process.env.AUTH_RESEND_KEY,
    from: process.env.AUTH_EMAIL_FROM,
  })],
  pages: { signIn: "/sign-in" },
  session: { strategy: "database" },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
