import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { dashboardQuery, revenueQuery } from "@/api/queries";
import { useAuth } from "@/auth/context";
import { ChartLegend, RevenueChart } from "@/components/revenue-chart";
import { TAB_BAR_CLEARANCE } from "@/components/screen";
import {
  Avatar,
  Badge,
  Caption,
  Card,
  type ChipOption,
  ChipRow,
  Empty,
  ErrorState,
  ListRow,
  MiniTile,
  pressOpacity,
  SectionHeader,
  Spinner,
  StatTile,
} from "@/components/ui";
import {
  changeFrom,
  daysUntil,
  formatCompact,
  formatMoney,
  formatQuantity,
  initialsOf,
} from "@/lib/format";
import { useMessages } from "@/locale-context";
import { font, radius, space } from "@/theme";
import { useTheme } from "@/theme-context";
import type {
  DashboardSnapshot,
  MemberStanding,
  RevenueReport,
  TopProduct,
} from "@/types";

/**
 * The screen this app exists for: what the gym did, at a glance.
 *
 * Two queries feed it. `/dashboard` is the snapshot — presence, receivables,
 * the roster's standing and the three attention lists — and does not take a
 * range. `/dashboard/revenue?days=N` is the money over the chosen window, and
 * carries its own previous-window totals so the deltas are the backend's
 * arithmetic rather than this app's.
 */

/** `days=1` is today. The backend validates 1…366, so all four are in range. */
const RANGES = [1, 7, 30, 90] as const;

type Range = (typeof RANGES)[number];

/** How many rows of each attention list the phone shows before it stops. */
const ATTENTION_ROWS = 4;

export default function Home() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const messages = useMessages();
  const { user } = useAuth();

  const [range, setRange] = useState<Range>(1);

  const snapshot = useQuery(dashboardQuery());
  const revenue = useQuery(revenueQuery(range));

  const rangeOptions: ChipOption<`${Range}`>[] = [
    { label: messages["range.today"], value: "1" },
    { label: messages["range.week"], value: "7" },
    { label: messages["range.month"], value: "30" },
    { label: messages["range.quarter"], value: "90" },
  ];

  const refreshing = snapshot.isRefetching || revenue.isRefetching;

  const refresh = () => {
    snapshot.refetch();
    revenue.refetch();
  };

  if (snapshot.isError) {
    return <ErrorState onRetry={refresh} />;
  }

  const data = snapshot.data;
  const report = revenue.data;

  return (
    <ScrollView
      contentContainerStyle={{
        paddingBottom: TAB_BAR_CLEARANCE,
        paddingTop: insets.top + space.md,
      }}
      refreshControl={
        <RefreshControl
          onRefresh={refresh}
          refreshing={refreshing}
          tintColor={theme.mutedForeground}
        />
      }
      style={{ backgroundColor: theme.background, flex: 1 }}
    >
      <Greeting name={user?.name ?? "—"} />

      {/* ------------------------------------------------------------- range */}
      <View style={{ marginTop: space.xl }}>
        <ChipRow
          onChange={(value) => setRange(Number(value) as Range)}
          options={rangeOptions}
          value={`${range}`}
        />
      </View>

      <IncomeCard
        loading={revenue.isPending}
        rangeLabel={rangeOptions.find((o) => o.value === `${range}`)?.label}
        report={report}
      />

      <Receivables data={data} />

      {/* ------------------------------------------------------------- tiles */}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: space.sm,
          marginTop: space.md,
          paddingHorizontal: space.lg,
        }}
      >
        <StatTile
          caption={messages["home.revenue"]}
          delta={
            report
              ? changeFrom(report.totals.revenue, report.previous.revenue)
              : undefined
          }
          icon="dollar-sign"
          value={formatCompact(report?.totals.revenue ?? 0)}
        />
        <StatTile
          caption={messages["home.profit"]}
          delta={
            report
              ? changeFrom(report.totals.net, report.previous.net)
              : undefined
          }
          icon="trending-up"
          value={formatCompact(report?.totals.net ?? 0)}
        />
        <StatTile
          caption={messages["home.expense"]}
          delta={
            report
              ? changeFrom(report.totals.expense, report.previous.expense)
              : undefined
          }
          icon="arrow-down-left"
          value={formatCompact(report?.totals.expense ?? 0)}
        />
        <StatTile
          caption={messages["home.shopSales"]}
          delta={
            report
              ? changeFrom(report.totals.shop, report.previous.shop)
              : undefined
          }
          icon="shopping-cart"
          value={formatCompact(report?.totals.shop ?? 0)}
        />
      </View>

      <StandingCard members={data?.members} />

      <TopSellers products={report?.topProducts ?? []} />

      {snapshot.isPending ? <Spinner /> : null}

      {data ? <Attention attention={data.attention} /> : null}
    </ScrollView>
  );
}

