# Design System — Journey Intelligence Demo

Adapted from Wise (VoltAgent/awesome-design-md) for government/civic service context.

## 1. Visual Theme & Atmosphere

A government digital service that communicates trust and clarity through bold typography, generous whitespace, and a distinctive green accent. The design operates on a clean white canvas with near-black text and a nature-inspired green — optimistic and accessible, unlike the grey bureaucratic default.

The approach borrows Wise's confidence (bold weights, tight headings, pill buttons, scale animations) but restrains it for institutional use: smaller display sizes, more breathing room, and a blue secondary for informational/navigational actions.

**Key Characteristics:**
- Inter at weight 700 for headings, 400/600 for body — confident but not extreme
- Primary Green (`#9fe870`) for success, confirmation, completed states
- Action Blue (`#2563EB`) for primary navigation CTAs
- Alert Orange (`#FF6B00`) for attention/audio (Kya Likha Hai)
- Danger Red (`#DC2626`) for consequential/irreversible actions
- Pill buttons (9999px) for primary CTAs, 12px radius for cards
- Scale(1.03) hover, scale(0.97) active on interactive elements
- Ring shadows only — no drop shadows

## 2. Color Palette & Roles

### Primary
- **Near Black** (`#0e0f0c`): Primary text, phone frame
- **Action Blue** (`#2563EB`): Primary CTA, active progress, navigational
- **Wise Green** (`#9fe870`): Success, completion, positive confirmation
- **Dark Green** (`#163300`): Text on green backgrounds
- **Light Mint** (`#e2f6d5`): Success surface, confidence artefact header

### Semantic
- **Orange** (`#FF6B00`): KLH audio, attention, floating actions
- **Danger Red** (`#DC2626`): Consequential actions, CAS gate confirm
- **Warning Amber** (`#FEF3CD` bg / `#856404` text): Risk signals
- **Info Blue** (`#E3F2FD` bg / `#1565C0` text): Navigational badges

### Materiality Tags
- INFORMATIONAL: `#E8F5E9` bg, `#2E7D32` text
- NAVIGATIONAL: `#E3F2FD` bg, `#1565C0` text
- TRANSACTIONAL: `#FFF3E0` bg, `#E65100` text
- CONSEQUENTIAL: `#FFEBEE` bg, `#C62828` text

### Neutral
- **Secondary text** (`#4B5563`)
- **Tertiary/labels** (`#9CA3AF`)
- **Borders** (`#E5E7EB`, `#F0F0F0`)
- **Surface** (`#F7F8FA`)
- **Card bg** (`#FFFFFF`)

## 3. Typography Rules

### Font Family
- **All text**: `Inter`, fallback `-apple-system, BlinkMacSystemFont, sans-serif`
- Load from Google Fonts: `Inter:wght@400;500;600;700`
- OpenType `"calt"` on all text

### Hierarchy
| Role | Size | Weight | Line Height | Use |
|------|------|--------|-------------|-----|
| Phone step title | 20px | 700 | 1.25 | Step card h2 |
| App bar title | 16px | 600 | 1.2 | Top app bar |
| JI headline | 17px | 700 | 1.3 | Rhetorical layer headline |
| Body | 14px | 400 | 1.5 | Step descriptions |
| JI explanation | 13px | 400 | 1.55 | Rhetorical explanation |
| Field value | 13px | 400 | 1.4 | Data fields |
| Field label | 10px | 600–700 | 1.0 | Uppercase labels |
| Button | 14px | 600 | 1.0 | All buttons |
| Badge/tag | 10px | 700 | 1.0 | Materiality tags |
| Counter | 11px | 500 | 1.0 | Step counter |

## 4. Component Stylings

### Buttons — Primary (Next/CTA)
- Background: `#2563EB`
- Text: `#FFFFFF`
- Radius: 10px
- Height: 44px
- Hover: `#1D4ED8`, scale(1.03)
- Active: scale(0.97)

### Buttons — Secondary (Previous)
- Background: `#F3F4F6`
- Text: `#4B5563`
- Hover: `#E5E7EB`

### Buttons — Danger (CAS Confirm)
- Background: `#DC2626`
- Text: `#FFFFFF`
- Radius: 12px
- Hover: `#B91C1C`

### KLH Floating Action Button
- Background: `#FF6B00`
- Size: 52px circle
- Shadow: `0 4px 14px rgba(255,107,0,0.35)`
- Icon: Speaker SVG, white
- Draggable within phone screen bounds
- Hover: scale(1.08)
- Active: scale(0.95)

### Cards
- Background: `#FFFFFF`
- Radius: 16px
- Shadow: `0 1px 3px rgba(0,0,0,0.04)` — minimal
- Padding: 20px

### Bottom Sheets
- Radius: 20px 20px 0 0
- Drag handle: 36×4px, `#D1D5DB`, centered
- Overlay: `rgba(0,0,0,0.35)`
- Transition: `0.35s cubic-bezier(0.32, 0.72, 0, 1)`

### Language Pills
- Container: `#F3F4F6`, radius 8px
- Active pill: `#FFFFFF` with subtle shadow
- Inactive: `#6B7280` text

### Progress Track
- Height: 3px segments with 4px gap
- Done: `#9fe870` (Wise Green — completed)
- Active: `#2563EB` (Blue — current)
- Pending: `#E5E7EB`

### Materiality Tags
- Radius: 4px
- Font: 10px, weight 700, uppercase, 0.5px letter-spacing
- Padding: 3px 8px

## 5. Layout Principles

### Phone Frame (Desktop Presentation)
- Dimensions: 393×852 (iPhone 15)
- Frame bg: `#0A0A0A`
- Frame radius: 52px
- Frame padding: 14px
- Screen radius: 40px
- Shadow: `0 40px 100px rgba(0,0,0,0.15), 0 8px 32px rgba(0,0,0,0.08)`

### Spacing
- Content padding: 16px
- Card gap: 12px
- Field gap: 10px
- Progress padding: 8px 16px

### Responsive
- Below 430px: phone frame drops, full-screen mobile app
- Status bar hidden on real mobile
- Bottom sheet radius preserved

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| Flat | No shadow | Default surfaces |
| Card | `0 1px 3px rgba(0,0,0,0.04)` | Content cards |
| FAB | `0 4px 14px rgba(255,107,0,0.35)` | KLH floating button |
| Frame | `0 40px 100px rgba(0,0,0,0.15)` | Phone bezel |
| Sheet overlay | `rgba(0,0,0,0.35)` | Bottom sheet dimming |

## 7. Animation

- Button hover: `scale(1.03)`, 150ms ease
- Button active: `scale(0.97)`
- FAB hover: `scale(1.08)`, 150ms ease
- Bottom sheet: `translateY(100%) → translateY(0)`, 350ms cubic-bezier
- Progress segment: `background 300ms`
- Loading spinner: `rotate 360deg`, 700ms linear infinite

## 8. Do's and Don'ts

### Do
- Use green for completion/success states only
- Use blue for navigation/action CTAs
- Use orange exclusively for KLH audio attention
- Use red exclusively for irreversible/consequential confirmations
- Keep cards at 16px radius, buttons at 10px, pills at 9999px
- Use uppercase + letter-spacing for label text
- Keep shadows minimal — ring or 1px only

### Don't
- Don't use green for primary CTAs (it's for success/done)
- Don't use multiple shadow layers on cards
- Don't use font weights below 400 or above 700
- Don't break the materiality color mapping
- Don't put the KLH button on INFORMATIONAL or NAVIGATIONAL steps
