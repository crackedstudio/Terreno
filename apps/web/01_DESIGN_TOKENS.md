# Terreno — Design Tokens ("Mercury")

Governs [`src/app/globals.css`](src/app/globals.css) and
[`tailwind.config.js`](tailwind.config.js). Those two files are the
implementation; this is the reasoning. If they disagree, the code is right and
this file is the bug.

Live reference, rendered from the real tokens: **`/dev/design-preview`**
(gated out of production by `src/app/dev/layout.tsx`).

> The three `0N_SPEC_*.md` files alongside this one describe screen layouts
> from an earlier brand and were already stale before this recolor. Treat them
> as history; the app's own screens are the current spec.

---

## Identity

**Name**: Terreno (Esperanto for "small world")
**Aesthetic**: A land registry. Hard-edged printed documents, offset drop
shadows, punch-card perforations, rubber stamps. Nothing is rounded, nothing is
frosted, nothing glows.
**One-liner**: It should feel like a government office that happens to sell the
planet.

---

## Two surfaces

The whole system is two surfaces and one variable that reconciles them.

| Surface | Class | When |
|---|---|---|
| **Ink** | `.surface-ink` (and `:root`) | The map, intake, wallet states, all chrome |
| **Paper** | `.surface-paper` | Printed documents: the ledger, the deed, the claim form, the rules |

`--edge` is the load-bearing token: **every hard border and every offset
shadow draws in it.** On ink it is paper; on paper it is ink. A block therefore
keeps a visible edge on either surface without a modifier class.

**The trap this exists to prevent**: painting a region ink with
`background: var(--ink)` *inside* a paper page leaves `--edge` set to ink, so
any button in it draws an ink border on an ink fill — invisible. Painting a
region ink means adding `.surface-ink`, not just setting a background. (This
bit us in the connect dialog on the deed; `/dev/design-preview` now demos both
surfaces side by side so it can't come back silently.)

---

## Palette

Named for meaning, not hue, so the names survive the next recolor.

```
--ink     #0D0D0D   the black everything is printed in
--paper   #E8E6E1   the light card / document surface
--stone   #C9C5BC   the grey the documents sit on
--held    #1F3BE8   land somebody holds — and the primary action
--rot     #FF4A0F   decay, warnings, the thing you should look at
--yours   #B430FF   the connected wallet's own land
--fresh   #F2E20A   just changed hands
--free    #B8B4AC   unclaimed land
--water   #1A1916   locked ocean — the contract refuses to sell it
```

Greys are split by the surface they sit on. Reaching for the wrong one is the
easiest way to make text unreadable here:

```
--mute-on-paper  #5A564E
--mute-on-ink    #7C776E
--dim-on-ink     #4A4740
--line-on-ink    #2A2823
--line-on-ink-2  #33312B
```

**Yellow is a fill, never type on paper.** `#F2E20A` on `#E8E6E1` is
unreadable. Where a yellow accent must carry a word on a light surface, it
becomes a filled chip with ink on top — the TYCOONS tab and the rules page both
do this.

### Canvas fills

The renderer can't read CSS custom properties, so the same values are restated
as literals in [`src/constants/mapColors.ts`](src/constants/mapColors.ts).
Legends import the ramps from there rather than hand-copying a gradient, so a
ramp and its legend cannot drift apart.

```
HEAT_RAMP  least traded ................ most traded
           #241F1A #4A2A12 #8A3A12 #FF4A0F #FF9A5C #F2E20A

ROT_RAMP   fresh & expensive ....... rotten & cheap
           #4A4740 #8A6A52 #FF7A3C #FF4A0F #F2E20A
```

### Owner colours

Holders pick any hex. `PROFILE_DEFAULT_PALETTE` in
[`src/constants/map.ts`](src/constants/map.ts) is the seed set and the swatch
row, curated to avoid anything near the locked-ocean near-black or the
unclaimed-land stone — a holder whose colour matches either looks like they own
nothing.

---

## Typography

Two faces, with a hard split of duties.

```
Display: 'Archivo Black'  — figures, headlines, the wordmark. ONE weight (400).
Body:    'Space Mono'     — labels, data, body, everything else. 400 and 700.
Import:  https://fonts.googleapis.com/css2?family=Archivo+Black&family=Space+Mono:wght@400;700&display=swap
```

Archivo Black ships a single weight; asking for 700 makes the browser
synthesise a bolder one, which smears at small sizes. Every rule that uses it
pins `font-weight: 400` — that is what `.font-display` does.

**A number is a headline.** Prices, ranks, plot counts, percentages: display
face, large, tight leading. Everything around them is Space Mono at 8–13px with
generous tracking.

```
--text-2xs  8px    --tracking-wide    0.10em
--text-xs   9px    --tracking-wider   0.14em
--text-sm   10px   --tracking-widest  0.20em
--text-base 11px   --tracking-button  0.18em
--text-md   12px
--text-lg   14px
--text-xl   18px
```

---

## Parts

```css
.brut        /* 3px solid var(--edge)                                  */
.brut-shadow /* 6px 6px 0 var(--edge)                                  */
.brut-card   /* surface fill + both of the above                       */
.brut-thin   /* 2px border, for rows that repeat down a list           */
.punch       /* 10px punch-card perforation, in var(--edge)            */
.stamp       /* rotated -7°, outlined in --rot — UNSTAMPED and friends */
.chip        /* small 2px outlined label in currentColor               */
```

Buttons keep the `.pixel-btn` class name (~20 call sites) but draw the
hard-shadow block. Pressing one moves it onto its own shadow — that is the
interaction language of the whole design.

```
.pixel-btn         block, 3px edge, 5px offset shadow
.pixel-btn-filled  --held fill, paper label      (primary)
.pixel-btn-rot     --rot fill, ink label         (take-the-rot, discard)
.pixel-btn-sm      2px edge, 3px shadow          (top bar, inline)
```

---

## Corners, shadows, motion

**No rounded corners.** `--radius-*` are all `0`, kept declared only because a
couple of genuinely pill-shaped controls still reference `--radius-full`.

**No soft shadows and no blur.** Elevation is the offset solid shadow, or a
heavier border, or an accent rule. The old frosted-glass bars are gone — they
read as soft, and nothing here is soft.

```
--transition-fast   120ms ease      button press
--transition-base   200ms ease
--transition-slow   400ms ease
--transition-drawer 300ms cubic-bezier(0.32, 0.72, 0, 1)
```

Motion is sparing and mechanical: a ticker, a hard-stepped caret blink, a
shake on a rejected tap, a spinner. `blink` is `steps(1)` — a terminal caret,
not a fade.

---

## Grid

Per-map, not global — read it from `useCurrentMapMeta()`, never from a
constant. The world map is 170×100. Plots are drawn as **squares**;
`TILE_RADIUS` went with the rounded tiles of the previous look.

```
TILE_GAP     0.08   gap between plots at 1× (canvas units)
PAINT_SCALE  4      minimum zoom to activate paint mode
MAX_SELECT   100    contract gas limit, ~100 plots per tx
```

---

## Tailwind

`tailwind.config.js` mirrors the palette under the same names (`ink`, `paper`,
`held`, `rot`, `yours`, `fresh`, `free`, `water`) plus
`fontFamily.display` / `fontFamily.mono`.

One constraint worth knowing: `--border` **must** stay an HSL triplet, because
Tailwind's `border-border` wraps it in `hsl()`. Inline styles that want a
hairline use `--hairline`. Every inline `var(--border)` in the old code was
silently invalid for exactly this reason.