/** The hero: what came in over the chosen window, and its daily shape. */
const IncomeCard = ({
  loading,
  rangeLabel,
  report,
}: {
  loading: boolean;
  rangeLabel?: string;
  report?: RevenueReport;
}) => {
  const theme = useTheme();
  const messages = useMessages();

  return (
    <View style={{ paddingHorizontal: space.lg, paddingTop: space.lg }}>
      <Card
        style={{
          /*
           * A green edge down the left rather than a green fill: the primary is
           * a 1.7:1 contrast and anything written on top of it disappears.
           */
          borderLeftColor: theme.primary,
          borderLeftWidth: 3,
        }}
        tinted
      >
        <View
          style={{
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <Caption>{messages["home.income"]}</Caption>
          {report ? <Badge label={rangeLabel ?? ""} tone="neutral" /> : null}
        </View>

        <View
          style={{
            alignItems: "baseline",
            flexDirection: "row",
            gap: space.sm,
            marginBottom: space.lg,
            marginTop: space.sm,
          }}
        >
          <Text
            style={{
              color: theme.foreground,
              fontSize: font.display,
              fontWeight: "700",
              letterSpacing: -1,
            }}
          >
            {formatMoney(report?.totals.revenue ?? 0)}
          </Text>
          <Text style={{ color: theme.mutedForeground, fontSize: font.label }}>
            {messages["common.currency"]}
          </Text>
        </View>

        {loading ? <Spinner /> : null}

        {loading ? null : (
          <>
            <RevenueChart points={report?.points ?? []} />
            <ChartLegend
              labels={[
                messages["home.membershipSales"],
                messages["home.shopSales"],
                messages["home.otherSales"],
              ]}
            />
          </>
        )}
      </Card>
    </View>
  );
};

/**
 * Money owed *to* the gym, plus who is inside right now.
 *
 * Scrolls sideways rather than wrapping: these are four glanceable figures, and
 * a second row of them would push the tiles below the fold.
 */
const Receivables = ({ data }: { data?: DashboardSnapshot }) => {
  const messages = useMessages();

  const owed = (value: string | undefined): "default" | "warning" =>
    Number(value ?? 0) > 0 ? "warning" : "default";

  return (
    <ScrollView
      contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg }}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginTop: space.md }}
    >
      <MiniTile
        caption={messages["home.inGym"]}
        icon="user-check"
        value={`${data?.presence.members ?? 0}`}
      />
      <MiniTile
        caption={messages["home.membershipDebt"]}
        icon="credit-card"
        tone={owed(data?.receivables.membership)}
        value={formatCompact(data?.receivables.membership ?? 0)}
      />
      <MiniTile
        caption={messages["home.shopDebt"]}
        icon="shopping-bag"
        tone={owed(data?.receivables.shop)}
        value={formatCompact(data?.receivables.shop ?? 0)}
      />
      <MiniTile
        /*
         * Supplier debt is money the gym *owes out*, not money owed to it —
         * hence "danger" rather than "warning". It is the only one of the four
         * that is a liability.
         */
        caption={messages["home.supplierDebt"]}
        icon="truck"
        tone={
          Number(data?.receivables.supplier ?? 0) > 0 ? "danger" : "default"
        }
        value={formatCompact(data?.receivables.supplier ?? 0)}
      />
    </ScrollView>
  );
};

/** Who is looking, and the way through to their profile. */
const Greeting = ({ name }: { name: string }) => {
  const theme = useTheme();
  const messages = useMessages();

  return (
    <View
      style={{
        alignItems: "center",
        flexDirection: "row",
        gap: space.md,
        paddingHorizontal: space.lg,
      }}
    >
      <Avatar initials={initialsOf(name)} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.mutedForeground, fontSize: font.label }}>
          {messages["home.greeting"]},
        </Text>
        <Text
          numberOfLines={1}
          style={{
            color: theme.foreground,
            fontSize: font.title,
            fontWeight: "700",
            letterSpacing: -0.4,
          }}
        >
          {name}
        </Text>
      </View>

      {/* The profile lives top-right, as a modal over whatever is open. */}
      <Link asChild href="/profile">
        <Pressable
          style={({ pressed }) => ({
            alignItems: "center",
            backgroundColor: theme.card,
            borderColor: theme.border,
            borderRadius: radius.pill,
            borderWidth: 1,
            height: 42,
            justifyContent: "center",
            opacity: pressOpacity(false, pressed),
            width: 42,
          })}
        >
          <Feather color={theme.foreground} name="user" size={18} />
        </Pressable>
      </Link>
    </View>
  );
};

