# Accessibility checklist

Applies to anything a person sees or operates. Aim for WCAG 2.1 AA.

## Flow (ux)
- Everything works with the keyboard alone, in a logical tab order, with no keyboard trap.
- Focus is moved on route change, dialog open and close, and returned afterwards.
- Every control has an accessible name; icon-only buttons have a label.
- Forms: each field has a visible label, errors name the field and the fix, and are announced.
- Status changes (loading, saved, error) are announced, not only coloured.
- Empty, loading, error and long-content states exist and read well.
- Time limits and auto-moving content can be paused or extended.

## Look (ui)
- Text contrast is at least 4.5:1 (3:1 for large text and UI borders).
- Meaning is never carried by colour alone.
- A visible focus indicator on every focusable element.
- Touch targets are at least 24x24 CSS px, and nothing breaks at 200% zoom or 320px width.
- Images have useful alt text, or empty alt when decorative.
- Motion respects `prefers-reduced-motion`.
- Semantics first: real buttons, links, headings and landmarks before ARIA.
