```sql
ALTER TABLE IF EXISTS "organization"
  ADD COLUMN IF NOT EXISTS "plan" text DEFAULT 'free' NOT NULL;
--> statement-breakpoint
```
