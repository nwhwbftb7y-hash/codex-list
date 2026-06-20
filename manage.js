const seriesList = document.querySelector("#series-list");
const seriesEmpty = document.querySelector("#series-empty");
const seriesCount = document.querySelector("#series-count");
const summaryList = document.querySelector("#summary-list");
const summaryEmpty = document.querySelector("#summary-empty");
const customRange = document.querySelector("#custom-range");
const rangeStart = document.querySelector("#range-start");
const rangeEnd = document.querySelector("#range-end");
const seriesDialog = document.querySelector("#series-dialog");
const { categories, frequencies } = TodoStore;
let activeRange = "week";
let editingSeriesId = null;
let currentSummary = [];

TodoStore.ensureOccurrences();

function localInput(value) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function dateInput(value) {
  if (!value) return "";
  return localInput(value).slice(0, 10);
}

function formatDate(value, withTime = true) {
  return new Intl.DateTimeFormat("zh-CN", withTime
    ? { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
    : { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}

function renderSeries() {
  const all = TodoStore.loadSeries().sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
  seriesList.replaceChildren();
  seriesCount.textContent = `${all.length} 组`;
  seriesEmpty.hidden = all.length > 0;

  all.forEach((series) => {
    const card = document.createElement("article");
    card.className = "series-card";
    card.dataset.category = series.category;
    card.innerHTML = `
      <div class="series-info">
        <h3></h3>
        <p class="series-rule"></p>
        <p class="series-start"></p>
      </div>
      <div class="series-actions"><button type="button" data-action="edit">编辑</button><button class="danger-text" type="button" data-action="delete">删除整组</button></div>`;
    card.querySelector("h3").textContent = series.text;
    card.querySelector(".series-rule").textContent = `${frequencies[series.frequency]} · ${categories[series.category].label}${series.endAt ? ` · 至 ${formatDate(series.endAt, false)}` : " · 持续重复"}`;
    card.querySelector(".series-start").textContent = `首次：${formatDate(series.startAt)}`;
    card.querySelector('[data-action="edit"]').addEventListener("click", () => openSeriesEditor(series.id));
    card.querySelector('[data-action="delete"]').addEventListener("click", () => {
      if (confirm(`确定删除“${series.text}”及其全部重复日程吗？`)) { TodoStore.deleteSeries(series.id); renderSeries(); }
    });
    seriesList.append(card);
  });
}

function openSeriesEditor(id) {
  const series = TodoStore.loadSeries().find((item) => item.id === id);
  if (!series) return;
  editingSeriesId = id;
  document.querySelector("#series-text").value = series.text;
  document.querySelector("#series-category").value = series.category;
  document.querySelector("#series-start").value = localInput(series.startAt);
  document.querySelector("#series-frequency").value = series.frequency;
  document.querySelector("#series-end").value = dateInput(series.endAt);
  seriesDialog.showModal();
}

function rangeBounds(type) {
  const now = new Date();
  let start;
  let end;
  if (type === "month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  } else if (type === "custom") {
    start = rangeStart.value ? new Date(`${rangeStart.value}T00:00:00`) : new Date(now.getFullYear(), now.getMonth(), 1);
    end = rangeEnd.value ? new Date(`${rangeEnd.value}T23:59:59.999`) : new Date();
  } else {
    const day = (now.getDay() + 6) % 7;
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
    end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59, 999);
  }
  return { start, end };
}

function renderSummary() {
  const { start, end } = rangeBounds(activeRange);
  currentSummary = TodoStore.loadTodos()
    .filter((todo) => todo.completed && todo.completedAt && new Date(todo.completedAt) >= start && new Date(todo.completedAt) <= end)
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
  document.querySelector("#summary-total").textContent = currentSummary.length;
  document.querySelector("#summary-urgent").textContent = currentSummary.filter((todo) => todo.category === "urgent-important").length;
  document.querySelector("#summary-series").textContent = currentSummary.filter((todo) => todo.seriesId).length;
  document.querySelector("#summary-period").textContent = `${formatDate(start, false)} — ${formatDate(end, false)}`;
  summaryList.replaceChildren();
  summaryEmpty.hidden = currentSummary.length > 0;
  currentSummary.forEach((todo) => {
    const row = document.createElement("div");
    row.className = "summary-row";
    row.dataset.category = todo.category;
    row.innerHTML = `<div><strong></strong><span></span></div><time></time>`;
    row.querySelector("strong").textContent = todo.text;
    row.querySelector("span").textContent = `${categories[todo.category].label}${todo.seriesId ? " · 周期日程" : ""}`;
    row.querySelector("time").textContent = formatDate(todo.completedAt);
    summaryList.append(row);
  });
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function exportSummary() {
  const { start, end } = rangeBounds(activeRange);
  const rows = [["任务", "分类", "计划时间", "完成时间", "是否周期日程"], ...currentSummary.map((todo) => [
    todo.text, categories[todo.category].label, todo.deadline ? formatDate(todo.deadline) : "", formatDate(todo.completedAt), todo.seriesId ? "是" : "否",
  ])];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `完成总结_${dateInput(start)}_${dateInput(end)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

document.querySelectorAll(".page-nav button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".page-nav button").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelectorAll(".manage-panel").forEach((panel) => { panel.hidden = panel.id !== button.dataset.panel; });
    if (button.dataset.panel === "summary-panel") renderSummary();
  });
});

document.querySelectorAll(".range-button").forEach((button) => {
  button.addEventListener("click", () => {
    activeRange = button.dataset.range;
    document.querySelectorAll(".range-button").forEach((item) => item.classList.toggle("active", item === button));
    customRange.hidden = activeRange !== "custom";
    renderSummary();
  });
});

document.querySelector("#apply-range").addEventListener("click", renderSummary);
document.querySelector("#export-summary").addEventListener("click", exportSummary);
document.querySelector("#save-series").addEventListener("click", () => {
  const text = document.querySelector("#series-text").value.trim();
  const startAt = document.querySelector("#series-start").value;
  if (!text || !startAt) return;
  const endValue = document.querySelector("#series-end").value;
  if (endValue && new Date(`${endValue}T23:59:59`) < new Date(startAt)) {
    alert("结束日期不能早于首次时间。");
    return;
  }
  TodoStore.updateSeries(editingSeriesId, {
    text, category: document.querySelector("#series-category").value,
    startAt, frequency: document.querySelector("#series-frequency").value,
    endAt: endValue ? new Date(`${endValue}T23:59:59`).toISOString() : null,
  });
  seriesDialog.close();
  renderSeries();
});
document.querySelector("#cancel-series").addEventListener("click", () => seriesDialog.close());
document.querySelector("#series-dialog .dialog-close").addEventListener("click", () => seriesDialog.close());

const today = new Date();
rangeStart.value = dateInput(new Date(today.getFullYear(), today.getMonth(), 1));
rangeEnd.value = dateInput(today);
renderSeries();
renderSummary();
