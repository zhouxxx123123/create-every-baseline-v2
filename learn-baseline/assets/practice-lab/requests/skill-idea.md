# Repeated Workflow

The team repeatedly receives a Markdown decision ticket and needs to verify:

- status is one allowed value;
- exactly one canonical owner is named;
- every deferred item has phase, resume gate, and blocking level;
- the document contains no unresolved `NEEDS_CLASSIFICATION`;
- relative links resolve.

The checker should report deterministic failures. It must not decide the product answer or rewrite the ticket.
