import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { membersQuery, PAGE_SIZE } from "@/api/queries";
import { Pager, ScreenHeader, TAB_BAR_CLEARANCE } from "@/components/screen";
import {
  Avatar,
  Badge,
  type BadgeTone,
  type ChipOption,
  ChipRow,
  Empty,
  ErrorState,
  ListRow,
  SearchField,
  Spinner,
} from "@/components/ui";
import type { Messages } from "@/i18n";
import { daysUntil, formatDay, formatMoney, initialsOf } from "@/lib/format";
import { useDebounced } from "@/lib/use-debounced";
import { useMessages } from "@/locale-context";
import { font, space } from "@/theme";
import { useTheme } from "@/theme-context";
import type { MemberFilter, MemberListItem } from "@/types";

/**
 * The roster.
 *
 * Search, filtering and paging all happen in the backend (`/members/page`), so
 * the counts on the filter chips are its tally over the whole roster rather than
 * something this screen can recompute from the rows it holds.
 */
export default function Members() {
  const theme = useTheme();
  const messages = useMessages();

  const [filter, setFilter] = useState<MemberFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  /*
   * Debounced because every keystroke would otherwise be a server round trip,
   * and the phone keyboard produces them faster than a desk one.
   */
  const query = useDebounced(search, 350);

  const members = useQuery(membersQuery(filter, query, page));
  const counts = members.data?.counts;

  const options: ChipOption<MemberFilter>[] = [
    { count: counts?.status.all, label: messages["members.all"], value: "all" },
    {
      count: counts?.status.active,
      label: messages["members.active"],
      value: "active",
    },
    {
      count: counts?.status.expiring,
      label: messages["members.expiring"],
      value: "expiring",
    },
    {
      count: counts?.status.inactive,
      label: messages["members.inactive"],
      value: "inactive",
    },
  ];

  /** Any filter or term change puts the pager back to the first page. */
  const reset =
    <T,>(apply: (value: T) => void) =>
    (value: T) => {
      apply(value);
      setPage(1);
    };

  if (members.isError) {
    return (
      <View style={{ backgroundColor: theme.background, flex: 1 }}>
        <ScreenHeader title={messages["members.title"]} />
        <ErrorState onRetry={() => members.refetch()} />
      </View>
    );
  }

  return (
    <View style={{ backgroundColor: theme.background, flex: 1 }}>
      <ScreenHeader
        subtitle={
          members.data
            ? `${members.data.total} ${messages["attendance.members"]}`
            : undefined
        }
        title={messages["members.title"]}
      />

      <View style={{ gap: space.md, paddingBottom: space.md }}>
        <SearchField
          onChange={reset(setSearch)}
          placeholder={messages["members.search"]}
          value={search}
        />
        <ChipRow onChange={reset(setFilter)} options={options} value={filter} />
      </View>

      {members.isPending ? (
        <Spinner />
      ) : (
        <FlatList
          contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE }}
          data={members.data?.rows ?? []}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<Empty />}
          ListFooterComponent={
            <Pager
              onChange={setPage}
              page={page}
              pageSize={PAGE_SIZE}
              total={members.data?.total ?? 0}
            />
          }
          refreshControl={
            <RefreshControl
              onRefresh={() => members.refetch()}
              refreshing={members.isRefetching}
              tintColor={theme.mutedForeground}
            />
          }
          renderItem={({ item }) => <MemberRow member={item} />}
        />
      )}
    </View>
  );
}

const MemberRow = ({ member }: { member: MemberListItem }) => {
  const theme = useTheme();
  const messages = useMessages();

  const debt = Number(member.membershipDebt) + Number(member.shopDebt);
  const left = daysUntil(member.endsAt);

  return (
    <ListRow
      leading={<Avatar initials={initialsOf(member.name)} size={38} />}
      subtitle={subtitleFor(member, messages)}
      title={member.name}
      trailing={
        debt > 0 ? (
          <Text
            style={{
              color: theme.destructive,
              fontSize: font.label,
              fontWeight: "700",
            }}
          >
            {formatMoney(debt)}
          </Text>
        ) : (
          <ExpiryBadge days={left} />
        )
      }
      trailingCaption={debt > 0 ? messages["members.debt"] : undefined}
    />
  );
};

/**
 * The plan they are on, and when it runs out.
 *
 * `endsAt` is the **soonest** upcoming expiry across every membership they hold,
 * not the latest — the desk learned that showing the latest hid a lapsing gym
 * plan behind a year-long sauna package.
 */
const subtitleFor = (member: MemberListItem, messages: Messages): string => {
  const plan = member.memberships[0]?.name;

  if (!plan) {
    return messages["members.noPlan"];
  }

  return member.endsAt ? `${plan} · ${formatDay(member.endsAt)}` : plan;
};

/** Days until expiry, coloured by how soon. A dash when nothing is running. */
const ExpiryBadge = ({ days }: { days: number | null }) => {
  if (days === null) {
    return <Badge label="—" tone="neutral" />;
  }

  return <Badge label={`${days}d`} tone={expiryTone(days)} />;
};

const expiryTone = (days: number): BadgeTone => {
  if (days <= 0) {
    return "bad";
  }

  return days <= 7 ? "warn" : "good";
};
