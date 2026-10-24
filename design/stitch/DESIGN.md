---
name: Nocturne Velocity
source: Google Stitch — proyecto "TicketFr Ticketing Platform" (projects/9303758242817309582), asset dab38c4eb1cd4c6085c35369267333b6
colors:
  surface: '#0f131c'
  surface-dim: '#0f131c'
  surface-bright: '#353943'
  surface-container-lowest: '#0a0e17'
  surface-container-low: '#181b25'
  surface-container: '#1c1f29'
  surface-container-high: '#262a34'
  surface-container-highest: '#31353f'
  on-surface: '#dfe2ef'
  on-surface-variant: '#c7c4d8'
  inverse-surface: '#dfe2ef'
  inverse-on-surface: '#2c303a'
  outline: '#918fa1'
  outline-variant: '#464555'
  surface-tint: '#c3c0ff'
  primary: '#c3c0ff'
  on-primary: '#1d00a5'
  primary-container: '#4f46e5'
  on-primary-container: '#dad7ff'
  inverse-primary: '#4d44e3'
  secondary: '#4cd7f6'
  on-secondary: '#003640'
  secondary-container: '#03b5d3'
  on-secondary-container: '#00424e'
  tertiary: '#4edea3'
  on-tertiary: '#003824'
  tertiary-container: '#006e4b'
  on-tertiary-container: '#67f4b7'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c3c0ff'
  on-primary-fixed: '#0f0069'
  on-primary-fixed-variant: '#3323cc'
  secondary-fixed: '#acedff'
  secondary-fixed-dim: '#4cd7f6'
  on-secondary-fixed: '#001f26'
  on-secondary-fixed-variant: '#004e5c'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#0f131c'
  on-background: '#dfe2ef'
  surface-variant: '#31353f'
typography:
  display-lg: { fontFamily: Inter, fontSize: 48px, fontWeight: '700', lineHeight: 56px, letterSpacing: -0.025em }
  display-lg-mobile: { fontFamily: Inter, fontSize: 36px, fontWeight: '700', lineHeight: 44px, letterSpacing: -0.02em }
  headline-xl: { fontFamily: Inter, fontSize: 32px, fontWeight: '700', lineHeight: 40px, letterSpacing: -0.02em }
  headline-xl-mobile: { fontFamily: Inter, fontSize: 26px, fontWeight: '700', lineHeight: 34px, letterSpacing: -0.015em }
  headline-lg: { fontFamily: Inter, fontSize: 24px, fontWeight: '600', lineHeight: 32px, letterSpacing: -0.015em }
  headline-md: { fontFamily: Inter, fontSize: 20px, fontWeight: '600', lineHeight: 28px, letterSpacing: -0.01em }
  title-sm: { fontFamily: Inter, fontSize: 16px, fontWeight: '600', lineHeight: 24px, letterSpacing: -0.005em }
  body-lg: { fontFamily: Inter, fontSize: 16px, fontWeight: '400', lineHeight: 24px, letterSpacing: 0em }
  body-md: { fontFamily: Inter, fontSize: 14px, fontWeight: '400', lineHeight: 20px, letterSpacing: 0em }
  body-sm: { fontFamily: Inter, fontSize: 12px, fontWeight: '400', lineHeight: 16px, letterSpacing: 0.01em }
  label-md: { fontFamily: Inter, fontSize: 12px, fontWeight: '600', lineHeight: 16px, letterSpacing: 0.025em }
  label-xs: { fontFamily: Inter, fontSize: 10px, fontWeight: '700', lineHeight: 14px, letterSpacing: 0.05em }
rounded: { sm: 0.125rem, DEFAULT: 0.25rem, md: 0.375rem, lg: 0.5rem, xl: 0.75rem, full: 9999px }
spacing:
  gutter: 1.5rem
  gutter-sm: 0.75rem
  gutter-lg: 2rem
  margin: 1.5rem
  margin-sm: 1rem
  margin-lg: 3rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system establishes a high-performance, dark-mode-first environment tailored for dual-sided ticketing ecosystems: mission-critical promoter backoffices and fast, frictionless attendee portals. The interface conveys structural authority, live operational precision, and premium event atmosphere.

