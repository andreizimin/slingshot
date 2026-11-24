---
parent: high-level-design
prefix: ANA
---

# Analytics

## Context and Design Philosophy

The developer wants two answers from the dashboard: does anyone play, and how do their flights end. Every app on andreizimin.com reports to one shared Umami website, told apart by hostname, so Slingshot adds the shared tag and a small vocabulary of events prefixed with the project name. Umami sets no cookie and keeps no identifier on the device. That is what makes analytics acceptable for a game whose players are children, without a consent banner.

## The Tag

`site/index.html` carries, in its head, the shared tag:

```html
<script defer src="https://cloud.umami.is/script.js" data-website-id="…shared id…"></script>
```

- `defer`, so the tracker never delays the game.
- No `data-domains`: the shared website is split by hostname in the dashboard, so local runs report under their own hostname instead of polluting the live site's numbers.

The tracker reports a page view on load. The game has one page, so views are visits.

## Events

`site/cockpit/analytics.js` exports `track(event, data)`, which calls `window.umami?.track('slingshot_' + event, data)` inside a `try`. When the tracker is blocked, offline or not yet loaded, the call does nothing and the game behaves exactly as without analytics.

| Event | Fired when | Data |
|---|---|---|
| `slingshot_launch` | Play starts from the ready state (the first unpause of a flight) | `planned_dv`: km/s of sideways change planned before launch, one decimal |
| `slingshot_flyby_result` | The sim status changes from `flying` to `departed` (tutorial) | `outcome` (`boost`, `brake` or `none`), `change` (km/s, one decimal), `fuel_left` (%) |
| `slingshot_crash` | The sim status changes from `flying` to `crashed` (tutorial) | `fuel_left` (%) |
| `slingshot_level_start` | The level starts or restarts | none |
| `slingshot_level_end` | A level flight ends | `outcome` (`arrived`, `crashed`, `lost`), `fuel_left` (%), `stars` (0–3) |

The end-of-flight events come from `flightEvents(prevStatus, status, …)` in `site/cockpit/view.js`, a pure function, so "sent once per flight" is unit-tested. The cockpit's frame loop sends whatever it returns.

## What Is Never Sent

Nothing a player types, no names or contact details, nothing from the feedback form (a separate channel), and no cookies. Data is counts only.

## Decisions & Alternatives

| Decision | Chosen | Alternatives Considered | Rationale |
|---|---|---|---|
| Tracker | The shared Umami Cloud website | A Slingshot-only Umami site; Plausible; none | One dashboard for every andreizimin.com app; cookieless, so no consent flow for a children's game. |
| Event prefix | `slingshot_` | Unprefixed names | The website is shared, so names must not collide with other apps. |
| Guard | Optional chaining plus `try` at the call | A queue that replays once the script loads | A blocked tracker should lose events, never hold or break the game. |
| Event set | Launch, flyby result, crash | Every control use | Three events answer "do they play, and how do flights end"; more adds volume, not answers. |

## Open Questions & Future Decisions

### Deferred
1. A short privacy note in the game, if asked for. Nothing is stored on the device, so it is not urgent.

## References

- Umami tracker functions: https://umami.is/docs/tracker-functions
- `docs/high-level-design.md` (Release Stages: beta)
