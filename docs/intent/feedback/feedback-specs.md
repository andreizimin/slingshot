# Feedback — EARS Specs

Design: `feedback-design.md` · Prefix: `FEED`

- [x] **FEED-001**: The game page shall load the shared feedback widget from `https://feedback.andreizimin.com/widget.js` with `data-project="slingshot"`, deferred, with `data-offset` lifting its button above the time buttons.
- [x] **FEED-002**: While the feedback form is open (between the widget's `feedback:open` and `feedback:close` events), the cockpit shall ignore all game keys, and when the form opens it shall release any held arrow or drag.

## Verified by hand

`FEED-002` depends on the live widget firing `feedback:open` and `feedback:close` in a real browser: open the form on the dev site, type arrows, Space and R, and confirm the ship does not react.
