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

let todos = loadTodos();
let currentFilter = "all";

dateLabel.textContent = new Intl.DateTimeFormat("zh-CN", {
  month: "long",
  day: "numeric",
  weekday: "long",
}).format(new Date());

function loadTodos() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? [];
  } catch {
    return [];
  }
}

function saveTodos() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
}

function visibleTodos() {
  if (currentFilter === "active") return todos.filter((todo) => !todo.completed);
  if (currentFilter === "completed") return todos.filter((todo) => todo.completed);
  return todos;
}

function render() {
  list.replaceChildren();

  visibleTodos().forEach((todo) => {
    const fragment = template.content.cloneNode(true);
    const item = fragment.querySelector(".todo-item");
    const toggle = fragment.querySelector(".toggle");
    const remove = fragment.querySelector(".delete");

    item.dataset.id = todo.id;
    item.classList.toggle("completed", todo.completed);
    fragment.querySelector(".todo-text").textContent = todo.text;
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

function addTodo(text) {
  todos.unshift({ id: crypto.randomUUID(), text, completed: false });
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
  addTodo(text);
  input.value = "";
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