The aesthetic blends **Modern Technical SaaS** with subtle **Cyber-Atmospheric Depth**. Surfaces are deep obsidian and navy, illuminated by vivid electric violet and cyan accents that provide immediate clarity under high cognitive loads. High-contrast typography and razor-sharp data boundaries eliminate ambiguity across high-volume ticketing dashboards, real-time access gates, and checkout flows.

## Colors

- **Canvases & Substrates:** Deep base `#090d16` for canvas foundations, moving to `#0b0f19` for elevated page containers.
- **Surfaces & Cards:** Level 1 surfaces use `#111827`; Level 2 interactive/nested panels use `#141c2e`.
- **Structural Borders:** Subtle internal dividers use `#232f48`; higher-emphasis structural borders and active interactive boundaries use `#2d3d5e`.
- **Primary Indigo/Violet:** `#4f46e5` drives primary actions, conversion focal points, and focus states, transitioning to `#6366f1` on hover.
- **Secondary Cyan:** `#06b6d4` highlights secondary metrics, real-time live events, attendee perks, and scan confirmation signals.
- **Functional Semantics:** Success `#10b981` · Warning `#f59e0b` · Danger `#ef4444`.
- **Text & Foreground:** Primary body text `#f8fafc`, secondary metadata `#94a3b8`, muted placeholders `#64748b`.

## Typography

Built on **Inter**. Tabular figures (`tnum`) must be enforced across monetary tables, live capacities, seat tiers and counters. Uppercase micro-type with tracking (`0.05em`) is reserved for status badges, ticket verification states and technical metadata. Titles above 24px use tight negative tracking.

## Layout & Spacing

8pt base grid, 12-column fluid system:

- **Desktop (1280px+):** 12 columns, 32px gutter, 48px margin. Backoffice sidebar docked at 260px; max content container 1600px.
- **Tablet (768–1279px):** 8 columns, 24px gutter/margin. Sidebar collapses to a 64px icon rail or drawer. KPI clusters go from 4 columns to 2x2.
- **Mobile (<768px):** 4 columns, 12px gutter, 16px margin. Single-column streams; table rows become cards; checkout summary pinned to the bottom.

## Elevation & Depth

1. **Substrate (Z0):** flat `#090d16`.
2. **Surface Level 1 (Z1):** `#111827` with 1px `#232f48` stroke, no shadow.
3. **Surface Level 2 (Z2 — modals, dropdowns, hovered cards):** `#141c2e` with `#2d3d5e` border and `0 12px 32px -4px rgba(0,0,0,0.6)`.
4. **Accent Glow (focus/active):** `0 0 0 3px rgba(79,70,229,0.25)`.
5. **Backdrop blurs:** `backdrop-filter: blur(12px)` over 75% `#090d16`.

## Shapes

Badges/tags 4px · inputs/buttons 6–8px · cards/tables/modals 8px (12px max for floating modals). Pills only for toggle switches and live indicators.

## Components

- **Buttons:** Primary `#4f46e5` → hover `#6366f1`, focus ring `rgba(79,70,229,0.35)`. Secondary `#141c2e` + border `#2d3d5e`, hover `#1e293b` + border `#4f46e5`. Danger `rgba(239,68,68,0.1)` + text `#ef4444` + border `rgba(239,68,68,0.25)`, hover fills `#ef4444`.
- **Badges (label-xs, uppercase):** Success / Warning / Danger use 12% fill, 30% border and the solid hue as text. Live uses cyan with a pulse dot.
- **Inputs:** `#0b0f19` background, `#232f48` border, `#f8fafc` text, `#64748b` placeholder; focus border `#4f46e5` + violet glow.
- **Switch:** 38x20 track `#232f48`, active `#4f46e5`, 16px white thumb.
- **Data tables:** header `#0b0f19` with `#2d3d5e` bottom border and label-xs uppercase `#94a3b8`; rows `#111827` separated by `#232f48`, hover `#141c2e`; numerics right-aligned with tabular numerals.
- **KPI cards:** `#111827`, 1px `#232f48`, 24px padding, label-md `#94a3b8` + trend chip, figure in headline-xl `tnum`, 2px accent bar at the bottom.
- **Ticket passes & QR cards:** perforated divider (dashed 1px `#2d3d5e`); artwork + metadata on top; QR on a `#ffffff` substrate with 8px padding.
