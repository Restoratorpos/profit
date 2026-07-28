"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@repo/design-system/components/ui/field";
import { Input } from "@repo/design-system/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/design-system/components/ui/sheet";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import {
  CheckIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import { type CategoryListItem, DEFAULT_PRODUCT_COLOR } from "@/lib/catalog";
import type { Messages } from "@/lib/i18n/dictionary";
import {
  createCategoryAction,
  deleteCategoryAction,
  updateCategoryAction,
} from "../actions";
import { ColorPicker } from "./color-picker";

interface CategoriesSheetProperties {
  categories: readonly CategoryListItem[];
  messages: Messages;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export const CategoriesSheet = ({
  categories,
  messages,
  onOpenChange,
  open,
}: CategoriesSheetProperties) => {
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string | null>(DEFAULT_PRODUCT_COLOR);
  const [busyId, setBusyId] = useState<string | null>(null);

  /** Id of the row being renamed, plus its working value. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (name.trim().length === 0) {
      return;
    }

    setIsPending(true);
    setError(null);

    const result = await createCategoryAction(name.trim(), color);

    setIsPending(false);

    if (result.ok) {
      // The list comes from the server; clearing the field is all this owns.
      setName("");
      setColor(DEFAULT_PRODUCT_COLOR);
      return;
    }

    setError(result.error ?? "Something went wrong.");
  };

  const startEdit = (category: CategoryListItem) => {
    setEditingId(category.id);
    setDraft(category.name);
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft("");
  };

  const handleRename = async (categoryId: string) => {
    const next = draft.trim();

    if (next.length === 0) {
      return;
    }

    setBusyId(categoryId);
    setError(null);

    const result = await updateCategoryAction(categoryId, next);

    setBusyId(null);

    if (result.ok) {
      cancelEdit();
      return;
    }

    setError(result.error ?? "Something went wrong.");
  };

  const handleDelete = async (categoryId: string) => {
    setBusyId(categoryId);
    setError(null);

    const result = await deleteCategoryAction(categoryId);

    setBusyId(null);

    if (!result.ok) {
      setError(result.error ?? "Something went wrong.");
    }
  };

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      {/* Side panels open from the right everywhere in this app. */}
      <SheetContent className="w-full sm:max-w-sm" side="right">
        <SheetHeader>
          <SheetTitle>{messages["categories.title"]}</SheetTitle>
          <SheetDescription className="sr-only">
            {messages["categories.title"]}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4">
          <form onSubmit={handleCreate}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="category-name">
                  {messages["categories.name"]}
                </FieldLabel>
                <div className="flex gap-2">
                  <Input
                    disabled={isPending}
                    id="category-name"
                    onChange={(event) => setName(event.target.value)}
                    value={name}
                  />
                  <Button
                    aria-label={messages["categories.add"]}
                    disabled={isPending || name.trim().length === 0}
                    size="icon"
                    type="submit"
                  >
                    {isPending ? <Spinner /> : <PlusIcon className="size-4" />}
                  </Button>
                </div>
              </Field>
              <Field>
                <FieldLabel>{messages["products.fieldColor"]}</FieldLabel>
                <ColorPicker
                  disabled={isPending}
                  label={messages["products.fieldColor"]}
                  noneLabel={messages["common.none"]}
                  onChange={setColor}
                  value={color}
                />
              </Field>
              {error ? <FieldError role="alert">{error}</FieldError> : null}
            </FieldGroup>
          </form>

          {categories.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground text-sm">
              {messages["categories.empty"]}
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {categories.map((category) => {
                const isEditing = editingId === category.id;
                const isBusy = busyId === category.id;

                return (
                  <li
                    className="flex items-center gap-2 px-3 py-2"
                    key={category.id}
                  >
                    {isEditing ? (
                      <>
                        <Input
                          aria-label={messages["categories.name"]}
                          autoFocus
                          className="h-8 flex-1"
                          disabled={isBusy}
                          onChange={(event) => setDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              handleRename(category.id);
                            }

                            if (event.key === "Escape") {
                              cancelEdit();
                            }
                          }}
                          value={draft}
                        />
                        <Button
                          aria-label={messages["common.save"]}
                          className="size-7 text-primary-accent"
                          disabled={isBusy || draft.trim().length === 0}
                          onClick={() => handleRename(category.id)}
                          size="icon"
                          variant="ghost"
                        >
                          {isBusy ? (
                            <Spinner />
                          ) : (
                            <CheckIcon className="size-4" />
                          )}
                        </Button>
                        <Button
                          aria-label={messages["common.cancel"]}
                          className="size-7 text-muted-foreground"
                          disabled={isBusy}
                          onClick={cancelEdit}
                          size="icon"
                          variant="ghost"
                        >
                          <XIcon className="size-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <span
                          aria-hidden="true"
                          className="size-3 shrink-0 rounded-full border"
                          style={{
                            backgroundColor: category.color ?? "transparent",
                          }}
                        />
                        <span className="flex-1 truncate text-sm">
                          {category.name}
                        </span>
                        <Button
                          aria-label={messages["common.edit"]}
                          className="size-7 text-muted-foreground"
                          disabled={isBusy}
                          onClick={() => startEdit(category)}
                          size="icon"
                          variant="ghost"
                        >
                          <PencilIcon className="size-4" />
                        </Button>
                        <Button
                          aria-label={messages["common.delete"]}
                          className="size-7 text-muted-foreground hover:text-destructive"
                          disabled={isBusy}
                          onClick={() => handleDelete(category.id)}
                          size="icon"
                          variant="ghost"
                        >
                          {isBusy ? (
                            <Spinner />
                          ) : (
                            <Trash2Icon className="size-4" />
                          )}
                        </Button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
