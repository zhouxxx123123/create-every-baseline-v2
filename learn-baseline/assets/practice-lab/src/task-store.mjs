export class TaskStore {
  #tasks = new Map();
  #nextId = 1;

  add(name) {
    const normalized = normalizeName(name);
    if (!normalized) {
      return { ok: false, reason: "empty-name" };
    }

    const task = {
      id: String(this.#nextId++),
      name: normalized,
      archived: false,
    };
    this.#tasks.set(task.id, task);
    return { ok: true, task: cloneTask(task) };
  }

  get(id) {
    const task = this.#tasks.get(id);
    return task ? cloneTask(task) : null;
  }

  rename(id, name) {
    const task = this.#tasks.get(id);
    if (!task) {
      return { ok: false, reason: "not-found" };
    }

    // Intentional course defect: mutation happens before validation.
    task.name = normalizeName(name);
    if (!task.name) {
      return { ok: false, reason: "empty-name" };
    }

    return { ok: true, task: cloneTask(task) };
  }

  archive(id) {
    const task = this.#tasks.get(id);
    if (!task) {
      return { ok: false, reason: "not-found" };
    }

    task.archived = true;
    return { ok: true, task: cloneTask(task) };
  }

  listActive() {
    return [...this.#tasks.values()]
      .filter((task) => !task.archived)
      .map(cloneTask)
      .sort((left, right) => left.name.localeCompare(right.name));
  }
}

function normalizeName(name) {
  return String(name ?? "").trim().replace(/\s+/g, " ");
}

function cloneTask(task) {
  return { ...task };
}
