import { passwordIssue } from "./password.ts";
import {
  passwordStrengthIssue,
  passwordStrengthMessage,
} from "./password-strength.ts";
import { nameIssueMessage, screenDisplayName } from "./name-screen.ts";
import { isValidPlace, isValidStateName } from "../geo/places.ts";

/**
 * Strict validation of a signup request, the same posture
 * lib/server/validate-guess.ts already takes: nothing from the request body
 * is trusted or coerced. City/state are checked against the real bundled
 * place list (lib/geo/places.ts) - "a real place list, not free text" means
 * enforcing it server-side, not just offering an autocomplete the client
 * could bypass with a raw request.
 *
 * Country is deliberately NOT a field here - it is auto-detected server-side
 * from the request, never submitted by the client. See app/api/account/route.ts.
 */

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MIN_BIRTH_YEAR = 1900;

function maxBirthYear(): number {
  // Matches the database CHECK constraint exactly: no signup claiming to be
  // younger than 5 years old.
  return new Date().getUTCFullYear() - 5;
}

export type ProfileFields = {
  displayName: string;
  birthYear: number | null;
  city: string | null;
  state: string | null;
};

export type ProfileParseResult =
  | { ok: true; value: ProfileFields }
  | { ok: false; error: string };

/**
 * The fields signup and profile-editing have in common. Split out so
 * PATCH /api/account can validate a profile edit without needing to invent a
 * fake password just to satisfy a combined validator - see
 * app/api/account/route.ts.
 */
export function parseProfileFields(raw: Record<string, unknown>): ProfileParseResult {
  if (typeof raw.displayName !== "string") {
    return { ok: false, error: "display name is required" };
  }
  const displayName = raw.displayName.trim();
  if (displayName.length < 1 || displayName.length > 40) {
    return { ok: false, error: "display name must be 1-40 characters" };
  }
  // Not a legal-name field, but still shown alongside other people's - reject
  // control characters only. An earlier version of this check used a
  // character-class regex that accidentally matched " " and "-" too, which
  // would have rejected "Mary Jane" and "Jean-Paul" - caught before it shipped.
  if (/[\x00-\x1f\x7f]/.test(displayName)) {
    return { ok: false, error: "display name contains invalid characters" };
  }
  /*
   * Angle brackets and backticks are refused outright.
   *
   * Found by attacking this endpoint on 2026-08-27: a signup with the display
   * name "<img src=x onerror=alert(1)>" was accepted. React escapes it
   * everywhere the site renders it, so there was no stored XSS in the app -
   * but lib/email/templates.ts interpolates the display name straight into
   * an HTML email body, which is a real HTML injection into someone's inbox.
   *
   * Fixed at BOTH ends: escaped there, rejected here. A display name has no
   * legitimate need for these characters, so refusing them costs nothing and
   * removes the class of problem rather than the one instance of it.
   */
  if (/[<>`]/.test(displayName)) {
    return { ok: false, error: "display name cannot contain < > or `" };
  }
  // Content judgement, separate from the structural checks above - see
  // lib/server/name-screen.ts for why it matches whole words only and why
  // the real backstop is an admin with a block button rather than a
  // longer word list.
  const nameIssue = screenDisplayName(displayName);
  if (nameIssue) {
    return { ok: false, error: nameIssueMessage(nameIssue) };
  }

  let birthYear: number | null = null;
  if (raw.birthYear !== null && raw.birthYear !== undefined) {
    if (
      typeof raw.birthYear !== "number" ||
      !Number.isInteger(raw.birthYear) ||
      raw.birthYear < MIN_BIRTH_YEAR ||
      raw.birthYear > maxBirthYear()
    ) {
      return { ok: false, error: "birth year is not plausible" };
    }
    birthYear = raw.birthYear;
  }

  let city: string | null = null;
  let state: string | null = null;
  const cityGiven = raw.city !== null && raw.city !== undefined && raw.city !== "";
  const stateGiven = raw.state !== null && raw.state !== undefined && raw.state !== "";

  if (cityGiven || stateGiven) {
    if (typeof raw.city !== "string" || typeof raw.state !== "string") {
      return { ok: false, error: "city and state must both be provided together" };
    }
    if (!isValidStateName(raw.state)) {
      return { ok: false, error: "not a recognised US state" };
    }
    if (!isValidPlace(raw.city, raw.state)) {
      return {
        ok: false,
        error: "city must be selected from the suggested list, not typed freely",
      };
    }
    city = raw.city;
    state = raw.state;
  }

  return { ok: true, value: { displayName, birthYear, city, state } };
}

export type SignupPayload = ProfileFields & {
  email: string;
  password: string;
  /** Always true when parsing succeeds - the parse fails otherwise. */
  acceptedTerms: true;
};

export type ParseResult =
  | { ok: true; value: SignupPayload }
  | { ok: false; error: string };

export function parseSignupPayload(body: unknown): ParseResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "body must be a JSON object" };
  }
  const raw = body as Record<string, unknown>;

  if (typeof raw.email !== "string") {
    return { ok: false, error: "a valid email is required" };
  }
  // Trim before validating, not after - a copy-pasted email with incidental
  // whitespace should not fail an anchored regex that has already lost its
  // chance to ignore it. (Caught by a test expecting exactly this to work.)
  const email = raw.email.trim().toLowerCase();
  if (!EMAIL.test(email)) {
    return { ok: false, error: "a valid email is required" };
  }
  if (email.length > 254) {
    return { ok: false, error: "email is too long" };
  }

  if (typeof raw.password !== "string") {
    return { ok: false, error: "password is required" };
  }
  const issue = passwordIssue(raw.password);
  if (issue === "empty") return { ok: false, error: "password is required" };
  if (issue === "too-long") return { ok: false, error: "password is too long" };

  const profile = parseProfileFields(raw);
  if (!profile.ok) return profile;

  /*
   * Strength is checked AFTER the profile parses, so the email and display
   * name are available as identity hints - a password containing either is
   * rejected, and that check needs both values to exist.
   *
   * Enforced here, server-side, and not only in the signup form: the form's
   * meter is guidance, but a raw POST bypasses it entirely, so this is the
   * only place the rule actually holds.
   */
  const strength = passwordStrengthIssue(raw.password, {
    email,
    displayName: profile.value.displayName,
  });
  if (strength) {
    return { ok: false, error: passwordStrengthMessage(strength) };
  }

  /*
   * Agreement is a REQUIRED field, not a default. A checkbox the server
   * treats as optional is not agreement to anything, and the whole point of
   * recording it is that it can be relied on later - this project intends to
   * publish aggregated drawing data, which is precisely the clause someone
   * needs to have actually agreed to.
   */
  if (raw.acceptedTerms !== true) {
    return { ok: false, error: "you must agree to the terms of use to create an account" };
  }

  return {
    ok: true,
    value: { email, password: raw.password, acceptedTerms: true, ...profile.value },
  };
}
