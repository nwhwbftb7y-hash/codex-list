const form = document.querySelector("#todo-form");
const input = document.querySelector("#todo-input");
const list = document.querySelector("#todo-list");
const completedList = document.querySelector("#completed-list");
const completedCountLabel = document.querySelector("#completed-count");
const completedEmpty = document.querySelector("#completed-empty");
const template = document.querySelector("#todo-template");
const emptyState = document.querySelector("#empty-state");
const itemsLeft = document.querySelector("#items-left");
const clearCompleted = document.querySelector("#clear-completed");
const progressRing = document.querySelector("#progress-ring");
const progressValue = document.querySelector("#progress-value");
const dateLabel = document.querySelector("#date-label");
const deadlineInput = document.querySelector("#deadline-input");
const repeatSelect = document.querySelector("#repeat-select");
const repeatEnd = document.querySelector("#repeat-end");
const weeklyDay = document.querySelector("#weekly-day");
const monthlyDay = document.querySelector("#monthly-day");
const editDialog = document.querySelector("#edit-dialog");
const editText = document.querySelector("#edit-text");
const editCategory = document.querySelector("#edit-category");
const editDeadline = document.querySelector("#edit-deadline");
const { categories: CATEGORIES, frequencies: FREQUENCIES } = TodoStore;
let todos = TodoStore.ensureOccurrences();
let editingId = null;

dateLabel.textContent = new Intl.DateTimeFormat("zh-CN", {
  month: "long", day: "numeric", weekday: "long",
}).format(new Date());

for (let day = 1; day <= 31; day += 1) {
  const option = document.createElement("option");
  option.value = String(day);
  option.textContent = `${day} 日`;
  monthlyDay.append(option);
}

function setRepeatDefaults() {
  const now = new Date();
  weeklyDay.value = String(now.getDay());
  monthlyDay.value = String(now.getDate());
}
setRepeatDefaults();

function refreshData() {
  todos = TodoStore.ensureOccurrences();
  render();
}

function compareTodos(a, b) {
  const priority = CATEGORIES[a.category].priority - CATEGORIES[b.category].priority;
  if (priority) return priority;
  if (a.deadline && b.deadline) return new Date(a.deadline) - new Date(b.deadline);
  if (a.deadline) return -1;
  if (b.deadline) return 1;
  return new Date(b.createdAt) - new Date(a.createdAt);
}

function toLocalInput(value) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function repeatRule(series) {
  if (!series) return "重复日程";
  if (series.frequency === "weekly") {
    return `每周${["日", "一", "二", "三", "四", "五", "六"][Number(series.repeatOn)]}`;
  }
  if (series.frequency === "monthly") return `每月 ${series.repeatOn} 日`;
  return FREQUENCIES[series.frequency];
}

function buildTodo(todo, target) {
  const fragment = template.content.cloneNode(true);
  const item = fragment.querySelector(".todo-item");
  const toggle = fragment.querySelector(".toggle");
  const edit = fragment.querySelector(".edit");
  const remove = fragment.querySelector(".delete");
  const deadline = fragment.querySelector(".todo-deadline");
  const repeatMark = fragment.querySelector(".repeat-mark");
  const series = todo.seriesId ? TodoStore.loadSeries().find((entry) => entry.id === todo.seriesId) : null;

  item.dataset.id = todo.id;
  item.dataset.category = todo.category;
  item.classList.toggle("completed", todo.completed);
  fragment.querySelector(".todo-text").textContent = todo.text;

  if (todo.deadline) {
    const deadlineDate = new Date(todo.deadline);
    const remaining = deadlineDate - Date.now();
    deadline.hidden = false;
    deadline.dateTime = deadlineDate.toISOString();
    deadline.textContent = `DDL · ${new Intl.DateTimeFormat("zh-CN", {
      month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
    }).format(deadlineDate)}`;
    deadline.classList.toggle("overdue", remaining < 0 && !todo.completed);
    deadline.classList.toggle("due-soon", remaining >= 0 && remaining <= 86400000);
  }

  if (series) {
    repeatMark.hidden = false;
    repeatMark.textContent = todo.completed ? `✓ ${repeatRule(series)}已完成` : `↻ ${repeatRule(series)}`;
    repeatMark.classList.toggle("period-completed", todo.completed);
  }

  toggle.setAttribute("aria-label", todo.completed ? "标记为未完成" : "标记为已完成");
  toggle.addEventListener("click", () => { TodoStore.toggleTodo(todo.id); refreshData(); });
  edit.addEventListener("click", () => openEditor(todo.id));
  remove.addEventListener("click", () => {
    if (todo.seriesId) openEditor(todo.id, true);
    else { TodoStore.deleteOccurrence(todo.id); refreshData(); }
  });
  target.append(fragment);
}

