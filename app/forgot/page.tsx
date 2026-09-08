import Link from "next/link";
import { ForgotPasswordForm } from "@/components/ForgotPasswordForm";

export const metadata = { title: "Reset your password" };

export default function ForgotPage() {
  return (
    <main className="page">
      <div className="frame stack-5">
        <header className="stack-2">
          <p className="eyebrow">Password</p>
          <h1 className="title">Reset your password</h1>
          <p className="question">
            Enter the address you signed up with and we&apos;ll send you a link
            to set a new password.
          </p>
        </header>

        <ForgotPasswordForm />

        <p className="note">
          Remembered it? <Link href="/signin">Sign in</Link>.
        </p>
      </div>
    </main>
  );
}
