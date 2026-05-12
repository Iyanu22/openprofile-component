# Components Module — Activation & Reorder

NestJS + TypeORM implementation of the two endpoints from the RFC.

## Run

```bash
npm install
npm test
```

Expect 13 passing tests in `test/components/components.service.spec.ts`.

## Layout

```
src/
  modules/components/
    components.controller.ts          PATCH /:id, PUT /order
    components.service.ts             toggle + transactional reorder
    components.module.ts
    dto/
      patch-component.dto.ts          forbids display_order
      reorder-components.dto.ts       UUID array, max 100, unique
    entities/
      component.entity.ts             mirrors DBML
      profile.entity.ts               read-only stub from profiles module
    exceptions/
      component-set-mismatch.exception.ts   409 + missing/extra diff
  common/
    guards/jwt-auth.guard.ts          STUB — replace with project guard
    decorators/current-user.decorator.ts   STUB — replace
  database/migrations/
    1715000000000-AddComponentsOrderingIndex.ts
test/
  components/components.service.spec.ts  13 tests covering RFC DoD
```

## Integration

Two stubs to swap with the auth-track equivalents:

- `src/common/guards/jwt-auth.guard.ts`
- `src/common/decorators/current-user.decorator.ts`

Both expect `req.user.id` to be a UUID string after authentication.

## Endpoints

```
PATCH  /v1/profiles/me/components/:componentId
PUT    /v1/profiles/me/components/order
```

See the system design doc and RFC for the full contract.
