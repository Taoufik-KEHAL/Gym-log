(function () {
  "use strict";

  var STORAGE = {
    daily: "gymlog.daily",     // { "2026-07-27": { weight, sleepHours, steps, water, cigarettes, dayType, moodMorning, moodMidday, moodEvening } }
    foods: "gymlog.foods",     // { "2026-07-27": { rice: true, potatoes: false, oliveOil: true, dates: false } }
    fasting: "gymlog.fasting"  // { current: {start: ISOString} | null, log: [{id, start, end, hours}] }
  };

  var DAY_TYPE_LABELS = {
    rest: "😴 Rest day",
    workout: "🏋️ Musculation",
    cardio: "🏃 Cardio day"
  };

  var FOOD_ITEMS = [
    { key: "rice", label: "Rice" },
    { key: "potatoes", label: "Potatoes" },
    { key: "oliveOil", label: "Olive oil" },
    { key: "dates", label: "Dates" }
  ];

  var currentDayType = null; // 'rest' | 'workout' | 'cardio' | null, for the Today form
  var fastingTimerInterval = null;

  // ---------- storage helpers ----------

  function loadDaily() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE.daily) || "{}");
    } catch (e) {
      return {};
    }
  }

  function saveDaily(data) {
    localStorage.setItem(STORAGE.daily, JSON.stringify(data));
  }

  function loadFoods() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE.foods) || "{}");
    } catch (e) {
      return {};
    }
  }

  function saveFoods(data) {
    localStorage.setItem(STORAGE.foods, JSON.stringify(data));
  }

  function makeId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  // ---------- date helpers ----------

  // Local (not UTC) calendar date, "yyyy-MM-dd", for an arbitrary Date instance.
  function localDateISO(d) {
    var tz = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tz).toISOString().slice(0, 10);
  }

  function todayISO() {
    return localDateISO(new Date());
  }

  function formatDateLong(iso) {
    var d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }

  function formatDateShort(iso) {
    var d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }

  function addDaysISO(iso, delta) {
    var d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + delta);
    var tz = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tz).toISOString().slice(0, 10);
  }

  // ---------- toast ----------

  var toastTimer = null;
  function toast(msg) {
    var el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove("show");
    }, 1800);
  }

  // ---------- tab navigation ----------

  function switchView(name) {
    document.querySelectorAll(".view").forEach(function (v) {
      v.classList.toggle("active", v.id === "view-" + name);
    });
    document.querySelectorAll(".tab-btn").forEach(function (b) {
      b.classList.toggle("active", b.dataset.view === name);
    });
    if (name === "today") renderToday();
    if (name === "history") renderHistory();
    if (name === "food") renderFoodChecklist(document.getElementById("foodDate").value || todayISO());
    if (name === "trends") renderTrends();
  }

  // ---------- today view ----------

  function renderToday() {
    var daily = loadDaily();
    var today = document.getElementById("logDate").value || todayISO();
    var entry = daily[today] || {};
    document.getElementById("sumWeight").textContent = entry.weight != null ? entry.weight : "—";
    document.getElementById("sumSleep").textContent = entry.sleepHours != null ? entry.sleepHours : "—";
    document.getElementById("sumSteps").textContent = entry.steps != null ? entry.steps : "—";
    document.getElementById("sumWater").textContent = entry.water != null ? entry.water : "—";
    document.getElementById("sumCigarettes").textContent = entry.cigarettes != null ? entry.cigarettes : "—";
    renderDayStatus(entry);
    renderWeightTrend(daily);
  }

  function renderDayStatus(entry) {
    var el = document.getElementById("dayStatus");
    if (!entry.dayType || !DAY_TYPE_LABELS[entry.dayType]) {
      el.style.display = "none";
      el.innerHTML = "";
      return;
    }
    el.innerHTML = '<span class="day-badge">' + DAY_TYPE_LABELS[entry.dayType] + "</span>";
    el.style.display = "flex";
  }

  function setDayTypeToggle(dayType) {
    currentDayType = dayType;
    document.querySelectorAll("#dayTypeToggle .segment").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.dayType === dayType);
    });
  }

  var MOOD_FIELDS = [
    { input: "moodMorningInput", value: "moodMorningValue", entry: "moodMorning" },
    { input: "moodMiddayInput", value: "moodMiddayValue", entry: "moodMidday" },
    { input: "moodEveningInput", value: "moodEveningValue", entry: "moodEvening" }
  ];

  function nativeStepsAvailable() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() &&
      window.Capacitor.Plugins && window.Capacitor.Plugins.Steps);
  }

  // Persists a freshly-read step count into today's entry and, if the Today form is
  // currently showing today's date, reflects it in the UI immediately. Called both from
  // the initial getTodaySteps() read and from every live "stepsUpdate" push event, so the
  // step count stays in sync automatically without any manual sync action.
  function applyStepsUpdate(steps) {
    var today = todayISO();
    var daily = loadDaily();
    var entry = daily[today] || {};
    entry.steps = steps;
    daily[today] = entry;
    saveDaily(daily);

    var shownDate = document.getElementById("logDate").value || today;
    if (shownDate === today) {
      document.getElementById("stepsInput").value = steps;
      document.getElementById("sumSteps").textContent = steps;
    }
  }

  function startStepsSync() {
    if (!nativeStepsAvailable()) return;
    var Steps = window.Capacitor.Plugins.Steps;
    Steps.addListener("stepsUpdate", function (data) {
      applyStepsUpdate(data.steps);
    });
    Steps.getTodaySteps().then(function (result) {
      applyStepsUpdate(result.steps);
    }).catch(function () {});
  }

  // Recalibrates the native baseline so future sensor reads (auto-fill, the periodic
  // background updates) report the given "steps so far today" value plus whatever new
  // steps happen from now on, instead of the device's own possibly-stale baseline
  // overwriting it.
  function recalibrateNativeSteps(stepsValue) {
    if (!nativeStepsAvailable()) return;
    window.Capacitor.Plugins.Steps.setTodaySteps({ steps: stepsValue }).catch(function () {});
  }

  // If the imported backup includes today's step count, treat it as the accurate
  // "steps so far" reference point.
  function recalibrateStepsFromImport(daily) {
    var entry = daily[todayISO()];
    if (!entry || entry.steps == null) return;
    recalibrateNativeSteps(entry.steps);
  }

  function fillFormFromDate(iso) {
    var daily = loadDaily();
    var entry = daily[iso] || {};
    document.getElementById("weightInput").value = entry.weight != null ? entry.weight : "";
    document.getElementById("sleepInput").value = entry.sleepHours != null ? entry.sleepHours : "";
    document.getElementById("stepsInput").value = entry.steps != null ? entry.steps : "";
    document.getElementById("waterInput").value = entry.water != null ? entry.water : "";
    document.getElementById("cigarettesInput").value = entry.cigarettes != null ? entry.cigarettes : "";
    setDayTypeToggle(entry.dayType || null);
    MOOD_FIELDS.forEach(function (f) {
      var input = document.getElementById(f.input);
      var valueEl = document.getElementById(f.value);
      var stored = entry[f.entry];
      input.value = stored != null ? stored : 5;
      input.dataset.touched = stored != null ? "1" : "0";
      // Once a mood is logged for a given day it's locked in permanently -- it's a
      // record of how you felt at that moment, not something to revise in hindsight.
      input.disabled = stored != null;
      valueEl.textContent = stored != null ? stored + " 🔒" : "—";
    });
  }

  function handleDailySubmit(e) {
    e.preventDefault();
    var date = document.getElementById("logDate").value || todayISO();
    var weight = document.getElementById("weightInput").value;
    var sleepHours = document.getElementById("sleepInput").value;
    var steps = document.getElementById("stepsInput").value;
    var water = document.getElementById("waterInput").value;
    var cigarettes = document.getElementById("cigarettesInput").value;

    var daily = loadDaily();
    var existing = daily[date] || {};
    var entry = {};
    if (weight !== "") entry.weight = parseFloat(weight);
    if (sleepHours !== "") entry.sleepHours = parseFloat(sleepHours);
    if (steps !== "") entry.steps = Math.round(parseFloat(steps));
    if (water !== "") entry.water = parseFloat(water);
    if (cigarettes !== "") entry.cigarettes = Math.round(parseFloat(cigarettes));
    if (currentDayType) entry.dayType = currentDayType;
    MOOD_FIELDS.forEach(function (f) {
      // Already logged for this day -- keep it exactly as first recorded, even if the
      // disabled slider were somehow bypassed.
      if (existing[f.entry] != null) { entry[f.entry] = existing[f.entry]; return; }
      var input = document.getElementById(f.input);
      if (input.dataset.touched === "1") entry[f.entry] = parseInt(input.value, 10);
    });

    if (Object.keys(entry).length === 0) {
      delete daily[date];
    } else {
      daily[date] = entry;
    }
    saveDaily(daily);
    // A manually-entered steps count for today is the user's authoritative "steps so
    // far" figure -- recalibrate the native baseline so it's the new reference point
    // instead of being silently overwritten by the next background sensor update.
    if (date === todayISO() && entry.steps != null) recalibrateNativeSteps(entry.steps);
    toast("Saved " + formatDateLong(date));
    fillFormFromDate(date);
    renderToday();
  }

  // ---------- charts ----------

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  function pickDateLabelIndices(count, width) {
    if (count <= 1) return [0];
    var maxLabels = Math.max(2, Math.min(6, Math.floor(width / 55)));
    var n = Math.min(maxLabels, count);
    var indices = [];
    for (var k = 0; k < n; k++) {
      indices.push(Math.round((k * (count - 1)) / (n - 1)));
    }
    var seen = {};
    return indices.filter(function (idx) {
      if (seen[idx]) return false;
      seen[idx] = true;
      return true;
    });
  }

  function drawLineChart(canvasId, emptyId, points) {
    var isDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    var color = isDark ? "#5ec2a0" : "#1f8f6c";
    drawMultiLineChart(canvasId, emptyId, [{ points: points, color: color }], { showMinMax: true });
  }

  function formatChartPointValue(v) {
    var r = Math.round(v * 10) / 10;
    return String(r);
  }

  function drawMultiLineChart(canvasId, emptyId, seriesList, options) {
    options = options || {};
    var canvas = document.getElementById(canvasId);
    var emptyEl = document.getElementById(emptyId);

    var allDatesSet = {};
    seriesList.forEach(function (s) { s.points.forEach(function (p) { allDatesSet[p.date] = true; }); });
    var allDates = Object.keys(allDatesSet).sort();

    if (allDates.length < 2) {
      canvas.style.display = "none";
      emptyEl.style.display = "block";
      return;
    }
    canvas.style.display = "block";
    emptyEl.style.display = "none";

    var dpr = window.devicePixelRatio || 1;
    var cssWidth = canvas.clientWidth || canvas.parentElement.clientWidth;
    var labelSpace = 16;
    var cssHeight = 140 + labelSpace;
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    var ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    var allValues = [];
    seriesList.forEach(function (s) { s.points.forEach(function (p) { allValues.push(p.value); }); });
    var min = Math.min.apply(null, allValues);
    var max = Math.max.apply(null, allValues);
    if (min === max) { min -= 1; max += 1; }
    var pad = (max - min) * 0.15;
    min -= pad; max += pad;

    var padX = 8, padY = 10;
    var w = cssWidth - padX * 2;
    var h = cssHeight - padY * 2 - labelSpace;

    var dateIndex = {};
    allDates.forEach(function (d, i) { dateIndex[d] = i; });

    seriesList.forEach(function (s) {
      if (s.points.length === 0) return;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.setLineDash(s.dashed ? [5, 4] : []);
      ctx.beginPath();
      s.points.forEach(function (p, i) {
        var x = padX + (dateIndex[p.date] / (allDates.length - 1)) * w;
        var y = padY + h - ((p.value - min) / (max - min)) * h;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);

      if (s.dashed) return;
      ctx.fillStyle = s.color;
      s.points.forEach(function (p, i) {
        var x = padX + (dateIndex[p.date] / (allDates.length - 1)) * w;
        var y = padY + h - ((p.value - min) / (max - min)) * h;
        ctx.beginPath();
        ctx.arc(x, y, i === s.points.length - 1 ? 3.5 : 2, 0, Math.PI * 2);
        ctx.fill();
      });
    });

    if (options.showMinMax && seriesList.length === 1 && seriesList[0].points.length > 0) {
      var pts = seriesList[0].points;
      var maxPoint = pts[0], minPoint = pts[0];
      pts.forEach(function (p) {
        if (p.value > maxPoint.value) maxPoint = p;
        if (p.value < minPoint.value) minPoint = p;
      });
      var textMain = getComputedStyle(document.documentElement).getPropertyValue("--text").trim() || "#f2f3f5";
      ctx.fillStyle = textMain;
      ctx.font = "bold 10px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
      var edge = w * 0.12;
      var pointY = function (p) { return padY + h - ((p.value - min) / (max - min)) * h; };
      var drawValueLabel = function (p, above) {
        var x = padX + (dateIndex[p.date] / (allDates.length - 1)) * w;
        var y = pointY(p);
        ctx.textAlign = x <= padX + edge ? "left" : x >= padX + w - edge ? "right" : "center";
        ctx.fillText(formatChartPointValue(p.value), x, above ? y - 6 : y + 14);
      };
      drawValueLabel(maxPoint, true);
      if (minPoint !== maxPoint) drawValueLabel(minPoint, false);
      var lastPoint = pts[pts.length - 1];
      if (lastPoint !== maxPoint && lastPoint !== minPoint) {
        drawValueLabel(lastPoint, pointY(lastPoint) > padY + h / 2);
      }
    }

    var textDim = getComputedStyle(document.documentElement).getPropertyValue("--text-dim").trim() || "#9aa1ac";
    ctx.fillStyle = textDim;
    ctx.font = "9px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
    pickDateLabelIndices(allDates.length, w).forEach(function (idx) {
      var x = padX + (idx / (allDates.length - 1)) * w;
      ctx.textAlign = idx === 0 ? "left" : idx === allDates.length - 1 ? "right" : "center";
      ctx.fillText(formatDateShort(allDates[idx]), x, cssHeight - 3);
    });
  }

  function getEarliestLoggedWeightDate() {
    var daily = loadDaily();
    var dates = Object.keys(daily).filter(function (d) { return daily[d].weight != null; }).sort();
    return dates.length ? dates[0] : null;
  }

  function getDefaultWeightTrendStart(end) {
    var earliest = getEarliestLoggedWeightDate();
    return earliest || addDaysISO(end, -29);
  }

  function resetWeightTrendDateInputs() {
    var end = todayISO();
    document.getElementById("weightTrendEndInput").value = end;
    document.getElementById("weightTrendStartInput").value = getDefaultWeightTrendStart(end);
  }

  function getWeightTrendRange() {
    var end = document.getElementById("weightTrendEndInput").value || todayISO();
    var start = document.getElementById("weightTrendStartInput").value || getDefaultWeightTrendStart(end);
    if (start > end) { var tmp = start; start = end; end = tmp; }
    return { start: start, end: end };
  }

  function renderWeightTrend(daily) {
    var range = getWeightTrendRange();
    var points = Object.keys(daily)
      .filter(function (d) { return d >= range.start && d <= range.end && daily[d].weight != null; })
      .sort()
      .map(function (d) { return { date: d, value: daily[d].weight }; });
    drawLineChart("weightChart", "chartEmpty", points);
  }

  // ---------- trends view ----------

  function getEarliestLoggedDate() {
    var daily = loadDaily();
    var dates = Object.keys(daily).sort();
    return dates.length ? dates[0] : null;
  }

  function getDefaultTrendsStart(end) {
    var earliest = getEarliestLoggedDate();
    return earliest || addDaysISO(end, -29);
  }

  function resetTrendsDateInputs() {
    var end = todayISO();
    document.getElementById("trendsEndInput").value = end;
    document.getElementById("trendsStartInput").value = getDefaultTrendsStart(end);
  }

  function getTrendsRange() {
    var end = document.getElementById("trendsEndInput").value || todayISO();
    var start = document.getElementById("trendsStartInput").value || getDefaultTrendsStart(end);
    if (start > end) { var tmp = start; start = end; end = tmp; }
    return { start: start, end: end };
  }

  var TREND_METRICS = [
    { key: "steps", canvasId: "trendsStepsChart", emptyId: "trendsStepsEmpty" },
    { key: "sleepHours", canvasId: "trendsSleepChart", emptyId: "trendsSleepEmpty" },
    { key: "water", canvasId: "trendsWaterChart", emptyId: "trendsWaterEmpty" },
    { key: "cigarettes", canvasId: "trendsCigarettesChart", emptyId: "trendsCigarettesEmpty" }
  ];

  function renderMetricTrend(cfg, daily, range) {
    var points = Object.keys(daily)
      .filter(function (d) { return d >= range.start && d <= range.end && daily[d][cfg.key] != null; })
      .sort()
      .map(function (d) { return { date: d, value: daily[d][cfg.key] }; });
    drawLineChart(cfg.canvasId, cfg.emptyId, points);
  }

  function renderTrends() {
    var daily = loadDaily();
    var range = getTrendsRange();
    TREND_METRICS.forEach(function (cfg) { renderMetricTrend(cfg, daily, range); });
  }

  // ---------- fasting ----------

  function loadFasting() {
    try {
      var data = JSON.parse(localStorage.getItem(STORAGE.fasting) || "{}");
      return { current: data.current || null, log: data.log || [] };
    } catch (e) {
      return { current: null, log: [] };
    }
  }

  function saveFasting(data) {
    localStorage.setItem(STORAGE.fasting, JSON.stringify(data));
  }

  function startFast() {
    var fasting = loadFasting();
    fasting.current = { start: new Date().toISOString() };
    saveFasting(fasting);
    renderFastingStatus();
  }

  function cancelFast() {
    if (!confirm("Cancel the current fast? It won't be recorded.")) return;
    var fasting = loadFasting();
    fasting.current = null;
    saveFasting(fasting);
    renderFastingStatus();
  }

  // Ends the active fast (if any) right now and logs its duration -- called whenever
  // food gets logged for today, since eating is what breaks a fast.
  function breakFastNow() {
    var fasting = loadFasting();
    if (!fasting.current) return;
    var startMs = new Date(fasting.current.start).getTime();
    var end = new Date();
    var hours = Math.round(((end.getTime() - startMs) / 3600000) * 10) / 10;
    fasting.log.push({ id: makeId(), start: fasting.current.start, end: end.toISOString(), hours: hours });
    fasting.current = null;
    saveFasting(fasting);
    renderFastingStatus();
    renderHistory();
  }

  function formatFastingDuration(hours) {
    var h = Math.floor(hours);
    var m = Math.round((hours - h) * 60);
    if (m === 60) { h += 1; m = 0; }
    return h + "h " + m + "m";
  }

  function formatClockTime(iso) {
    var d = new Date(iso);
    var h = d.getHours();
    var m = d.getMinutes();
    return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
  }

  function renderFastingStatus() {
    var fasting = loadFasting();
    var timerEl = document.getElementById("fastingTimer");
    var labelEl = document.getElementById("fastingLabel");
    var wakeBtn = document.getElementById("wakeUpBtn");
    var cancelBtn = document.getElementById("cancelFastBtn");
    if (!timerEl) return;

    clearInterval(fastingTimerInterval);
    fastingTimerInterval = null;

    if (fasting.current) {
      wakeBtn.style.display = "none";
      cancelBtn.style.display = "inline-block";
      labelEl.textContent = "Fasting since " + formatClockTime(fasting.current.start);
      var update = function () {
        var hours = (Date.now() - new Date(fasting.current.start).getTime()) / 3600000;
        timerEl.textContent = formatFastingDuration(hours);
      };
      update();
      fastingTimerInterval = setInterval(update, 60000);
    } else {
      wakeBtn.style.display = "inline-block";
      cancelBtn.style.display = "none";
      var lastFast = fasting.log[fasting.log.length - 1];
      timerEl.textContent = lastFast ? formatFastingDuration(lastFast.hours) : "—";
      labelEl.textContent = lastFast ? "Last fast" : "Not fasting";
    }
  }

  // ---------- food checklist ----------

  function renderFoodChecklist(date) {
    var foods = loadFoods()[date] || {};
    document.querySelectorAll("#foodChecklist input[data-food]").forEach(function (input) {
      input.checked = !!foods[input.dataset.food];
    });
  }

  function handleFoodCheckboxChange(e) {
    var checkbox = e.target;
    var key = checkbox.dataset.food;
    var date = document.getElementById("foodDate").value || todayISO();
    var foods = loadFoods();
    var dayFoods = foods[date] || {};
    dayFoods[key] = checkbox.checked;
    foods[date] = dayFoods;
    saveFoods(foods);
    // Checking a food off today breaks an active fast, same as any other food log.
    if (checkbox.checked && date === todayISO()) breakFastNow();
  }

  // ---------- history view ----------

  function renderHistory() {
    var daily = loadDaily();
    var foods = loadFoods();
    var list = document.getElementById("historyList");

    // Completed fasts are attributed to the date they ended on -- the day the
    // fast was actually broken, which is when its duration became known.
    var fastsByDate = {};
    loadFasting().log.forEach(function (f) {
      var d = localDateISO(new Date(f.end));
      (fastsByDate[d] = fastsByDate[d] || []).push(f);
    });

    var dates = {};
    Object.keys(daily).forEach(function (d) { dates[d] = true; });
    Object.keys(foods).forEach(function (d) {
      if (FOOD_ITEMS.some(function (f) { return foods[d][f.key]; })) dates[d] = true;
    });
    Object.keys(fastsByDate).forEach(function (d) { dates[d] = true; });

    var sorted = Object.keys(dates).sort().reverse();

    if (sorted.length === 0) {
      list.innerHTML = '<div class="empty-state">No entries yet. Log a day to get started.</div>';
      return;
    }

    var weightDatesAsc = Object.keys(daily).filter(function (d) { return daily[d].weight != null; }).sort();
    var prevWeightByDate = {};
    for (var wi = 1; wi < weightDatesAsc.length; wi++) {
      prevWeightByDate[weightDatesAsc[wi]] = daily[weightDatesAsc[wi - 1]].weight;
    }

    list.innerHTML = "";
    sorted.forEach(function (date) {
      var wrap = document.createElement("div");
      wrap.className = "history-entry";

      var dateEl = document.createElement("div");
      dateEl.className = "h-date";
      dateEl.textContent = formatDateLong(date);
      if (daily[date] && DAY_TYPE_LABELS[daily[date].dayType]) {
        var badge = document.createElement("span");
        badge.className = "day-type-badge";
        badge.textContent = DAY_TYPE_LABELS[daily[date].dayType];
        dateEl.appendChild(badge);
      }
      wrap.appendChild(dateEl);

      var entry = daily[date];
      if (entry) {
        var line = document.createElement("div");
        line.className = "h-line";
        var parts = [];
        if (entry.weight != null) {
          var weightPart = entry.weight + " kg";
          var prevWeight = prevWeightByDate[date];
          if (prevWeight != null) {
            var weightDiff = round1(entry.weight - prevWeight);
            var diffCls = weightDiff < 0 ? "diff-down" : weightDiff > 0 ? "diff-up" : "";
            weightPart += ' <span class="weight-diff' + (diffCls ? " " + diffCls : "") + '">(' +
              (weightDiff > 0 ? "+" : "") + weightDiff + ")</span>";
          }
          parts.push(weightPart);
        }
        if (entry.sleepHours != null) parts.push(entry.sleepHours + " h sleep");
        if (entry.steps != null) parts.push(entry.steps + " steps");
        if (entry.water != null) parts.push(entry.water + " L water");
        if (entry.cigarettes != null) parts.push(entry.cigarettes + " cigarettes");
        if (parts.length) {
          line.innerHTML = "<span>" + parts.join(" · ") + "</span>";
          wrap.appendChild(line);
        }
      }

      var dayFoods = foods[date] || {};
      var eaten = FOOD_ITEMS.filter(function (f) { return dayFoods[f.key]; }).map(function (f) { return f.label; });
      if (eaten.length) {
        var foodLine = document.createElement("div");
        foodLine.className = "h-line";
        foodLine.innerHTML = "<span>🍽️ " + eaten.join(", ") + "</span>";
        wrap.appendChild(foodLine);
      }

      (fastsByDate[date] || []).forEach(function (f) {
        var fastLine = document.createElement("div");
        fastLine.className = "h-line";
        fastLine.innerHTML = "<span>⏱️ Fasted " + formatFastingDuration(f.hours) + " (" +
          formatClockTime(f.start) + " → " + formatClockTime(f.end) + ")</span>";
        wrap.appendChild(fastLine);
      });

      list.appendChild(wrap);
    });
  }

  // ---------- data export / import / clear ----------

  async function handleExport() {
    var payload = {
      exportedAt: new Date().toISOString(),
      daily: loadDaily(),
      foods: loadFoods(),
      fasting: loadFasting()
    };
    var json = JSON.stringify(payload, null, 2);
    var filename = "gymlog-lite-backup-" + todayISO() + ".json";

    var isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

    if (isNative) {
      try {
        var plugins = window.Capacitor.Plugins;
        await plugins.Filesystem.writeFile({ path: filename, data: json, directory: "CACHE", encoding: "utf8" });
        var uriResult = await plugins.Filesystem.getUri({ directory: "CACHE", path: filename });
        await plugins.Share.share({
          title: "Gym Log Lite backup",
          text: "Gym Log Lite backup " + todayISO(),
          url: uriResult.uri,
          dialogTitle: "Save or send your backup"
        });
        toast("Choose where to save your backup");
        return;
      } catch (e) {
        // Fall through to the plain download as a last resort.
      }
    }

    var canUseSavePicker = typeof window.showSaveFilePicker === "function" && !isNative;
    if (canUseSavePicker) {
      try {
        var handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: "JSON backup", accept: { "application/json": [".json"] } }]
        });
        var writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();
        toast("Backup saved");
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return;
        // Fall through to the plain download if the picker isn't usable here.
      }
    }

    var blob = new Blob([json], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Backup downloaded");
  }

  function handleImportText(text) {
    var payload;
    try {
      payload = JSON.parse(text);
    } catch (e) {
      toast("Invalid JSON");
      return;
    }
    if (payload.daily) { saveDaily(payload.daily); recalibrateStepsFromImport(payload.daily); }
    if (payload.foods) saveFoods(payload.foods);
    if (payload.fasting) { saveFasting(payload.fasting); renderFastingStatus(); }
    toast("Import complete");
    fillFormFromDate(document.getElementById("logDate").value || todayISO());
    resetWeightTrendDateInputs();
    resetTrendsDateInputs();
    renderToday();
    renderHistory();
    renderTrends();
    renderFoodChecklist(document.getElementById("foodDate").value || todayISO());
  }

  function handleClear() {
    if (!confirm("Erase all logged data on this device? This cannot be undone.")) return;
    localStorage.removeItem(STORAGE.daily);
    localStorage.removeItem(STORAGE.foods);
    localStorage.removeItem(STORAGE.fasting);
    resetWeightTrendDateInputs();
    resetTrendsDateInputs();
    renderToday();
    renderHistory();
    renderTrends();
    renderFastingStatus();
    renderFoodChecklist(document.getElementById("foodDate").value || todayISO());
    toast("All data erased");
  }

  // ---------- init ----------

  function init() {
    document.getElementById("headerDate").textContent = formatDateLong(todayISO());
    document.getElementById("logDate").value = todayISO();
    document.getElementById("foodDate").value = todayISO();
    resetWeightTrendDateInputs();
    resetTrendsDateInputs();

    document.getElementById("stepsAutoHint").style.display = nativeStepsAvailable() ? "block" : "none";
    startStepsSync();

    fillFormFromDate(todayISO());

    document.querySelectorAll(".tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { switchView(btn.dataset.view); });
    });

    document.getElementById("dailyForm").addEventListener("submit", handleDailySubmit);
    document.getElementById("wakeUpBtn").addEventListener("click", startFast);
    document.getElementById("cancelFastBtn").addEventListener("click", cancelFast);
    renderFastingStatus();
    document.getElementById("logDate").addEventListener("change", function (e) {
      fillFormFromDate(e.target.value);
      renderToday();
    });
    MOOD_FIELDS.forEach(function (f) {
      var input = document.getElementById(f.input);
      var valueEl = document.getElementById(f.value);
      input.addEventListener("input", function () {
        input.dataset.touched = "1";
        valueEl.textContent = input.value;
      });
    });

    document.querySelectorAll("#dayTypeToggle .segment").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setDayTypeToggle(currentDayType === btn.dataset.dayType ? null : btn.dataset.dayType);
      });
    });

    document.getElementById("weightTrendStartInput").addEventListener("change", renderToday);
    document.getElementById("weightTrendEndInput").addEventListener("change", renderToday);

    document.getElementById("trendsStartInput").addEventListener("change", renderTrends);
    document.getElementById("trendsEndInput").addEventListener("change", renderTrends);

    document.getElementById("foodDate").addEventListener("change", function (e) {
      renderFoodChecklist(e.target.value);
    });
    document.querySelectorAll("#foodChecklist input[data-food]").forEach(function (input) {
      input.addEventListener("change", handleFoodCheckboxChange);
    });

    document.getElementById("exportBtn").addEventListener("click", handleExport);
    document.getElementById("importBtn").addEventListener("click", function () {
      var box = document.getElementById("importBox");
      if (box.style.display === "none") {
        box.style.display = "block";
      } else if (box.value.trim()) {
        handleImportText(box.value.trim());
        box.value = "";
        box.style.display = "none";
      }
    });
    document.getElementById("importFileBtn").addEventListener("click", function () {
      document.getElementById("importFile").click();
    });
    document.getElementById("importFile").addEventListener("change", function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () { handleImportText(String(reader.result)); };
      reader.onerror = function () { toast("Could not read file"); };
      reader.readAsText(file);
      e.target.value = "";
    });
    document.getElementById("clearBtn").addEventListener("click", handleClear);

    window.addEventListener("resize", function () { renderToday(); renderTrends(); });
    // Refresh the fasting timer's display immediately on foregrounding, so it
    // doesn't look stale for up to a minute after the app was backgrounded.
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) renderFastingStatus();
    });

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("sw.js").catch(function () {});
      });
    }

    renderToday();
    renderHistory();
    renderFoodChecklist(todayISO());
    renderTrends();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
