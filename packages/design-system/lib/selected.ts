/**
 * The classes that mark a control as chosen.
 *
 * There is one pairing for this in the theme — `--selected` and
 * `--selected-foreground` — and the point of naming it here is that every
 * segmented control, option card and nav item reaches for the same one. Seven
 * call sites had each written their own variation, and they had drifted.
 *
 * ## Why hover has to be restated
 *
 * `Button`'s `outline` variant carries `hover:bg-accent
 * hover:text-accent-foreground`. Those are grey — near-white text in dark mode.
 * Applied on top of a selected option they repaint it on hover, so the chosen
 * card turns grey-and-white under the cursor and green again when it leaves.
 * That reads as "you are about to deselect this", which is not what happens.
 *
 * A selected thing has nowhere further to go, so its hover state is itself.
 * Restating the colours at the same specificity is what stops the variant's
 * hover from winning.
 */

/**
 * A solid fill. For the chosen option in a segmented control, where the choice
 * is the whole point of the control and should be readable across the room.
 */
export const SELECTED_FILL =
  "border-selected bg-selected font-semibold text-selected-foreground hover:bg-selected hover:text-selected-foreground [&_svg]:text-selected-foreground";

/**
 * A tint plus a ring. For options that sit in a list of many, where filling
 * every chosen one would flood the panel with green — a plan card, a colour
 * swatch, a row that happens to be current.
 */
export const SELECTED_TINT =
  "border-primary bg-primary/10 font-semibold text-primary-accent ring-2 ring-primary hover:bg-primary/15 hover:text-primary-accent";
