import { Input } from "@repo/design-system/components/ui/input";
import { useLayoutEffect, useRef, useState } from "react";
import { formatAmountInput, isAmountChar, toBareAmount } from "@/lib/money";

type InputProperties = React.ComponentProps<typeof Input>;

interface MoneyInputProperties
  extends Omit<InputProperties, "defaultValue" | "onChange" | "value"> {
  /** Bare digits. Omit to let the field hold its own state. */
  defaultValue?: string;
  /**
   * When set, a hidden input carries the bare value under this name, so a form
   * read through `FormData` still sees digits. The visible box deliberately
   * carries no name: it holds "500,000", and that is not a number.
   */
  name?: string;
  /** Called with bare digits — never the grouped string on screen. */
  onChange?: (value: string) => void;
  /** Bare digits. Provide with `onChange` to control the field. */
  value?: string;
}

/**
 * An amount box that groups digits as they are typed.
 *
 * "500000" is four glances to read and one to miscount; "500,000" is one. The
 * grouping is only ever paint — `onChange` hands back bare digits and the
 * hidden input submits them, so nothing downstream has to know this exists.
 *
 * ## Why the caret is put back by hand
 *
 * Reformatting on every keystroke rewrites the whole value, and the browser
 * answers that by parking the caret at the end. Typing at the end hides it, but
 * correcting a digit in the middle of "1,250,000" throws you to the end after
 * every key — the field becomes unusable for editing, which is most of what an
 * amount box is for. So the caret is remembered as a count of real characters
 * before it, which separators cannot shift, and restored once the new string is
 * on screen.
 */
export const MoneyInput = ({
  defaultValue,
  name,
  onChange,
  ref,
  value,
  ...rest
}: MoneyInputProperties) => {
  const [internal, setInternal] = useState(() =>
    toBareAmount(defaultValue ?? "")
  );

  // Controlled when the caller passes a value; otherwise the field holds it.
  const bare = value ?? internal;

  const inputRef = useRef<HTMLInputElement | null>(null);
  /** Real characters before the caret, pending restoration after the repaint. */
  const caretRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const target = caretRef.current;
    const input = inputRef.current;

    if (target === null || !input) {
      return;
    }

    caretRef.current = null;

    const display = input.value;
    let seen = 0;
    let index = 0;

    while (index < display.length && seen < target) {
      if (isAmountChar(display[index])) {
        seen += 1;
      }

      index += 1;
    }

    input.setSelectionRange(index, index);
  });

  const attachRef = (node: HTMLInputElement | null) => {
    inputRef.current = node;

    if (typeof ref === "function") {
      ref(node);
    } else if (ref) {
      ref.current = node;
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    const caret = event.target.selectionStart ?? raw.length;

    // Counted before stripping, so a deleted separator does not drag the caret
    // over the digit beside it.
    caretRef.current = toBareAmount(raw.slice(0, caret)).length;

    const next = toBareAmount(raw);

    setInternal(next);
    onChange?.(next);
  };

  return (
    <>
      {name ? <input name={name} type="hidden" value={bare} /> : null}
      <Input
        inputMode="decimal"
        {...rest}
        onChange={handleChange}
        ref={attachRef}
        value={formatAmountInput(bare)}
      />
    </>
  );
};
