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
    return read(SERIES_KEY, []).map((series) => ({
      ...series,
      hasDeadline: series.hasDeadline !== undefined ? Boolean(series.hasDeadline) : true,
      endAt: series.endAt || defaultSeriesEnd(series.startAt),
      exceptions: Array.isArray(series.exceptions) ? series.exceptions : [],
    }));
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
      const anchorDay = start.getDate();
      let cursor = new Date(start);
      let guard = 0;
      while (cursor <= horizon && guard < 1000) {
        const key = cursor.toISOString();
        const withinEnd = !series.endAt || cursor <= new Date(series.endAt);
        if (withinEnd && !series.exceptions.includes(key) && !existing.has(`${series.id}|${key}`)) {
          todos.push(normalizeTodo({
            id: uid(), text: series.text, category: series.category,
            deadline: series.hasDeadline ? key : null,
            scheduledAt: key, createdAt: series.createdAt,
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
    todos.unshift(normalizeTodo({ ...data, id: uid(), createdAt: new Date().toISOString(), completed: false }, 0));
    saveTodos(todos);
  }

  function addSeries(data) {
    const seriesList = loadSeries();
    const startAt = data.startAt || new Date().toISOString();
    seriesList.push({
      id: uid(), text: data.text, category: data.category,
      startAt: new Date(startAt).toISOString(),
      hasDeadline: Boolean(data.startAt),
      frequency: data.frequency,
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
    if (!target.seriesId || scope === "single") {
      if (target.seriesId) addException(target.seriesId, target.occurrenceKey);
      saveTodos(loadTodos().map((todo) => todo.id === id ? normalizeTodo({ ...todo, ...changes, detached: Boolean(target.seriesId) }, 0) : todo));
      return;
    }

    const oldSeries = loadSeries().find((series) => series.id === target.seriesId);
    if (!oldSeries) return;
    const cutoff = new Date(new Date(target.occurrenceKey).getTime() - 1).toISOString();
    const remainingEnd = oldSeries.endAt;
    const seriesList = loadSeries().map((series) => series.id === oldSeries.id ? { ...series, endAt: cutoff } : series);
    const newSeries = {
      ...oldSeries, id: uid(), text: changes.text, category: changes.category,
      startAt: new Date(changes.deadline || target.occurrenceKey).toISOString(),
      hasDeadline: Boolean(changes.deadline),
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
    const updated = { ...old, ...changes, startAt: new Date(changes.startAt || old.startAt).toISOString() };
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
    const groups = new Map();
    items.filter((todo) => todo.seriesId).forEach((todo) => {
      if (!groups.has(todo.seriesId)) groups.set(todo.seriesId, []);
      groups.get(todo.seriesId).push(todo);
    });
    const now = Date.now();
    const representatives = [...groups.values()].map((occurrences) => {
      const ordered = occurrences.sort((a, b) => new Date(a.scheduledAt || a.createdAt) - new Date(b.scheduledAt || b.createdAt));
      const alreadyStarted = ordered.filter((todo) => new Date(todo.scheduledAt || todo.createdAt).getTime() <= now);
      return alreadyStarted.length ? alreadyStarted[alreadyStarted.length - 1] : ordered[0];
    });
    return [...standalone, ...representatives];
  }

  window.TodoStore = {
    categories, frequencies, loadTodos, saveTodos, loadSeries, saveSeries,
    ensureOccurrences, addTodo, addSeries, toggleTodo, deleteOccurrence,
    updateOccurrence, updateSeries, deleteSeries, collapseTodos,
  };
})();
