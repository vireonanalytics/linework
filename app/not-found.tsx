import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page">
      <div className="frame stack-4">
        <p className="eyebrow">404</p>
        <h1 className="title">Nothing here.</h1>
        <p className="question">
          That chart doesn&apos;t exist, or isn&apos;t live yet.
        </p>
        <Link className="button button--primary" href="/">Back to start</Link>
      </div>
    </main>
  );
}
