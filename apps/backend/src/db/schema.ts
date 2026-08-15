import {
  bigint,
  boolean,
  date,
  datetime,
  decimal,
  index,
  int,
  mysqlTable,
  text,
  time,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * ProFit — multi-tenant gym CRM. Tenancy is gyms > branches > everything.
 *
 * These definitions mirror the tables already provisioned in the `gyms`
 * database (see gyms.sql). They are transcribed to match what is live, NOT
 * generated from here: the database was created out-of-band, so `db:push` would
 * diff this file against the 24 real tables and propose dropping whatever this
 * file does not yet model. 23 are modelled; only `membership_freezes` is not,
 * because nothing reads it yet.
 *
 * Ids are `varchar(20)`, so ids are minted with nanoid(20) — not nanoid(21),
 * which MySQL would reject (or silently truncate outside strict mode).
 */

/** Ids are this wide across ProFit's tenancy tables. */
export const ID_LENGTH = 20;

/** `categories`, `combos` and `suppliers` declare narrower id columns. */
export const SHORT_ID_LENGTH = 16;

/**
 * `workers.role` is a free-form varchar(32) in SQL rather than an enum, so the
 * allowed set is defined and enforced here.
 */
export const WORKER_ROLES = [
  "owner",
  "admin",
  "manager",
  "trainer",
  "receptionist",
] as const;

/** Only `active` workers may authenticate — see verifyCredentials. */
export const WORKER_STATUSES = ["active", "inactive", "suspended"] as const;

export const gyms = mysqlTable("gyms", {
  gymId: varchar("gym_id", { length: 20 }).primaryKey(),
  gym: varchar("gym", { length: 200 }),
  ownerName: varchar("owner_name", { length: 200 }),
  phone: varchar("phone", { length: 20 }),
  planTier: varchar("plan_tier", { length: 32 }),
  isActive: boolean("is_active").default(true),
  createdAt: datetime("created_at"),
  /**
   * Day of the month (1–28) a monthly worker's whole salary is accrued to their
   * balance. Added as a nullable column; null means no payday is configured yet.
   */
  payday: int("payday"),
});

export const branches = mysqlTable(
  "branches",
  {
    branchId: varchar("branch_id", { length: 20 }).primaryKey(),
    gymId: varchar("gym_id", { length: 20 }),
    branch: varchar("branch", { length: 200 }),
    address: varchar("address", { length: 255 }),
    phone: varchar("phone", { length: 20 }),
    timezone: varchar("timezone", { length: 64 }),
    openTime: time("open_time"),
    closeTime: time("close_time"),
    isActive: boolean("is_active").default(true),
    createdAt: datetime("created_at"),
  },
  (table) => [index("idx_branches_gym").on(table.gymId)]
);

export const workers = mysqlTable(
  "workers",
  {
    workerId: varchar("worker_id", { length: 20 }).primaryKey(),
    gymId: varchar("gym_id", { length: 20 }),
    branchId: varchar("branch_id", { length: 20 }),
    fullname: varchar("fullname", { length: 200 }),
    phone: varchar("phone", { length: 20 }),
    role: varchar("role", { length: 32 }),
    login: varchar("login", { length: 64 }),
    // bcrypt produces 60 chars; the column is 255 for headroom on rehash.
    passwordHash: varchar("password_hash", { length: 255 }),
    salaryType: varchar("salary_type", { length: 16 }),
    salaryAmount: decimal("salary_amount", { precision: 14, scale: 2 }),
    expectedStart: time("expected_start"),
    /** Shift end, the estimate an auto-checkout uses at gym closing time. */
    shiftEnd: time("shift_end"),
    /** Working weekdays as ISO numbers, comma-joined — "1,2,3,4,5" is Mon–Fri. */
    workingDays: varchar("working_days", { length: 32 }),
    lateGraceMin: int("late_grace_min").default(0),
    status: varchar("status", { length: 16 }),
    // Kept as "YYYY-MM-DD" (like members.birthdate): a hire date has no time or
    // timezone, and round-tripping it through a Date can shift it a day.
    hiredAt: date("hired_at", { mode: "string" }),
    createdAt: datetime("created_at"),
  },
  (table) => [
    index("idx_workers_gym").on(table.gymId),
    index("idx_workers_branch").on(table.branchId),
    index("idx_workers_role").on(table.gymId, table.role),
    index("idx_workers_status").on(table.status),
  ]
);

/**
 * One completed (or open) shift. `check_out` null means still on shift;
 * `minutes_worked` is filled when it closes. `person_type` is "worker" here, but
 * the table is shared with member attendance, so every query filters on it.
 * `source`/faceid lives on the raw events; a session is the derived pair.
 */
export const attendanceSessions = mysqlTable(
  "attendance_sessions",
  {
    // AUTO_INCREMENT bigint — never set by the service.
    sessionId: bigint("session_id", { mode: "number" })
      .autoincrement()
      .primaryKey(),
    gymId: varchar("gym_id", { length: 20 }),
    branchId: varchar("branch_id", { length: 20 }),
    personType: varchar("person_type", { length: 10 }),
    personId: varchar("person_id", { length: 20 }),
    workDate: date("work_date", { mode: "string" }),
    checkIn: datetime("check_in"),
    checkOut: datetime("check_out"),
    minutesWorked: int("minutes_worked"),
    wasLate: boolean("was_late"),
    lateMinutes: int("late_minutes"),
    status: varchar("status", { length: 16 }),
    needsReview: boolean("needs_review"),
    isCorrected: boolean("is_corrected"),
    correctedBy: varchar("corrected_by", { length: 20 }),
    createdAt: datetime("created_at"),
  },
  (table) => [
    index("idx_attendance_sessions_person").on(
      table.personType,
      table.personId
    ),
    index("idx_attendance_sessions_branch").on(table.branchId),
  ]
);

/**
 * The raw in/out taps a session is built from. `direction` is "in"/"out" and
 * `source` is "manual" or "faceid" — the desk logs manual taps today; FaceID
 * devices will write here later without any schema change.
 */
export const attendanceEvents = mysqlTable(
  "attendance_events",
  {
    // AUTO_INCREMENT bigint — never set by the service.
    eventId: bigint("event_id", { mode: "number" })
      .autoincrement()
      .primaryKey(),
    gymId: varchar("gym_id", { length: 20 }),
    branchId: varchar("branch_id", { length: 20 }),
    personType: varchar("person_type", { length: 10 }),
    personId: varchar("person_id", { length: 20 }),
    credentialId: varchar("credential_id", { length: 20 }),
    deviceId: varchar("device_id", { length: 64 }),
    eventTime: datetime("event_time").notNull(),
    direction: varchar("direction", { length: 4 }),
    source: varchar("source", { length: 10 }),
    createdAt: datetime("created_at"),
  },
  (table) => [
    index("idx_attendance_events_person").on(table.personType, table.personId),
    index("idx_attendance_events_branch").on(table.branchId),
  ]
);

export const categories = mysqlTable(
  "categories",
  {
    // varchar(16), not 20 — mint with SHORT_ID_LENGTH.
    categoryId: varchar("category_id", { length: 16 }).primaryKey(),
    gymId: varchar("gym_id", { length: 20 }),
    category: varchar("category", { length: 120 }),
    createdAt: datetime("created_at"),
    // Background tint for the POS tile when no photo is set. Hex like "#2563eb".
    color: varchar("color", { length: 16 }),
  },
  (table) => [index("idx_categories_gym").on(table.gymId)]
);

export const products = mysqlTable(
  "products",
  {
    productId: varchar("product_id", { length: 20 }).primaryKey(),
    gymId: varchar("gym_id", { length: 20 }),
    product: varchar("product", { length: 100 }),
    productType: varchar("product_type", { length: 64 }),
    description: varchar("description", { length: 124 }),
    // DECIMAL comes back as a string; formatting money is the caller's job.
    price: decimal("price", { precision: 10, scale: 2 }),
    cost: decimal("cost", { precision: 10, scale: 2 }),
    unit: varchar("unit", { length: 64 }),
    lowStockThreshold: decimal("low_stock_threshold", {
      precision: 14,
      scale: 3,
    }),
    isActive: boolean("is_active").default(true),
    // The only table so far whose created_at is a TIMESTAMP with a DB default.
    createdAt: timestamp("created_at").defaultNow(),
    categoryId: varchar("category_id", { length: 16 }),
    // Background tint for the POS tile when no photo is set. Hex like "#2563eb".
    color: varchar("color", { length: 16 }),
  },
  (table) => [index("idx_products_gym").on(table.gymId)]
);

/**
 * A combo (to'plam): a named bundle sold at one price, assembled from product
 * components. Like a product it belongs to one side of the catalog via
 * `product_type` ("bar" or "shop"). `combo_id` and `category_id` are varchar(16)
 * — mint the id with SHORT_ID_LENGTH.
 */
export const combos = mysqlTable(
  "combos",
  {
    comboId: varchar("combo_id", { length: 16 }).primaryKey(),
    gymId: varchar("gym_id", { length: 20 }),
    combo: varchar("combo", { length: 255 }),
    price: decimal("price", { precision: 10, scale: 2 }),
    createdAt: timestamp("created_at"),
    productType: varchar("product_type", { length: 16 }),
    categoryId: varchar("category_id", { length: 16 }),
  },
  (table) => [index("idx_combos_gym").on(table.gymId)]
);

/**
 * One product inside a combo, with how much of it goes in — `quantity` is in the
 * product's own unit (0.05 for 50 g of a per-kg product). Unlike every other
 * table here, `id` is a DB AUTO_INCREMENT bigint, so the service must never set
 * it. `product_id` was widened from varchar(16) to varchar(20) to hold a
 * nanoid(20) product id.
 */
export const comboComponents = mysqlTable(
  "combo_components",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    comboId: varchar("combo_id", { length: 16 }),
    productId: varchar("product_id", { length: 20 }),
    quantity: decimal("quantity", { precision: 10, scale: 2 }),
  },
  (table) => [index("idx_combo_components_combo").on(table.comboId)]
);

