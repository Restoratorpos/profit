import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { attendanceQuery, PAGE_SIZE } from "@/api/queries";
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
import { formatMoment, initialsOf, rangeOf } from "@/lib/format";
import { useDebounced } from "@/lib/use-debounced";
import { useMessages } from "@/locale-context";
import { font, space } from "@/theme";
import { useTheme } from "@/theme-context";
import type { AttendanceRow } from "@/types";

/**
 * Who came in, over a window.
 *
 * One row is **one member**, not one entry: their last visit in the range and
 * how many times they came. The header's figure is the visit count across all
 * of them, which is why it does not match the row count.
 */

const RANGES = [1, 7, 30] as const;

type Range = (typeof RANGES)[number];

export default function Attendance() {
  const theme = useTheme();
  const messages = useMessages();

  const [range, setRange] = useState<Range>(1);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const query = useDebounced(search, 350);

  /*
   * Recomputed only when the range changes. Deriving it inline would produce a
   * new `from`/`to` pair on every render — and since both are part of the query
   * key, every render would be a cache miss and a fresh request.
   */
  const { from, to } = useMemo(() => rangeOf(range), [range]);

  const attendance = useQuery(attendanceQuery(from, to, query, page));

  const options: ChipOption<`${Range}`>[] = [
    { label: messages["range.today"], value: "1" },
    { label: messages["range.week"], value: "7" },
    { label: messages["range.month"], value: "30" },
  ];

  const reset =
    <T,>(apply: (value: T) => void) =>
    (value: T) => {
      apply(value);
      setPage(1);
    };

  if (attendance.isError) {
    return (
      <View style={{ backgroundColor: theme.background, flex: 1 }}>
        <ScreenHeader title={messages["attendance.title"]} />
        <ErrorState onRetry={() => attendance.refetch()} />
      </View>
    );
  }

  return (
    <View style={{ backgroundColor: theme.background, flex: 1 }}>
      <ScreenHeader
        subtitle={
          attendance.data
            ? `${attendance.data.visits} ${messages["attendance.visits"]} · ${attendance.data.total} ${messages["attendance.members"]}`
            : undefined
        }
        title={messages["attendance.title"]}
      />

      <View style={{ gap: space.md, paddingBottom: space.md }}>
        <SearchField
          onChange={reset(setSearch)}
          placeholder={messages["attendance.search"]}
          value={search}
        />
        <ChipRow
          onChange={reset((value: `${Range}`) =>
            setRange(Number(value) as Range)
          )}
          options={options}
          value={`${range}`}
        />
      </View>

      {attendance.isPending ? (
        <Spinner />
      ) : (
        <FlatList
          contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE }}
          data={attendance.data?.rows ?? []}
          keyExtractor={(item) => item.memberId}
          ListEmptyComponent={<Empty />}
          ListFooterComponent={
            <Pager
              onChange={setPage}
              page={page}
              pageSize={PAGE_SIZE}
              total={attendance.data?.total ?? 0}
            />
          }
          refreshControl={
            <RefreshControl
              onRefresh={() => attendance.refetch()}
              refreshing={attendance.isRefetching}
              tintColor={theme.mutedForeground}
            />
          }
          renderItem={({ item }) => <VisitRow row={item} />}
        />
      )}
    </View>
  );
}

const VisitRow = ({ row }: { row: AttendanceRow }) => {
  const theme = useTheme();
  const messages = useMessages();

  return (
    <ListRow
      leading={<Avatar initials={initialsOf(row.name)} size={38} />}
      subtitle={formatMoment(row.at)}
      title={row.name}
      trailing={
        <View style={{ alignItems: "flex-end", flexDirection: "row", gap: 6 }}>
          {/*
           * Sessions left is as of **now**, not as of the visit on this row —
           * so it is shown beside the count rather than inside it.
           */}
          {row.remainingVisits === null ? null : (
            <Badge
              label={`${row.remainingVisits}`}
              tone={row.remainingVisits <= 2 ? "warn" : "neutral"}
            />
          )}
          <Text
            style={{
              color: theme.foreground,
              fontSize: font.body,
              fontWeight: "700",
            }}
          >
            {row.visits}×
          </Text>
        </View>
      }
      trailingCaption={
        row.remainingVisits === null
          ? undefined
          : messages["attendance.visitsLeft"]
      }
    />
  );
};
