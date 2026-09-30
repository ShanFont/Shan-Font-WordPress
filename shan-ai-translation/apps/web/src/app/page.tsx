import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let stats = { contributors: 0, approvedSentences: 0, approvedPages: 0, pendingReviews: 0 };
  try {
    const target = process.env.API_PROXY_TARGET || 'http://127.0.0.1:3001';
    const response = await fetch(`${target}/api/v1/community/stats`, { cache: 'no-store' });
    if (response.ok) stats = await response.json();
  } catch {
    stats = { contributors: 0, approvedSentences: 0, approvedPages: 0, pendingReviews: 0 };
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-4 py-16">
      <p className="text-sm font-semibold uppercase tracking-wide text-teal">English → Shan</p>
      <h1 className="text-4xl font-bold">Translate sentences and pages. Build a Shan dataset.</h1>
      <p className="text-lg text-muted">
        Contributors claim a random task, write in Shan, and earn after review. Payments are manual
        Thai bank or QR transfers.
      </p>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Approved sentences" value={stats.approvedSentences} />
        <Stat label="Approved pages" value={stats.approvedPages} />
        <Stat label="Contributors" value={stats.contributors} />
      </div>
      <div className="flex gap-3">
        <Link
          href="/register"
          className="inline-flex min-h-11 items-center rounded-xl bg-teal px-4 font-semibold text-white"
        >
          Create an account
        </Link>
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center rounded-xl border border-line bg-card px-4 font-semibold"
        >
          Log in
        </Link>
      </div>
      <p className="text-sm text-muted">
        The platform collects training text. It does not train or host a model.
      </p>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line bg-card p-4 shadow-sm">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}