export const halls = mysqlTable(
  "halls",
  {
    hallId: varchar("hall_id", { length: 20 }).primaryKey(),
    gymId: varchar("gym_id", { length: 20 }),
    branchId: varchar("branch_id", { length: 20 }),
    hall: varchar("hall", { length: 100 }),
    capacity: int("capacity"),
    description: varchar("description", { length: 255 }),
    isActive: boolean("is_active"),
    createdAt: datetime("created_at"),
  },
  (table) => [index("idx_halls_branch").on(table.branchId)]
);

/**
 * A membership plan. `billing_type` decides which of `duration` / `visit_qty`
 * is meaningful — a plan is sold either by time or by a bundle of visits.
 *
 * The scheduling columns (`trainer_id`, `hall_id`, `slots`, `weekdays`) belong
 * to group classes and are modelled but not yet used; `halls` is one of the 21
 * tables still absent from this file.
 */
export const plans = mysqlTable(
  "plans",
  {
    planId: varchar("plan_id", { length: 20 }).primaryKey(),
    gymId: varchar("gym_id", { length: 20 }),
    branchId: varchar("branch_id", { length: 20 }),
    plan: varchar("plan", { length: 255 }),
    price: decimal("price", { precision: 14, scale: 2 }),
    billingType: varchar("billing_type", { length: 16 }),
    /** Days, when billed by duration. */
    duration: int("duration"),
    /** Number of entries, when billed by visits. */
    visitQty: int("visit_qty"),
    // `start` and `end` are SQL keywords; Drizzle quotes them for us.
    startsAt: datetime("start"),
    endsAt: datetime("end"),
    description: text("description"),
    trainerId: varchar("trainer_id", { length: 20 }),
    hallId: varchar("hall_id", { length: 20 }),
    slots: int("slots"),
    weekdays: varchar("weekdays", { length: 240 }),
    isActive: boolean("is_active"),
    createdAt: datetime("created_at"),
  },
  (table) => [index("idx_plans_gym").on(table.gymId)]
);

