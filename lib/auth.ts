import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { userByEmail } from "@/lib/server/db";
import { verifyPassword } from "@/lib/server/password";

/**
 * Exception to the lib/ convention: everything else in lib/ uses relative
 * imports with explicit .ts extensions so it stays plain-Node-runnable (see
 * docs/DESIGN.md). This file cannot be - it wires next-auth into Next's request
 * lifecycle and has no meaningful existence outside it, the same way
 * middleware.ts and route handlers already sit outside that convention. Uses
 * @/ imports accordingly. The actual logic it calls out to (userByEmail,
 * verifyPassword) lives in properly plain-Node-tested modules; this file is
 * glue, not logic.
 *
 * NextAuth v5 (Auth.js), chosen over Supabase Auth - the human left this
 * choice open ("your call: NextAuth/Supabase Auth"). Reasoning:
 *
 * The app already owns its entire schema and talks to Postgres directly
 * through one pooled connection (lib/server/db.ts) - no ORM, no Supabase
 * client SDK, no PostgREST. Supabase Auth would introduce a second identity
 * system alongside that: its own `auth.users` table in a schema this project
 * does not manage, its own GoTrue service, and a real question about how a
 * `public.users` profile table stays in sync with it (typically a trigger on
 * `auth.users` insert). NextAuth needs none of that - it is a thin session
 * layer, not a separate platform, so `users` stays the one and only account
 * table, defined and migrated exactly like every other table in this schema.
 *
 * Credentials only (email + password), not OAuth or Email/magic-link:
 * magic-link needs a transactional email provider, which is a new external
 * service (with a cost and an account to set up) this project does not have
 * configured. Password auth needs nothing external - hashing is
 * lib/server/password.ts, built on node:crypto, no new dependency beyond
 * next-auth itself. If a transactional email provider ever gets set up,
 * adding passwordless email as a second provider is additive, not a rewrite.
 *
 * Session strategy: JWT, not database sessions. A DB session strategy would
 * need NextAuth's own `sessions` table (a second session concept, alongside
 * the app's own anonymous `sessions` table from Phase 3 - genuinely
 * confusing to have two). JWT needs no extra table at all: the session is a
 * signed, encrypted cookie NextAuth manages itself, separate from and
 * unrelated to the anonymous `dtl_session` cookie middleware.ts already
 * mints. Both cookies coexist; neither replaces the other.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        const user = await userByEmail(email);
        if (!user || !user.passwordHash) return null;

        const valid = verifyPassword(password, user.passwordHash);
        if (!valid) return null;

        /*
         * A blocked account cannot start a NEW session. This is the cheap
         * half of enforcement; it is not sufficient on its own, because this
         * project uses a JWT session strategy and a token minted before the
         * block stays cryptographically valid until it expires. The
         * authoritative check is isUserBlocked() on every guess - see
         * app/api/guess/route.ts. Both exist because neither alone is
         * enough: this one stops a fresh sign-in, that one stops an existing
         * session.
         */
        if (user.blockedAt) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.displayName,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    // Runs on sign-in and on every subsequent request. Only re-reads the
    // database on sign-in (when `user` is present) - after that the role
    // travels in the JWT itself, so a session does not cost a query per
    // request. A role change (e.g. someone promoted to admin) takes effect
    // on that person's next sign-in, not instantly - an acceptable tradeoff
    // for not hitting Postgres on every page view.
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role: "user" | "admin" }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "user" | "admin";
      }
      return session;
    },
  },
});
