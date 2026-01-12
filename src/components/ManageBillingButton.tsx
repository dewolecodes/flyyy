 'use client';
import * as React from 'react';
import { Button } from '@/components/ui/button';

export function ManageBillingButton({ className }: { className?: string }) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No portal URL returned');
      }
    } catch (err: any) {
      setError(err?.message ?? String(err));
      setLoading(false);
    }
  }

  return (
    <div className={className}>
      <Button onClick={handleClick} disabled={loading} variant="outline">
        {loading ? 'Redirecting...' : 'Manage Billing'}
      </Button>
      {error ? <div className="text-destructive text-sm mt-2">{error}</div> : null}
    </div>
  );
}

export default ManageBillingButton;