/** A person who trains at the gym. `memberships` is what ties one to a plan. */
export const members = mysqlTable(
  "members",
  {
    memberId: varchar("member_id", { length: 20 }).primaryKey(),
    gymId: varchar("gym_id", { length: 20 }),
    homeBranch: varchar("home_branch", { length: 20 }),
    fullname: varchar("fullname", { length: 200 }),
    phone: varchar("phone", { length: 20 }),
    gender: varchar("gender", { length: 10 }),
    joinedAt: datetime("joined_at"),
    /*
     * Kept as "YYYY-MM-DD" rather than a Date. A birthdate has no time and no
     * timezone; round-tripping it through a Date is how someone born on the
     * 1st ends up stored as the 31st of the month before.
     */
    birthdate: date("birthdate", { mode: "string" }),
    /** Short human-facing card number, not the primary key. */
    uniqueId: varchar("unique_id", { length: 10 }),
    type: varchar("type", { length: 20 }),
    status: varchar("status", { length: 16 }),
  },
  (table) => [index("idx_members_gym").on(table.gymId)]
);

/**
 * Modelled here for one reason so far: a plan cannot be deleted while a
 * membership still points at it. There are no foreign keys in this database, so
 * nothing else would stop the delete from orphaning live memberships.
 */
export const memberships = mysqlTable(
  "memberships",
  {
    membershipId: varchar("membership_id", { length: 20 }).primaryKey(),
    gymId: varchar("gym_id", { length: 20 }),
    memberId: varchar("member_id", { length: 20 }),
    planId: varchar("plan_id", { length: 20 }),
    /**
     * What the sale was **charged**, net of any discount — the member's debt is
     * `price - SUM(income.amount)`, so this has to be the figure they owe rather
     * than the plan's list price.
     */
    price: decimal("price", { precision: 14, scale: 2 }),
    /**
     * How much was taken off the plan's list price, or null when nothing was.
     *
     * Kept as its own figure rather than inferred from `price` against the plan:
     * a plan's price is edited over time, so "what did we give away" stops being
     * answerable the moment somebody changes it. `list price = price + discount`.
     */
    discount: decimal("discount", { precision: 14, scale: 2 }),
    startsAt: datetime("start"),
    endsAt: datetime("end"),
    remainingVisits: int("remaining_visits"),
    totalVisits: int("total_visits"),
    status: varchar("status", { length: 16 }),
    lastVisit: date("last_visit"),
    createdAt: datetime("created_at"),
    createdBy: varchar("created_by", { length: 20 }),
  },
  (table) => [
    index("idx_memberships_gym").on(table.gymId),
    index("idx_memberships_member").on(table.memberId),
    index("idx_memberships_status").on(table.status),
  ]
);

