#!/usr/bin/env python3
"""
Generates the ShieldForge application icons (PNG + ICO) without any image
library, so the repository stays dependency-free.

Run:  python3 tools/generate_icons.py

The design is deliberately simple: an obsidian rounded square with an emerald
shield. It is rasterised with plain arithmetic - no external assets, no
network access.
"""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent.parent / "src-tauri" / "icons"

BG = (11, 14, 18, 255)        # obsidian canvas
ACCENT = (16, 185, 129, 255)  # emerald accent
EDGE = (34, 211, 238, 255)    # thin cyan edge highlight


def rounded_rect_alpha(x: int, y: int, size: int, radius: float) -> bool:
    """True when (x, y) is inside a rounded rectangle."""
    radius = min(radius, size / 2)
    dx = max(radius - x, x - (size - 1 - radius), 0)
    dy = max(radius - y, y - (size - 1 - radius), 0)
    return dx * dx + dy * dy <= radius * radius


def inside_shield(x: float, y: float, size: int) -> bool:
    """True when (x, y) is inside the shield glyph."""
    cx = size / 2
    top = size * 0.20
    bottom = size * 0.80
    half = size * 0.24

    if y < top or y > bottom:
        return False

    # Upper section: straight sides.
    if y <= top + (bottom - top) * 0.45:
        return abs(x - cx) <= half

    # Lower section: tapers to a point.
    t = (y - (top + (bottom - top) * 0.45)) / ((bottom - top) * 0.55)
    return abs(x - cx) <= half * (1 - t) ** 0.85


def render(size: int) -> bytes:
    """Renders one square RGBA icon and returns raw RGBA bytes."""
    rows = bytearray()
    radius = size * 0.22
    for y in range(size):
        rows.append(0)  # PNG filter type 0
        for x in range(size):
            if not rounded_rect_alpha(x, y, size, radius):
                rows.extend((0, 0, 0, 0))
                continue

            if inside_shield(x + 0.5, y + 0.5, size):
                # Inner highlight gives the shield a subtle facet.
                facet = (y / size) < 0.52 and abs((x + 0.5) - size / 2) < size * 0.06
                colour = EDGE if facet else ACCENT
            else:
                colour = BG
            rows.extend(colour)
    return bytes(rows)


def png_bytes(size: int) -> bytes:
    """Encodes a rendered icon as a PNG."""
    raw = render(size)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    header = struct.pack(">2I5B", size, size, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def ico_bytes(sizes: list[int]) -> bytes:
    """Wraps PNG images in a single .ico container (Vista+ supports PNG entries)."""
    images = [png_bytes(size) for size in sizes]
    header = struct.pack("<HHH", 0, 1, len(images))
    offset = 6 + 16 * len(images)
    entries = b""
    for size, image in zip(sizes, images):
        entries += struct.pack(
            "<BBBBHHII",
            size if size < 256 else 0,
            size if size < 256 else 0,
            0,
            0,
            1,
            32,
            len(image),
            offset,
        )
        offset += len(image)
    return header + entries + b"".join(images)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for size in (32, 64, 128, 256, 512):
        (OUT_DIR / f"{size}x{size}.png").write_bytes(png_bytes(size))
    (OUT_DIR / "128x128@2x.png").write_bytes(png_bytes(256))
    (OUT_DIR / "icon.png").write_bytes(png_bytes(512))
    (OUT_DIR / "icon.ico").write_bytes(ico_bytes([16, 32, 48, 64, 256]))

    print(f"icons written to {OUT_DIR}")


if __name__ == "__main__":
    main()
