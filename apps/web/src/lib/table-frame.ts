/**
 * The frame around a table block — the rows plus whatever bar sits under them.
 *
 * A table is the page, not a card on it: it runs the full width of the content
 * area and is fenced only by the two horizontal rules that separate it from the
 * toolbar above and whatever follows. No corners, and no vertical rules — a
 * side border a pixel from the window edge reads as a rendering artefact rather
 * than as an edge, and rounded corners on a table that already spans the
 * viewport only shave the first and last cell.
 *
 * The negative margin cancels the page padding every view carries, so the block
 * reaches the edge while the toolbar, the stats caption and the empty states
 * stay inset. Keep it in step with that padding: views use `p-4 sm:p-6`.
 */
export const TABLE_FRAME = "-mx-4 border-y sm:-mx-6";

/**
 * The same frame inside a Sheet, whose body padding is a flat `p-4` at every
 * width — pulling `sm:-mx-6` there would overhang the panel by 8px.
 */
export const SHEET_TABLE_FRAME = "-mx-4 border-y";
