import {
  pgTable, text, boolean, numeric, timestamp, integer, uuid, pgEnum,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ── Enums ────────────────────────────────────────────────────
export const roleEnum           = pgEnum("role",            ["user", "admin"]);
export const chatTypeEnum       = pgEnum("chat_type",       ["direct", "group"]);
export const requestStatusEnum  = pgEnum("request_status",  ["pending", "in_progress", "completed", "cancelled"]);
export const paymentStatusEnum  = pgEnum("payment_status",  ["unpaid", "pending", "paid", "failed"]);
export const extPayStatusEnum   = pgEnum("ext_pay_status",  ["unpaid", "pending", "paid", "failed"]);
export const initiatedByEnum    = pgEnum("initiated_by",    ["user", "admin"]);

// ── Tables ───────────────────────────────────────────────────

export const users = pgTable("users", {
  id:        uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name:      text("name").notNull(),
  email:     text("email").notNull().unique(),
  password:  text("password").notNull(),
  role:      roleEnum("role").notNull().default("user"),
  avatar:    text("avatar"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chats = pgTable("chats", {
  id:            uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  type:          chatTypeEnum("type").notNull(),
  name:          text("name"),
  avatar:        text("avatar"),
  createdBy:     uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  lastMessageId: uuid("last_message_id"),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chatParticipants = pgTable("chat_participants", {
  chatId: uuid("chat_id").notNull().references(() => chats.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
});

export const messages = pgTable("messages", {
  id:        uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  chatId:    uuid("chat_id").notNull().references(() => chats.id, { onDelete: "cascade" }),
  senderId:  uuid("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  content:   text("content").notNull(),
  read:      boolean("read").notNull().default(false),
  replyToId: uuid("reply_to_id"),
  type:      text("type").notNull().default("text"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const viewOnceImages = pgTable("view_once_images", {
  id:        uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: uuid("message_id").references(() => messages.id, { onDelete: "cascade" }),
  senderId:  uuid("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  chatId:    uuid("chat_id").notNull().references(() => chats.id, { onDelete: "cascade" }),
  imageData: text("image_data"),
  mimeType:  text("mime_type").notNull().default("image/jpeg"),
  viewed:    boolean("viewed").notNull().default(false),
  viewedAt:  timestamp("viewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const services = pgTable("services", {
  id:          uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  title:       text("title").notNull(),
  description: text("description").notNull(),
  price:       numeric("price"),
  features:    text("features").array().notNull().default(sql`'{}'::text[]`),
  icon:        text("icon"),
  category:    text("category"),
  popular:     boolean("popular").notNull().default(false),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const serviceRequests = pgTable("service_requests", {
  id:                      uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId:                  uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  serviceId:               uuid("service_id").references(() => services.id, { onDelete: "set null" }),
  serviceName:             text("service_name").notNull(),
  description:             text("description").notNull(),
  requirements:            text("requirements"),
  status:                  requestStatusEnum("status").notNull().default("pending"),
  adminNotes:              text("admin_notes"),
  completedAt:             timestamp("completed_at", { withTimezone: true }),
  subscriptionEndsAt:      timestamp("subscription_ends_at", { withTimezone: true }),
  paymentRequired:         boolean("payment_required").notNull().default(false),
  paymentAmount:           numeric("payment_amount"),
  paymentCurrency:         text("payment_currency").notNull().default("KES"),
  paymentStatus:           paymentStatusEnum("payment_status").notNull().default("unpaid"),
  paymentPhone:            text("payment_phone"),
  pesapalOrderTrackingId:  text("pesapal_order_tracking_id"),
  mpesaMessage:            text("mpesa_message"),
  mpesaAmount:             numeric("mpesa_amount"),
  createdAt:               timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:               timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const deadlinePayments = pgTable("deadline_payments", {
  id:                     uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId:                 uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  serviceRequestId:       uuid("service_request_id").notNull().references(() => serviceRequests.id, { onDelete: "cascade" }),
  serviceName:            text("service_name").notNull(),
  purpose:                text("purpose").notNull(),
  amount:                 numeric("amount").notNull(),
  currency:               text("currency").notNull().default("KES"),
  paymentStatus:          extPayStatusEnum("payment_status").notNull().default("unpaid"),
  pesapalOrderTrackingId: text("pesapal_order_tracking_id"),
  adminConfirmed:         boolean("admin_confirmed").notNull().default(false),
  adminNotes:             text("admin_notes"),
  newDeadline:            timestamp("new_deadline", { withTimezone: true }),
  initiatedBy:            initiatedByEnum("initiated_by").notNull().default("user"),
  adminMessage:           text("admin_message"),
  adminRequestedDays:     integer("admin_requested_days"),
  mpesaMessage:           text("mpesa_message"),
  mpesaAmount:            numeric("mpesa_amount"),
  createdAt:              timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:              timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  id:        uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  key:       text("key").notNull().unique(),
  value:     text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
