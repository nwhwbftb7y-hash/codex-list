(function () {
  const TODO_KEY = "today-todos-v1";
  const SERIES_KEY = "today-recurring-series-v1";
  const DAY = 24 * 60 * 60 * 1000;

  const categories = {
    "urgent-important": { label: "紧急重要", priority: 0 },
    important: { label: "重要不紧急", priority: 1 },
    low: { label: "不紧急不重要", priority: 2 },
  };

  const frequencies = {
    daily: "每天",
    weekly: "每周",
    monthly: "每月",
  };

  function uid() {
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  }

  function normalizeSubtasks(subtasks) {
    if (!Array.isArray(subtasks)) return [];
    return subtasks.map((subtask) => ({
      id: subtask && subtask.id ? String(subtask.id) : uid(),
      text: String((subtask && subtask.text) || "").trim().slice(0, 100),
      completed: Boolean(subtask && subtask.completed),
    })).filter((subtask) => subtask.text);
  }

  function normalizeTodo(todo, index) {
    const createdAt = todo.createdAt || new Date(Date.now() - index).toISOString();
    return {
      ...todo,
      id: todo.id || uid(),
      text: String(todo.text || "").slice(0, 100),
      category: categories[todo.category] ? todo.category : "important",
      deadline: todo.deadline || null,
      scheduledAt: todo.scheduledAt || todo.deadline || null,
      createdAt,
      order: Number.isFinite(Number(todo.order)) ? Number(todo.order) : index,
      subtasks: normalizeSubtasks(todo.subtasks),
      completed: Boolean(todo.completed),
      completedAt: todo.completed ? (todo.completedAt || todo.deadline || createdAt) : null,
      seriesId: todo.seriesId || null,
      occurrenceKey: todo.occurrenceKey || null,
    };
  }

  function loadTodos() {
    return read(TODO_KEY, []).map(normalizeTodo).filter((todo) => todo.text);
  }

  function saveTodos(todos) {
    localStorage.setItem(TODO_KEY, JSON.stringify(todos));
  }

  function loadSeries() {
    const raw = read(SERIES_KEY, []);
    const migratedIds = [];
    const normalized = raw.map((series) => {
      if (series.modelVersion === 3) {
        return {
          ...series,
          deadline: series.deadline || null,
          hasDeadline: Boolean(series.deadline),
          repeatOn: normalizeRepeatOn(series.frequency, series.repeatOn, series.startAt),
          endAt: series.endAt || defaultSeriesEnd(series.startAt),
          exceptions: Array.isArray(series.exceptions) ? series.exceptions : [],
        };
      }

      if (series.modelVersion === 2) {
        migratedIds.push(series.id);
        return {
          ...series,
          modelVersion: 3,
          deadline: series.deadline || null,
          hasDeadline: Boolean(series.deadline),
          repeatOn: normalizeRepeatOn(series.frequency, series.repeatOn, series.startAt),
          endAt: series.endAt || defaultSeriesEnd(series.startAt),
          exceptions: Array.isArray(series.exceptions) ? series.exceptions : [],
        };
      }

      // 旧版误把 DDL 当作重复周期的起点。迁移后：周期从创建日开始，DDL 固定不变。
      const hadDeadline = series.hasDeadline !== undefined ? Boolean(series.hasDeadline) : true;
      const oldStart = series.startAt || series.createdAt || new Date().toISOString();
      const scheduleStart = series.createdAt || new Date().toISOString();
      migratedIds.push(series.id);
      return {
        ...series,
        modelVersion: 3,
        startAt: new Date(scheduleStart).toISOString(),
        deadline: hadDeadline ? new Date(oldStart).toISOString() : null,
        hasDeadline: hadDeadline,
        repeatOn: normalizeRepeatOn(series.frequency, series.repeatOn, scheduleStart),
        endAt: series.endAt || defaultSeriesEnd(scheduleStart),
        exceptions: [],
      };
    });

    if (migratedIds.length) {
      localStorage.setItem(SERIES_KEY, JSON.stringify(normalized));
      const migratedSet = new Set(migratedIds);
      const todos = read(TODO_KEY, []).filter((todo) => !migratedSet.has(todo.seriesId) || todo.completed || todo.detached);
      localStorage.setItem(TODO_KEY, JSON.stringify(todos));
    }
    return normalized;
  }

  function saveSeries(series) {
    localStorage.setItem(SERIES_KEY, JSON.stringify(series));
  }

  function defaultSeriesEnd(startAt) {
    const end = new Date(startAt);
    end.setFullYear(end.getFullYear() + 10);
    end.setHours(23, 59, 59, 999);
    return end.toISOString();
  }

  function normalizeRepeatOn(frequency, repeatOn, startAt) {
    const start = new Date(startAt || Date.now());
    if (frequency === "weekly") return Number.isInteger(Number(repeatOn)) ? Number(repeatOn) : start.getDay();
    if (frequency === "monthly") return Number.isInteger(Number(repeatOn)) ? Number(repeatOn) : start.getDate();
    return null;
  }

  function alignScheduleStart(frequency, repeatOn, value = new Date()) {
    const date = new Date(value);
    if (frequency === "weekly") {
      const target = Number(repeatOn);
      const delta = (target - date.getDay() + 7) % 7;
      date.setDate(date.getDate() + delta);
    }
    if (frequency === "monthly") {
      const target = Number(repeatOn);
      const lastThisMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      const thisMonthDay = Math.min(target, lastThisMonth);
      if (date.getDate() <= thisMonthDay) date.setDate(thisMonthDay);
      else {
        const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1, date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
        const lastNextMonth = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
        nextMonth.setDate(Math.min(target, lastNextMonth));
        return nextMonth;
      }
    }
    return date;
  }

  function sameLocalDate(a, b) {
    const first = new Date(a);
    const second = new Date(b);
    return first.getFullYear() === second.getFullYear()
      && first.getMonth() === second.getMonth()
      && first.getDate() === second.getDate();
  }

  function seriesDueOn(series, value) {
    const date = new Date(value);
    const start = new Date(series.startAt);
    const end = new Date(series.endAt);
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const seriesStart = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const seriesEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);
    if (dayStart < seriesStart || dayStart > seriesEnd) return false;
    if ((series.exceptions || []).some((key) => sameLocalDate(key, date))) return false;
    if (series.frequency === "daily") return true;
    if (series.frequency === "weekly") return date.getDay() === Number(series.repeatOn);
    if (series.frequency === "monthly") {
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      return date.getDate() === Math.min(Number(series.repeatOn), lastDay);
    }
    return false;
  }

  function calendarItemsForDate(value) {
    const date = new Date(value);
    const seriesList = loadSeries();
    const todos = loadTodos();
    const repeating = seriesList.filter((series) => seriesDueOn(series, date)).map((series) => ({
      kind: "repeat", id: series.id, text: series.text,
      category: series.category, frequency: series.frequency, repeatOn: series.repeatOn,
    }));
    const deadlines = seriesList
      .filter((series) => series.deadline && sameLocalDate(series.deadline, date))
      .map((series) => ({
        kind: "deadline", id: series.id, text: series.text,
        category: series.category, deadline: series.deadline, seriesId: series.id,
      }));
    todos.filter((todo) => !todo.seriesId && todo.deadline && sameLocalDate(todo.deadline, date))
      .forEach((todo) => deadlines.push({
        kind: "deadline", id: todo.id, text: todo.text,
        category: todo.category, deadline: todo.deadline, seriesId: null,
      }));
    return { repeating, deadlines };
  }

  function addPeriod(value, frequency, anchorDay) {
    const date = new Date(value);
    if (frequency === "daily") date.setDate(date.getDate() + 1);
    if (frequency === "weekly") date.setDate(date.getDate() + 7);
    if (frequency === "monthly") {
      const nextMonth = date.getMonth() + 1;
      const year = date.getFullYear() + Math.floor(nextMonth / 12);
      const month = ((nextMonth % 12) + 12) % 12;
      const lastDay = new Date(year, month + 1, 0).getDate();
      date.setFullYear(year, month, Math.min(anchorDay, lastDay));
    }
    return date;
  }

  function ensureOccurrences(horizonDays = 14) {
    const seriesList = loadSeries();
    const todos = loadTodos();
    const existing = new Set(todos.filter((todo) => todo.seriesId).map((todo) => `${todo.seriesId}|${todo.occurrenceKey}`));
    const horizon = new Date(Date.now() + horizonDays * DAY);
    let changed = false;

    seriesList.forEach((series) => {
      const start = new Date(series.startAt);
      const anchorDay = series.frequency === "monthly" ? Number(series.repeatOn) : start.getDate();
      let cursor = new Date(start);
      let guard = 0;
      while (cursor <= horizon && guard < 1000) {
        const key = cursor.toISOString();
        const withinEnd = !series.endAt || cursor <= new Date(series.endAt);
        if (withinEnd && !series.exceptions.includes(key) && !existing.has(`${series.id}|${key}`)) {
          todos.push(normalizeTodo({
            id: uid(), text: series.text, category: series.category,
            deadline: series.deadline || null,
            scheduledAt: key, createdAt: series.createdAt,
            order: todos.length,
            subtasks: series.subtasks || [],
            completed: false, seriesId: series.id, occurrenceKey: key,
          }, todos.length));
          existing.add(`${series.id}|${key}`);
          changed = true;
        }
        if (!withinEnd) break;
        cursor = addPeriod(cursor, series.frequency, anchorDay);
        guard += 1;
      }
    });

    if (changed) saveTodos(todos);
    return todos;
  }

  function addTodo(data) {
    const todos = loadTodos();
    const minOrder = todos.length ? Math.min(...todos.map((todo) => Number(todo.order) || 0)) : 0;
    todos.unshift(normalizeTodo({
      ...data,
      id: uid(),
      createdAt: new Date().toISOString(),
      order: minOrder - 1,
      completed: false,
    }, 0));
    saveTodos(todos);
  }

  function addSeries(data) {
    const seriesList = loadSeries();
    const repeatOn = normalizeRepeatOn(data.frequency, data.repeatOn, new Date());
    const startAt = alignScheduleStart(data.frequency, repeatOn, new Date()).toISOString();
    seriesList.push({
      id: uid(), text: data.text, category: data.category,
      modelVersion: 3,
      startAt,
      deadline: data.deadline ? new Date(data.deadline).toISOString() : null,
      hasDeadline: Boolean(data.deadline),
      subtasks: normalizeSubtasks(data.subtasks),
      frequency: data.frequency,
      repeatOn,
      endAt: data.endAt ? new Date(`${data.endAt}T23:59:59`).toISOString() : defaultSeriesEnd(startAt),
      createdAt: new Date().toISOString(), exceptions: [],
    });
    saveSeries(seriesList);
    ensureOccurrences();
  }

  function toggleTodo(id) {
    const todos = loadTodos().map((todo) => todo.id === id
      ? { ...todo, completed: !todo.completed, completedAt: todo.completed ? null : new Date().toISOString() }
      : todo);
    saveTodos(todos);
  }

  function addSubtask(id, text) {
    const value = String(text || "").trim();
    if (!value) return;
    saveTodos(loadTodos().map((todo) => todo.id === id
      ? { ...todo, subtasks: [...normalizeSubtasks(todo.subtasks), { id: uid(), text: value.slice(0, 100), completed: false }] }
      : todo));
  }

  function toggleSubtask(todoId, subtaskId) {
    saveTodos(loadTodos().map((todo) => todo.id === todoId
      ? {
        ...todo,
        subtasks: normalizeSubtasks(todo.subtasks).map((subtask) => subtask.id === subtaskId
          ? { ...subtask, completed: !subtask.completed }
          : subtask),
      }
      : todo));
  }

  function deleteSubtask(todoId, subtaskId) {
    saveTodos(loadTodos().map((todo) => todo.id === todoId
      ? { ...todo, subtasks: normalizeSubtasks(todo.subtasks).filter((subtask) => subtask.id !== subtaskId) }
      : todo));
  }

  function reorderTodos(orderedIds) {
    const positions = new Map(orderedIds.map((id, index) => [id, index]));
    saveTodos(loadTodos().map((todo) => positions.has(todo.id) ? { ...todo, order: positions.get(todo.id) } : todo));
  }

  function addException(seriesId, key) {
    if (!seriesId || !key) return;
    const seriesList = loadSeries().map((series) => series.id === seriesId
      ? { ...series, exceptions: [...new Set([...series.exceptions, key])] }
      : series);
    saveSeries(seriesList);
  }

  function deleteOccurrence(id, scope = "single") {
    const target = loadTodos().find((todo) => todo.id === id);
    if (!target) return;
    if (!target.seriesId) {
      saveTodos(loadTodos().filter((todo) => todo.id !== id));
      return;
    }

    if (scope === "all") {
      saveSeries(loadSeries().filter((series) => series.id !== target.seriesId));
      saveTodos(loadTodos().filter((todo) => todo.seriesId !== target.seriesId));
      return;
    }

    if (scope === "future") {
      const cutoff = new Date(new Date(target.occurrenceKey).getTime() - 1).toISOString();
      saveSeries(loadSeries().map((series) => series.id === target.seriesId ? { ...series, endAt: cutoff } : series));
      saveTodos(loadTodos().filter((todo) => todo.seriesId !== target.seriesId || new Date(todo.occurrenceKey) < new Date(target.occurrenceKey)));
      return;
    }

    addException(target.seriesId, target.occurrenceKey);
    saveTodos(loadTodos().filter((todo) => todo.id !== id));
  }

  function updateOccurrence(id, changes, scope = "single") {
    const target = loadTodos().find((todo) => todo.id === id);
    if (!target) return;
    if (!target.seriesId) {
      saveTodos(loadTodos().map((todo) => todo.id === id ? normalizeTodo({ ...todo, ...changes }, 0) : todo));
      return;
    }

    // DDL belongs to the recurring series, not to an individual occurrence.
    // Keeping it on the series prevents daily/weekly/monthly instances from
    // silently acquiring different deadlines after a single-instance edit.
    const fixedDeadline = changes.deadline ? new Date(changes.deadline).toISOString() : null;
    saveSeries(loadSeries().map((series) => series.id === target.seriesId
      ? { ...series, deadline: fixedDeadline, hasDeadline: Boolean(fixedDeadline) }
      : series));
    saveTodos(loadTodos().map((todo) => todo.seriesId === target.seriesId
      ? { ...todo, deadline: fixedDeadline }
      : todo));

    if (scope === "single") {
      // Only text/category are occurrence-specific. The fixed DDL above is
      // deliberately shared by every occurrence in the series.
      saveTodos(loadTodos().map((todo) => todo.id === id
        ? normalizeTodo({ ...todo, text: changes.text, category: changes.category }, 0)
        : todo));
      return;
    }

    const oldSeries = loadSeries().find((series) => series.id === target.seriesId);
    if (!oldSeries) return;
    const cutoff = new Date(new Date(target.occurrenceKey).getTime() - 1).toISOString();
    const remainingEnd = oldSeries.endAt;
    const seriesList = loadSeries().map((series) => series.id === oldSeries.id ? { ...series, endAt: cutoff } : series);
    const newSeries = {
      ...oldSeries, id: uid(), text: changes.text, category: changes.category,
      modelVersion: 3,
      startAt: new Date(target.occurrenceKey).toISOString(),
      deadline: fixedDeadline,
      hasDeadline: Boolean(fixedDeadline),
      endAt: remainingEnd, createdAt: new Date().toISOString(), exceptions: [],
    };
    seriesList.push(newSeries);
    saveSeries(seriesList);
    saveTodos(loadTodos().filter((todo) => todo.seriesId !== target.seriesId || new Date(todo.occurrenceKey) < new Date(target.occurrenceKey)));
    ensureOccurrences();
  }

  function updateSeries(id, changes) {
    const old = loadSeries().find((series) => series.id === id);
    if (!old) return;
    const frequency = changes.frequency || old.frequency;
    const repeatOn = normalizeRepeatOn(frequency, changes.repeatOn, old.startAt);
    const scheduleChanged = frequency !== old.frequency || Number(repeatOn) !== Number(old.repeatOn);
    const updated = {
      ...old, ...changes, modelVersion: 3, frequency, repeatOn,
      startAt: scheduleChanged ? alignScheduleStart(frequency, repeatOn, new Date()).toISOString() : old.startAt,
    };
    saveSeries(loadSeries().map((series) => series.id === id ? updated : series));
    const preserved = loadTodos().filter((todo) => todo.seriesId !== id || todo.completed || todo.detached);
    saveTodos(preserved);
    ensureOccurrences();
  }

  function deleteSeries(id) {
    saveSeries(loadSeries().filter((series) => series.id !== id));
    saveTodos(loadTodos().filter((todo) => todo.seriesId !== id));
  }

  function collapseTodos(items) {
    const standalone = items.filter((todo) => !todo.seriesId);
    const seriesById = new Map(loadSeries().map((series) => [series.id, series]));
    const groups = new Map();
    items.filter((todo) => todo.seriesId).forEach((todo) => {
      if (!groups.has(todo.seriesId)) groups.set(todo.seriesId, []);
      groups.get(todo.seriesId).push(todo);
    });
    const now = Date.now();
    const representatives = [...groups.values()].map((occurrences) => {
      const ordered = occurrences.sort((a, b) => new Date(a.scheduledAt || a.createdAt) - new Date(b.scheduledAt || b.createdAt));
      const series = seriesById.get(ordered[0].seriesId);
      if (!series) return ordered[0];
      if (!seriesDueOn(series, new Date(now))) return null;
      // 当天实例若被单独删除，则整组保持隐藏；绝不提前跳到未来实例。
      return ordered.find((todo) => sameLocalDate(todo.occurrenceKey, new Date(now))) || null;
    }).filter(Boolean);
    return [...standalone, ...representatives];
  }

  function validDate(value) {
    return value && !Number.isNaN(new Date(value).getTime());
  }

  function normalizeImportedSeries(series, index) {
    if (!series || typeof series !== "object") throw new Error(`第 ${index + 1} 条重复任务格式不正确`);
    const text = String(series.text || "").trim().slice(0, 100);
    if (!text) throw new Error(`第 ${index + 1} 条重复任务缺少名称`);
    if (!frequencies[series.frequency]) throw new Error(`第 ${index + 1} 条重复任务的周期无效`);
    if (!validDate(series.startAt)) throw new Error(`第 ${index + 1} 条重复任务的开始日期无效`);
    const repeatOn = normalizeRepeatOn(series.frequency, series.repeatOn, series.startAt);
    if (series.frequency === "weekly" && (repeatOn < 0 || repeatOn > 6)) throw new Error(`第 ${index + 1} 条重复任务的星期无效`);
    if (series.frequency === "monthly" && (repeatOn < 1 || repeatOn > 31)) throw new Error(`第 ${index + 1} 条重复任务的日期无效`);
    const deadline = series.deadline && validDate(series.deadline) ? new Date(series.deadline).toISOString() : null;
    const endAt = series.endAt && validDate(series.endAt)
      ? new Date(series.endAt).toISOString()
      : defaultSeriesEnd(series.startAt);
    return {
      ...series,
      id: String(series.id || uid()),
      modelVersion: 3,
      text,
      category: categories[series.category] ? series.category : "important",
      startAt: new Date(series.startAt).toISOString(),
      deadline,
      hasDeadline: Boolean(deadline),
      subtasks: normalizeSubtasks(series.subtasks),
      frequency: series.frequency,
      repeatOn,
      endAt,
      createdAt: validDate(series.createdAt) ? new Date(series.createdAt).toISOString() : new Date().toISOString(),
      exceptions: Array.isArray(series.exceptions)
        ? series.exceptions.filter(validDate).map((value) => new Date(value).toISOString())
        : [],
    };
  }

  function normalizeImportedTodo(todo, index) {
    if (!todo || typeof todo !== "object") throw new Error(`第 ${index + 1} 条任务格式不正确`);
    if (!String(todo.text || "").trim()) throw new Error(`第 ${index + 1} 条任务缺少名称`);
    for (const field of ["deadline", "scheduledAt", "createdAt", "completedAt", "occurrenceKey"]) {
      if (todo[field] && !validDate(todo[field])) throw new Error(`第 ${index + 1} 条任务的日期数据无效`);
    }
    const normalized = normalizeTodo(todo, index);
    return {
      ...normalized,
      deadline: normalized.deadline ? new Date(normalized.deadline).toISOString() : null,
      scheduledAt: normalized.scheduledAt ? new Date(normalized.scheduledAt).toISOString() : null,
      createdAt: new Date(normalized.createdAt).toISOString(),
      order: Number.isFinite(Number(normalized.order)) ? Number(normalized.order) : index,
      subtasks: normalizeSubtasks(normalized.subtasks),
      completedAt: normalized.completedAt ? new Date(normalized.completedAt).toISOString() : null,
      occurrenceKey: normalized.occurrenceKey ? new Date(normalized.occurrenceKey).toISOString() : null,
    };
  }

  function exportBackup() {
    return {
      app: "today-todo-list",
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      data: {
        todos: loadTodos(),
        series: loadSeries(),
      },
      preferences: {
        cowAffection: localStorage.getItem("today-highland-cow-v1") || "0",
        cowPosition: localStorage.getItem("today-highland-cow-position-v1") || null,
      },
    };
  }

  function importBackup(backup) {
    if (!backup || typeof backup !== "object") throw new Error("备份文件内容为空或格式不正确");
    if (backup.app !== "today-todo-list") throw new Error("这不是本 Todo List 导出的备份文件");
    if (backup.formatVersion !== 1) throw new Error("备份版本暂不支持，请使用新版页面导出的文件");
    if (!backup.data || !Array.isArray(backup.data.todos) || !Array.isArray(backup.data.series)) {
      throw new Error("备份文件缺少任务数据");
    }

    const series = backup.data.series.map(normalizeImportedSeries);
    const seriesIds = new Set(series.map((item) => item.id));
    if (seriesIds.size !== series.length) throw new Error("备份中存在重复的周期任务编号");
    const todos = backup.data.todos.map(normalizeImportedTodo).map((todo) => ({
      ...todo,
      seriesId: todo.seriesId && seriesIds.has(todo.seriesId) ? todo.seriesId : null,
      occurrenceKey: todo.seriesId && validDate(todo.occurrenceKey) ? new Date(todo.occurrenceKey).toISOString() : null,
    }));
    const todoIds = new Set(todos.map((item) => item.id));
    if (todoIds.size !== todos.length) throw new Error("备份中存在重复的任务编号");

    const oldTodos = localStorage.getItem(TODO_KEY);
    const oldSeries = localStorage.getItem(SERIES_KEY);
    const oldAffection = localStorage.getItem("today-highland-cow-v1");
    const oldPosition = localStorage.getItem("today-highland-cow-position-v1");
    try {
      saveSeries(series);
      saveTodos(todos);
      if (backup.preferences && backup.preferences.cowAffection !== undefined) {
        localStorage.setItem("today-highland-cow-v1", String(Math.max(0, Number(backup.preferences.cowAffection) || 0)));
      }
      if (backup.preferences && backup.preferences.cowPosition) {
        JSON.parse(backup.preferences.cowPosition);
        localStorage.setItem("today-highland-cow-position-v1", backup.preferences.cowPosition);
      } else {
        localStorage.removeItem("today-highland-cow-position-v1");
      }
      ensureOccurrences();
    } catch (error) {
      if (oldTodos === null) localStorage.removeItem(TODO_KEY); else localStorage.setItem(TODO_KEY, oldTodos);
      if (oldSeries === null) localStorage.removeItem(SERIES_KEY); else localStorage.setItem(SERIES_KEY, oldSeries);
      if (oldAffection === null) localStorage.removeItem("today-highland-cow-v1"); else localStorage.setItem("today-highland-cow-v1", oldAffection);
      if (oldPosition === null) localStorage.removeItem("today-highland-cow-position-v1"); else localStorage.setItem("today-highland-cow-position-v1", oldPosition);
      throw error;
    }
    return { todos: todos.length, series: series.length, exportedAt: backup.exportedAt || null };
  }

  window.TodoStore = {
    categories, frequencies, loadTodos, saveTodos, loadSeries, saveSeries,
    ensureOccurrences, addTodo, addSeries, toggleTodo, deleteOccurrence,
    updateOccurrence, updateSeries, deleteSeries, collapseTodos,
    seriesDueOn, calendarItemsForDate, exportBackup, importBackup,
    addSubtask, toggleSubtask, deleteSubtask, reorderTodos,
  };
})();
