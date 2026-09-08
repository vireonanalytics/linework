"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CityAutocomplete } from "@/components/CityAutocomplete";
import { ChangePassword } from "@/components/ChangePassword";
import type { UsPlace } from "@/lib/geo/places";

type Account = {
  id: string;
  email: string;
  displayName: string;
  birthYear: number | null;
  city: string | null;
  state: string | null;
  currentStreak: number;
  longestStreak: number;
  streakFreezesAvailable: number;
};

export default function AccountPage() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [place, setPlace] = useState<UsPlace | null>(null);

  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    fetch("/api/account")
      .then(async (res) => {
        if (res.status === 401) {
          // Client-side navigation, so the sign-in page loads without a full
          // document request and the React tree is not thrown away.
          router.push("/signin?callbackUrl=/account");
          return;
        }
        if (!res.ok) throw new Error();
        const body = (await res.json()) as { user: Account };
        setAccount(body.user);
        setDisplayName(body.user.displayName);
        setBirthYear(body.user.birthYear?.toString() ?? "");
        if (body.user.city && body.user.state) {
          setPlace({ city: body.user.city, state: body.user.state });
        }
      })
      .catch(() => setLoadError("Could not load your account."));
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setSaveError(null);
    setSaved(false);

    const response = await fetch("/api/account", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        displayName,
        birthYear: birthYear ? Number(birthYear) : null,
        city: place?.city ?? null,
        state: place?.state ?? null,
      }),
    });

    setPending(false);

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setSaveError(body.error ?? "Could not save changes.");
      return;
    }

    const body = (await response.json()) as { user: Account };
    setAccount(body.user);
    setSaved(true);
  };

  if (loadError) {
    return (
      <main className="page">
        <div className="frame"><p className="note">{loadError}</p></div>
      </main>
    );
  }

  if (!account) {
    return (
      <main className="page">
        <div className="frame"><p className="note">Loading...</p></div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="frame stack-5">
        <header className="stack-2">
          <p className="eyebrow">{account.email}</p>
          <h1 className="title">Your account</h1>
        </header>

        <dl className="metrics">
          <div>
            <dt className="metric-term">Current streak</dt>
            <dd className="metric-value">{account.currentStreak} day{account.currentStreak === 1 ? "" : "s"}</dd>
          </div>
          <div>
            <dt className="metric-term">Longest streak</dt>
            <dd className="metric-value">{account.longestStreak} day{account.longestStreak === 1 ? "" : "s"}</dd>
          </div>
          <div>
            <dt className="metric-term">Streak freezes</dt>
            <dd className="metric-value">{account.streakFreezesAvailable}</dd>
          </div>
        </dl>

        <form className="stack-4" onSubmit={handleSubmit}>
          <div className="field">
            <label className="field-label" htmlFor="displayName">Display name</label>
            <input
              id="displayName"
              className="field-input"
              type="text"
              maxLength={40}
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="birthYear">Birth year</label>
            <input
              id="birthYear"
              className="field-input"
              type="number"
              inputMode="numeric"
              min={1900}
              max={new Date().getFullYear() - 5}
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value)}
            />
          </div>

          <CityAutocomplete selected={place} onSelect={setPlace} />

          {saveError ? <p className="field-error" role="alert">{saveError}</p> : null}
          {saved ? <p className="note">Saved.</p> : null}

          <button type="submit" className="button button--primary" disabled={pending}>
            {pending ? "Saving..." : "Save changes"}
          </button>
        </form>

        <ChangePassword />

        <p className="note">
          All demographic fields on this page are self-reported and unverified -
          see the <a href="/legal/privacy">privacy policy</a> for how they&apos;re
          used.
        </p>
      </div>
    </main>
  );
}
