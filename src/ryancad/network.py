"""Local IPv4 addresses used by the opt-in LAN listener and host allowlist."""
from __future__ import annotations

import ipaddress
import socket


def local_ipv4_addresses() -> list[str]:
    """Find private/link-local interface addresses without contacting a server.

    Virtual adapters can be included. The allowlist is a startup snapshot, so
    changing networks or DHCP addresses requires restarting LAN mode.
    """
    try:
        candidates = socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)
    except OSError:
        return []
    addresses = set()
    for candidate in candidates:
        try:
            address = ipaddress.IPv4Address(candidate[4][0])
        except ipaddress.AddressValueError:
            continue
        if (address.is_private or address.is_link_local) and not (
            address.is_loopback or address.is_unspecified or address.is_multicast
        ):
            addresses.add(address)
    return [str(address) for address in sorted(addresses)]
