(function () {
  "use strict";

  var STORAGE = {
    daily: "gymlog.daily",       // { "2026-07-27": { weight, calories, protein } }
    workouts: "gymlog.workouts"  // [ { id, date, name, exercises: [{name, sets:[{reps,weight}]}] } ]
  };

  var currentExercises = []; // in-progress workout builder state

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

  function loadWorkouts() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE.workouts) || "[]");
    } catch (e) {
      return [];
    }
  }

  function saveWorkouts(list) {
    localStorage.setItem(STORAGE.workouts, JSON.stringify(list));
  }

  function makeId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  // ---------- date helpers ----------

  function todayISO() {
    var d = new Date();
    var tz = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tz).toISOString().slice(0, 10);
  }

  function formatDateLong(iso) {
    var d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
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
    if (name === "workout") renderWorkoutBuilder();
  }

  // ---------- today view ----------

  function renderToday() {
    var daily = loadDaily();
    var today = document.getElementById("logDate").value || todayISO();
    var entry = daily[today] || {};
    document.getElementById("sumWeight").textContent = entry.weight != null ? entry.weight : "—";
    document.getElementById("sumCalories").textContent = entry.calories != null ? entry.calories : "—";
    document.getElementById("sumProtein").textContent = entry.protein != null ? entry.protein : "—";
    drawWeightChart(daily);
  }

  function fillFormFromDate(iso) {
    var daily = loadDaily();
    var entry = daily[iso] || {};
    document.getElementById("weightInput").value = entry.weight != null ? entry.weight : "";
    document.getElementById("caloriesInput").value = entry.calories != null ? entry.calories : "";
    document.getElementById("proteinInput").value = entry.protein != null ? entry.protein : "";
  }

  function handleDailySubmit(e) {
    e.preventDefault();
    var date = document.getElementById("logDate").value || todayISO();
    var weight = document.getElementById("weightInput").value;
    var calories = document.getElementById("caloriesInput").value;
    var protein = document.getElementById("proteinInput").value;

    var daily = loadDaily();
    var entry = {};
    if (weight !== "") entry.weight = parseFloat(weight);
    if (calories !== "") entry.calories = Math.round(parseFloat(calories));
    if (protein !== "") entry.protein = Math.round(parseFloat(protein));

    if (Object.keys(entry).length === 0) {
      delete daily[date];
    } else {
      daily[date] = entry;
    }
    saveDaily(daily);
    toast("Saved " + formatDateLong(date));
    renderToday();
  }

  // ---------- weight chart ----------

  function drawWeightChart(daily) {
    var canvas = document.getElementById("weightChart");
    var emptyEl = document.getElementById("chartEmpty");
    var points = Object.keys(daily)
      .filter(function (d) { return daily[d].weight != null; })
      .sort()
      .map(function (d) { return { date: d, weight: daily[d].weight }; });

    if (points.length < 2) {
      canvas.style.display = "none";
      emptyEl.style.display = "block";
      return;
    }
    canvas.style.display = "block";
    emptyEl.style.display = "none";

    points = points.slice(-30);

    var dpr = window.devicePixelRatio || 1;
    var cssWidth = canvas.clientWidth || canvas.parentElement.clientWidth;
    var cssHeight = 140;
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    var ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    var weights = points.map(function (p) { return p.weight; });
    var min = Math.min.apply(null, weights);
    var max = Math.max.apply(null, weights);
    if (min === max) { min -= 1; max += 1; }
    var pad = (max - min) * 0.15;
    min -= pad; max += pad;

    var padX = 8, padY = 10;
    var w = cssWidth - padX * 2;
    var h = cssHeight - padY * 2;

    var isDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    ctx.strokeStyle = isDark ? "#5ec2a0" : "#1f8f6c";
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach(function (p, i) {
      var x = padX + (i / (points.length - 1)) * w;
      var y = padY + h - ((p.weight - min) / (max - min)) * h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = ctx.strokeStyle;
    points.forEach(function (p, i) {
      var x = padX + (i / (points.length - 1)) * w;
      var y = padY + h - ((p.weight - min) / (max - min)) * h;
      ctx.beginPath();
      ctx.arc(x, y, i === points.length - 1 ? 3.5 : 2, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // ---------- workout builder ----------

  function renderWorkoutBuilder() {
    var list = document.getElementById("exerciseList");
    list.innerHTML = "";
    currentExercises.forEach(function (ex, exIdx) {
      var block = document.createElement("div");
      block.className = "exercise-block";

      var titleRow = document.createElement("div");
      titleRow.className = "ex-title-row";
      var title = document.createElement("div");
      title.className = "ex-title";
      title.textContent = ex.name;
      var removeExBtn = document.createElement("button");
      removeExBtn.type = "button";
      removeExBtn.className = "icon-btn";
      removeExBtn.textContent = "Remove";
      removeExBtn.addEventListener("click", function () {
        currentExercises.splice(exIdx, 1);
        renderWorkoutBuilder();
      });
      titleRow.appendChild(title);
      titleRow.appendChild(removeExBtn);
      block.appendChild(titleRow);

      ex.sets.forEach(function (set, setIdx) {
        var row = document.createElement("div");
        row.className = "set-row";
        row.innerHTML = '<span class="set-idx">#' + (setIdx + 1) + "</span><strong>" +
          set.reps + " reps</strong> @ <strong>" + set.weight + " kg</strong>";
        var removeSetBtn = document.createElement("button");
        removeSetBtn.type = "button";
        removeSetBtn.className = "remove";
        removeSetBtn.textContent = "✕";
        removeSetBtn.addEventListener("click", function () {
          ex.sets.splice(setIdx, 1);
          renderWorkoutBuilder();
        });
        row.appendChild(removeSetBtn);
        block.appendChild(row);
      });

      var addSetRow = document.createElement("div");
      addSetRow.className = "add-set-row";
      var repsInput = document.createElement("input");
      repsInput.type = "number";
      repsInput.placeholder = "Reps";
      repsInput.inputMode = "numeric";
      repsInput.min = "0";
      var weightInput = document.createElement("input");
      weightInput.type = "number";
      weightInput.placeholder = "Weight (kg)";
      weightInput.inputMode = "decimal";
      weightInput.step = "0.5";
      weightInput.min = "0";
      var addSetBtn = document.createElement("button");
      addSetBtn.type = "button";
      addSetBtn.className = "secondary";
      addSetBtn.textContent = "Add set";
      addSetBtn.addEventListener("click", function () {
        var reps = parseFloat(repsInput.value);
        var weight = parseFloat(weightInput.value);
        if (!reps) { toast("Enter reps"); return; }
        ex.sets.push({ reps: reps, weight: isNaN(weight) ? 0 : weight });
        renderWorkoutBuilder();
      });
      addSetRow.appendChild(repsInput);
      addSetRow.appendChild(weightInput);
      addSetRow.appendChild(addSetBtn);
      block.appendChild(addSetRow);

      list.appendChild(block);
    });
  }

  function handleAddExercise() {
    var input = document.getElementById("exerciseNameInput");
    var name = input.value.trim();
    if (!name) { toast("Enter an exercise name"); return; }
    currentExercises.push({ name: name, sets: [] });
    input.value = "";
    renderWorkoutBuilder();
  }

  function handleSaveWorkout() {
    var date = document.getElementById("workoutDate").value || todayISO();
    var name = document.getElementById("workoutName").value.trim() || "Workout";
    var exercises = currentExercises.filter(function (ex) { return ex.sets.length > 0; });

    if (exercises.length === 0) {
      toast("Add at least one set");
      return;
    }

    var workouts = loadWorkouts();
    workouts.push({ id: makeId(), date: date, name: name, exercises: exercises });
    saveWorkouts(workouts);

    currentExercises = [];
    document.getElementById("workoutName").value = "";
    renderWorkoutBuilder();
    toast("Workout saved");
    switchView("history");
  }

  // ---------- history view ----------

  function renderHistory() {
    var daily = loadDaily();
    var workouts = loadWorkouts();
    var list = document.getElementById("historyList");

    var dates = {};
    Object.keys(daily).forEach(function (d) { dates[d] = true; });
    workouts.forEach(function (w) { dates[w.date] = true; });

    var sorted = Object.keys(dates).sort().reverse();

    if (sorted.length === 0) {
      list.innerHTML = '<div class="empty-state">No entries yet. Log a day or a workout to get started.</div>';
      return;
    }

    list.innerHTML = "";
    sorted.forEach(function (date) {
      var wrap = document.createElement("div");
      wrap.className = "history-entry";

      var dateEl = document.createElement("div");
      dateEl.className = "h-date";
      dateEl.textContent = formatDateLong(date);
      wrap.appendChild(dateEl);

      var entry = daily[date];
      if (entry) {
        var line = document.createElement("div");
        line.className = "h-line";
        var parts = [];
        if (entry.weight != null) parts.push(entry.weight + " kg");
        if (entry.calories != null) parts.push(entry.calories + " kcal");
        if (entry.protein != null) parts.push(entry.protein + " g protein");
        line.innerHTML = "<span>" + parts.join(" · ") + "</span>";
        wrap.appendChild(line);
      }

      workouts.filter(function (w) { return w.date === date; }).forEach(function (w) {
        var wDiv = document.createElement("div");
        wDiv.className = "h-workout";
        var totalSets = w.exercises.reduce(function (sum, ex) { return sum + ex.sets.length; }, 0);
        var exNames = w.exercises.map(function (ex) { return ex.name + " (" + ex.sets.length + ")"; }).join(", ");
        wDiv.innerHTML = "<strong>🏋️ " + w.name + "</strong> — " + totalSets + " sets<br><span class=\"ex\">" + exNames + "</span>";
        wrap.appendChild(wDiv);
      });

      list.appendChild(wrap);
    });
  }

  // ---------- data export / import / clear ----------

  function handleExport() {
    var payload = {
      exportedAt: new Date().toISOString(),
      daily: loadDaily(),
      workouts: loadWorkouts()
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "gymlog-backup-" + todayISO() + ".json";
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
    if (payload.daily) saveDaily(payload.daily);
    if (payload.workouts) saveWorkouts(payload.workouts);
    toast("Import complete");
    renderToday();
    renderHistory();
  }

  function handleClear() {
    if (!confirm("Erase all logged data on this device? This cannot be undone.")) return;
    localStorage.removeItem(STORAGE.daily);
    localStorage.removeItem(STORAGE.workouts);
    currentExercises = [];
    renderToday();
    renderHistory();
    renderWorkoutBuilder();
    toast("All data erased");
  }

  // ---------- init ----------

  function init() {
    document.getElementById("headerDate").textContent = formatDateLong(todayISO());
    document.getElementById("logDate").value = todayISO();
    document.getElementById("workoutDate").value = todayISO();

    fillFormFromDate(todayISO());

    document.querySelectorAll(".tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { switchView(btn.dataset.view); });
    });

    document.getElementById("dailyForm").addEventListener("submit", handleDailySubmit);
    document.getElementById("logDate").addEventListener("change", function (e) {
      fillFormFromDate(e.target.value);
    });

    document.getElementById("addExerciseBtn").addEventListener("click", handleAddExercise);
    document.getElementById("exerciseNameInput").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); handleAddExercise(); }
    });
    document.getElementById("saveWorkoutBtn").addEventListener("click", handleSaveWorkout);

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
    document.getElementById("clearBtn").addEventListener("click", handleClear);

    window.addEventListener("resize", function () { renderToday(); });

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("sw.js").catch(function () {});
      });
    }

    renderToday();
    renderHistory();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
