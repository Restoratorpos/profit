import type { Metadata } from "next";
import { backendFetch } from "@/lib/backend";
import { getMessages } from "@/lib/i18n/dictionary";
import { getLocale } from "@/lib/i18n/server";
import type { MemberListItem } from "@/lib/members";
import { AttendanceView } from "./components/attendance-view";

export const metadata: Metadata = {
  title: "Davomatlar",
};

const AttendancePage = async () => {
  // The table and the pending queue are both loaded client-side — the filters
  // and the poll drive them — so the page itself only needs the member list the
  // manual-entry picker offers.
  const membersPromise = backendFetch<MemberListItem[]>("/members");
  const localePromise = getLocale();

  const [members, locale] = await Promise.all([membersPromise, localePromise]);

  return <AttendanceView members={members} messages={getMessages(locale)} />;
};

export default AttendancePage;
