/**
 * A person's own code (`A06`), as its own column.
 *
 * It is the one thing on a row that *is* them rather than a description of
 * them, and it is what the desk says out loud — so it gets a column of its own
 * rather than riding along inside the name. The chip is what keeps it reading
 * as a label instead of as more data in the row.
 */
export const IdCode = ({ code }: { code: string | null }) => {
  if (!code) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <span className="inline-flex h-9 min-w-11 items-center justify-center rounded-lg bg-muted px-2.5 font-medium font-mono text-sm tracking-wide">
      {code}
    </span>
  );
};