/**
 * Money in. One row per payment, so a membership paid in instalments has
 * several. `target_id` points at whatever was paid for — a membership id for
 * `category = 'membership'`. A refund/correction sets `voided_at` rather than
 * deleting the row, so every balance must exclude voided rows.
 */
export const income = mysqlTable(
  "income",
  {
    /** The one id in this database the server does not mint — see gyms.sql. */
    transactionId: bigint("transaction_id", { mode: "number" })
      .autoincrement()
      .primaryKey(),
    gymId: varchar("gym_id", { length: 20 }),
    branchId: varchar("branch_id", { length: 20 }),
    category: varchar("category", { length: 16 }),
    targetId: varchar("target_id", { length: 20 }),
    memberId: varchar("member_id", { length: 20 }),
    amount: decimal("amount", { precision: 14, scale: 2 }),
    paymentType: varchar("payment_type", { length: 16 }),
    paidAt: datetime("paid_at"),
    voidedAt: datetime("voided_at"),
    voidedBy: varchar("voided_by", { length: 20 }),
    createdBy: varchar("created_by", { length: 20 }),
    note: varchar("note", { length: 255 }),
  },
  (table) => [
    index("idx_income_gym").on(table.gymId),
    index("idx_income_target").on(table.targetId),
    index("idx_income_member").on(table.memberId),
  ]
);

