/**
 * The classes that mark a control as chosen.
 *
 * There is one of these, and the point of naming it here is that every
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
 * Restating the colours is what stops the variant's hover from winning.
 *
 * ## Why the dark colours are restated too
 *
 * The same trap, one level deeper. `outline` also carries `dark:bg-input/30`,
 * `dark:border-input` and `dark:hover:bg-input/50`; `ghost` carries
 * `dark:hover:bg-accent/50`. The `dark` variant compiles to `&:is(.dark *, …)`,
 * and `:is()` contributes the specificity of its heaviest argument — so a
 * `dark:`-prefixed utility outweighs a plain one instead of merely coming
 * later. An unprefixed `bg-primary/10` loses to `dark:bg-input/30` outright and
 * the selection has no fill at all in dark mode. `cn()` does not save us: it
 * merges within a variant, so it never sees the two as the same declaration.
 *
 * Every colour therefore ships twice, plain and `dark:`.
 */

/**
 * A green tint, a green edge and a green label — the chosen option reads as
 * chosen without being repainted in solid neon. This is the only selected
 * style; a control that needs to look picked uses it whether it sits in a
 * two-button segmented control or a list of twelve.
 *
 * The opacities are what keep it soft. `bg-primary/10` is a wash rather than a
 * fill, so a panel of these does not flood with green, and the label stays
 * `--primary-accent` — the darkened green that clears 4.5:1 on the page
 * background, which the neon does not.
 */
export const SELECTED_TINT =
  "border-primary/50 bg-primary/10 font-semibold text-primary-accent ring-1 ring-primary/30 ring-inset hover:border-primary/50 hover:bg-primary/15 hover:text-primary-accent dark:border-primary/50 dark:bg-primary/10 dark:hover:border-primary/50 dark:hover:bg-primary/15 [&_svg]:text-primary-accent";
