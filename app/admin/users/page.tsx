import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { allUsersForAdmin } from "@/lib/server/db";
import { AdminUserList } from "@/components/AdminUserList";

export const dynamic = "force-dynamic";
export const metadata = { title: "Accounts" };

/**
 * Moderation. Every account, with block and flag actions.
 *
 * Same gate as every other admin surface: session.user.role read from the
 * database at sign-in, never a hardcoded email comparison.
 */
export default async function AdminUsersPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin?callbackUrl=/admin/users");
  if (session.user.role !== "admin") redirect("/");

  const users = await allUsersForAdmin();
  const flagged = users.filter((u) => u.flaggedAt && !u.blockedAt).length;
  const blocked = users.filter((u) => u.blockedAt).length;

  return (
    <main className="page">
      <div className="frame frame--wide stack-5">
        <header className="stack-2">
          <p className="eyebrow">
            <Link href="/admin">&larr; Datasets</Link>
          </p>
          <h1 className="title">Accounts</h1>
          <p className="question">
            {users.length} accounts · {flagged} flagged for review · {blocked}{" "}
            blocked. Blocking takes effect immediately, including for sessions
            that are already signed in.
          </p>
        </header>

        <AdminUserList users={users} />
      </div>
    </main>
  );
}
