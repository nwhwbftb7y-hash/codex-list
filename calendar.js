const grid = document.querySelector("#calendar-grid");
const title = document.querySelector("#calendar-title");
const dialog = document.querySelector("#day-dialog");
const dayTitle = document.querySelector("#day-title");
const dayTasks = document.querySelector("#day-tasks");
let view = new Date();
view = new Date(view.getFullYear(), view.getMonth(), 1);

TodoStore.ensureOccurrences(45);

function sameDay(a, b) {
  const x = new Date(a); const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

function rule(series) {
  if (series.frequency === "weekly") return `每周${["日", "一", "二", "三", "四", "五", "六"][Number(series.repeatOn)]}`;
  if (series.frequency === "monthly") return `每月 ${series.repeatOn} 日`;
  return "每天";
}

function tasksForDay(date) {
  const { repeating, deadlines } = TodoStore.calendarItemsForDate(date);
  return {
    repeating: repeating.map((item) => ({ ...item, detail: rule(item) })),
    deadlines: deadlines.map((item) => ({
      ...item,
      detail: new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(item.deadline)),
    })),
  };
}

function openDay(date) {
  const { repeating, deadlines } = tasksForDay(date);
  dayTitle.textContent = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(date);
  dayTasks.replaceChildren();
  const all = [...deadlines, ...repeating];
  if (!all.length) {
    const empty = document.createElement("p"); empty.className = "completed-empty"; empty.textContent = "这一天没有任务。"; dayTasks.append(empty);
  }
  all.forEach((task) => {
    const row = document.createElement("article");
    row.className = `day-task ${task.kind}`;
    row.dataset.category = task.category;
    const strong = document.createElement("strong"); strong.textContent = task.text;
    const span = document.createElement("span"); span.textContent = task.kind === "deadline" ? `DDL · ${task.detail}` : task.detail;
    row.append(strong, span); dayTasks.append(row);
  });
  dialog.showModal();
}

function renderCalendar() {
  title.textContent = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long" }).format(view);
  grid.replaceChildren();
  const firstOffset = (view.getDay() + 6) % 7;
  const start = new Date(view.getFullYear(), view.getMonth(), 1 - firstOffset);
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const { repeating, deadlines } = tasksForDay(date);
    const button = document.createElement("button");
    button.type = "button"; button.className = "calendar-day";
    if (date.getMonth() !== view.getMonth()) button.classList.add("outside");
    if (sameDay(date, new Date())) button.classList.add("today");
    const number = document.createElement("span"); number.className = "day-number"; number.textContent = date.getDate();
    const marks = document.createElement("span"); marks.className = "day-marks";
    if (repeating.length) { const mark = document.createElement("i"); mark.className = "repeat-dot"; mark.title = `${repeating.length} 个重复日程`; marks.append(mark); }
    if (deadlines.length) { const mark = document.createElement("i"); mark.className = "deadline-dot"; mark.title = `${deadlines.length} 个 DDL`; marks.append(mark); }
    button.append(number, marks);
    button.addEventListener("click", () => openDay(date));
    grid.append(button);
  }
}

document.querySelector("#prev-month").addEventListener("click", () => { view.setMonth(view.getMonth() - 1); renderCalendar(); });
document.querySelector("#next-month").addEventListener("click", () => { view.setMonth(view.getMonth() + 1); renderCalendar(); });
document.querySelector("#today-month").addEventListener("click", () => { const now = new Date(); view = new Date(now.getFullYear(), now.getMonth(), 1); renderCalendar(); });
document.querySelector("#day-dialog .dialog-close").addEventListener("click", () => dialog.close());
renderCalendar();
