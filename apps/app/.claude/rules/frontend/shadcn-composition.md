---
paths:
  - "apps/app/app/(authenticated)/**"
  - "apps/app/app/(unauthenticated)/**"
  - "packages/auth/components/**"
  - "**/*.tsx"
---
# shadcn/ui Composition Rules

Rules for correctly composing shadcn/ui components from `@repo/design-system/components/ui/`. These prevent common mistakes that break accessibility, styling, or functionality.

---

## Items always inside their Group

Never render items directly inside a content container — always wrap in the Group component.

**Incorrect:**

```tsx
<SelectContent>
  <SelectItem value="apple">Apple</SelectItem>
</SelectContent>
```

**Correct:**

```tsx
<SelectContent>
  <SelectGroup>
    <SelectItem value="apple">Apple</SelectItem>
  </SelectGroup>
</SelectContent>
```

| Item | Group |
|------|-------|
| `SelectItem`, `SelectLabel` | `SelectGroup` |
| `DropdownMenuItem`, `DropdownMenuLabel`, `DropdownMenuSub` | `DropdownMenuGroup` |
| `ContextMenuItem` | `ContextMenuGroup` |
| `CommandItem` | `CommandGroup` |

---

## Dialog, Sheet, and Drawer always need a Title

`DialogTitle`, `SheetTitle`, `DrawerTitle` are required for accessibility. Use `className="sr-only"` if visually hidden.

```tsx
<DialogContent>
  <DialogHeader>
    <DialogTitle>Edit Profile</DialogTitle>
    <DialogDescription>Update your profile.</DialogDescription>
  </DialogHeader>
  ...
</DialogContent>
```

---

## InputGroup requires InputGroupInput / InputGroupTextarea

Never use raw `Input` or `Textarea` inside an `InputGroup`.

**Incorrect:**

```tsx
<InputGroup>
  <Input placeholder="Search..." />
</InputGroup>
```

**Correct:**

```tsx
import { InputGroup, InputGroupInput } from "@repo/design-system/components/ui/input-group"

<InputGroup>
  <InputGroupInput placeholder="Search..." />
</InputGroup>
```

---

## Buttons inside inputs use InputGroup + InputGroupAddon

Never position a Button absolutely over an Input.

**Incorrect:**

```tsx
<div className="relative">
  <Input placeholder="Search..." className="pr-10" />
  <Button className="absolute right-0 top-0" size="icon">
    <SearchIcon />
  </Button>
</div>
```

**Correct:**

```tsx
import { InputGroup, InputGroupInput, InputGroupAddon } from "@repo/design-system/components/ui/input-group"

<InputGroup>
  <InputGroupInput placeholder="Search..." />
  <InputGroupAddon>
    <Button size="icon"><SearchIcon /></Button>
  </InputGroupAddon>
</InputGroup>
```

---

## Use `asChild` for custom triggers

Radix components use `asChild` to replace the default rendered element. Don't wrap triggers in extra elements.

**Incorrect:**

```tsx
<DialogTrigger>
  <div><Button>Open</Button></div>
</DialogTrigger>
```

**Correct:**

```tsx
<DialogTrigger asChild>
  <Button>Open</Button>
</DialogTrigger>
```

Applies to: `DialogTrigger`, `SheetTrigger`, `AlertDialogTrigger`, `DropdownMenuTrigger`, `PopoverTrigger`, `TooltipTrigger`, `CollapsibleTrigger`, `DialogClose`, `SheetClose`.

---

## Button has no isPending / isLoading prop

Compose loading state manually with disabled + inline spinner:

```tsx
<Button disabled>
  <Loader2 className="animate-spin" />
  Saving...
</Button>
```

---

## TabsTrigger must be inside TabsList

Never render `TabsTrigger` directly inside `Tabs`.

```tsx
<Tabs defaultValue="account">
  <TabsList>
    <TabsTrigger value="account">Account</TabsTrigger>
    <TabsTrigger value="password">Password</TabsTrigger>
  </TabsList>
  <TabsContent value="account">...</TabsContent>
</Tabs>
```

---

## Avatar always needs AvatarFallback

For when the image fails to load:

```tsx
<Avatar>
  <AvatarImage src="/avatar.png" alt="User" />
  <AvatarFallback>JD</AvatarFallback>
</Avatar>
```

---

## Use existing components instead of custom markup

| Instead of | Use |
|---|---|
| `<hr>` or `<div className="border-t">` | `<Separator />` |
| `<div className="animate-pulse">` styled divs | `<Skeleton className="h-4 w-3/4" />` |
| `<span className="rounded-full bg-green-100 ...">` | `<Badge variant="secondary">` |
| Custom styled callout div | `<Alert>` with `AlertTitle` / `AlertDescription` |
| Custom empty state markup | the `Empty` suite from `@repo/design-system/components/ui/empty` |
| `toast()` from random lib | `toast()` from `@repo/design-system/components/ui/sonner` |

---

## No manual z-index on overlay components

`Dialog`, `Sheet`, `Drawer`, `AlertDialog`, `DropdownMenu`, `Popover`, `Tooltip`, `HoverCard` handle their own stacking context. Never add `z-50` or `z-[999]`.

---

## Full Card composition

Use the full composition — don't dump everything into `CardContent`:

```tsx
<Card>
  <CardHeader>
    <CardTitle>Team Members</CardTitle>
    <CardDescription>Manage your team.</CardDescription>
  </CardHeader>
  <CardContent>...</CardContent>
  <CardFooter>
    <Button>Invite</Button>
  </CardFooter>
</Card>
```

---

## className for layout, not styling

Use `className` for layout (`max-w-md`, `mx-auto`, `mt-4`), not for overriding component colors or typography. To change appearance, use:

1. **Built-in variants** — `variant="outline"`, `size="sm"`
2. **Semantic color tokens** — `bg-primary`, `text-muted-foreground`
3. **CSS variables** — define in `packages/design-system/styles/globals.css`
