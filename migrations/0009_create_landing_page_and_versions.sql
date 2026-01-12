```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "landing_page" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "landing_page_slug_idx" ON "landing_page" USING btree ("slug");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "landing_page_version" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "landing_page_id" uuid NOT NULL,
  "schema" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "published_at" timestamp NULL
);
--> statement-breakpoint
ALTER TABLE IF EXISTS "landing_page_version"
  ADD CONSTRAINT IF NOT EXISTS "fk_lpv_landing_page" FOREIGN KEY ("landing_page_id") REFERENCES "landing_page" ("id") ON DELETE CASCADE;

```
