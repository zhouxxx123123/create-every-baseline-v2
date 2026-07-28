# Technical Uncertainty Seed

A future local importer may process a file in asynchronous chunks. The product
principle requires the operation to stop before the final success write when its
`AbortSignal` is triggered.

Unknown:

- whether the current Node runtime observes abort between two simulated chunks;
- whether a completed chunk can be recorded without writing the final success state;
- whether an abort racing with the final chunk can leave a misleading completed result.

Run a disposable experiment with fake in-memory chunks and deterministic timing. The
experiment must not read real files, implement the production importer, or redefine
the product principle.