/**
 * Shop/bar sales. `user_id` is deliberately wide and paired with `user_type`
 * because an order can belong to a member or to a worker — so a member's shop
 * debt must filter on both, never on `user_id` alone.
 */
export const orders = mysqlTable(
  "orders",
  {
    orderId: varchar("order_id", { length: 20 }).primaryKey(),
    gymId: varchar("gym_id", { length: 20 }),
    branchId: varchar("branch_id", { length: 20 }),
    userId: varchar("user_id", { length: 64 }),
    userType: varchar("user_type", { length: 20 }),
    /**
     * What the sale comes to **after** any discount. Every debt query in this
     * service reads `total_price - SUM(income.amount)`, so netting it here is
     * what keeps a discounted order from being chased for the difference.
     */
    totalPrice: decimal("total_price", { precision: 10, scale: 2 }),
    /**
     * How much was taken off the line totals, or null when nothing was. The
     * gross is `total_price + discount`; the lines still carry their own prices,
     * so a discount is never smeared across them.
     */
    discount: decimal("discount", { precision: 10, scale: 2 }),
    createdAt: timestamp("created_at"),
    settledAt: datetime("settled_at"),
    status: varchar("status", { length: 16 }),
  },
  (table) => [
    index("idx_orders_gym").on(table.gymId),
    index("idx_orders_user").on(table.userId),
  ]
);

/**
 * The line items of a shop order — one row per product on the ticket. `name`
 * and `price` are snapshotted at sale time, so a later price change on the
 * product does not rewrite history. `line_total` is stored rather than derived
 * so the row is self-describing even if `price`/`quantity` are later adjusted.
 */
export const orderItems = mysqlTable(
  "order_items",
  {
    orderRepId: varchar("order_rep_id", { length: 20 }).primaryKey(),
    gymId: varchar("gym_id", { length: 20 }),
    branchId: varchar("branch_id", { length: 20 }),
    orderId: varchar("order_id", { length: 20 }),
    productId: varchar("product_id", { length: 20 }),
    name: varchar("name", { length: 100 }),
    quantity: int("quantity"),
    price: decimal("price", { precision: 10, scale: 2 }),
    cost: decimal("cost", { precision: 10, scale: 2 }),
    lineTotal: decimal("line_total", { precision: 10, scale: 2 }),
    comboId: varchar("combo_id", { length: 16 }),
    comboPrice: decimal("combo_price", { precision: 10, scale: 2 }),
    isSaved: boolean("is_saved"),
    savedAt: datetime("saved_at"),
    status: varchar("status", { length: 20 }),
    createdAt: timestamp("created_at"),
    voidedAt: datetime("voided_at"),
    voidedBy: varchar("voided_by", { length: 20 }),
  },
  (table) => [
    index("idx_order_items_order").on(table.orderId),
    index("idx_order_items_combo").on(table.comboId),
  ]
);

/**
 * A correction to a line item after the fact — a return, a comp, a spoiled
 * unit. `qty_change` is signed and `refund_amount` records money handed back,
 * so the original `order_items` row is never rewritten.
 */
