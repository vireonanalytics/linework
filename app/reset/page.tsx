import Link from "next/link";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set a new password" };

/**
 * The destination of the link in the reset email.
 *
 * This page only READS the token out of the query string and hands it to a
 * form. Nothing is consumed by loading it - see ResetPasswordForm and the
 * POST route for why that matters (mail scanners fetch links, and a spent
 * token would lock the user out of their own reset).
 */
export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="page">
      <div className="frame stack-5">
        <header className="stack-2">
          <p className="eyebrow">Password</p>
          <h1 className="title">Set a new password</h1>
        </header>

        {typeof token === "string" && token.length > 0 ? (
          <ResetPasswordForm token={token} />
        ) : (
          <div className="card stack-3">
            <p className="question">
              This page needs a reset link from your email.
            </p>
            <p className="controls">
              <Link className="button button--primary" href="/forgot">
                Request a reset link
              </Link>
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
