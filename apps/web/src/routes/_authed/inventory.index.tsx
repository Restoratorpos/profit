import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/inventory/")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/_authed/inventory/"!</div>;
}