function render() {
  list.replaceChildren();
  completedList.replaceChildren();

  const current = TodoStore.collapseTodos(todos);
  const active = current.filter((todo) => !todo.completed).sort(compareTodos);
  const completed = todos.filter((todo) => todo.completed)
    .sort((a, b) => new Date(b.completedAt || b.createdAt) - new Date(a.completedAt || a.createdAt));

  active.forEach((todo) => buildTodo(todo, list));
  completed.forEach((todo) => buildTodo(todo, completedList));

  const currentCompleted = current.filter((todo) => todo.completed).length;
  const progress = current.length ? Math.round((currentCompleted / current.length) * 100) : 0;
  emptyState.hidden = active.length > 0;
  completedEmpty.hidden = completed.length > 0;
  completedCountLabel.textContent = completed.length;
  clearCompleted.disabled = completed.length === 0;
  itemsLeft.textContent = `${active.length} 件待完成`;
  progressValue.textContent = `${progress}%`;
  progressRing.style.setProperty("--progress", `${progress * 3.6}deg`);
  progressRing.setAttribute("aria-label", `完成进度 ${progress}%`);
}

function openEditor(id, deletionOnly = false) {
  const todo = TodoStore.loadTodos().find((item) => item.id === id);
  if (!todo) return;
  editingId = id;
  editText.value = todo.text;
  editCategory.value = todo.category;
  editDeadline.value = toLocalInput(todo.deadline);
  document.querySelector(".single-actions").hidden = deletionOnly;
  document.querySelector(".delete-actions").hidden = !todo.seriesId;
  document.querySelector("#save-future").hidden = !todo.seriesId;
  document.querySelector("#delete-all").hidden = !todo.seriesId;
  document.querySelector("#delete-future").hidden = !todo.seriesId;
  editDialog.showModal();
}

function editorChanges() {
  return { text: editText.value.trim(), category: editCategory.value, deadline: editDeadline.value || null };
}

function applyEdit(scope) {
  const changes = editorChanges();
  if (!changes.text) return editText.focus();
  TodoStore.updateOccurrence(editingId, changes, scope);
  editDialog.close();
  refreshData();
}

function updateRepeatFields() {
  const value = repeatSelect.value;
  document.querySelectorAll(".repeat-end").forEach((element) => { element.hidden = value === "none"; });
  document.querySelectorAll(".weekly-repeat").forEach((element) => { element.hidden = value !== "weekly"; });
  document.querySelectorAll(".monthly-repeat").forEach((element) => { element.hidden = value !== "monthly"; });
}

repeatSelect.addEventListener("change", updateRepeatFields);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return input.focus();
  const category = new FormData(form).get("category");
  if (repeatSelect.value !== "none") {
    if (repeatEnd.value && new Date(`${repeatEnd.value}T23:59:59`) < new Date()) {
      alert("重复结束日期不能早于今天。");
      return repeatEnd.focus();
    }
    const repeatOn = repeatSelect.value === "weekly" ? Number(weeklyDay.value)
      : repeatSelect.value === "monthly" ? Number(monthlyDay.value) : null;
    TodoStore.addSeries({
      text, category, deadline: deadlineInput.value || null,
      frequency: repeatSelect.value, repeatOn, endAt: repeatEnd.value,
    });
  } else {
    TodoStore.addTodo({ text, category, deadline: deadlineInput.value || null });
  }
  form.reset();
  setRepeatDefaults();
  updateRepeatFields();
  input.focus();
  refreshData();
});

clearCompleted.addEventListener("click", (event) => {
  event.preventDefault();
  TodoStore.loadTodos().filter((todo) => todo.completed && todo.seriesId)
    .forEach((todo) => TodoStore.deleteOccurrence(todo.id, "single"));
  TodoStore.saveTodos(TodoStore.loadTodos().filter((todo) => !todo.completed));
  refreshData();
});

document.querySelector(".dialog-close").addEventListener("click", () => editDialog.close());
document.querySelector("#save-single").addEventListener("click", () => applyEdit("single"));
document.querySelector("#save-future").addEventListener("click", () => applyEdit("future"));
document.querySelector("#delete-single").addEventListener("click", () => {
  TodoStore.deleteOccurrence(editingId, "single"); editDialog.close(); refreshData();
});
document.querySelector("#delete-future").addEventListener("click", () => {
  if (confirm("确定删除此日程及之后的所有重复日程吗？")) {
    TodoStore.deleteOccurrence(editingId, "future"); editDialog.close(); refreshData();
  }
});
document.querySelector("#delete-all").addEventListener("click", () => {
  if (confirm("确定删除这一组的所有重复日程吗？此操作不可恢复。")) {
    TodoStore.deleteOccurrence(editingId, "all"); editDialog.close(); refreshData();
  }
});

render();
