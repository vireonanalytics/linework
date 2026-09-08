# Security policy

## Reporting a vulnerability

Please report security issues privately to **vireonanalytics@gmail.com** rather
than opening a public issue.

Include what you found, the steps to reproduce it, and what an attacker could
do with it. You will get an acknowledgement within a few days. Please give a
reasonable window to fix anything confirmed before disclosing it publicly.

This is a small project run by one person, not a company with a security team.
There is no bug bounty. Reports are still genuinely welcome and will be taken
seriously.

Please do not run automated scanners, load tests, or brute-force tooling
against the live site. It shares infrastructure limits with real players, and
the anti-abuse measures below mean you will mostly be testing a rate limiter.

## How the application is built

The defensive design, for anyone reviewing the code:

**Database access.** Every query uses `postgres.js` tagged templates, which
parameterise. There is no string-concatenated SQL anywhere. Row Level Security
is enabled on every table with zero policies, and `anon` and `authenticated`
are explicitly revoked, so the PostgREST path exposes nothing even if a policy
were added by mistake later.

**Invariants live in the database, not only in application code.** `CHECK`
constraints enforce that an unverified dataset cannot be served, that a stored
path matches its declared resolution with every value in range, that a flag
always carries a reason, and that scores stay in bounds. Application code can
be bypassed or buggy; a constraint cannot.

**Scores are never trusted from the client.** The request payload parses into a
type that structurally has no score field, and the server scores against its
own read of the series.

**Passwords** are hashed with `scrypt` and a per-user random salt. The policy is
length plus a blocklist, not composition rules, following NIST SP 800-63B:
rules like "one uppercase, one symbol" push people toward `Password1!` and
reject good passphrases.

**Moderation is enforced per request, not at sign-in.** The session strategy is
JWT, so a token minted before an account was blocked stays cryptographically
valid. The block check runs on every write and fails closed.

**Rate limiting** is applied per endpoint class, with tighter limits on anything
that sends mail to a third party. Limits are sized on the principle that a
client address is not a person: offices, campuses and mobile carriers share
one address, so a limit tuned for an individual locks out a building.

**Bot protection** on signup is Cloudflare Turnstile, verified server-side
before any parsing or database work, alongside a honeypot and timing checks.

**No secrets in the repository.** Environment files are gitignored;
`.env.example` carries placeholders only.

**Personal data** is minimised by design. The anonymous pipeline stores no raw
IP and no raw user agent; the user agent is hashed with a server-only pepper
that never reaches the database. Exports drop every identifier in the query
rather than filtering afterwards.
