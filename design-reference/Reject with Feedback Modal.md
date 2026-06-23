---
name: QuotePilot
colors:
  surface: '#0c141f'
  surface-dim: '#0c141f'
  surface-bright: '#323946'
  surface-container-lowest: '#070e19'
  surface-container-low: '#151c27'
  surface-container: '#19202b'
  surface-container-high: '#232a36'
  surface-container-highest: '#2e3541'
  on-surface: '#dce2f3'
  on-surface-variant: '#b9caca'
  inverse-surface: '#dce2f3'
  inverse-on-surface: '#2a313d'
  outline: '#849495'
  outline-variant: '#3a494a'
  surface-tint: '#00dce5'
  primary: '#e9feff'
  on-primary: '#003739'
  primary-container: '#00f5ff'
  on-primary-container: '#006c71'
  inverse-primary: '#00696e'
  secondary: '#adc6ff'
  on-secondary: '#002e6a'
  secondary-container: '#0566d9'
  on-secondary-container: '#e6ecff'
  tertiary: '#fff9f5'
  on-tertiary: '#432c00'
  tertiary-container: '#ffd79e'
  on-tertiary-container: '#835900'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#63f7ff'
  primary-fixed-dim: '#00dce5'
  on-primary-fixed: '#002021'
  on-primary-fixed-variant: '#004f53'
  secondary-fixed: '#d8e2ff'
  secondary-fixed-dim: '#adc6ff'
  on-secondary-fixed: '#001a42'
  on-secondary-fixed-variant: '#004395'
  tertiary-fixed: '#ffddaf'
  tertiary-fixed-dim: '#ffba43'
  on-tertiary-fixed: '#281800'
  on-tertiary-fixed-variant: '#614000'
  background: '#0c141f'
  on-background: '#dce2f3'
  surface-variant: '#2e3541'
typography:
  display-lg:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Geist
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-md:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-xs:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 14px
  headline-lg-mobile:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  container-max: 1440px
  sidebar-width: 240px
  panel-split: 45%
  gutter: 16px
  margin-page: 24px
  stack-xs: 4px
  stack-sm: 8px
  stack-md: 16px
---

## Brand & Style
The design system is engineered for high-velocity decision-making within the AI-driven freelance ecosystem. It targets developers and technical project managers who require a high-density information environment that remains legible and aesthetically sophisticated.

The style is **Modern Corporate with a technical edge**, drawing inspiration from developer-centric tools. It utilizes a deep, monochromatic foundation punctuated by high-vibrancy accents. The interface employs a layered approach:
- **Minimalist Hierarchy:** Content is organized through structural lines and tonal shifts rather than heavy shadows.
- **Subtle Glassmorphism:** Strategic use of backdrop blurs on floating panels and navigation to maintain context.
- **Precision Utility:** Every element is optimized for "data density," ensuring that complex approval workflows are visible at a glance without overwhelming the user.

## Colors
The palette is rooted in a "Deep Space" navy to reduce eye strain during prolonged sessions.
- **Primary Background:** Use `#0B0E14` for the base canvas.
- **Surface Layering:** Use `#161B22` for cards, sidebars, and elevated containers to create subtle depth.
- **Interactive Accents:** Electric Teal (`#00F5FF`) is reserved for primary actions and active states. Use Amber (`#FFB000`) specifically for items requiring human intervention (Agent Pending status).
- **Status Indicators:** Success, Danger, and Info roles use high-chroma variants to ensure they pop against the dark backgrounds. 
- **Borders:** Define structures using `#30363D`. Avoid pure black or high-contrast white dividers.

## Typography
This design system utilizes **Geist** for its neutral, technical appearance and exceptional legibility at small sizes. **JetBrains Mono** is introduced as a secondary font for labels and data points to reinforce the "Agent/Developer" aesthetic.

- **Scale:** The system uses a tight 13px/14px baseline for body text to allow for high data density.
- **Tracking:** Headlines should use slight negative letter-spacing for a more "locked-in" feel. Labels use increased tracking for readability in uppercase.
- **Hierarchy:** Use font weight (Medium 500 to Semi-Bold 600) rather than large jumps in font size to differentiate information levels.

## Layout & Spacing
The layout follows a **Fixed-Fluid Hybrid** model optimized for wide-screen monitors.
- **Sidebars:** A slim 240px fixed navigation stays on the left.
- **Two-Panel Approval View:** For the console experience, use a split-pane layout. The left pane (45%) displays the AI's drafted quote/code, and the right pane (55%) displays the context/client data.
- **Grid:** Use a 12-column grid for dashboard views, but default to Flexbox-based stacks for the approval console to maintain density.
- **Responsive:** On tablet, the two-panel layout stacks vertically. On mobile, the sidebar becomes a bottom-bar or drawer, and font sizes transition to the mobile-specific tokens.

## Elevation & Depth
Depth is communicated through **Tonal Layering** and **Subtle Outlines** rather than traditional drop shadows.
- **Base:** Level 0 is the Deep Navy background.
- **Panels:** Level 1 uses the Surface charcoal with a 1px border (`#30363D`).
- **Overlays/Modals:** Level 2 uses the Surface color with a subtle 20px blur glassmorphism effect and a slightly brighter border (`#444D56`) to simulate proximity.
- **Active Accents:** Use a "Glow" effect for Amber (Warning) and Teal (Primary) items by applying a very low-spread (4px) box-shadow with a 30% opacity of the accent color itself.

## Shapes
The shape language is **Precision-Sharp**. 
- **Standard Radius:** 6px (mapped to `rounded-md`) is the default for buttons, inputs, and cards.
- **Icons/Small Badges:** 4px radius for a tighter, more technical appearance.
- **Full-Pill:** Only used for status "pills" or toggle switches to differentiate them from interactive buttons.

## Components
- **Buttons:** 
  - *Primary:* Electric Teal background, black text, 6px radius. 
  - *Secondary:* Ghost style with `#30363D` border, white text.
- **Status Badges:** Use a "Subtle Fill" approach—10% opacity background of the status color (e.g., Emerald for success) with a 1px solid border of the same color. Text remains 100% opacity.
- **Input Fields:** Darker than the surface (`#0B0E14`), 1px border. On focus, the border transitions to Electric Teal with no glow, just a crisp color change.
- **Cards:** No shadows. Use the Surface color and a `#30363D` border. For "Active" or "Selected" cards, increase the border brightness.
- **Sidebars:** Use a transparent background with a single vertical border on the right to separate from the main content.
- **Data Tables:** Row-based hover states using a slightly lighter navy (`#1C2128`). Use monospaced fonts for numerical data or IDs.