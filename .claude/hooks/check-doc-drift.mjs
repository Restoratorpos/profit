#!/usr/bin/env node

import { execSync } from "node:child_process";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");

const listFiles = (cmd) => {
  const out = execSync(cmd, { encoding: "utf8" }).trim();
  return out ? out.split("\n") : [];
};

const parseCodeApiInventory = () => {
  const files = listFiles("find apps/app/app/api -name route.ts | sort");
  const map = new Map();

  for (const file of files) {
    const text = read(file);
    const route = file
      .replace("apps/app/app", "")
      .replace(/\/route\.ts$/, "")
      .replace(/\/(\[([^\]]+)\])/g, "/:$2");

    const methods = new Set();

    for (const m of text.matchAll(
      /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g
    )) {
      methods.add(m[1]);
    }

    for (const m of text.matchAll(
      /export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=/g
    )) {
      methods.add(m[1]);
    }

    for (const m of text.matchAll(
      /export\s+const\s*\{([^}]+)\}\s*=\s*serve\s*\(/g
    )) {
      for (const token of m[1].split(",").map((s) => s.trim())) {
        if (/^(GET|POST|PUT|PATCH|DELETE)$/.test(token)) {
          methods.add(token);
        }
      }
    }

    map.set(route, methods);
  }

  return map;
};

const parseApiSurfaceInventory = () => {
  const text = read("apps/app/.claude/contracts/api-surface.md");
  const map = new Map();

  for (const line of text.split("\n")) {
    const m = line.match(/^\|\s*([^|`]+?)\s*\|\s*`(\/api\/[^`]+)`\s*\|/);
    if (!m) {
      continue;
    }

    const methods = m[1]
      .split("/")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const route = m[2].replace(/\[([^\]]+)\]/g, ":$1");

    if (!map.has(route)) {
      map.set(route, new Set());
    }
    for (const method of methods) {
      map.get(route).add(method);
    }
  }

  return map;
};

const parseRouteMapInventory = () => {
  const text = read("apps/app/.claude/contracts/route-map.md");
  const map = new Map();

  for (const line of text.split("\n")) {
    const m = line.match(
      /^\s*(api\/[A-Za-z0-9_\-[\]/]+(?:route\.ts)?)\s*#\s*(.*)$/
    );
    if (!m) {
      continue;
    }

    let route = m[1].replace(/route\.ts$/, "").replace(/\[([^\]]+)\]/g, ":$1");
    if (!route.endsWith("/")) {
      route = `${route}/`;
    }
    route = `/${route}`.replace(/^\/api\//, "/api/");

    const methods = new Set();
    for (const mm of m[2].matchAll(/\b(GET|POST|PUT|PATCH|DELETE)\b/g)) {
      methods.add(mm[1]);
    }

    map.set(route.replace(/\/$/, ""), methods);
  }

  return map;
};

const compareInventories = (name, codeMap, docMap, issues) => {
  for (const [route, methods] of codeMap) {
    if (!docMap.has(route)) {
      issues.push(
        `[${name}] missing route: ${route} (${[...methods].sort().join("/")})`
      );
      continue;
    }

    const codeMethods = [...methods].sort();
    const docMethods = [...docMap.get(route)].sort();

    if (JSON.stringify(codeMethods) !== JSON.stringify(docMethods)) {
      issues.push(
        `[${name}] method mismatch: ${route} code=${codeMethods.join(
          "/"
        )} docs=${docMethods.join("/")}`
      );
    }
  }

  for (const [route] of docMap) {
    if (!codeMap.has(route)) {
      issues.push(`[${name}] stale route: ${route}`);
    }
  }
};

const parseCodeEvents = () => {
  const files = listFiles(
    "find apps/app/app/api apps/app/lib -type f \\( -name '*.ts' -o -name '*.tsx' \\) ! -path '*/__tests__/*' ! -name '*.test.*' ! -name '*.spec.*'"
  );

  const events = new Set();

  for (const file of files) {
    const text = read(file);

    for (const m of text.matchAll(
      /\bname\s*:\s*["'`]([a-z0-9][a-z0-9._-]*\/[a-z0-9._-]+)["'`]/gi
    )) {
      events.add(m[1]);
    }

    for (const m of text.matchAll(
      /\beventName\s*:\s*["'`]([a-z0-9][a-z0-9._-]*)["'`]/gi
    )) {
      events.add(m[1]);
    }
  }

  return events;
};

const parseEventCatalogTokens = () => {
  const text = read("apps/app/.claude/contracts/event-catalog.md");
  return new Set([...text.matchAll(/`([^`]+)`/g)].map((m) => m[1]));
};

const runSchemaDriftChecks = (issues) => {
  const schemaDoc = read("apps/app/.claude/contracts/schema-reference.md");
  const rpcDoc = read("apps/app/.claude/contracts/rpc-functions.md");
  const dbTypes = read("packages/database/database.types.ts");

  const require = (condition, message) => {
    if (!condition) {
      issues.push(`[schema] ${message}`);
    }
  };

  require(schemaDoc.includes(
    "| person | person_type | `PROSPECT`, `CONTACT` |"
  ), "person_type values must be PROSPECT/CONTACT");
  require(schemaDoc.includes(
    "| cohort | composition | `PROSPECT`, `REAL`, `MIXED` |"
  ), "cohort composition values must be PROSPECT/REAL/MIXED");

  require(!(
    schemaDoc.includes("problem_competitor") ||
    schemaDoc.includes("opportunity_competitor") ||
    schemaDoc.includes("insight_competitor")
  ), "junction names still use *_competitor");

  require(schemaDoc.includes("problem_company") &&
    schemaDoc.includes("opportunity_company") &&
    schemaDoc.includes(
      "insight_company"
    ), "company junction names missing in schema contract");

  require(!rpcDoc.includes("competitor_id") &&
    rpcDoc.includes(
      "company_id"
    ), "RPC contract still references competitor_id");

  for (const table of [
    "problem_company",
    "opportunity_company",
    "insight_company",
    "signal_company",
    "project_company",
  ]) {
    if (dbTypes.includes(`${table}: {`)) {
      require(schemaDoc.includes(
        `\`${table}\``
      ), `missing table mention: ${table}`);
    }
  }
};

const main = () => {
  const issues = [];

  const codeApi = parseCodeApiInventory();
  compareInventories(
    "api-surface",
    codeApi,
    parseApiSurfaceInventory(),
    issues
  );
  compareInventories("route-map", codeApi, parseRouteMapInventory(), issues);

  const codeEvents = parseCodeEvents();
  const docEvents = parseEventCatalogTokens();
  for (const event of [...codeEvents].sort()) {
    if (!docEvents.has(event)) {
      issues.push(`[events] missing event in catalog: ${event}`);
    }
  }

  runSchemaDriftChecks(issues);

  if (issues.length > 0) {
    console.error("Doc drift detected:\n");
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log(
    "Doc drift check passed: routes, events, and schema contracts are in sync."
  );
};

main();
