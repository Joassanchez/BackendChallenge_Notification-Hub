# Tasks: HTTP Input Validation with Zod

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~840–990 (additions + deletions) |
| 800-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 |
| Delivery strategy | auto-forecast |
| Chain strategy | feature-branch-chain (PR 1 done) |

Decision needed before apply: No (PR 1 complete)
Chained PRs recommended: Yes (PR 1 done, 2 remaining)
Chain strategy: feature-branch-chain (PR 1 done)
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Wrapper + admin-metrics + admin-reporting | PR 1 | Foundation + 2 simplest modules; ~277 lines |
| 2 | notification-targets + messages | PR 2 | Core notification domain; ~540 lines |
| 3 | auth + cleanup | PR 3 | 422 error mode + deprecated helper removal; ~170 lines |

---

## Phase 1: Foundation

- [x] **T001** Install zod dependency
  - Add `zod` to `package.json` via `npm install zod`
  - Dependencies: none
  - Acceptance: `zod` in `node_modules`, `npm ls zod` succeeds
  - Files: `package.json`, `package-lock.json`
  - Estimated: ~2 lines

- [x] **T002** Create `src/shared/http/validation-wrapper.ts`
  - Implement `validateBody`, `validateQuery`, `validateParams`, `validateHeaders`, `runValidation`, `mapZodToAppError`
  - Export `ValidationOptions` type with `mode: "bad-request" | "validation-error"`, optional `message` and `details`
  - `bad-request` mode: `badRequest(options.message ?? firstIssue.message)`
  - `validation-error` mode: `unprocessable(options.message ?? "Validation failed", options.details ?? { errors: issueMessages })`
  - Dependencies: T001
  - Acceptance: file compiles, exports 4 validate functions + type
  - Files: `src/shared/http/validation-wrapper.ts` (create)
  - Estimated: ~50 lines

- [x] **T003** Write validation-wrapper unit tests
  - Test both error modes with synthetic Zod schemas
  - Assert: valid input returns typed data, invalid input throws AppError with correct status/code/message/details
  - Test `message` and `details` overrides
  - Dependencies: T002
  - Acceptance: `npx vitest run tests/validation-wrapper.test.ts` — all pass
  - Files: `tests/validation-wrapper.test.ts` (create)
  - Estimated: ~60 lines

## Phase 2: admin-metrics (simplest module)

- [x] **T004** Create `src/modules/administration/metrics/admin-metrics.schemas.ts`
  - `getMetricsQuerySchema`: `z.object({}).superRefine()` rejecting any key → `"Unsupported query parameter: {key}"`
  - Dependencies: T002
  - Acceptance: schema rejects `{ userId: "x" }`, passes `{}`
  - Files: `src/modules/administration/metrics/admin-metrics.schemas.ts` (create)
  - Estimated: ~10 lines

- [x] **T005** Refactor `admin-metrics.controller.ts` to use `validateQuery`
  - Replace manual `assertSupportedKeys` call with `validateQuery(getMetricsQuerySchema, req.query, { mode: "bad-request" })`
  - Dependencies: T004
  - Acceptance: `GET /admin/metrics?foo=bar` returns 400 `"Unsupported query parameter: foo"`
  - Files: `src/modules/administration/metrics/admin-metrics.controller.ts` (modify)
  - Estimated: ~8 lines

- [x] **T006** Remove `assertSupportedKeys` from `admin-metrics.service.ts`
  - Remove `assertSupportedKeys` helper and `query` parameter from `getMetrics()`
  - Dependencies: T005
  - Acceptance: `npx vitest run` — metrics tests pass; service has zero input validation
  - Files: `src/modules/administration/metrics/admin-metrics.service.ts` (modify)
  - Estimated: ~12 lines

## Phase 3: admin-reporting

- [x] **T007** Create `src/modules/administration/reporting/admin-reporting.schemas.ts`
  - `listMessagesQuerySchema`: optional userId (broad UUID, `invalid_type_error`), status, provider, from/to (two chained `.refine()` — timezone then date validity)
  - `.superRefine()` for allowed-keys: `Set(["userId","status","provider","from","to"])`
  - Dependencies: T002
  - Acceptance: schema rejects unknown keys, validates UUIDs, enforces from≤to, two-step date errors
  - Files: `src/modules/administration/reporting/admin-reporting.schemas.ts` (create)
  - Estimated: ~30 lines

- [x] **T008** Refactor `admin-reporting.controller.ts`
  - Replace manual query parsing with `validateQuery(listMessagesQuerySchema, req.query, { mode: "bad-request" })`
  - Pass typed `AdminReportingMessageFilters` to service
  - Dependencies: T007
  - Acceptance: integration tests for reporting error paths pass unchanged
  - Files: `src/modules/administration/reporting/admin-reporting.controller.ts` (modify)
  - Estimated: ~15 lines

