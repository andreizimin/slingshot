# Analytics — EARS Specs

Design: `analytics-design.md` · Prefix: `ANA`

- [x] **ANA-001**: The game page shall load the shared andreizimin.com Umami tracker (`https://cloud.umami.is/script.js`, the shared website ID) with `defer` and without `data-domains`.
- [x] **ANA-002**: When play starts from the ready state, the cockpit shall send `slingshot_launch` with `planned_dv`, the planned sideways change in km/s rounded to one decimal.
- [x] **ANA-003**: When the sim status changes from `flying` to `departed`, the cockpit shall send one `slingshot_flyby_result` with `outcome` (`boost` above +0.05 km/s, `brake` below −0.05 km/s, otherwise `none`), `change` (km/s, one decimal) and `fuel_left` (whole %); when it changes from `flying` to `crashed`, it shall send one `slingshot_crash` with `fuel_left`.
- [x] **ANA-004**: If the Umami tracker is missing, blocked, or throws, then sending an event shall do nothing and the game shall behave exactly as without analytics.
- [x] **ANA-005**: Analytics events shall carry counts and categories only: no player-entered text, no identifiers, and nothing from the feedback form.
- [x] **ANA-006**: The tour shall send its events through the same `track` function with the `slingshot_` prefix (see TOUR-010).

## Verified by hand

`ANA-006` is wiring in `site/cockpit/main.js`: play the tutorial on the dev site and confirm `slingshot_tour_start`, `slingshot_tour_complete` and `slingshot_tour_skip` arrive in Umami under the dev hostname.
