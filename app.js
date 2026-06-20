const STORAGE_KEY = "today-todos-v1";

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

const CATEGORIES = {
  "urgent-important": { label: "紧急重要", priority: 0 },
  important: { label: "重要不紧急", priority: 1 },
  low: { label: "不紧急不重要", priority: 2 },
};

let todos = loadTodos();
let currentFilter = "all";

dateLabel.textContent = new Intl.DateTimeFormat("zh-CN", {
  month: "long",
  day: "numeric",
  weekday: "long",
}).format(new Date());

function loadTodos() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? [];
    return saved.map((todo, index) => ({
      ...todo,
      category: CATEGORIES[todo.category] ? todo.category : "important",
      deadline: todo.deadline || null,
      createdAt: todo.createdAt || new Date(Date.now() - index).toISOString(),
    }));
  } catch {
    return [];
  }
}

function saveTodos() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
}

function visibleTodos() {
  let filtered = todos;
  if (currentFilter === "active") filtered = todos.filter((todo) => !todo.completed);
  if (currentFilter === "completed") filtered = todos.filter((todo) => todo.completed);
  return [...filtered].sort(compareTodos);
}

function compareTodos(a, b) {
  if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
  const categoryDifference = CATEGORIES[a.category].priority - CATEGORIES[b.category].priority;
  if (categoryDifference) return categoryDifference;
  if (a.deadline && b.deadline) return new Date(a.deadline) - new Date(b.deadline);
  if (a.deadline) return -1;
  if (b.deadline) return 1;
  return new Date(b.createdAt) - new Date(a.createdAt);
}

function render() {
  list.replaceChildren();

  visibleTodos().forEach((todo) => {
    const fragment = template.content.cloneNode(true);
    const item = fragment.querySelector(".todo-item");
    const toggle = fragment.querySelector(".toggle");
    const remove = fragment.querySelector(".delete");
    const deadline = fragment.querySelector(".todo-deadline");

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
      deadline.classList.toggle("due-soon", remaining >= 0 && remaining <= 24 * 60 * 60 * 1000);
    }
    toggle.setAttribute("aria-label", todo.completed ? "标记为未完成" : "标记为已完成");

    toggle.addEventListener("click", () => toggleTodo(todo.id));
    remove.addEventListener("click", () => deleteTodo(todo.id));
    list.append(fragment);
  });

  const activeCount = todos.filter((todo) => !todo.completed).length;
  const completedCount = todos.length - activeCount;
  const progress = todos.length ? Math.round((completedCount / todos.length) * 100) : 0;

  emptyState.hidden = visibleTodos().length > 0;
  itemsLeft.textContent = `${activeCount} 件待完成`;
  clearCompleted.disabled = completedCount === 0;
  progressValue.textContent = `${progress}%`;
  progressRing.style.setProperty("--progress", `${progress * 3.6}deg`);
  progressRing.setAttribute("aria-label", `完成进度 ${progress}%`);
}

function addTodo(text, category, deadline) {
  todos.unshift({
    id: crypto.randomUUID(),
    text,
    category,
    deadline: deadline || null,
    createdAt: new Date().toISOString(),
    completed: false,
  });
  saveTodos();
  render();
}

function toggleTodo(id) {
  todos = todos.map((todo) => todo.id === id ? { ...todo, completed: !todo.completed } : todo);
  saveTodos();
  render();
}

function deleteTodo(id) {
  todos = todos.filter((todo) => todo.id !== id);
  saveTodos();
  render();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) {
    input.focus();
    return;
  }
  const category = new FormData(form).get("category");
  addTodo(text, category, deadlineInput.value);
  input.value = "";
  deadlineInput.value = "";
  input.focus();
});

document.querySelectorAll(".filter").forEach((button) => {
  button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;
    document.querySelectorAll(".filter").forEach((item) => item.classList.toggle("active", item === button));
    render();
  });
});

clearCompleted.addEventListener("click", () => {
  todos = todos.filter((todo) => !todo.completed);
  saveTodos();
  render();
});

render();
