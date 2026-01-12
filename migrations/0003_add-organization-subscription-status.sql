```sql
ALTER TABLE IF EXISTS "organization"
  ADD COLUMN IF NOT EXISTS "subscription_status" text;
--> statement-breakpoint
```