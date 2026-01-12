import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';

import { TitleBar } from '@/features/dashboard/TitleBar';
import { DashboardSection } from '@/features/dashboard/DashboardSection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default async function NewLandingPage() {
  const { userId } = await auth();

  if (!userId) redirect('/sign-in');

  return (
    <div>
      <TitleBar title="Create Landing Page" description="Create a new landing page for your organization." />

      <DashboardSection
        title="Create"
        description="Provide the required fields to create a landing page."
      >
        <NewLandingPageForm />
      </DashboardSection>
    </div>
  );
}

'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';

type FormValues = {
  slug: string;
  title: string;
  headline: string;
  description: string;
  businessType?: string;
  targetAudience?: string;
  tone?: string;
};

function NewLandingPageForm() {
  const router = useRouter();
  const { register, handleSubmit, formState: { errors, isSubmitting }, setValue, getValues } = useForm<FormValues>({
    defaultValues: { slug: '', title: '', headline: '', description: '', businessType: '', targetAudience: '', tone: 'professional' },
  });

  const [serverError, setServerError] = React.useState<string | null>(null);
  const [aiLoading, setAiLoading] = React.useState(false);
  const [aiHelper, setAiHelper] = React.useState<string | null>(null);

  async function onSubmit(values: FormValues) {
    setServerError(null);

    try {
      const res = await fetch('/api/landing-pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (res.ok) {
        router.push('/landing-pages');
        return;
      }

      const body = await res.json().catch(() => ({}));
      setServerError(body?.error || 'Failed to create landing page');
    } catch (err: any) {
      setServerError(err?.message ?? 'Failed to create landing page');
    }
  }

  async function generateAI() {
    setServerError(null);
    const values = getValues();
    if (!values.businessType || values.businessType.trim().length === 0) {
      setAiHelper('Please provide a Business Type to generate AI suggestions.');
      return;
    }

    // clear previous helper
    setAiHelper(null);

    setAiLoading(true);
    try {
      const res = await fetch('/api/ai/landing-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: values.title, slug: values.slug }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // handle refusal-like responses returned as error strings
        if (body?.refusal) {
          setAiHelper(body.refusal);
          return;
        }
        if (body?.error && typeof body.error === 'string' && body.error.startsWith('Refusal:')) {
          setAiHelper(body.error.replace(/^Refusal:\s*/i, ''));
          return;
        }

        setServerError(body?.error || `AI request failed: ${res.status}`);
        return;
      }

      const data = await res.json();
      // Model may return explicit refusal object
      if (data?.refusal) {
        setAiHelper(String(data.refusal));
        return;
      }

      if (data.headline) setValue('headline', data.headline);
      if (data.description) setValue('description', data.description);
    } catch (err: any) {
      setServerError(err?.message ?? 'AI request failed');
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-2xl">
      <div className="rounded-md border p-3">
        <div className="text-sm font-medium mb-2">AI Assist</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <Label>Business Type</Label>
            <input
              {...register('businessType')}
              className="flex h-9 w-full rounded-md border px-3 py-1 text-sm"
              placeholder="e.g. SaaS analytics platform"
            />
          </div>

          <div className="sm:col-span-1">
            <Label>Target Audience</Label>
            <input
              {...register('targetAudience')}
              className="flex h-9 w-full rounded-md border px-3 py-1 text-sm"
              placeholder="e.g. product managers"
            />
          </div>

          <div className="sm:col-span-1">
            <Label>Tone</Label>
            <select
              {...register('tone')}
              className="flex h-9 w-full rounded-md border bg-white px-3 py-1 text-sm"
            >
              <option value="professional">Professional</option>
              <option value="friendly">Friendly</option>
              <option value="persuasive">Persuasive</option>
            </select>
          </div>
        </div>
        {aiHelper && <div className="mt-2 text-sm text-muted-foreground italic">{aiHelper}</div>}
      </div>
      <div>
        <Label>Slug</Label>
        <Input
          {...register('slug', { required: 'Slug is required', minLength: { value: 1, message: 'Slug is required' } })}
          placeholder="my-product"
        />
        {errors.slug && <div className="text-sm text-destructive">{errors.slug.message}</div>}
      </div>

      <div>
        <Label>Title</Label>
        <Input {...register('title', { required: 'Title is required' })} placeholder="Landing Page Title" />
        {errors.title && <div className="text-sm text-destructive">{errors.title.message}</div>}
      </div>

      <div>
        <Label>Headline</Label>
        <Input {...register('headline', { required: 'Headline is required' })} placeholder="Short headline" />
        {errors.headline && <div className="text-sm text-destructive">{errors.headline.message}</div>}
      </div>

      <div>
        <Label>Description</Label>
        <textarea
          {...register('description', { required: 'Description is required' })}
          className="w-full rounded-md border px-3 py-2 text-sm"
          rows={4}
          placeholder="Describe this landing page"
        />
        {errors.description && <div className="text-sm text-destructive">{errors.description.message}</div>}
      </div>

      {serverError && <div className="text-sm text-destructive">{serverError}</div>}

      <div className="flex items-center gap-3">
        <Button type="button" onClick={generateAI} disabled={aiLoading || isSubmitting} variant="secondary">
          {aiLoading ? 'Generating…' : 'Generate with AI'}
        </Button>

        <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creating…' : 'Create'}</Button>

        <Link href="/landing-pages" className="text-sm text-muted-foreground">Cancel</Link>
      </div>
    </form>
  );
}
