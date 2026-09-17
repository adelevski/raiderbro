# raiderbro icon

The icon restores the circular ARC Raiders stripe mark used before the snowball
launch, visible in `app/index.html` and `app/src/app-shell.css` at commit
`0226045fa71846ebf51a380cbe27e8081f2ce352`.

- Original URL (now unavailable): `https://storage.googleapis.com/web-arc-raiders-cms-assets/temp/stripes/stripes.png`.
- Current source: [official ARC Raiders stripes](https://assets.arcraiders.com/static/stripes/stripes.png), linked by [arcraiders.com](https://arcraiders.com/), retrieved September 10, 2026 and retained unchanged as `stripes.png`.
- Framing: a 58×58 circle on `#04080d`; stripe image at x=-16, y=-8, height=74 with its aspect ratio preserved; 1px inner border in `rgba(182, 209, 236, 0.14)`.
- `icon.png` is the 512px rasterized composition. The app icon (116px), favicon (32px) and Apple touch icon (180px) use the same composition with transparent corners.

The old remote asset cannot be compared byte-for-byte; this restores the original
framing using the stripe artwork currently served by the official site. The
artwork is third-party game material, not original snowball artwork or MIT-licensed
content. See [third-party notices](../THIRD-PARTY-NOTICES.md).

The temporary generated crate icon and its generation prompt remain in Git history
at the v0.2.0 release; they are no longer the project identity.
