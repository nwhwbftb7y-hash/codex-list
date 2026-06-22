const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

function makeStore() {
  const values = new Map();
  const localStorage = {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  let id = 0;
  const context = { window: {}, localStorage, crypto: { randomUUID: () => `id-${++id}` }, Date, Math };
  vm.runInNewContext(fs.readFileSync("data.js", "utf8"), context);
  return { store: context.window.TodoStore, localStorage, values };
}

const { store, localStorage, values } = makeStore();
const now = new Date();
const deadline = new Date(now.getTime() + 86400000).toISOString();
store.saveSeries([{
  id: "series-1", modelVersion: 3, text: "每周复习", category: "important",
  startAt: now.toISOString(), deadline, hasDeadline: true, frequency: "weekly",
  repeatOn: now.getDay(), endAt: new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()).toISOString(),
  createdAt: now.toISOString(), exceptions: [],
}]);
store.saveTodos([{
  id: "todo-1", text: "每周复习", category: "important", deadline,
  scheduledAt: now.toISOString(), createdAt: now.toISOString(), completed: true,
  completedAt: now.toISOString(), seriesId: "series-1", occurrenceKey: now.toISOString(),
}]);
localStorage.setItem("today-highland-cow-v1", "17");
localStorage.setItem("today-highland-cow-position-v1", JSON.stringify({ x: .4, y: .6 }));

const backup = store.exportBackup();
assert.equal(backup.app, "today-todo-list");
assert.equal(backup.formatVersion, 1);
assert.equal(backup.data.todos.length, 1);
assert.equal(backup.data.series.length, 1);
assert.equal(backup.preferences.cowAffection, "17");

store.saveTodos([]); store.saveSeries([]);
localStorage.setItem("today-highland-cow-v1", "0");
const result = store.importBackup(JSON.parse(JSON.stringify(backup)));
assert.equal(result.todos, 1);
assert.equal(result.series, 1);
assert.equal(store.loadTodos().some((item) => item.id === "todo-1" && item.completed), true);
assert.equal(store.loadSeries()[0].deadline, deadline);
assert.equal(localStorage.getItem("today-highland-cow-v1"), "17");

const before = values.get("today-todos-v1");
assert.throws(() => store.importBackup({ app: "wrong", formatVersion: 1, data: { todos: [], series: [] } }), /不是本 Todo List/);
assert.equal(values.get("today-todos-v1"), before, "invalid file must not overwrite current data");

const html = fs.readFileSync("manage.html", "utf8");
const js = fs.readFileSync("manage.js", "utf8");
assert.match(html, /data-panel="transfer-panel"[\s\S]*id="export-backup"[\s\S]*id="backup-file"/);
assert.match(js, /TodoStore\.exportBackup\(\)[\s\S]*TodoStore\.importBackup\(backup\)/);
console.log("backup export/import audit passed");
