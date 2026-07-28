/**
 * One-off: hand a short human-facing code (A00, A01 … Z99) to every existing
 * member that has none, per gym, continuing from the highest code already in
 * use so it never collides with a legacy card number or a code the app has
 * since minted. Ordered by join date so codes track the order members arrived.
 *
 * Dry run by default — prints the full assignment and writes nothing. Re-run
 * with `--commit` to apply it:
 *
 *   pnpm --filter backend exec tsx scripts/backfill-member-codes.ts
 *   pnpm --filter backend exec tsx scripts/backfill-member-codes.ts --commit
 *
 * Targets only members whose code is NULL or empty; anyone with an existing
 * code (of any shape) is left untouched.
 */
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "../src/db/index.js";
import { members } from "../src/db/schema.js";

const MEMBER_CODE_REGEXP = "^[A-Z][0-9][0-9]$";

/** The code that follows `current`, or null once A00…Z99 is spent. */
const codeAfter = (current: string | null): string | null => {
  if (!current) {
    return "A00";
  }

  const digits = Number(current.slice(1));

  if (digits < 99) {
    return current[0] + String(digits + 1).padStart(2, "0");
  }

  const letter = current.charCodeAt(0);

  if (letter >= "Z".charCodeAt(0)) {
    return null;
  }

  return String.fromCharCode(letter + 1) + "00";
};

const commit = process.argv.includes("--commit");

const main = async (): Promise<void> => {
  const gymRows = await db.selectDistinct({ gymId: members.gymId }).from(members);

  let planned = 0;
  let exhausted = 0;

  for (const { gymId } of gymRows) {
    if (!gymId) {
      continue;
    }

    const [maxRow] = await db
      .select({ max: sql<string | null>`MAX(${members.uniqueId})` })
      .from(members)
      .where(
        and(
          eq(members.gymId, gymId),
          sql`${members.uniqueId} REGEXP ${MEMBER_CODE_REGEXP}`
        )
      );

    let cursor = maxRow?.max ?? null;

    const targets = await db
      .select({ id: members.memberId, name: members.fullname })
      .from(members)
      .where(
        and(
          eq(members.gymId, gymId),
          or(isNull(members.uniqueId), eq(members.uniqueId, ""))
        )
      )
      .orderBy(asc(members.joinedAt));

    for (const target of targets) {
      const code = codeAfter(cursor);

      if (!code) {
        exhausted += 1;
        continue;
      }

      cursor = code;
      planned += 1;
      // eslint-disable-next-line no-console
      console.log(`${gymId}  ${code}  ${target.name ?? ""}`);

      if (commit) {
        await db
          .update(members)
          .set({ uniqueId: code })
          .where(
            and(eq(members.gymId, gymId), eq(members.memberId, target.id))
          );
      }
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `\n${commit ? "APPLIED" : "DRY RUN — would assign"} ${planned} code(s); ${exhausted} left codeless (A00…Z99 exhausted).`
  );

  process.exit(0);
};

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
