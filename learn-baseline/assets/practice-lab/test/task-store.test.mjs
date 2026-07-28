import assert from "node:assert/strict";
import test from "node:test";

import { TaskStore } from "../src/task-store.mjs";

test("adds and reads a task through the public interface", () => {
  const store = new TaskStore();

  const result = store.add("  Prepare   review ");

  assert.equal(result.ok, true);
  assert.equal(result.task.name, "Prepare review");
  assert.deepEqual(store.get(result.task.id), result.task);
});

test("renames an existing task", () => {
  const store = new TaskStore();
  const created = store.add("Prepare review").task;

  const result = store.rename(created.id, "Publish review");

  assert.equal(result.ok, true);
  assert.equal(store.get(created.id).name, "Publish review");
});

test("archives without deleting the task", () => {
  const store = new TaskStore();
  const created = store.add("Prepare review").task;

  const result = store.archive(created.id);

  assert.equal(result.ok, true);
  assert.equal(store.get(created.id).archived, true);
  assert.deepEqual(store.listActive(), []);
});
