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

The exercise is to define a specification boundary and implementation route, not to silently broaden the feature.
