# Bug Report

## Summary

Rejecting a Task rename made only of spaces still erases the Task's visible name.

## Reproduction

1. Add a Task named `Prepare review`.
2. Rename it to three spaces.
3. Observe a failed result.
4. Read the Task again.

## Expected

The rename fails and the original name remains `Prepare review`.

## Actual

The rename fails, but the stored name becomes empty.

No existing test covers mutation after a rejected rename.
