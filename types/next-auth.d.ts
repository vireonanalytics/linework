import type { DefaultSession } from "next-auth";

/**
 * Adds `id` and `role` to the session/JWT shapes NextAuth ships by default.
 * Populated in lib/auth.ts's jwt/session callbacks.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "user" | "admin";
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "user" | "admin";
  }
}