export const orderItemAdjustments = mysqlTable(
  "order_item_adjustments",
  {
    adjustmentId: varchar("adjustment_id", { length: 20 }).primaryKey(),
    gymId: varchar("gym_id", { length: 20 }),
    branchId: varchar("branch_id", { length: 20 }),
    orderRepId: varchar("order_rep_id", { length: 20 }),
    orderId: varchar("order_id", { length: 20 }),
    qtyChange: int("qty_change"),
    disposition: varchar("disposition", { length: 10 }),
    reason: varchar("reason", { length: 120 }),
    refundAmount: decimal("refund_amount", { precision: 14, scale: 2 }),
    createdBy: varchar("created_by", { length: 20 }),
    createdAt: datetime("created_at"),
  },
  (table) => [
    index("idx_adjustments_item").on(table.orderRepId),
    index("idx_adjustments_order").on(table.orderId),
  ]
);

/**
 * The stock ledger. One append-only row per movement, `quantity` **signed**
 * (+in / −out), so stock on hand for a product is `SUM(quantity)`. A sale writes
 * a negative row here linked to its `order_rep_id`; there is no separate "current
 * stock" column to keep in step. `storage_actions_main` is an optional header for
 * deliberate documents (a delivery, a stocktake) — a sale writes no main row.
 */
export const storageActionsRep = mysqlTable(
  "storage_actions_rep",
  {
    storageActionsRepId: varchar("storage_actions_rep_id", {
      length: 64,
    }).primaryKey(),
    gymId: varchar("gym_id", { length: 20 }),
    branchId: varchar("branch_id", { length: 20 }),
    productId: varchar("product_id", { length: 20 }),
    actionId: varchar("action_id", { length: 64 }),
    orderRepId: varchar("order_rep_id", { length: 20 }),
    adjustmentId: varchar("adjustment_id", { length: 20 }),
    movementType: varchar("movement_type", { length: 20 }),
    quantity: decimal("quantity", { precision: 14, scale: 3 }),
    unitCost: decimal("unit_cost", { precision: 14, scale: 2 }),
    time: datetime("time"),
    createdBy: varchar("created_by", { length: 20 }),
    note: varchar("note", { length: 255 }),
    seq: bigint("seq", { mode: "number" }),
  },
  (table) => [
    index("idx_rep_stock").on(table.branchId, table.productId, table.time),
    index("idx_rep_order_item").on(table.orderRepId),
    index("idx_rep_type").on(table.movementType),
  ]
);

/**
 * `devices.direction` — which way a scan at this terminal counts. A gym with one
 * door runs `both` and lets the server decide by toggling the open shift; a gym
 * with a separate entry and exit reader pins each one, which is the only way to
 * get honest hours when somebody scans twice on the way in.
 */
export const DEVICE_DIRECTIONS = ["in", "out", "both"] as const;

/**
 * A face/card terminal. `port`, `username`, `password_enc`, `webhook_key` and
 * `direction` were added to the live table for the Hikvision integration; the
 * rest is as `gyms.sql` shipped it.
 *
 * **`password_enc` is AES-256-GCM ciphertext, never a plaintext password** — see
 * lib/secret.ts. It is the terminal's admin credential: whoever holds it can
 * open the door, so it must not survive a database dump on its own.
 */
export const devices = mysqlTable(
  "devices",
  {
    deviceId: varchar("device_id", { length: 64 }).primaryKey(),
    gymId: varchar("gym_id", { length: 20 }),
    branchId: varchar("branch_id", { length: 20 }),
    deviceName: varchar("device_name", { length: 100 }),
    /** `face` for a MinMoe terminal; the column predates us being specific. */
    deviceType: varchar("device_type", { length: 16 }),
    ipAddress: varchar("ip_address", { length: 45 }),
    location: varchar("location", { length: 100 }),
    /** Stamped by the probe and by every event the device pushes. */
    lastSeen: datetime("last_seen"),
    isActive: boolean("is_active"),
    createdAt: datetime("created_at"),
    port: int("port"),
    username: varchar("username", { length: 64 }),
    passwordEnc: varchar("password_enc", { length: 255 }),
    /**
     * The device cannot send a service token, so its push URL carries this
     * instead: `/attendance/hik/<webhook_key>`. It identifies *and* authenticates
     * the terminal, which is why it is minted server-side and never returned in
     * a list response.
     */
    webhookKey: varchar("webhook_key", { length: 32 }),
    direction: varchar("direction", { length: 4 }),
  },
  (table) => [index("idx_devices_branch").on(table.branchId)]
);

