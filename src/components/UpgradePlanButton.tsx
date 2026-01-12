'use client';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { isBillingEnabledClient } from '@/libs/env';

export default function UpgradePlanButton({ plan = 'pro', className }: { plan?: 'basic' | 'pro'; className?: string }) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleClick() {
    if (!isBillingEnabledClient) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err: any) {
      setError(err?.message ?? String(err));
      setLoading(false);
    }
  }

  return (
    <div className={className}>
      <Button onClick={handleClick} disabled={loading || !isBillingEnabledClient} variant="default">
        {loading ? 'Redirecting…' : 'Upgrade plan'}
      </Button>
      {error ? <div className="text-destructive text-sm mt-2">{error}</div> : null}
    </div>
  );
}
