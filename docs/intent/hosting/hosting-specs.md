# Hosting — EARS Specs

Design: `hosting-design.md` · Prefix: `HOST`

- [ ] **HOST-001**: The repository shall keep every served file under `site/`, and the hosting configuration shall upload only `site/`.
- [ ] **HOST-002**: When the developer runs `npm run dev`, the project shall serve `site/` over HTTP at `http://localhost:5173` using `npx -y serve@14 site -l 5173`.
- [ ] **HOST-003**: When the developer runs `npm test`, the project shall run all suites in `tests/` with `node --test`.
- [ ] **HOST-004**: When the developer runs `npm run deploy`, the project shall run `npm test` and, only if it passes, run `sst deploy --stage production`.
- [ ] **HOST-005**: The SST configuration shall define one `sst.aws.StaticSite` named `Slingshot` with `path: "site"`, no build command, in AWS region `us-east-1`.
- [ ] **HOST-006**: Where the SST stage is `production`, the SST configuration shall attach the custom domain `slingshot.andreizimin.com` and set removal to `retain`; on any other stage it shall attach no domain and set removal to `remove`.
- [ ] **HOST-007**: The SST configuration shall serve every uploaded file with `Cache-Control: no-cache`.
- [ ] **HOST-008**: The project shall pin SST as a dev dependency at `^3.17`.
- [ ] **HOST-009**: Before the first production deploy, the developer shall confirm that Route 53 has no existing `slingshot.andreizimin.com` record and the parent site has no wildcard alias that would conflict; if one exists, the deploy shall not proceed until the conflict is resolved.
- [ ] **HOST-010**: A production deploy shall happen only after the developer has played the local build from `npm run dev` and approved it.