/**
 * What a person presents at a terminal, and who it belongs to. The face itself
 * never leaves the device — this row stores the `employeeNo` the terminal knows
 * them by, which is what arrives on every event and the only way to turn a scan
 * into a member or a member of staff.
 */
export const credentials = mysqlTable(
  "credentials",
  {
    credentialId: varchar("credential_id", { length: 20 }).primaryKey(),
    gymId: varchar("gym_id", { length: 20 }),
    /** `worker` or `member` — the two id spaces `person_type` distinguishes. */
    ownerType: varchar("owner_type", { length: 10 }),
    ownerId: varchar("owner_id", { length: 20 }),
    /** `face`, `card`, `pin`. */
    credentialType: varchar("credential_type", { length: 16 }),
    /** The `employeeNo` the terminal knows them by, or the card number. */
    credentialValue: varchar("credential_value", { length: 255 }),
    deviceId: varchar("device_id", { length: 64 }),
    isPrimary: boolean("is_primary"),
    isActive: boolean("is_active"),
    issuedAt: datetime("issued_at"),
    revokedAt: datetime("revoked_at"),
    revokedReason: varchar("revoked_reason", { length: 120 }),
    createdBy: varchar("created_by", { length: 20 }),
  },
  (table) => [
    index("idx_cred_gym").on(table.gymId),
    index("idx_cred_active").on(table.isActive),
    index("idx_cred_lookup").on(
      table.gymId,
      table.credentialType,
      table.credentialValue
    ),
    index("idx_cred_owner").on(table.ownerType, table.ownerId),
  ]
);

/**
 * Who stock is bought from. `supplier` (not `name`) is the column that holds the
 * trading name — the table is transcribed as it is live, not as it would be
 * designed. `supplier_type` distinguishes a company from an individual, which is
 * why `passport` exists beside `phone`.
 */
export const suppliers = mysqlTable(
  "suppliers",
  {
    supplierId: varchar("supplier_id", { length: 16 }).primaryKey(),
    gymId: varchar("gym_id", { length: 20 }),
    supplier: varchar("supplier", { length: 255 }),
    phone: varchar("phone", { length: 50 }),
    description: text("description"),
    supplierType: varchar("supplier_type", { length: 32 }),
    passport: varchar("passport", { length: 32 }),
  },
  (table) => [index("idx_suppliers_gym").on(table.gymId)]
);

/**
 * `storage_actions_main.action_type` is a free-form varchar(32), so the allowed
 * set is defined here. All four are one document with a different sign and
 * intent, which is why they share a table rather than getting one each:
 *
 * | type       | Uzbek           | stock | money                          |
 * |------------|-----------------|-------|--------------------------------|
 * | `in`       | Kirim           | +     | owed to a supplier             |
 * | `writeoff` | Yaroqsiz        | −     | none — the loss is the cost    |
 * | `return`   | Qaytarish       | −     | reduces what is owed           |
 * | `stocktake`| Inventarizatsiya| ±     | none — it corrects to a count  |
 */
export const STOCK_ACTION_TYPES = [
  "in",
  "writeoff",
  "return",
  "stocktake",
] as const;

/**
 * The header for a deliberate stock document — a delivery, a write-off, a
 * return, a stocktake. A sale writes no row here: it is driven by an order and
 * only lands in `storage_actions_rep`. `total_price` is what the document is
 * worth to the supplier, and `is_deleted` voids it without erasing the ledger.
 */
