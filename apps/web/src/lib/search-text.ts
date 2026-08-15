import { z } from "zod";

/**
 * A free-text search term carried in the URL.
 *
 * The router's default serializer JSON-encodes search values, so a term that is
 * all digits round-trips as `q="998901234567"` — quotes and all. That is fine
 * coming back out of a link the app wrote. It is not fine when somebody retypes
 * or trims the address: without the quotes the parser hands zod the *number*
 * `998901234567`, a plain `z.string()` rejects it, and the screen opens
 * unfiltered with nothing on it to say why. A phone number is exactly the term
 * the dashboard hands the roster, so this is the common case, not the odd one.
 *
 * Hence: accept a number and read it as its digits.
 *
 * Optional and `.catch`ed as well, so a bare `/members` is still the plain
 * screen, and nothing anyone types in here turns a shared link into an error.
 */
export const searchText = z
  .union([z.string(), z.number()])
  .transform(String)
  .optional()
  .catch(undefined);
