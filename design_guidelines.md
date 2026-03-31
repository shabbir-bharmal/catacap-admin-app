# CATA Cap Website Redesign - Design Guidelines

## Design Approach
**Reference-Based Design**: Inspired by Fude Theme (Home-3) - a modern, clean aesthetic with floating animated elements, subtle parallax effects, and professional polish suited for impact investing.

## Color Palette
- **Primary Colors**: Greens and blues reflecting impact investing, sustainability, and trust
- **Accent Colors**: Gradient effects for hero title text
- **Overlay Treatment**: Slightly blurred/darkened background for hero image to ensure text readability

## Typography Hierarchy

**Hero Title**: "10x your impact"
- Size: 60-80px (desktop), scale down proportionally for tablet/mobile
- Weight: Bold
- Treatment: Gradient text effect with subtle animation

**Hero Subtitle**: "It's philanthropy with purpose and returns"
- Size: 24-32px (desktop)
- Style: Elegant serif or modern sans-serif
- Placement: Directly under main title

**Navigation**: Clean, modern sans-serif
**Body Text**: Professional sans-serif for readability

## Layout System

**Spacing Primitives**: Use Tailwind units of 4, 6, 8, 12, 16, 20 for consistent rhythm

**Responsive Breakpoints**:
- Mobile: <768px - Single column, hamburger menu, 2-3 floating icons, smaller text
- Tablet: 768px-1023px - Condensed navigation, medium text, 3-4 floating icons
- Desktop: 1024px+ - Full navigation, large hero text, 5-6 floating icons
- Large Desktop: 1440px+ - Maximum width container with generous spacing

## Component Library

### Header (Sticky)
- **Left**: CATA Cap logo
- **Center**: Horizontal navigation menu
  - Find Investments
  - Communities
  - About Us (with dropdown: "How we work", "Raise Money")
- **Right**: Login button + Sign Up button (primary CTA styling)
- **Mobile**: Hamburger menu with slide-out/overlay navigation

### Hero Section
- **Height**: Full viewport (100vh) for maximum impact
- **Background**: Large hero image from CATA Cap with overlay treatment for text contrast
- **Content Structure** (centered, vertical stack):
  - Main title with gradient effect
  - Subtitle below title
  - "Find Investments" CTA button with hover animation (scale/glow)
- **Floating Elements**: 5-6 minimalist vector icons positioned throughout hero, continuously animating

### Floating Vector Icons
**Categories** (simple, minimalist SVG style):
1. **Healthcare**: Medical cross or heart with pulse line
2. **Education**: Graduation cap or open book
3. **Environment**: Leaf or globe
4. **Community**: Connected people silhouettes or hands
5. **Innovation**: Lightbulb or rocket ship

**Animation Behavior**:
- Gentle up/down drift (15-20 second cycles)
- Slight horizontal movement
- Subtle pulsing scale (0.95 to 1.05)
- Optional opacity fade (0.7 to 1.0)
- Z-index layering for depth perception
- Continuous, organic movement patterns

### Buttons
- **Primary CTA**: Large size, primary color, hover effects (scale 1.05, glow/shadow)
- **Secondary** (Login): Outlined or ghost style
- **Blurred Background**: When placed over images, buttons should have backdrop blur effect

## Animation Strategy

**Parallax Scrolling**: Hero elements move at different speeds creating depth
**Smooth Scroll**: Implement smooth scrolling behavior across entire site
**Floating Animation**: CSS keyframes for continuous icon movement
**Hover States**: Subtle scale and glow effects on interactive elements
**Performance**: Use transform and opacity for animations, avoid layout thrashing

## Images

**Hero Image**:
- Large, high-quality background image representing impact investing, community development, or sustainability
- Placement: Full-width, full-height behind hero content
- Treatment: Slight blur (2-4px) with dark overlay (opacity 0.3-0.5) for text contrast
- Content: Should evoke positive social impact - could show diverse communities, sustainable projects, educational settings, or collaborative environments

## Accessibility
- Maintain color contrast ratios for text over images
- Ensure navigation is keyboard accessible
- Provide focus states for all interactive elements
- Semantic HTML structure for screen readers

## Key Design Principles
1. **Modern & Clean**: Minimal clutter, generous whitespace
2. **Motion with Purpose**: Animations enhance experience without distracting
3. **Professional Polish**: Impact investing audience expects sophistication
4. **Performance-First**: Optimized animations, lazy loading for smooth experience
5. **Depth & Dimension**: Layered floating elements create visual interest