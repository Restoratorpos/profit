import { describe, expect, it } from "vitest";
import { localAddressToward } from "../src/lib/lan-address.js";

/**
 * The address a terminal should push its scans to used to be typed into
 * `DEVICE_CALLBACK_HOST` by hand, and went stale every time DHCP moved the desk
 * PC — silently, because a wrong push destination fails only in the direction
 * nothing watches.
 *
 * What matters about the replacement is not which address it returns on any
 * given machine, but that it *always answers*: a caller configuring a device
 * must never be left hanging on a route lookup, and must never see this throw.
 */
describe("localAddressToward", () => {
  it("answers with the source address the OS would route from", async () => {
    // Loopback is the one destination every machine can route to, so this
    // pins the mechanism — the reply is the source address for *that* target,
    // not an arbitrary interface picked off a list.
    expect(await localAddressToward("127.0.0.1")).toBe("127.0.0.1");
  });

  it("never binds to the wildcard address", async () => {
    // `0.0.0.0` means no interface was chosen. A terminal cannot post to it,
    // so it has to come back as null rather than as a usable-looking string.
    const address = await localAddressToward("127.0.0.1");

    expect(address).not.toBe("0.0.0.0");
    expect(address).not.toBe("::");
  });

  it("settles rather than throwing when the host cannot be resolved", async () => {
    // `.invalid` is reserved as permanently unresolvable (RFC 2606), though a
    // DNS resolver that hijacks NXDOMAIN will hand back a real address instead.
    // Either outcome is fine; hanging or throwing is not, because this runs
    // inside device setup and on every boot.
    const address = await localAddressToward("no-such-host.invalid");

    expect(address === null || typeof address === "string").toBe(true);
  });

  it("resolves for every host in a batch without leaking a pending promise", async () => {
    const addresses = await Promise.all([
      localAddressToward("127.0.0.1"),
      localAddressToward("no-such-host.invalid"),
      localAddressToward("127.0.0.1"),
    ]);

    expect(addresses).toHaveLength(3);
    expect(addresses[0]).toBe("127.0.0.1");
    expect(addresses[2]).toBe("127.0.0.1");
  });
});
