```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "landing_pages" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "organization_id" text NOT NULL,
    "slug" text NOT NULL,
    "title" text NOT NULL,
    "headline" text NOT NULL,
    "description" text NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "landing_pages_slug_idx" ON "landing_pages" USING btree ("slug");
```
