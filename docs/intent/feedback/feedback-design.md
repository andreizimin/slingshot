---
parent: high-level-design
prefix: FEED
---

# Feedback

## Context and Design Philosophy

Players and parents should be able to suggest an idea or report a bug without leaving the game. Slingshot uses the shared feedback platform at feedback.andreizimin.com: one hosted script tag, rendered in a Shadow DOM so it cannot clash with the game's styles. Submissions land in the shared Linear project labelled `slingshot`, and in Slack.

## The Tag

`site/index.html` loads, just before `</body>`:

```html
<script src="https://feedback.andreizimin.com/widget.js" data-project="slingshot"
        data-accent="#0891b2" data-offset="calc(76px + env(safe-area-inset-bottom, 0px))" defer></script>
```

- `data-project="slingshot"` labels every submission.
- `data-offset` lifts the floating button above the bottom row of time buttons, which spans most of a phone's width.
- `data-accent` matches the game's cyan family while keeping white text readable.

## Keeping Game Input Out of the Form

The game listens for keys on the whole window: arrows steer, Space pauses, 1 to 4 set the speed, R restarts. Keys typed in the feedback form would otherwise reach those handlers. The widget fires `feedback:open` and `feedback:close` on `window`; while the form is open, the cockpit ignores every game key and releases any held arrow or drag.

## Decisions & Alternatives

| Decision | Chosen | Alternatives Considered | Rationale |
|---|---|---|---|
| Channel | Shared feedback platform | A Slingshot-only form; email link | One intake for every app, already wired to Linear and Slack. |
| Launcher | The widget's own floating button, offset upward | `data-launcher="none"` plus an in-game button | No extra HUD control for kids to learn; the offset keeps it clear of the time buttons. |
| Key handling | Ignore game keys while the form is open | Stop propagation inside the widget | The widget's events are its documented contract; the game owns its own keys. |

## References

- Feedback platform embed guide (`feedback-platform/EMBED.md`)
- `docs/high-level-design.md` (Release Stages: beta)
