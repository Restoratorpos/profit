-- Discounts: what a sale was reduced by, kept as its own figure.
--
-- Hand-written and applied out-of-band, following the same route the `devices`
-- columns took on 2026-07-26 and for the same reason: `drizzle/`'s journal is
-- empty, so `db:generate` emits a create-everything baseline rather than an
-- ALTER, and `db:push` would propose dropping `membership_freezes`. See
-- ../README.md.
--
-- Both columns are NULL-able with no default, so every existing row keeps
-- meaning exactly what it means today: no discount was given. Nothing reads
-- these columns until the code that writes them ships, which makes this safe to
-- apply ahead of a deploy.
--
-- Reversing it is `ALTER TABLE ... DROP COLUMN discount` on each table, which
-- loses only the discounts recorded after this ran.

ALTER TABLE `orders`
  ADD COLUMN `discount` DECIMAL(10, 2) NULL AFTER `total_price`;

ALTER TABLE `memberships`
  ADD COLUMN `discount` DECIMAL(14, 2) NULL AFTER `price`;
