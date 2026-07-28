# Harbor Tasks Context

## Purpose

Harbor Tasks is a fictional work-tracking product used only for course practice.

## Terms

**Account**: A stable platform identity.

**Workspace**: A data boundary owned by one organization. Entering a Workspace does not grant access to every Project.

**Project**: A stable container for related Tasks inside one Workspace.

**Task**: A work item with a stable identity, visible name, and lifecycle state.

**Review Request**: A request for another Account to examine a Task outcome. Whether it creates a new responsibility object is intentionally unresolved.

**Current Workspace**: The one Workspace currently selected for ordinary product work.

## Stable relationships

- A Project belongs to exactly one Workspace.
- A Task belongs to exactly one Project.
- Changing a Task name does not create a new Task.
- A failed Task operation must not be represented as successful.
- A Review Request must not silently expand access to its Task or Project.

## Authority

This glossary owns stable terminology. Product behavior is owned by `docs/product/product-baseline.md` and explicit course decision artifacts.
