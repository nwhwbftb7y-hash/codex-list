const seriesList = document.querySelector("#series-list");
const seriesEmpty = document.querySelector("#series-empty");
const seriesCount = document.querySelector("#series-count");
const summaryList = document.querySelector("#summary-list");
const summaryEmpty = document.querySelector("#summary-empty");
const customRange = document.querySelector("#custom-range");
const rangeStart = document.querySelector("#range-start");
const rangeEnd = document.querySelector("#range-end");
const seriesDialog = document.querySelector("#series-dialog");
const manageWeekLabel = document.querySelector("#manage-week-label");
const { categories, frequencies } = TodoStore;
let activeRange = "week";
let editingSeriesId = null;
let currentSummary = [];

function weekOfMonth(value) {
  const firstDay = new Date(value.getFullYear(), value.getMonth(), 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  return Math.ceil((value.getDate() + mondayOffset) / 7);
}

function renderManageWeekLabel() {
  if (!manageWeekLabel) return;
  const today = new Date();
  const date = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(today);
  manageWeekLabel.textContent = `${date} · W${weekOfMonth(today)}`;
}

const seriesFrequency = document.querySelector("#series-frequency");
const seriesWeekday = document.querySelector("#series-weekday");
const seriesMonthday = document.querySelector("#series-monthday");
for (let day = 1; day <= 31; day += 1) {
  const option = document.createElement("option");
  option.value = String(day);
  option.textContent = `${day} 日`;
  seriesMonthday.append(option);
}

function updateSeriesRepeatFields() {
  document.querySelector(".series-weekly").hidden = seriesFrequency.value !== "weekly";
  document.querySelector(".series-monthly").hidden = seriesFrequency.value !== "monthly";
}

function recurrenceLabel(series) {
  if (series.frequency === "weekly") return `每周${["日", "一", "二", "三", "四", "五", "六"][Number(series.repeatOn)]}`;
  if (series.frequency === "monthly") return `每月 ${series.repeatOn} 日`;
  return frequencies[series.frequency];
}

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
    card.querySelector(".series-rule").textContent = `${recurrenceLabel(series)} · ${categories[series.category].label}${series.endAt ? ` · 至 ${formatDate(series.endAt, false)}` : " · 持续重复"}`;
    card.querySelector(".series-start").textContent = series.deadline ? `固定 DDL：${formatDate(series.deadline)}` : "固定 DDL：未设置";
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
  document.querySelector("#series-start").value = series.deadline ? localInput(series.deadline) : "";
  seriesFrequency.value = series.frequency;
  seriesWeekday.value = String(series.frequency === "weekly" ? series.repeatOn : new Date(series.startAt).getDay());
  seriesMonthday.value = String(series.frequency === "monthly" ? series.repeatOn : new Date(series.startAt).getDate());
  updateSeriesRepeatFields();
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

function backupFilename() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString();
  return `todo-list完整备份_${local.slice(0, 10)}_${local.slice(11, 16).replace(":", "-")}.json`;
}

function showTransferStatus(message, type = "success") {
  const status = document.querySelector("#transfer-status");
  status.hidden = false;
  status.dataset.type = type;
  status.textContent = message;
}

function exportBackupFile() {
  const backup = TodoStore.exportBackup();
  const content = JSON.stringify(backup, null, 2);
  const url = URL.createObjectURL(new Blob([content], { type: "application/json;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = backupFilename();
  link.click();
  URL.revokeObjectURL(url);
  showTransferStatus(`导出成功：${backup.data.todos.length} 条任务，${backup.data.series.length} 组重复日程。请把文件发送到另一台设备。`);
}

async function importBackupFile(file) {
  if (!file) return;
  try {
    const backup = JSON.parse(await file.text());
    const todoCount = Array.isArray(backup?.data?.todos) ? backup.data.todos.length : 0;
    const seriesCountValue = Array.isArray(backup?.data?.series) ? backup.data.series.length : 0;
    const confirmed = confirm(`即将导入 ${todoCount} 条任务和 ${seriesCountValue} 组重复日程。\n\n这会替换当前设备已有的数据，是否继续？`);
    if (!confirmed) {
      showTransferStatus("已取消导入，当前设备数据没有变化。", "neutral");
      return;
    }
    const result = TodoStore.importBackup(backup);
    showTransferStatus(`导入成功：已恢复 ${result.todos} 条任务和 ${result.series} 组重复日程，页面即将刷新。`);
    setTimeout(() => location.reload(), 900);
  } catch (error) {
    showTransferStatus(`导入失败：${error.message || "文件无法读取"}`, "error");
  }
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
document.querySelector("#export-backup").addEventListener("click", exportBackupFile);
document.querySelector("#choose-backup").addEventListener("click", () => document.querySelector("#backup-file").click());
document.querySelector("#backup-file").addEventListener("change", (event) => {
  importBackupFile(event.target.files?.[0]);
  event.target.value = "";
});
seriesFrequency.addEventListener("change", updateSeriesRepeatFields);
document.querySelector("#save-series").addEventListener("click", () => {
  const text = document.querySelector("#series-text").value.trim();
  const deadline = document.querySelector("#series-start").value;
  if (!text) return;
  const endValue = document.querySelector("#series-end").value;
  if (endValue && new Date(`${endValue}T23:59:59`) < new Date()) {
    alert("结束日期不能早于今天。");
    return;
  }
  TodoStore.updateSeries(editingSeriesId, {
    text, category: document.querySelector("#series-category").value,
    deadline: deadline ? new Date(deadline).toISOString() : null,
    hasDeadline: Boolean(deadline),
    frequency: seriesFrequency.value,
    repeatOn: seriesFrequency.value === "weekly" ? Number(seriesWeekday.value)
      : seriesFrequency.value === "monthly" ? Number(seriesMonthday.value) : null,
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
renderManageWeekLabel();
renderSeries();
renderSummary();
