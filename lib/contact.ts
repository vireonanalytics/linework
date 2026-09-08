/**
 * The public contact address, in one place.
 *
 * Deliberately NOT the admin account's email. Those were the same address
 * until 2026-08-28 and it was a latent mistake: one is a login and a
 * moderation identity, the other is printed in the privacy policy, the terms,
 * every "your password changed" email and the contact page. Tying them
 * together meant the owner's personal address was published, and meant it
 * could not be changed without also changing who can sign in as an admin.
 *
 * scripts/seed-admin.ts keeps its own constant for exactly that reason -
 * changing this must never move the admin account.
 */
export const CONTACT_EMAIL = "vireonanalytics@gmail.com";

/** Human-readable date for "last updated" lines on the legal pages. */
export const LEGAL_LAST_UPDATED = "28 August 2026";
