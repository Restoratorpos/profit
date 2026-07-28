import { Spinner } from "@repo/design-system/components/ui/spinner";
import { useQuery } from "@tanstack/react-query";
import { membersPageQuery } from "@/features/members";
import { DEFAULT_MEMBER_QUERY } from "@/features/members/types";
import { useLocale } from "@/lib/i18n/provider";
import { AttendanceView } from "./attendance-view";

/**
 * What `app/(authenticated)/attendance/page.tsx` was.
 *
 * The table and the door queue are both fetched by the view — the filters and
 * the poll drive them — so this only supplies the member list the manual-entry
 * picker offers.
 *
 * That list comes from the members feature's paged query rather than the
 * unpaged `/members` the server component used: that endpoint returns the whole
 * roster, which on a real gym is thousands of rows shipped to fill a picker.
 */
export const AttendancePage = () => {
  const { messages } = useLocale();
  const members = useQuery(membersPageQuery(DEFAULT_MEMBER_QUERY));

  if (members.error) {
    return (
      <p
        className="m-6 rounded-lg border-2 border-destructive/50 bg-destructive/10 px-4 py-3 font-medium text-destructive"
        role="alert"
      >
        {members.error.message}
      </p>
    );
  }

  if (!members.data) {
    return (
      <output
        aria-label={messages["attendance.title"]}
        className="flex flex-1 items-center justify-center py-20"
      >
        <Spinner className="size-8" />
      </output>
    );
  }

  return <AttendanceView members={members.data.rows} messages={messages} />;
};