- [x] **T009** Remove input validation from `admin-reporting.service.ts`
  - Remove `readMessageFilters`, `assertSupportedKeys`, `readSingletonQueryParam`, `readOptionalUuid`, `readOptionalMessageStatus`, `readOptionalProviderCode`, `readOptionalUtcDate`
  - Service receives typed `AdminReportingMessageFilters` DTO
  - Dependencies: T008
  - Acceptance: service has zero `typeof`/regex input checks; typecheck passes
  - Files: `src/modules/administration/reporting/admin-reporting.service.ts` (modify)
  - Estimated: ~55 lines

- [x] **T010** Adjust admin-reporting tests
  - Remove input-validation test cases from `admin-reporting.service.test.ts` (assertSupportedKeys, date parsing, UUID format)
  - Error-path assertions in `admin-reporting.integration.test.ts` stay unchanged
  - Dependencies: T009
  - Acceptance: `npx vitest run tests/admin-reporting.service.test.ts tests/admin-reporting.integration.test.ts` — all pass
  - Files: `tests/admin-reporting.service.test.ts` (modify), `tests/admin-reporting.integration.test.ts` (verify)
  - Estimated: ~35 lines

## Phase 4: notification-targets

- [x] **T011** Create `src/modules/notifications/notification-targets/notification-target.schemas.ts`
  - `createTargetBodySchema`: provider+targetType+externalTargetId required, `.strict()`, reject `providerConnectionId`, module-local `validateProviderTargetType` via `.refine()`
  - `updateTargetBodySchema`: only displayName/metadata, `.strict()`, reject forbidden update keys, require ≥1 allowed key
  - `targetIdParamsSchema`: broad UUID pattern
  - Dependencies: T002
  - Acceptance: schemas produce exact error strings from spec scenarios
  - Files: `src/modules/notifications/notification-targets/notification-target.schemas.ts` (create)
  - Estimated: ~50 lines

- [x] **T012** Refactor `notification-target.controller.ts`
  - Add `validateBody`/`validateParams` calls with schemas; stop passing raw `request.body` to service
  - Build typed DTOs for create/update/getById
  - Dependencies: T011
  - Acceptance: integration tests for targets error paths pass unchanged
  - Files: `src/modules/notifications/notification-targets/notification-target.controller.ts` (modify)
  - Estimated: ~35 lines

- [x] **T013** Remove input validation from `notification-target.service.ts`
  - Remove `readBodyRecord`, `readProviderCode`, `readTargetType`, `validateProviderTargetType`, `readRequiredString`, `readOptionalString`, `readOptionalJsonObject`, `readTargetId`, forbidden-keys checks
  - Change input types from `unknown` to typed DTOs
  - Dependencies: T012
  - Acceptance: service has zero input-shape validation; typecheck passes
  - Files: `src/modules/notifications/notification-targets/notification-target.service.ts` (modify)
  - Estimated: ~90 lines

- [x] **T014** Adjust notification-target tests
  - Remove input-validation test cases from `provider-target.service.test.ts` (readBodyRecord, readProviderCode, forbidden-keys, etc.)
  - Error-path assertions in `providers-notification-targets.integration.test.ts` stay unchanged
  - Dependencies: T013
  - Acceptance: `npx vitest run tests/provider-target.service.test.ts tests/providers-notification-targets.integration.test.ts` — all pass
  - Files: `tests/provider-target.service.test.ts` (modify), `tests/providers-notification-targets.integration.test.ts` (verify)
  - Estimated: ~45 lines

## Phase 5: messages

- [x] **T015** Create `src/modules/notifications/messages/message.schemas.ts`
  - `createMessageBodySchema`: content non-empty, destinations ≥1 with `.superRefine()` for nested provider/UUID/duplicate checks with path-prefixed messages
  - `listMessagesQuerySchema`: optional status/provider/from/to with `.strict()`, from≤to refine
  - `messageIdParamsSchema`: RFC v1-5 UUID
  - `idempotencyKeyHeaderSchema`: optional non-empty, `.passthrough()`
  - Dependencies: T002
  - Acceptance: all spec error scenarios produce exact messages
  - Files: `src/modules/notifications/messages/message.schemas.ts` (create)
  - Estimated: ~60 lines

