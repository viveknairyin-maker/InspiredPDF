---
name: Monochrome Precision
colors:
  surface: '#f9f9f9'
  surface-dim: '#dadada'
  surface-bright: '#f9f9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f3'
  surface-container: '#eeeeee'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e2e2e2'
  on-surface: '#1b1b1b'
  on-surface-variant: '#4c4546'
  inverse-surface: '#303030'
  inverse-on-surface: '#f1f1f1'
  outline: '#7e7576'
  outline-variant: '#cfc4c5'
  surface-tint: '#5e5e5e'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1b1b1b'
  on-primary-container: '#848484'
  inverse-primary: '#c6c6c6'
  secondary: '#5d5f5f'
  on-secondary: '#ffffff'
  secondary-container: '#dfe0e0'
  on-secondary-container: '#616363'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#1b1b1b'
  on-tertiary-container: '#848484'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2e2e2'
  primary-fixed-dim: '#c6c6c6'
  on-primary-fixed: '#1b1b1b'
  on-primary-fixed-variant: '#474747'
  secondary-fixed: '#e2e2e2'
  secondary-fixed-dim: '#c6c6c7'
  on-secondary-fixed: '#1a1c1c'
  on-secondary-fixed-variant: '#454747'
  tertiary-fixed: '#e2e2e2'
  tertiary-fixed-dim: '#c6c6c6'
  on-tertiary-fixed: '#1b1b1b'
  on-tertiary-fixed-variant: '#474747'
  background: '#f9f9f9'
  on-background: '#1b1b1b'
  surface-variant: '#e2e2e2'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: '800'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-bold:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  gutter: 1px
  margin-mobile: 16px
  margin-desktop: 32px
---

## Brand & Style

The design system is built on a philosophy of absolute clarity and functional reduction. It targets professionals who require a high-performance, distraction-free environment for document manipulation. By stripping away all color, grays, and decorative effects, the interface achieves a "utility-first" aesthetic that prioritizes content over chrome.

The style is a fusion of **Hard-Edge Minimalism** and **Swiss International Style**. It relies on heavy structural borders, intentional whitespace, and high-contrast typography to create hierarchy. Every UI element exists in a binary state—black or white—ensuring the user's focus remains entirely on the PDF content.

## Colors

The palette is strictly binary. There are no shades of gray or tonal variations. 

- **Primary (#000000):** Used for all text, borders, iconography, and primary button fills.
- **Surface (#FFFFFF):** Used for the canvas, modal backgrounds, and secondary button fills.
- **Interactive States:** Interaction is signaled through color inversion. An element that is white with a black border becomes solid black with white text upon hover or activation. 
- **Content:** The only non-monochrome elements allowed within the interface are the PDF documents themselves, which are treated as external objects hosted within this rigid frame.

## Typography

This design system utilizes **Inter** for its systematic, neutral character. Hierarchy is established through extreme weight contrasts (Extra Bold for headers vs. Regular for body) rather than color or size alone.

- **Headlines:** Set with tight tracking (-0.01em to -0.02em) to create a dense, "ink-on-paper" feel.
- **Labels:** Small caps or bold uppercase labels are used for UI controls to distinguish functional metadata from document content.
- **Clarity:** Line heights are generous (1.5x for body text) to compensate for the high-contrast strain on the eyes, ensuring long-term legibility.

## Layout & Spacing

The layout follows a **Fixed Grid** philosophy rooted in architectural blueprints. All containers are separated by 1px black lines, creating a paneled appearance.

- **The Grid:** A 12-column system is used for the dashboard, while the editor view uses a "center-stage" model with fixed-width sidebars (240px or 320px).
- **The 1px Rule:** Instead of traditional margins between sections, 1px borders act as the primary structural dividers. 
- **Internal Padding:** Generous internal padding (24px+) is required within white containers to prevent the black text from feeling claustrophobic against the high-contrast borders.
- **Mobile:** On small screens, sidebars collapse into full-width stacked panels, maintaining the 1px divider between every logical vertical section.

## Elevation & Depth

This design system is strictly 2D. It rejects the concept of Z-axis simulation.

- **No Shadows:** Drop shadows and inner shadows are prohibited.
- **Tonal Layering:** Hierarchy is achieved by nesting. A white container sits inside a black-bordered parent. 
- **The "Overlay" Exception:** Modals or dropdowns do not use shadows to float. They use a thick 2px black border (instead of 1px) to indicate they are positioned above the base layer, or they use a solid black "block" offset (1:1 shadow) where a black rectangle is placed exactly 4px behind the white container.
- **Occlusion:** When a modal is active, the background does not blur; it remains sharp but can be obscured by a solid white or stippled black-and-white pattern overlay.

## Shapes

The shape language is rigid and industrial. 

- **Corner Radius:** A universal 4px radius is applied to buttons, input fields, and small UI components to provide a subtle "human" touch without breaking the minimalist aesthetic.
- **Large Containers:** Main editor panels and viewport containers use 0px (sharp) corners to emphasize the structural frame of the application.
- **Icons:** Must be stroke-based, 2px weight, with sharp or slightly rounded caps to match the font's geometry.

## Components

### Buttons
- **Primary:** Solid black fill, white text, 4px radius. No border. On hover: Invert to white fill, black text, 1px black border.
- **Secondary:** White fill, 1px black border, black text, 4px radius. On hover: Invert to solid black fill, white text.

### Input Fields
- **Default:** White background, 1px black border, 4px radius. Text is 16px Inter.
- **Focus:** The 1px border thickens to 2px. No "glow" or color change.

### Chips / Tags
- Small, 1px black border, 4px radius. Use `label-bold` typography.

### Lists & Tables
- Items are separated by 1px horizontal lines. 
- Selected state: The entire row inverts to solid black with white text.

### Cards
- White background, 1px black border, 0px or 4px radius. 
- Headers within cards are separated by a 1px internal horizontal line.

### Checkboxes & Radios
- **Checkbox:** Square, 1px black border. When checked, a solid black "X" or a solid black fill is used.
- **Radio:** Circle, 1px black border. When selected, a smaller solid black concentric circle is used.