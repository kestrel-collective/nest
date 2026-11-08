"""Whether a string parses as a URL by the WHATWG URL Standard, as ``URL.canParse`` does in Node.

zod's ``z.url()`` accepts what ``URL.canParse`` accepts, so ``projects[].url`` needs the same answer here.
This covers what the standard decides for absolute URLs without a base: the scheme, then for the special
schemes (http, https, ws, wss, ftp, file) a host that is not empty, has no forbidden code point, and a port
that fits in 16 bits. A non-special scheme such as ``mailto:`` takes almost anything after the colon.
"""

from __future__ import annotations

import ipaddress
import re

SPECIAL = {"http", "https", "ws", "wss", "ftp", "file"}
_SCHEME = re.compile(r"^([A-Za-z][A-Za-z0-9+\-.]*):")
_FORBIDDEN_HOST = set("\x00\t\n\r #/:<>?@[\\]^|")
_FORBIDDEN_DOMAIN = _FORBIDDEN_HOST | set(chr(c) for c in range(0x20)) | {"%", "\x7f"}


def _strip(text: str) -> str:
    # C0 controls and space are removed from both ends, tab and newlines from everywhere
    text = text.strip("".join(chr(c) for c in range(0x21)))
    return re.sub(r"[\t\n\r]", "", text)


def _ipv4_number(part: str) -> int | None:
    if part == "":
        return None
    try:
        if part[:2].lower() == "0x":
            return int(part[2:] or "0", 16)
        if len(part) > 1 and part[0] == "0":
            return int(part[1:], 8)
        return int(part, 10)
    except ValueError:
        return None


def _ends_in_number(host: str) -> bool:
    parts = host.split(".")
    if parts[-1] == "" and len(parts) > 1:
        parts = parts[:-1]
    last = parts[-1]
    return last != "" and (last.isdigit() or re.fullmatch(r"0[xX][0-9A-Fa-f]*", last) is not None)


def _valid_ipv4(host: str) -> bool:
    parts = host.split(".")
    if parts[-1] == "" and len(parts) > 1:
        parts = parts[:-1]
    if len(parts) > 4:
        return False
    numbers = [_ipv4_number(p) for p in parts]
    if any(n is None for n in numbers):
        return False
    *head, last = numbers
    if any(n > 255 for n in head):  # type: ignore[operator]
        return False
    return last < 256 ** (5 - len(numbers))  # type: ignore[operator]


def _valid_domain(host: str) -> bool:
    if host == "":
        return False
    try:
        from urllib.parse import unquote

        decoded = unquote(host)
    except Exception:  # pragma: no cover - unquote does not raise on str
        return False
    if not decoded.isascii():
        try:
            decoded = decoded.encode("idna").decode("ascii")
        except UnicodeError:
            return False
    if any(ch in _FORBIDDEN_DOMAIN for ch in decoded):
        return False
    if _ends_in_number(decoded):
        return _valid_ipv4(decoded)
    return True


def _valid_host(host: str, special: bool) -> bool:
    if host.startswith("["):
        if not host.endswith("]"):
            return False
        try:
            ipaddress.IPv6Address(host[1:-1])
        except ValueError:
            return False
        return True
    if not special:
        return not any(ch in _FORBIDDEN_HOST for ch in host)
    return _valid_domain(host)


def _valid_authority(authority: str, special: bool) -> bool:
    hostport = authority.rsplit("@", 1)[-1]
    if hostport.startswith("["):
        end = hostport.find("]")
        if end < 0:
            return False
        host, rest = hostport[: end + 1], hostport[end + 1 :]
        if rest and not rest.startswith(":"):
            return False
        port = rest[1:]
    elif ":" in hostport:
        host, port = hostport.rsplit(":", 1)
    else:
        host, port = hostport, ""
    if port and (not port.isdigit() or int(port) > 65535):
        return False
    if host == "":
        return not special
    return _valid_host(host, special)


def can_parse_url(text: str) -> bool:
    text = _strip(text)
    m = _SCHEME.match(text)
    if not m:
        return False
    scheme = m.group(1).lower()
    rest = text[m.end() :]
    if scheme == "file":
        return True
    if scheme in SPECIAL:
        rest = rest.lstrip("/\\")
        authority = re.split(r"[/\\?#]", rest, maxsplit=1)[0]
        return authority != "" and _valid_authority(authority, special=True)
    if rest.startswith("//"):
        authority = re.split(r"[/?#]", rest[2:], maxsplit=1)[0]
        return _valid_authority(authority, special=False)
    return True
