import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/transactions")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/_authed/transactions"!</div>;
}
