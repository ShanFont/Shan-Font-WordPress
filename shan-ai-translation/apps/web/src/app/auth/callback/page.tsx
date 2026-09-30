'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function CallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const token = hash.get('access_token');
    if (!token) {
      setError('Google did not return a session. Check the Supabase redirect URL.');
      return;
    }
    sessionStorage.setItem('sat.supabase', token);
    router.replace('/dashboard');
  }, [router]);
  return <main className="p-8">{error || 'Signing you in…'}</main>;
}
