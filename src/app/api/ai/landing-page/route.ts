import { NextResponse } from 'next/server';
import requireOrgContext from '@/libs/requireOrgContext'
import { mapErrorToResponse } from '@/libs/ApiErrors'
import { z } from 'zod';

import { db } from '@/libs/DB';
import { aiUsageSchema } from '@/models/Schema';
import { getOrganization } from '@/libs/Org';
import { eq, and } from 'drizzle-orm';
import { getEntitlements, canUseAI } from '@/libs/Entitlements';
import { PlanError } from '@/libs/PlanGuard';
import { sql } from 'drizzle-orm';
import { isAIEnabled, OPENAI_API_KEY } from '@/libs/env';

// Request validation
const requestSchema = z.object({
  businessType: z.string().min(3, 'businessType is required and should be descriptive'),
  targetAudience: z.string().optional(),
  tone: z.string().optional().default('professional'),
});

// Successful response
const responseSchema = z.object({
  headline: z.string().min(1),
  description: z.string().min(1),
});

// Refusal response from the model
const refusalSchema = z.object({ refusal: z.string().min(1) });

export async function POST(request: Request) {
  try {
    if (!isAIEnabled) {
        const r = NextResponse.json({ error: 'AI features are disabled' }, { status: 503 });
        r.headers.set('Cache-Control', 'no-store')
        try { applySecurityHeaders(r.headers) } catch (e) {}
        return r
    }

    const { userId, orgId } = await requireOrgContext()

    // Load org from DB to perform entitlement checks (do not trust client input)
    const org = await getOrganization(orgId);
    if (!org) {
        const r = NextResponse.json({ error: 'Organization not found' }, { status: 404 });
        r.headers.set('Cache-Control', 'no-store')
        try { applySecurityHeaders(r.headers) } catch (e) {}
        return r
    }

  // Gate AI generation by entitlement
  const plan = (org.plan ?? 'starter') as any;
  const allowed = canUseAI(plan);
  if (!allowed) {
    const err = new PlanError('AI generation not available on current plan', 403, 'INSUFFICIENT_ENTITLEMENT', undefined, (org.plan as any) ?? 'starter');
    return NextResponse.json(
      {
        error: 'Insufficient plan',
        code: err.code,
        requiredPlan: err.requiredPlan,
        currentPlan: err.currentPlan,
      },
      { status: err.status ?? 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Do not accept organization identifiers from clients
  if (body && typeof body === 'object' && ('organizationId' in body || 'organization_id' in body)) {
    return NextResponse.json({ error: 'Cannot provide organizationId' }, { status: 403 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
        const r = NextResponse.json({ error: 'Invalid input', details: parsed.error.format() }, { status: 400 });
        r.headers.set('Cache-Control', 'no-store')
        try { applySecurityHeaders(r.headers) } catch (e) {}
        return r
  }

  const { businessType, targetAudience, tone } = parsed.data;

  const OPENAI_KEY = OPENAI_API_KEY;
  if (!OPENAI_KEY) {
        const r = NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
        r.headers.set('Cache-Control', 'no-store')
        try { applySecurityHeaders(r.headers) } catch (e) {}
        return r
  }

  // Monthly usage enforcement
  const now = new Date();
  const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`; // YYYY-MM

  const usageRows = await db
    .select()
    .from(aiUsageSchema)
    .where(and(eq(aiUsageSchema.organizationId, String(orgId)), eq(aiUsageSchema.period, period)));
  const currentCount = Array.isArray(usageRows) && usageRows[0] ? Number((usageRows[0] as any).count ?? 0) : 0;
  const ent = getEntitlements(org.plan ?? 'starter');
  const limit = ent.ai.monthlyLimit;
  if (limit !== Infinity && currentCount >= limit) {
    // Compute minimal plan that would allow another unit
    const order: Array<string> = ['starter', 'growth', 'scale'];
    let required: any = undefined;
    for (const p of order) {
      const e = getEntitlements(p as any);
      if (e.ai.monthlyLimit === Infinity || currentCount < e.ai.monthlyLimit) {
        required = p;
        break;
      }
    }
    const err = new PlanError('AI monthly quota exceeded', 403, 'QUOTA_EXCEEDED', required ?? undefined, (org.plan as any) ?? 'starter');
    return NextResponse.json({ error: 'Quota exceeded', code: err.code, requiredPlan: err.requiredPlan, currentPlan: err.currentPlan }, { status: err.status });
  }

    try {
    // System prompt strictly enforces business/marketing behavior and JSON-only output
    const system = `You are a helpful marketing copywriter. You MUST only respond to prompts about business, products, services, or marketing. If the user's request is unrelated to business, output a JSON object with a single field {"refusal":"<brief reason>"} and do not produce marketing text. Otherwise, output ONLY a JSON object with two fields: \"headline\" (a concise, attention-grabbing headline) and \"description\" (a short descriptive paragraph). Do not include any extra explanation, markdown, or text. Keep the headline under 20 words and description under 200 words.`;

    const userPrompt = `Business type: ${businessType}${targetAudience ? `\nTarget audience: ${targetAudience}` : ''}\nTone: ${tone}`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 400,
      }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
          const r = NextResponse.json({ error: 'OpenAI request failed', details: txt }, { status: 502 });
          r.headers.set('Cache-Control', 'no-store')
          try { applySecurityHeaders(r.headers) } catch (e) {}
          return r
    }

    const payload = await res.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') {
          const r = NextResponse.json({ error: 'No content from OpenAI' }, { status: 502 });
          r.headers.set('Cache-Control', 'no-store')
          try { applySecurityHeaders(r.headers) } catch (e) {}
          return r
    }

    // Extract first JSON object from the model output
    let parsedJson: unknown;
    try {
      const firstBrace = content.indexOf('{');
      const lastBrace = content.lastIndexOf('}');
      const jsonStr = firstBrace >= 0 && lastBrace >= 0 ? content.slice(firstBrace, lastBrace + 1) : content;
      parsedJson = JSON.parse(jsonStr);
    } catch (err) {
          const r = NextResponse.json({ error: 'Failed to parse OpenAI response as JSON', raw: content }, { status: 502 });
          r.headers.set('Cache-Control', 'no-store')
          try { applySecurityHeaders(r.headers) } catch (e) {}
          return r
    }

    // If model refused, return refusal message
    const maybeRefusal = refusalSchema.safeParse(parsedJson);
    if (maybeRefusal.success) {
          const r = NextResponse.json({ error: `Refusal: ${maybeRefusal.data.refusal}` }, { status: 400 });
          r.headers.set('Cache-Control', 'no-store')
          try { applySecurityHeaders(r.headers) } catch (e) {}
          return r
    }

    const validated = responseSchema.safeParse(parsedJson);
    if (!validated.success) {
          const r = NextResponse.json({ error: 'OpenAI response validation failed', details: validated.error.format(), raw: parsedJson }, { status: 502 });
          r.headers.set('Cache-Control', 'no-store')
          try { applySecurityHeaders(r.headers) } catch (e) {}
          return r
    }

    // Successful generation — increment monthly usage atomically
    try {
      // Try to atomically increment existing row
      const updated = await db
        .update(aiUsageSchema)
        .set({ count: sql`${aiUsageSchema.count} + 1` })
        .where(and(eq(aiUsageSchema.organizationId, String(orgId)), eq(aiUsageSchema.period, period)))
        .returning();

      if (!updated || updated.length === 0) {
        // No existing row — insert. If a concurrent insert created the row, catch unique violation and fall back to increment.
        try {
          await db.insert(aiUsageSchema).values({ organizationId: orgId, period, count: 1 }).returning();
        } catch (e: any) {
          // Assume unique violation — fallback to increment
          await db
            .update(aiUsageSchema)
            .set({ count: sql`${aiUsageSchema.count} + 1` })
            .where(and(eq(aiUsageSchema.organizationId, String(orgId)), eq(aiUsageSchema.period, period)));
        }
      }
    } catch (e: any) {
      // Log or ignore increment errors — do not fail the user response
      console.error('Failed to increment AI usage', e);
    }

        const ok = NextResponse.json(validated.data);
        ok.headers.set('Cache-Control', 'no-store')
        try { applySecurityHeaders(ok.headers) } catch (e) {}
        return ok
    } catch (err: any) {
        const r = NextResponse.json({ error: 'AI generation failed', details: err?.message ?? String(err) }, { status: 500 });
        r.headers.set('Cache-Control', 'no-store')
        try { applySecurityHeaders(r.headers) } catch (e) {}
        return r
    }
  } catch (err: any) {
    const mapped = mapErrorToResponse(err)
      const r = NextResponse.json(mapped.body, { status: mapped.status })
      r.headers.set('Cache-Control', 'no-store')
      try { applySecurityHeaders(r.headers) } catch (e) {}
      return r
  }
}

  export const runtime = 'nodejs'
