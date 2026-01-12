```sql
ALTER TABLE IF EXISTS "organization"
  ADD COLUMN IF NOT EXISTS "stripe_customer_id" text;
--> statement-breakpoint
ALTER TABLE IF EXISTS "organization"
  ADD COLUMN IF NOT EXISTS "stripe_subscription_id" text;
--> statement-breakpoint
ALTER TABLE IF EXISTS "organization"
  ADD COLUMN IF NOT EXISTS "subscription_status" text;
--> statement-breakpoint
```
