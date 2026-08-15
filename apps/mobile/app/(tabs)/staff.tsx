import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { PAGE_SIZE, workersQuery } from "@/api/queries";
import { Pager, ScreenHeader, TAB_BAR_CLEARANCE } from "@/components/screen";
import {
  Avatar,
  Badge,
  type ChipOption,
  ChipRow,
  Empty,
  ErrorState,
  ListRow,
  SearchField,
  Spinner,
} from "@/components/ui";
import {
  formatMinutes,
  formatMoney,
  formatTime,
  initialsOf,
} from "@/lib/format";
import { useDebounced } from "@/lib/use-debounced";
import { useMessages } from "@/locale-context";
import { font, space } from "@/theme";
import { useTheme } from "@/theme-context";
import type { WorkerFilter, WorkerListItem } from "@/types";

/**
 * Staff, and whether they are on shift right now.
 *
 * `earned` is null for a monthly salary — the backend deliberately does not
 * guess what a month part-worked is worth — and `balance` is null whenever
 * `earned` is. A dash is the honest rendering; a zero would read as "paid up".
 */
export default function Staff() {
  const theme = useTheme();
  const messages = useMessages();

  const [status, setStatus] = useState<WorkerFilter>("active");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const query = useDebounced(search, 350);
  const workers = useQuery(workersQuery(status, query, page));
  const counts = workers.data?.counts;

  const options: ChipOption<WorkerFilter>[] = [
    {
      count: counts?.active,
      label: messages["staff.activeFilter"],
      value: "active",
    },
    {
      count: counts?.["on-shift"],
      label: messages["staff.onShift"],
      value: "on-shift",
    },
    {
      count: counts?.inactive,
      label: messages["staff.inactive"],
      value: "inactive",
    },
    { count: counts?.all, label: messages["staff.all"], value: "all" },
  ];

  const reset =
    <T,>(apply: (value: T) => void) =>
    (value: T) => {
      apply(value);
      setPage(1);
    };

  if (workers.isError) {
    return (
      <View style={{ backgroundColor: theme.background, flex: 1 }}>
        <ScreenHeader title={messages["staff.title"]} />
        <ErrorState onRetry={() => workers.refetch()} />
      </View>
    );
  }

  return (
    <View style={{ backgroundColor: theme.background, flex: 1 }}>
      <ScreenHeader
        subtitle={workers.data ? `${workers.data.total}` : undefined}
        title={messages["staff.title"]}
      />

      <View style={{ gap: space.md, paddingBottom: space.md }}>
        <SearchField
          onChange={reset(setSearch)}
          placeholder={messages["staff.search"]}
          value={search}
        />
        <ChipRow onChange={reset(setStatus)} options={options} value={status} />
      </View>

      {workers.isPending ? (
        <Spinner />
      ) : (
        <FlatList
          contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE }}
          data={workers.data?.rows ?? []}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<Empty />}
          ListFooterComponent={
            <Pager
              onChange={setPage}
              page={page}
              pageSize={PAGE_SIZE}
              total={workers.data?.total ?? 0}
            />
          }
          refreshControl={
            <RefreshControl
              onRefresh={() => workers.refetch()}
              refreshing={workers.isRefetching}
              tintColor={theme.mutedForeground}
            />
          }
          renderItem={({ item }) => <WorkerRow worker={item} />}
        />
      )}
    </View>
  );
}

/**
 * The one figure worth showing per row, in priority order.
 *
 * On shift beats everything — that is the answer to the question a manager
 * walking the floor is asking. Otherwise it is what they are owed, and when
 * that is unknowable (a monthly salary, where the backend refuses to guess what
 * a month part-worked is worth) it falls back to hours, which always is known.
 */
const WorkerFigure = ({
  balance,
  worker,
}: {
  balance: number | null;
  worker: WorkerListItem;
}) => {
  const theme = useTheme();
  const messages = useMessages();

  if (worker.onShiftNow) {
    return <Badge label={messages["staff.onShift"]} tone="good" />;
  }

  if (balance === null) {
    return (
      <Text style={{ color: theme.mutedForeground, fontSize: font.label }}>
        {formatMinutes(worker.minutesWorked)}
      </Text>
    );
  }

  return (
    <Text
      style={{
        color: balance > 0 ? theme.warning : theme.mutedForeground,
        fontSize: font.label,
        fontWeight: "700",
      }}
    >
      {formatMoney(balance)}
    </Text>
  );
};

const WorkerRow = ({ worker }: { worker: WorkerListItem }) => {
  const messages = useMessages();

  const balance = worker.balance === null ? null : Number(worker.balance);

  return (
    <ListRow
      leading={<Avatar initials={initialsOf(worker.name)} size={38} />}
      subtitle={
        worker.onShiftNow && worker.openSince
          ? `${formatTime(worker.openSince)} ${messages["staff.sinceShift"]}`
          : (worker.role ?? undefined)
      }
      title={worker.name}
      trailing={<WorkerFigure balance={balance} worker={worker} />}
      trailingCaption={
        worker.onShiftNow || balance === null
          ? undefined
          : messages["staff.balance"]
      }
    />
  );
};
