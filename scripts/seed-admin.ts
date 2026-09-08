/**
 * Seeds exactly one admin, role 'admin', with no password. Admin status is a
 * database column (users.role), never a hardcoded email check anywhere in
 * application code - this script is the only place an address is treated as
 * special, and it reads that address from the environment rather than
 * hardcoding it.
 *
 * The row is created WITHOUT a password. That is what lets it be claimed:
 * when this exact email signs up through the normal POST /api/account flow,
 * createUser() in lib/server/db.ts finds the passwordless row, sets the
 * password on it, and leaves `role` untouched - see that function's
 * comment for the full mechanism. Until then this row cannot log in at all
 * (password_hash is null, and lib/auth.ts's authorize() rejects that).
 *
 * Safe to re-run: ON CONFLICT does nothing if the row already exists, so
 * running this after the admin has already signed up does not clobber their
 * password or profile.
 *
 * Run with: ADMIN_EMAIL=you@example.com npm run seed:admin
 */

import postgres from "postgres";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.trim().toLowerCase();
if (!ADMIN_EMAIL) {
  console.error("ADMIN_EMAIL is not set. Run: ADMIN_EMAIL=you@example.com npm run seed:admin");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. See .env.example.");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, ssl: "require", max: 1 });

const rows = await sql`
  insert into users (id, email, display_name, role)
  values (${crypto.randomUUID()}, ${ADMIN_EMAIL}, ${"Admin"}, ${"admin"})
  on conflict (email) do nothing
  returning id, role
`;

if (rows.length === 1) {
  console.log(`seed-admin: created admin stub for ${ADMIN_EMAIL} (id ${rows[0].id})`);
  console.log("seed-admin: no password set yet - sign up with this exact email to claim it.");
} else {
  const existing = await sql`select role from users where email = ${ADMIN_EMAIL}`;
  console.log(
    existing[0]?.role === "admin"
      ? `seed-admin: ${ADMIN_EMAIL} already exists and is already admin - nothing to do`
      : `seed-admin: WARNING - ${ADMIN_EMAIL} already exists with role "${existing[0]?.role}", not "admin". This script never overwrites role; fix it by hand if that's wrong: update users set role = 'admin' where email = '${ADMIN_EMAIL}';`,
  );
}

await sql.end();
