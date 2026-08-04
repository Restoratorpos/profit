import { createSocket } from "node:dgram";
import { isIP } from "node:net";

/**
 * Which of this machine's addresses a given host would see us arrive from.
 *
 * The terminals push their scans to us, so they need our LAN address — and no
 * incoming HTTP request can tell us what it is, because the browser reaches us
 * over a different path than the door does. That left `DEVICE_CALLBACK_HOST` to
 * be typed in by hand at every gym, against a LAN whose numbering nobody
 * running the gym knows, and re-typed whenever DHCP moved the desk PC.
 *
 * The operating system already knows the answer: it has to pick a source
 * address every time it routes a packet to the terminal. Asking it is the whole
 * trick below.
 */

/**
 * Nothing is ever sent here. A UDP `connect()` performs the route lookup and
 * binds a local address without putting a byte on the wire, so the port only
 * has to be a legal number — 9 is discard, which is the honest choice.
 */
const PROBE_PORT = 9;

/** Long enough for a DNS lookup on a slow LAN, short enough not to hold a boot. */
const PROBE_TIMEOUT_MS = 1000;

/**
 * The local address this machine would use to reach `host`.
 *
 * Returns `null` rather than throwing when there is no route, so callers can
 * fall back to a configured value instead of failing a device operation over
 * something this incidental.
 *
 * Being asked per-device rather than once at boot is deliberate: it is the
 * difference between guessing which network card matters and knowing. This desk
 * has both Ethernet and Wi-Fi, on `…105` and `…110`, and only one of them
 * carries traffic to the door. A route lookup picks that one by construction;
 * enumerating interfaces would just as confidently pick the wrong one.
 */
export const localAddressToward = (host: string): Promise<string | null> =>
  new Promise((resolve) => {
    const socket = createSocket(isIP(host) === 6 ? "udp6" : "udp4");

    let settled = false;

    const finish = (address: string | null) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      socket.removeAllListeners();

      try {
        socket.close();
      } catch {
        // Already closing, or never opened. Either way there is nothing to do.
      }

      // `0.0.0.0` means the socket bound to every interface without choosing
      // one, which is not an address a terminal can post to.
      resolve(address && address !== "0.0.0.0" && address !== "::" ? address : null);
    };

    const timer = setTimeout(() => finish(null), PROBE_TIMEOUT_MS);

    // Nothing here is worth taking the process down for — a hostname that will
    // not resolve is an ordinary miss, not a crash.
    timer.unref();
    socket.on("error", () => finish(null));

    try {
      socket.connect(PROBE_PORT, host, () => {
        try {
          finish(socket.address().address);
        } catch {
          finish(null);
        }
      });
    } catch {
      finish(null);
    }
  });
