'use client';

import { type Me, api } from '@sat/api-client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const contributorLinks = [
  ['/dashboard', 'Dashboard'],
  ['/translate', 'Translate'],
  ['/translations', 'My translations'],
  ['/earnings', 'Earnings'],
];

const adminLinks = [
  ['/admin', 'Dashboard'],
  ['/admin/data', 'Data'],
  ['/admin/categories', 'Categories'],
  ['/admin/users', 'Users'],
  ['/admin/review', 'Review'],
  ['/admin/payments', 'Payments'],
  ['/admin/exports', 'Exports'],
  ['/admin/settings', 'Settings'],
  ['/admin/audit', 'Audit'],
];

export function useMe(kind?: 'admin' | 'contributor') {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    api
      .me()
      .then((user) => {
        if (kind === 'admin' && user.role !== 'admin') router.replace('/dashboard');
        else setMe(user);
      })
      .catch(() => router.replace('/login'));
  }, [kind, router]);
  return me;
}

export function Shell({
  kind,
  children,
}: { kind: 'admin' | 'contributor'; children: React.ReactNode }) {
  const me = useMe(kind);
  const pathname = usePathname();
  const router = useRouter();
  const links = kind === 'admin' ? adminLinks : contributorLinks;
  if (!me) return <p className="p-8 text-muted">Loading…</p>;
  return (
    <div className="min-h-screen">
      <header className="app-nav border-b border-line bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link
            href={kind === 'admin' ? '/admin' : '/dashboard'}
            className="text-lg font-bold text-teal"
          >
            Shan translation
          </Link>
          <nav className="hidden gap-1 md:flex">
            {links.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className={`rounded-xl px-3 py-2 text-sm font-semibold ${pathname === href ? 'bg-teal text-white' : 'text-ink'}`}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2 text-sm">
            <Link href="/settings" className="font-semibold">
              {me.displayName}
            </Link>
            <button
              className="min-h-11 px-2"
              type="button"
              onClick={async () => {
                await api.logout();
                router.push('/login');
              }}
            >
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 md:pb-8">{children}</main>
      {kind === 'contributor' ? (
        <nav className="app-nav fixed inset-x-0 bottom-0 grid grid-cols-4 border-t border-line bg-card md:hidden">
          {contributorLinks.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="flex min-h-11 items-center justify-center text-xs font-semibold"
            >
              {label.split(' ')[0]}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

export function Notice({ children }: { children: string | null }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger">
      {children}
    </p>
  );
}

export function message(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong';
}
