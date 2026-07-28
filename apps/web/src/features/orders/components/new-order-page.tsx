import { Spinner } from "@repo/design-system/components/ui/spinner";
import { useQuery } from "@tanstack/react-query";
import { membersPageQuery } from "@/features/members";
import { DEFAULT_MEMBER_QUERY } from "@/features/members/types";
import { useCombos, useProducts } from "@/features/products/api";
import { useLocale } from "@/lib/i18n/provider";
import { type OrderCustomer, toPosProducts } from "../types";
import { OrderComposer } from "./order-composer";

/**
 * What `app/(authenticated)/orders/new/page.tsx` was — the POS.
 *
 * The customer list is read through the members feature's paged query rather
 * than the unpaged `/members` the server component used. That endpoint returns
 * the whole roster, which on a real gym is thousands of rows shipped to fill a
 * picker; the paged query is already cached by the members screen, so on a desk
 * that has been used at all today this costs nothing.
 */
export const NewOrderPage = () => {
  const { messages } = useLocale();
  const products = useProducts();
  const combos = useCombos();
  const members = useQuery(membersPageQuery(DEFAULT_MEMBER_QUERY));

  const failure = products.error ?? combos.error ?? members.error;

  if (failure) {
    return (
      <p
        className="m-6 rounded-lg border-2 border-destructive/50 bg-destructive/10 px-4 py-3 font-medium text-destructive"
        role="alert"
      >
        {failure.message}
      </p>
    );
  }

  if (!(products.data && combos.data)) {
    return (
      <output
        aria-label={messages["nav.newOrder"]}
        className="flex flex-1 items-center justify-center py-20"
      >
        <Spinner className="size-8" />
      </output>
    );
  }

  const customers: OrderCustomer[] = (members.data?.rows ?? []).map(
    (member) => ({
      id: member.id,
      name: member.name,
      phone: member.phone,
    })
  );

  return (
    <OrderComposer
      customers={customers}
      messages={messages}
      products={toPosProducts(products.data, combos.data)}
    />
  );
};
