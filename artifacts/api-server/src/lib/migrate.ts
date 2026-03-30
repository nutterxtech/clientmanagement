import { getDb } from "./db";
import { logger } from "./logger";
import { sql } from "drizzle-orm";

export async function runMigrations(): Promise<void> {
  const db = getDb();

  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE role            AS ENUM ('user', 'admin');        EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      CREATE TYPE chat_type       AS ENUM ('direct', 'group');      EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      CREATE TYPE request_status  AS ENUM ('pending', 'in_progress', 'completed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      CREATE TYPE payment_status  AS ENUM ('unpaid', 'pending', 'paid', 'failed'); EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      CREATE TYPE ext_pay_status  AS ENUM ('unpaid', 'pending', 'paid', 'failed'); EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      CREATE TYPE initiated_by    AS ENUM ('user', 'admin');        EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name       TEXT NOT NULL,
      email      TEXT NOT NULL UNIQUE,
      password   TEXT NOT NULL,
      role       role NOT NULL DEFAULT 'user',
      avatar     TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS chats (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      type            chat_type NOT NULL,
      name            TEXT,
      avatar          TEXT,
      created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
      last_message_id UUID,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS chat_participants (
      chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (chat_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      chat_id    UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      sender_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content    TEXT NOT NULL,
      read       BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS services (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title       TEXT NOT NULL,
      description TEXT NOT NULL,
      price       NUMERIC,
      features    TEXT[] NOT NULL DEFAULT '{}',
      icon        TEXT,
      category    TEXT,
      popular     BOOLEAN NOT NULL DEFAULT false,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS service_requests (
      id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      service_id               UUID REFERENCES services(id) ON DELETE SET NULL,
      service_name             TEXT NOT NULL,
      description              TEXT NOT NULL,
      requirements             TEXT,
      status                   request_status NOT NULL DEFAULT 'pending',
      admin_notes              TEXT,
      completed_at             TIMESTAMPTZ,
      subscription_ends_at     TIMESTAMPTZ,
      payment_required         BOOLEAN NOT NULL DEFAULT false,
      payment_amount           NUMERIC,
      payment_currency         TEXT NOT NULL DEFAULT 'KES',
      payment_status           payment_status NOT NULL DEFAULT 'unpaid',
      payment_phone            TEXT,
      pesapal_order_tracking_id TEXT,
      created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS deadline_payments (
      id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      service_request_id       UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
      service_name             TEXT NOT NULL,
      purpose                  TEXT NOT NULL,
      amount                   NUMERIC NOT NULL,
      currency                 TEXT NOT NULL DEFAULT 'KES',
      payment_status           ext_pay_status NOT NULL DEFAULT 'unpaid',
      pesapal_order_tracking_id TEXT,
      admin_confirmed          BOOLEAN NOT NULL DEFAULT false,
      admin_notes              TEXT,
      new_deadline             TIMESTAMPTZ,
      initiated_by             initiated_by NOT NULL DEFAULT 'user',
      admin_message            TEXT,
      admin_requested_days     INTEGER,
      created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS settings (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      key        TEXT NOT NULL UNIQUE,
      value      TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Incremental migrations — each in its own execute call so failures are isolated
  await db.execute(sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL`);
  await db.execute(sql`ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS mpesa_message TEXT`);
  await db.execute(sql`ALTER TABLE deadline_payments ADD COLUMN IF NOT EXISTS mpesa_message TEXT`);
  await db.execute(sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'text'`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS view_once_images (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      message_id  UUID REFERENCES messages(id) ON DELETE CASCADE,
      sender_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      chat_id     UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      image_data  TEXT,
      mime_type   TEXT NOT NULL DEFAULT 'image/jpeg',
      caption     TEXT,
      viewed      BOOLEAN NOT NULL DEFAULT false,
      viewed_at   TIMESTAMPTZ,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`ALTER TABLE view_once_images ADD COLUMN IF NOT EXISTS caption TEXT`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS view_once_views (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      image_id   UUID NOT NULL REFERENCES view_once_images(id) ON DELETE CASCADE,
      viewer_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      viewed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (image_id, viewer_id)
    )
  `);

  await db.execute(sql`ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS mpesa_amount NUMERIC`);
  await db.execute(sql`ALTER TABLE deadline_payments ADD COLUMN IF NOT EXISTS mpesa_amount NUMERIC`);

  logger.info("Database migrations completed");
}