- [x] **T016** Refactor `message.controller.ts`
  - Replace `readBodyRecord`/`readQueryParam`/`readRouteParam` with `validateBody`/`validateQuery`/`validateParams`/`validateHeaders`
  - Build typed DTOs for create/list/getById
  - Dependencies: T015
  - Acceptance: integration tests for messages error paths pass unchanged
  - Files: `src/modules/notifications/messages/message.controller.ts` (modify)
  - Estimated: ~45 lines

- [x] **T017** Remove input validation from `message.service.ts`
  - Remove `readContent`, `readDestinations`, `readDestination`, `readProviderCode`, `readUuid`, `readDate`, `readListFilters`, `normalizeIdempotencyKey`, `readMessageStatus`, `isProviderCode`, `isMessageStatus`, `uuidPattern`
  - Change `CreateMessageInput` fields from `unknown` to typed (`string`, `NormalizedDestination[]`)
  - Keep business rules: idempotency, rate limiting, delivery
  - Dependencies: T016
  - Acceptance: service has zero input-shape validation; ~120 lines removed
  - Files: `src/modules/notifications/messages/message.service.ts` (modify)
  - Estimated: ~130 lines

- [x] **T018** Adjust message tests
  - Remove input-validation test cases from `message.service.test.ts` (readContent, readDestinations, readUuid, readDate, normalizeIdempotencyKey)
  - Add edge-case assertions to `messages.integration.test.ts` if needed (from>to, forbidden keys)
  - Dependencies: T017
  - Acceptance: `npx vitest run tests/message.service.test.ts tests/messages.integration.test.ts` — all pass
  - Files: `tests/message.service.test.ts` (modify), `tests/messages.integration.test.ts` (modify)
  - Estimated: ~85 lines

## Phase 6: auth

- [x] **T019** Create `src/modules/identity/auth/auth.schemas.ts`
  - `registerBodySchema`: username required, email optional+valid, password required, `.strict()`, mode `validation-error`
  - `loginBodySchema`: username/email/identifier ≥1 required via `.refine()`, password required, `.strict()`, mode `validation-error`
  - Dependencies: T002
  - Acceptance: schemas produce exact 422 error strings from spec
  - Files: `src/modules/identity/auth/auth.schemas.ts` (create)
  - Estimated: ~30 lines

- [x] **T020** Refactor `auth.controller.ts`
  - Replace `requireObjectBody`/`readString`/`readOptionalString` with `validateBody` + schemas
  - Use `mode: "validation-error"` with explicit `message` overrides (`"Invalid registration payload"`, `"Invalid login payload"`)
  - Add identifier resolution logic (username || email || identifier)
  - Dependencies: T019
  - Acceptance: integration tests for auth error paths pass unchanged
  - Files: `src/modules/identity/auth/auth.controller.ts` (modify)
  - Estimated: ~45 lines

- [x] **T021** Remove input validation from `auth.service.ts`
  - Remove `validateRegisterInput`, `validateLoginInput`
  - Keep `normalizeOptionalEmail`; input types unchanged
  - Dependencies: T020
  - Acceptance: service has zero input-shape validation; typecheck passes
  - Files: `src/modules/identity/auth/auth.service.ts` (modify)
  - Estimated: ~40 lines

- [x] **T022** Adjust auth tests
  - Remove `validateRegisterInput`/`validateLoginInput` test cases from `auth.service.test.ts`
  - Error-shape assertions in `auth-roles.integration.test.ts` stay unchanged
  - Dependencies: T021
  - Acceptance: `npx vitest run tests/auth.service.test.ts tests/auth-roles.integration.test.ts` — all pass
  - Files: `tests/auth.service.test.ts` (modify), `tests/auth-roles.integration.test.ts` (verify)
  - Estimated: ~35 lines

## Phase 7: Cleanup & Verification

- [x] **T023** Remove deprecated manual validation helpers
  - Scan for and remove any remaining `readString`, `readBodyRecord`, `readQueryParam`, `readRouteParam`, `readOptionalString`, `readRequiredString`, `readOptionalJsonObject` from shared utilities (if any exist outside already-cleaned services)
  - Dependencies: T006, T009, T013, T017, T021
  - Acceptance: `grep -r "readBodyRecord\|readString\|readQueryParam" src/` returns zero hits
  - Files: any shared utility files containing deprecated helpers
  - Estimated: ~20 lines

- [x] **T024** Full verification pass
  - Run `npm run typecheck` — zero errors
  - Run `npx vitest run` — full test suite passes
  - Verify Zod imports only in `validation-wrapper.ts` and `*.schemas.ts`
  - Verify error contract: spot-check 5+ error paths return identical responses to pre-migration
  - Dependencies: T023
  - Acceptance: all commands exit 0; no Zod import violations
  - Files: none (verification only)
  - Estimated: 0 lines
