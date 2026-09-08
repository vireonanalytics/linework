/**
 * The two emails this project sends.
 *
 * There used to be a third - an address-confirmation mail on signup - removed
 * 2026-08-27 once password reset stopped depending on confirmation. It gated
 * nothing, so every signup was spending an email, a token and a page on a
 * step with no consequence.
 *
 * PLAIN TEXT IS WRITTEN FIRST AND CARRIES THE WHOLE MESSAGE. Every one of
 * these has a text body that stands alone, because a meaningful share of mail
 * clients, corporate gateways and screen readers show it instead of the HTML.
 * A text part that says "view this email in a browser" is a broken email.
 *
 * The HTML is deliberately primitive: a table-free single column, inline
 * styles, no external stylesheet, no webfont, no image. Mail clients strip
 * <style> blocks, block remote images by default, and Outlook renders through
 * Word. The design system that governs the site (app/tokens.css) cannot reach
 * here at all - the same documented exception the OG image route takes - so
 * the few colours below are literal by necessity, matching the site's ink,
 * violet and paper.
 */

import { CONTACT_EMAIL } from "../contact.ts";

export type EmailContent = { subject: string; text: string; html: string };

/**
 * Escape anything that reaches the HTML part.
 *
 * The display name is user input and was previously interpolated raw, which
 * made a name like "<img src=x onerror=alert(1)>" an HTML injection into the
 * recipient's inbox. Signup now rejects those characters too, but this is the
 * layer that has to hold regardless: a template that trusts its inputs is one
 * validation change away from being wrong again, and names arriving here
 * predate the new rule.
 */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const INK = "#111111";
const VIOLET = "#6844ff";
const PAPER = "#f8f7f2";
const MUTED = "#5d5b68";

function layout(heading: string, bodyHtml: string): string {
  return `<div style="margin:0;padding:24px;background:${PAPER};font-family:Georgia,'Times New Roman',serif;color:${INK};">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:2px solid ${INK};padding:28px;">
    <p style="margin:0 0 20px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${MUTED};">Linework</p>
    <h1 style="margin:0 0 16px;font-size:24px;line-height:1.2;">${heading}</h1>
    ${bodyHtml}
  </div>
  <p style="max-width:520px;margin:16px auto 0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:1.5;color:${MUTED};">
    You received this because someone used this address at Linework. If that wasn't you, you can ignore it safely.
  </p>
</div>`;
}

function button(href: string, label: string): string {
  /*
   * An <a> styled as a button, not a <button> - a form control in an email is
   * inert or stripped. The full URL is also printed beneath it in both parts,
   * because link rewriting and "protected view" modes routinely make the
   * clickable version unusable and the reader needs a fallback they can copy.
   */
  return `<p style="margin:0 0 20px;">
    <a href="${href}" style="display:inline-block;background:${VIOLET};color:#ffffff;text-decoration:none;padding:12px 20px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;letter-spacing:0.05em;text-transform:uppercase;border:2px solid ${INK};">${label}</a>
  </p>`;
}

function fallbackLink(href: string): string {
  return `<p style="margin:0 0 8px;font-size:14px;color:${MUTED};">Or paste this into your browser:</p>
  <p style="margin:0 0 20px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;word-break:break-all;color:${MUTED};">${href}</p>`;
}

export function resetPassword(link: string, displayName: string): EmailContent {
  const hi = displayName ? `${displayName}, ` : "";
  return {
    subject: "Reset your Linework password",
    text: [
      `${hi}someone asked to reset the password on your Linework account.`,
      "",
      "Set a new password here:",
      link,
      "",
      "The link works for one hour and can only be used once.",
      "",
      "If you didn't ask for this, ignore this email - your password has not",
      "changed and nobody can get in without this link.",
    ].join("\n"),
    html: layout(
      "Reset your password",
      `<p style="margin:0 0 20px;font-size:16px;line-height:1.5;">${hi ? `${esc(displayName)}, someone` : "Someone"} asked to reset the password on your Linework account.</p>
      ${button(link, "Set a new password")}
      ${fallbackLink(link)}
      <p style="margin:0;font-size:14px;line-height:1.5;color:${MUTED};">The link works for one hour and can only be used once. If you didn't ask for this, ignore this email - your password has not changed.</p>`,
    ),
  };
}

/**
 * Sent AFTER a password changes, to the address on file.
 *
 * This is the one email here that exists purely as a security signal rather
 * than to be acted on. If an attacker changes a password, this is the moment
 * the real owner finds out - which is why it is sent on every change,
 * including a change the user made themselves while signed in, and why it
 * cannot be turned off.
 */
export function passwordChanged(displayName: string): EmailContent {
  const hi = displayName ? `${displayName}, ` : "";
  const support = CONTACT_EMAIL;
  return {
    subject: "Your Linework password was changed",
    text: [
      `${hi}the password on your Linework account was just changed.`,
      "",
      "If that was you, there's nothing to do.",
      "",
      `If it wasn't, reply to this message or contact ${support} straight away -`,
      "someone else may have access to your account.",
    ].join("\n"),
    html: layout(
      "Your password was changed",
      `<p style="margin:0 0 20px;font-size:16px;line-height:1.5;">${hi ? `${esc(displayName)}, the` : "The"} password on your Linework account was just changed.</p>
      <p style="margin:0 0 20px;font-size:16px;line-height:1.5;">If that was you, there's nothing to do.</p>
      <p style="margin:0;font-size:14px;line-height:1.5;color:${MUTED};">If it wasn't, contact ${support} straight away - someone else may have access to your account.</p>`,
    ),
  };
}
