'use client';

import { Shell } from '@/components/shell';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <Shell kind="admin">{children}</Shell>;
}
