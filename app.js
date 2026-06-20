const form = document.querySelector("#todo-form");
const input = document.querySelector("#todo-input");
const list = document.querySelector("#todo-list");
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
const repeatEndElements = document.querySelectorAll(".repeat-end");
const editDialog = document.querySelector("#edit-dialog");
const editText = document.querySelector("#edit-text");
const editCategory = document.querySelector("#edit-category");
const editDeadline = document.querySelector("#edit-deadline");

const { categories: CATEGORIES, frequencies: FREQUENCIES } = TodoStore;
let todos = TodoStore.ensureOccurrences();
let currentFilter = "all";
let editingId = null;

dateLabel.textContent = new Intl.DateTimeFormat("zh-CN", {
  month: "long", day: "numeric", weekday: "long",
}).format(new Date());

function refreshData() {
  todos = TodoStore.ensureOccurrences();
  render();
}

function visibleTodos() {
  let filtered = collapseRecurring(todos);
  if (currentFilter === "active") filtered = filtered.filter((todo) => !todo.completed);
  if (currentFilter === "completed") filtered = filtered.filter((todo) => todo.completed);
  return filtered.sort(compareTodos);
}

function collapseRecurring(items) {
  return TodoStore.collapseTodos(items);
}

function compareTodos(a, b) {
  if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
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
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function render() {
  list.replaceChildren();
  const visible = visibleTodos();

  visible.forEach((todo) => {
    const fragment = template.content.cloneNode(true);
    const item = fragment.querySelector(".todo-item");
    const toggle = fragment.querySelector(".toggle");
    const edit = fragment.querySelector(".edit");
    const remove = fragment.querySelector(".delete");
    const deadline = fragment.querySelector(".todo-deadline");
    const repeatMark = fragment.querySelector(".repeat-mark");

    item.dataset.id = todo.id;
    item.dataset.category = todo.category;
    item.classList.toggle("completed", todo.completed);
    fragment.querySelector(".todo-text").textContent = todo.text;

    if (todo.deadline) {
      const deadlineDate = new Date(todo.deadline);
      const remaining = deadlineDate - Date.now();
      deadline.hidden = false;
      deadline.dateTime = deadlineDate.toISOString();
      deadline.textContent = new Intl.DateTimeFormat("zh-CN", {
        month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
      }).format(deadlineDate);
      deadline.classList.toggle("overdue", remaining < 0 && !todo.completed);
      deadline.classList.toggle("due-soon", remaining >= 0 && remaining <= 86400000);
    }

    if (todo.seriesId) {
      const series = TodoStore.loadSeries().find((item) => item.id === todo.seriesId);
      repeatMark.hidden = false;
      if (series && todo.completed) {
        const completedLabels = { daily: "本日已完成", weekly: "本周已完成", monthly: "本月已完成" };
        repeatMark.textContent = `✓ ${completedLabels[series.frequency]}`;
        repeatMark.classList.add("period-completed");
      } else {
        repeatMark.textContent = series ? `↻ ${FREQUENCIES[series.frequency]}` : "↻ 重复日程";
      }
    }

    toggle.setAttribute("aria-label", todo.completed ? "标记为未完成" : "标记为已完成");
    toggle.addEventListener("click", () => { TodoStore.toggleTodo(todo.id); refreshData(); });
    edit.addEventListener("click", () => openEditor(todo.id));
    remove.addEventListener("click", () => {
      if (todo.seriesId) openEditor(todo.id, true);
      else { TodoStore.deleteOccurrence(todo.id); refreshData(); }
    });
    list.append(fragment);
  });

  const displayUniverse = collapseRecurring(todos);
  const activeCount = displayUniverse.filter((todo) => !todo.completed).length;
  const completedCount = displayUniverse.length - activeCount;
  const progress = displayUniverse.length ? Math.round((completedCount / displayUniverse.length) * 100) : 0;
  emptyState.hidden = visible.length > 0;
  itemsLeft.textContent = `${activeCount} 件待完成`;
  clearCompleted.disabled = completedCount === 0;
  progressValue.textContent = `${progress}%`;
  progressRing.style.setProperty("--progress", `${progress * 3.6}deg`);
  progressRing.setAttribute("aria-label", `完成进度 ${progress}%`);
}

function openEditor(id, deletionOnly = false) {
  const todo = todos.find((item) => item.id === id);
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

repeatSelect.addEventListener("change", () => {
  const show = repeatSelect.value !== "none";
  repeatEndElements.forEach((element) => { element.hidden = !show; });
});

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
    TodoStore.addSeries({ text, category, deadline: deadlineInput.value || null, frequency: repeatSelect.value, endAt: repeatEnd.value });
  } else {
    TodoStore.addTodo({ text, category, deadline: deadlineInput.value || null });
  }
  form.reset();
  repeatEndElements.forEach((element) => { element.hidden = true; });
  input.focus();
  refreshData();
});

document.querySelectorAll(".filter").forEach((button) => {
  button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;
    document.querySelectorAll(".filter").forEach((item) => item.classList.toggle("active", item === button));
    render();
  });
});

clearCompleted.addEventListener("click", () => {
  todos.filter((todo) => todo.completed && todo.seriesId)
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