/** The roster in four numbers. */
const StandingCard = ({ members }: { members?: MemberStanding }) => {
  const theme = useTheme();
  const messages = useMessages();

  return (
    <View style={{ paddingHorizontal: space.lg }}>
      <SectionHeader title={messages["home.standing"]} />
      <Card>
        <View style={{ flexDirection: "row" }}>
          <Standing
            label={messages["home.active"]}
            value={members?.active ?? 0}
          />
          <Standing
            label={messages["home.expiring"]}
            tone={theme.warning}
            value={members?.expiring ?? 0}
          />
          <Standing
            label={messages["home.lapsed"]}
            tone={theme.destructive}
            value={members?.lapsed ?? 0}
          />
          <Standing
            label={messages["home.joined"]}
            tone={theme.primaryAccent}
            value={members?.joinedThisMonth ?? 0}
          />
        </View>
      </Card>
    </View>
  );
};

const TopSellers = ({ products }: { products: readonly TopProduct[] }) => {
  const theme = useTheme();
  const messages = useMessages();

  if (products.length === 0) {
    return null;
  }

  return (
    <View style={{ paddingHorizontal: space.lg }}>
      <SectionHeader title={messages["home.topProducts"]} />
      <Card style={{ paddingHorizontal: 0, paddingVertical: space.xs }}>
        {products.map((product) => (
          <ListRow
            key={product.id}
            subtitle={`${formatQuantity(product.quantity)} ×`}
            title={product.name}
            trailing={
              <Text
                style={{
                  color: theme.foreground,
                  fontSize: font.body,
                  fontWeight: "700",
                }}
              >
                {formatCompact(product.revenue)}
              </Text>
            }
          />
        ))}
      </Card>
    </View>
  );
};

/**
 * The three lists worth acting on: who is about to lapse, who owes money, and
 * what is running out. Each is capped — the phone is a prompt to go and look,
 * not the place to work through a backlog.
 */
const Attention = ({
  attention,
}: {
  attention: DashboardSnapshot["attention"];
}) => {
  const theme = useTheme();
  const messages = useMessages();

  return (
    <View style={{ paddingHorizontal: space.lg }}>
      <SectionHeader title={messages["home.expiringSoon"]} />
      <Card style={{ paddingHorizontal: 0, paddingVertical: space.xs }}>
        {attention.expiring.length === 0 ? <Empty /> : null}
        {attention.expiring.slice(0, ATTENTION_ROWS).map((row) => {
          const left = daysUntil(row.endsAt);

          return (
            <ListRow
              key={row.id}
              leading={<Avatar initials={initialsOf(row.name)} size={34} />}
              subtitle={row.plan}
              title={row.name}
              trailing={
                <Badge
                  label={left === null ? "—" : `${left}d`}
                  tone={left !== null && left <= 3 ? "bad" : "warn"}
                />
              }
            />
          );
        })}
      </Card>

      <SectionHeader title={messages["home.debtors"]} />
      <Card style={{ paddingHorizontal: 0, paddingVertical: space.xs }}>
        {attention.debtors.length === 0 ? <Empty /> : null}
        {attention.debtors.slice(0, ATTENTION_ROWS).map((row) => (
          <ListRow
            key={`${row.type}-${row.id}`}
            leading={<Avatar initials={initialsOf(row.name)} size={34} />}
            title={row.name}
            trailing={
              <Text
                style={{
                  color: theme.destructive,
                  fontSize: font.body,
                  fontWeight: "700",
                }}
              >
                {formatMoney(row.remaining)}
              </Text>
            }
          />
        ))}
      </Card>

      <SectionHeader title={messages["home.lowStock"]} />
      <Card style={{ paddingHorizontal: 0, paddingVertical: space.xs }}>
        {attention.lowStock.length === 0 ? <Empty /> : null}
        {attention.lowStock.slice(0, ATTENTION_ROWS).map((row) => (
          <ListRow
            key={row.id}
            subtitle={row.unit ?? undefined}
            title={row.name}
            trailing={
              <Badge
                label={formatQuantity(row.stock)}
                tone={row.status === "out" ? "bad" : "warn"}
              />
            }
          />
        ))}
      </Card>
    </View>
  );
};

/** One quarter of the standing card. */
const Standing = ({
  label,
  tone,
  value,
}: {
  label: string;
  tone?: string;
  value: number;
}) => {
  const theme = useTheme();

  return (
    <View style={{ alignItems: "center", flex: 1, gap: space.xs }}>
      <Text
        style={{
          color: tone ?? theme.foreground,
          fontSize: font.title,
          fontWeight: "700",
        }}
      >
        {value}
      </Text>
      <Text
        numberOfLines={1}
        style={{
          color: theme.mutedForeground,
          fontSize: font.caption,
          textAlign: "center",
        }}
      >
        {label}
      </Text>
    </View>
  );
};
