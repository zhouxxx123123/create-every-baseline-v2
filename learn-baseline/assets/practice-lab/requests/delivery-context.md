# Delivery Context

Assume a current readiness receipt authorizes one bounded change:

> Rejecting an empty Task rename must preserve the original Task name and return a stable failed result.

Admitted sources:

- `CONTEXT.md`;
- confirmed Task identity and failure rules in `docs/product/product-baseline.md`;
- the public `TaskStore.rename` interface;
- a reviewed decision artifact establishing the empty-name behavior.

Not admitted:

- Review Queue behavior;
- UI layout;
- cross-device synchronization;
- production deployment.

The Task name is authoritative persisted business state. The exercise therefore includes a database-neutral operational data contract before specification. Do not choose a physical database merely from the fixture implementation; record the physical gate separately.

The exercise is to define a data contract, specification boundary, and implementation route without silently broadening the feature.