export const storageActionsMain = mysqlTable(
  "storage_actions_main",
  {
    actionId: varchar("action_id", { length: 64 }).primaryKey(),
    gymId: varchar("gym_id", { length: 20 }),
    branchId: varchar("branch_id", { length: 20 }),
    actionType: varchar("action_type", { length: 32 }),
    supplierId: varchar("supplier_id", { length: 64 }),
    time: datetime("time"),
    totalPrice: decimal("total_price", { precision: 14, scale: 2 }),
    description: varchar("description", { length: 64 }),
    responsible: varchar("responsible", { length: 64 }),
    isDeleted: boolean("is_deleted"),
  },
  (table) => [
    index("idx_storage_main_branch").on(table.branchId),
    index("idx_storage_main_supplier").on(table.supplierId),
  ]
);

/**
 * Money out. The mirror of `income`, and the only place a supplier payment is
 * recorded: `action_id` ties a payment to the delivery it settles, which is what
 * makes "how much do we still owe on this delivery?" answerable without storing
 * a balance anywhere. `voided_at` rather than deletion, so every total must
 * exclude voided rows — the same rule `income` follows.
 */
export const expenses = mysqlTable(
  "expenses",
  {
    /** Autoincrement, like `income` — this id is the database's, not ours. */
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    gymId: varchar("gym_id", { length: 20 }),
    branchId: varchar("branch_id", { length: 20 }),
    category: varchar("category", { length: 16 }).notNull(),
    actionId: varchar("action_id", { length: 64 }),
    supplierId: varchar("supplier_id", { length: 16 }),
    workerId: varchar("worker_id", { length: 20 }),
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
    method: varchar("method", { length: 16 }).notNull(),
    paidAt: datetime("paid_at").notNull(),
    voidedAt: datetime("voided_at"),
    voidedBy: varchar("voided_by", { length: 20 }),
    createdBy: varchar("created_by", { length: 20 }).notNull(),
    note: varchar("note", { length: 255 }),
  },
  (table) => [
    index("idx_expenses_action").on(table.actionId),
    index("idx_expenses_category").on(table.category),
    index("idx_expenses_paid_at").on(table.branchId, table.paidAt),
    index("idx_expenses_worker").on(table.workerId),
  ]
);

export type Gym = typeof gyms.$inferSelect;
export type NewGym = typeof gyms.$inferInsert;
export type Branch = typeof branches.$inferSelect;
export type NewBranch = typeof branches.$inferInsert;
export type Worker = typeof workers.$inferSelect;
export type NewWorker = typeof workers.$inferInsert;
export type AttendanceSession = typeof attendanceSessions.$inferSelect;
export type NewAttendanceSession = typeof attendanceSessions.$inferInsert;
export type AttendanceEvent = typeof attendanceEvents.$inferSelect;
export type NewAttendanceEvent = typeof attendanceEvents.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Combo = typeof combos.$inferSelect;
export type NewCombo = typeof combos.$inferInsert;
export type ComboComponent = typeof comboComponents.$inferSelect;
export type NewComboComponent = typeof comboComponents.$inferInsert;
export type Hall = typeof halls.$inferSelect;
export type NewHall = typeof halls.$inferInsert;
export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;
export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;
export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;
export type Income = typeof income.$inferSelect;
export type NewIncome = typeof income.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;
export type OrderItemAdjustment = typeof orderItemAdjustments.$inferSelect;
export type NewOrderItemAdjustment = typeof orderItemAdjustments.$inferInsert;
export type StorageActionRep = typeof storageActionsRep.$inferSelect;
export type NewStorageActionRep = typeof storageActionsRep.$inferInsert;
export type Device = typeof devices.$inferSelect;
export type NewDevice = typeof devices.$inferInsert;
export type Credential = typeof credentials.$inferSelect;
export type NewCredential = typeof credentials.$inferInsert;
export type Supplier = typeof suppliers.$inferSelect;
export type NewSupplier = typeof suppliers.$inferInsert;
export type StorageActionMain = typeof storageActionsMain.$inferSelect;
export type NewStorageActionMain = typeof storageActionsMain.$inferInsert;
export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;
