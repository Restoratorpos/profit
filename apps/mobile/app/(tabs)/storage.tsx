import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { inventoryQuery } from "@/api/queries";
import { ScreenHeader, TAB_BAR_CLEARANCE } from "@/components/screen";
import {
  Badge,
  type BadgeTone,
  Caption,
  Card,
  type ChipOption,
  ChipRow,
  Empty,
  ErrorState,
  ListRow,
  SearchField,
  Spinner,
} from "@/components/ui";
import { formatCompact, formatQuantity } from "@/lib/format";
import { useMessages } from "@/locale-context";
import { font, radius, space } from "@/theme";
import { useTheme } from "@/theme-context";
import {
  countByStatus,
  type InventoryItem,
  type StockFilter,
  type StockStatus,
} from "@/types";

/**
 * What is on the shelf, and how much of it is left.
 *
 * **Read-only, deliberately.** The backend has the four stock documents behind
 * `/inventory/actions` and `/inventory/stocktakes`, and a stocktake in
 * particular would be better on a phone than at the desk — you are standing at
 * the shelf. That is a separate piece of work with its own confirmation flow;
 * this screen is the report it will hang off.
 *
 * `/inventory` is not paged, so the whole shelf arrives in one call. That is
 * what lets the four tiles count from the same array the list renders, rather
 * than asking the backend for a tally this route does not offer.
 */
export default function Storage() {
  const theme = useTheme();
  const messages = useMessages();

  const [filter, setFilter] = useState<StockFilter>("total");
  const [search, setSearch] = useState("");

  const inventory = useQuery(inventoryQuery());

  const counts = useMemo(
    () => countByStatus(inventory.data ?? []),
    [inventory.data]
  );

  /*
   * Filtering happens here rather than server-side because the whole list is
   * already in memory — a round trip to narrow an array we hold would be slower
   * than the array scan, and it would spin the list on every keystroke.
   */
  const rows = useMemo(() => {
    const items = inventory.data ?? [];
    const term = search.trim().toLowerCase();
    const matched: InventoryItem[] = [];

    for (const item of items) {
      if (filter !== "total" && item.status !== filter) {
        continue;
      }

      if (term.length > 0 && !item.name.toLowerCase().includes(term)) {
        continue;
      }

      matched.push(item);
    }

    return matched;
  }, [filter, inventory.data, search]);

  const options: ChipOption<StockFilter>[] = [
    { count: counts.total, label: messages["storage.total"], value: "total" },
    { count: counts.in, label: messages["storage.in"], value: "in" },
    { count: counts.low, label: messages["storage.low"], value: "low" },
    { count: counts.out, label: messages["storage.out"], value: "out" },
  ];

  if (inventory.isError) {
    return (
      <View style={{ backgroundColor: theme.background, flex: 1 }}>
        <ScreenHeader title={messages["storage.title"]} />
        <ErrorState onRetry={() => inventory.refetch()} />
      </View>
    );
  }

  /** What is still owed on the deliveries that brought this stock in. */
  const supplierDebt = (inventory.data ?? []).reduce(
    (sum, item) => sum + Number(item.supplierDebt),
    0
  );

  return (
    <View style={{ backgroundColor: theme.background, flex: 1 }}>
      <ScreenHeader
        subtitle={messages["storage.readOnly"]}
        title={messages["storage.title"]}
      />

      {/* --------------------------------------------------------- top boxes */}
      <View
        style={{
          flexDirection: "row",
          gap: space.sm,
          paddingBottom: space.md,
          paddingHorizontal: space.lg,
        }}
      >
        <StockBox
          caption={messages["storage.low"]}
          tone={theme.warning}
          value={`${counts.low}`}
        />
        <StockBox
          caption={messages["storage.out"]}
          tone={theme.destructive}
          value={`${counts.out}`}
        />
        <StockBox
          caption={messages["home.supplierDebt"]}
          tone={supplierDebt > 0 ? theme.foreground : theme.mutedForeground}
          value={formatCompact(supplierDebt)}
        />
      </View>

      <View style={{ gap: space.md, paddingBottom: space.md }}>
        <SearchField
          onChange={setSearch}
          placeholder={messages["storage.search"]}
          value={search}
        />
        <ChipRow onChange={setFilter} options={options} value={filter} />
      </View>

      {inventory.isPending ? (
        <Spinner />
      ) : (
        <FlatList
          contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE }}
          data={rows}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<Empty />}
          refreshControl={
            <RefreshControl
              onRefresh={() => inventory.refetch()}
              refreshing={inventory.isRefetching}
              tintColor={theme.mutedForeground}
            />
          }
          renderItem={({ item }) => <StockRow item={item} />}
        />
      )}
    </View>
  );
}

const StockBox = ({
  caption,
  tone,
  value,
}: {
  caption: string;
  tone: string;
  value: string;
}) => (
  <Card style={{ flex: 1, padding: space.md }}>
    <Text
      style={{
        color: tone,
        fontSize: font.title,
        fontWeight: "700",
        marginBottom: space.xs,
      }}
    >
      {value}
    </Text>
    <Caption>{caption}</Caption>
  </Card>
);

/** How each shelf state reads. Mirrors `stockStatusOf` on the backend. */
const STOCK_TONE: Record<StockStatus, BadgeTone> = {
  in: "good",
  low: "warn",
  out: "bad",
};

const StockRow = ({ item }: { item: InventoryItem }) => {
  const theme = useTheme();
  const messages = useMessages();

  const stock = Number(item.stock);
  const tone = STOCK_TONE[item.status];
  const iconColor = {
    in: theme.mutedForeground,
    low: theme.warning,
    out: theme.destructive,
  }[item.status];

  return (
    <ListRow
      leading={
        <View
          style={{
            alignItems: "center",
            backgroundColor: theme.raised,
            borderRadius: radius.sm,
            height: 38,
            justifyContent: "center",
            width: 38,
          }}
        >
          <Feather color={iconColor} name="package" size={17} />
        </View>
      }
      subtitle={
        item.price === null
          ? (item.unit ?? undefined)
          : `${formatCompact(item.price)} ${messages["common.currency"]}`
      }
      title={item.name}
      trailing={
        <Badge
          /*
           * Stock is signed: a negative means more went out than was ever
           * booked in. Showing it as-is rather than clamping to zero is what
           * makes that visible instead of hiding a bookkeeping error.
           */
          label={`${formatQuantity(stock)}${item.unit ? ` ${item.unit}` : ""}`}
          tone={tone}
        />
      }
      trailingCaption={messages["storage.left"]}
    />
  );
};
