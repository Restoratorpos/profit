import { config } from "dotenv";

config({ path: [".env.local", ".env"] });
const mysql = (await import("mysql2/promise")).default;

const c = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  dateStrings: true,
});

const q = async (label, sql) => {
  const [rows] = await c.query(sql);
  console.log("=== " + label);
  console.table(rows);
};

console.log("node local now:", new Date().toString());
console.log("node iso now  :", new Date().toISOString());

await q(
  "raw event_time vs created_at (skew seconds)",
  "SELECT event_id, event_time, created_at, TIMESTAMPDIFF(SECOND, event_time, created_at) AS skew_sec, person_type, person_id, source, direction FROM attendance_events ORDER BY event_id DESC LIMIT 8"
);

await q(
  "exact listRecentEvents join, limit 3",
  "SELECT e.event_id, e.event_time, e.person_type, e.person_id, d.device_name, w.fullname AS worker_name, m.fullname AS member_name FROM attendance_events e LEFT JOIN devices d ON d.device_id = e.device_id LEFT JOIN workers w ON w.worker_id = e.person_id AND e.person_type = 'worker' LEFT JOIN members m ON m.member_id = e.person_id AND e.person_type = 'member' WHERE e.gym_id = 'D39vUb-q6xjHJppKcWZO' ORDER BY e.event_time DESC LIMIT 3"
);

await q(
  "attendance_sessions tail",
  "SELECT session_id, gym_id, person_type, person_id, check_in, check_out, work_date, status, needs_review FROM attendance_sessions ORDER BY session_id DESC LIMIT 8"
);

await q(
  "devices",
  "SELECT device_id, gym_id, branch_id, device_name, direction, is_active, last_seen FROM devices"
);

await q(
  "worker gyms (who signs in)",
  "SELECT worker_id, gym_id, branch_id, fullname, phone, role, status FROM workers LIMIT 10"
);

await c.end();
