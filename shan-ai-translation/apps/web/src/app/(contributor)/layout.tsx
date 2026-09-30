'use client';

import { Shell } from '@/components/shell';

export default function ContributorLayout({ children }: { children: React.ReactNode }) {
  return <Shell kind="contributor">{children}</Shell>;
}
