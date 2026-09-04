(function () {
  "use strict";

  var STORAGE = {
    daily: "gymlog.daily",       // { "2026-07-27": { weight, sleepHours, steps, water, cigarettes, dayType } }
    workouts: "gymlog.workouts", // [ { id, date, name, exercises: [{name, sets:[{reps,weight}]}] } ]
    foods: "gymlog.foods",       // { "2026-07-27": { corn: true, potatoes: false, water: true, ... } }
    customExercises: "gymlog.customExercises", // [ { name, type: 'strength' | 'cardio' } ]
    customWorkoutTemplates: "gymlog.customWorkoutTemplates", // [ { id, name, exercises: [{name, type}] } ]
    fasting: "gymlog.fasting" // { current: {start: ISOString} | null, log: [{id, start, end, hours}] }
  };

  var WORKOUT_TEMPLATE_SEED = [
    {
      name: "Full Body (Wave 15→12→8→6)",
      exercises: [
        { name: "Dumbbell Bench Press", type: "strength" },
        { name: "Incline Dumbbell Press", type: "strength" },
        { name: "Pullover", type: "strength" },
        { name: "Lat Pulldown - Wide Grip", type: "strength" },
        { name: "Lat Pulldown - Close Grip", type: "strength" },
        { name: "Leg Press (Machine)", type: "strength" },
        { name: "Leg Extension (Machine)", type: "strength" },
        { name: "Seated Leg Curl (Machine)", type: "strength" },
        { name: "Lateral Raise (Machine)", type: "strength" },
        { name: "Pectoral fly", type: "strength" },
        { name: "Preacher Curl", type: "strength" },
        { name: "Cycling", type: "cardio" }
      ]
    }
  ];

  var FOOD_ITEMS = [
    { key: "water", label: "Water" },
    { key: "blackCoffee", label: "Black coffee" },
    { key: "corn", label: "Corn (all forms)" },
    { key: "potatoes", label: "Potatoes" },
    { key: "oliveOil", label: "Olive oil" },
    { key: "butter", label: "Butter" },
    { key: "ghee", label: "Traditional ghee (smen)" },
    { key: "vegetableOils", label: "Vegetable oils (some)" },
    { key: "cheddar", label: "Cheddar" },
    { key: "gouda", label: "Gouda" },
    { key: "edam", label: "Edam / Flamenco-style" },
    { key: "mozzarella", label: "Mozzarella" },
    { key: "parmesan", label: "Parmesan" },
    { key: "roquefort", label: "Roquefort" },
    { key: "processedCheese", label: "Processed cheese" },
    { key: "dates", label: "Dates" },
    { key: "grapes", label: "Grapes" },
    { key: "figs", label: "Figs" },
    { key: "banana", label: "Banana" },
    { key: "apple", label: "Apple" },
    { key: "pear", label: "Pear" },
    { key: "guava", label: "Seedless guava" },
    { key: "lamb", label: "Lamb" },
    { key: "goat", label: "Goat" },
    { key: "camel", label: "Camel" },
    { key: "seaFish", label: "Sea fish (some)" },
    { key: "pigeon", label: "Pigeon" },
    { key: "quail", label: "Quail" },
    { key: "rabbit", label: "Rabbit" }
  ];

  var DEFAULT_BODYWEIGHT_KG = 75; // used to estimate calories burned when no weight is logged for the day
  // Evidence-based daily minimums for the Today stat-card good/bad coloring.
  var STRENGTH_MET = 6.0; // general resistance training, ~1 minute assumed per set
  var STEPS_KCAL_PER_STEP_PER_KG = 0.0005; // rough walking-equivalent burn per step per kg bodyweight
  var CARDIO_MET_TABLE = {
    "cycling": 7.5,
    "rowing machine": 7.0,
    "jump rope": 10.0,
    "stair climber": 8.0,
    "elliptical": 5.0,
    "treadmill": 8.0,
    "assault bike": 8.0,
    "ski erg": 7.0
  };

  var DAY_TYPE_LABELS = {
    rest: "😴 Rest day",
    workout: "🏋️ Workout day",
    cardio: "🏃 Cardio day"
  };

  var currentExercises = []; // in-progress workout builder state
  var editingWorkoutId = null; // id of the workout being edited, or null when building a new one
  var lastAutoWorkoutName = ""; // tracks the auto-generated session name so user edits aren't clobbered on date change
  var currentDayType = null; // 'rest' | 'workout' | null, for the Today form
  var currentExerciseType = "strength"; // 'strength' | 'cardio', for the exercise about to be added

  var CUSTOM_EXERCISE_VALUE = "__custom__";

  var EXERCISE_LIBRARY = {
    "Chest": [
      "Barbell Bench Press", "Incline Barbell Bench Press", "Decline Barbell Bench Press",
      "Dumbbell Bench Press", "Incline Dumbbell Press", "Decline Dumbbell Press",
      "Dumbbell Pullover", "Dumbbell Chest Fly", "Cable Fly", "Cable Crossover",
      "Pec Deck (Machine)", "Chest Press (Machine)", "Incline Chest Press (Machine)",
      "Smith Machine Bench Press", "Push-Up", "Dips"
    ],
    "Back": [
      "Deadlift", "Pull-Up", "Chin-Up", "Assisted Pull-Up (Machine)",
      "Lat Pulldown - Wide Grip", "Lat Pulldown - Close Grip", "Straight-Arm Pulldown (Cable)",
      "Barbell Row", "Pendlay Row", "Dumbbell Row", "T-Bar Row",
      "Seated Cable Row", "Chest-Supported Row (Machine)", "Row (Machine)",
      "Face Pull (Cable)", "Barbell Shrug", "Dumbbell Shrug", "Back Extension (Machine)"
    ],
    "Shoulders": [
      "Barbell Overhead Press", "Dumbbell Shoulder Press", "Shoulder Press (Machine)",
      "Smith Machine Shoulder Press", "Arnold Press",
      "Dumbbell Lateral Raise", "Cable Lateral Raise", "Lateral Raise (Machine)",
      "Front Raise", "Dumbbell Rear Delt Fly", "Cable Rear Delt Fly", "Rear Delt (Machine)",
      "Upright Row"
    ],
    "Legs": [
      "Barbell Squat", "Front Squat", "Hack Squat (Machine)", "Smith Machine Squat",
      "Leg Press (Machine)", "Leg Extension (Machine)", "Lying Leg Curl (Machine)", "Seated Leg Curl (Machine)",
      "Lunges", "Bulgarian Split Squat", "Romanian Deadlift", "Stiff-Leg Deadlift",
      "Standing Calf Raise (Machine)", "Seated Calf Raise (Machine)",
      "Hip Thrust", "Glute Bridge (Machine)", "Cable Kickback",
      "Hip Adductor (Machine)", "Hip Abductor (Machine)"
    ],
    "Arms": [
      "Barbell Curl", "Dumbbell Curl", "Hammer Curl", "Preacher Curl", "Cable Curl",
      "Concentration Curl", "Bicep Curl (Machine)",
      "Tricep Pushdown (Cable)", "Overhead Tricep Extension", "Skull Crusher",
      "Close-Grip Bench Press", "Tricep Dip (Machine)", "Tricep Kickback"
    ],
    "Core": [
      "Plank", "Crunch", "Sit-Up", "Cable Crunch", "Ab Crunch (Machine)",
      "Hanging Leg Raise", "Captain's Chair Leg Raise (Machine)",
      "Russian Twist", "Cable Woodchopper", "Ab Wheel Rollout"
    ],
    "Cardio": ["Running", "Walking", "Cycling", "Rowing Machine", "Jump Rope", "Stair Climber", "Elliptical", "Treadmill", "Assault Bike", "Ski Erg"]
  };

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

  function loadCustomExercises() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE.customExercises) || "[]");
    } catch (e) {
      return [];
    }
  }

  function saveCustomExercises(list) {
    localStorage.setItem(STORAGE.customExercises, JSON.stringify(list));
  }

  function isKnownExerciseName(name, type) {
    var lname = name.toLowerCase();
    if (type === "cardio") {
      return EXERCISE_LIBRARY["Cardio"].some(function (n) { return n.toLowerCase() === lname; });
    }
    return Object.keys(EXERCISE_LIBRARY).some(function (group) {
      if (group === "Cardio") return false;
      return EXERCISE_LIBRARY[group].some(function (n) { return n.toLowerCase() === lname; });
    });
  }

  function saveCustomExerciseIfNew(name, type) {
    if (isKnownExerciseName(name, type)) return;
    var customExercises = loadCustomExercises();
    var exists = customExercises.some(function (ex) { return ex.type === type && ex.name.toLowerCase() === name.toLowerCase(); });
    if (exists) return;
    customExercises.push({ name: name, type: type });
    saveCustomExercises(customExercises);
  }

  function loadWorkoutTemplates() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE.customWorkoutTemplates) || "[]");
    } catch (e) {
      return [];
    }
  }

  function saveWorkoutTemplates(list) {
    localStorage.setItem(STORAGE.customWorkoutTemplates, JSON.stringify(list));
  }

  function seedWorkoutTemplatesIfNeeded() {
    if (localStorage.getItem(STORAGE.customWorkoutTemplates) != null) return;
    var seeded = WORKOUT_TEMPLATE_SEED.map(function (t) {
      return { id: makeId(), name: t.name, exercises: t.exercises.map(function (ex) { return { name: ex.name, type: ex.type }; }) };
    });
    saveWorkoutTemplates(seeded);
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

  function getDefaultWorkoutSessionName(iso) {
    var d = new Date(iso + "T00:00:00");
    var dayName = d.toLocaleDateString(undefined, { weekday: "long" });
    var month = iso.slice(5, 7);
    return dayName + "-" + month;
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
    if (name === "workout") { renderWorkoutBuilder(); populateWorkoutTemplateSelect(); }
    if (name === "food") renderFoodChecklist(document.getElementById("foodDate").value || todayISO());
    if (name === "trends") renderTrends();
    if (name === "data") renderWorkoutTemplateList();
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
    renderDayStatus(entry, today);
    renderWeightTrend(daily);
  }

  function getCardioMET(name, pace) {
    var lname = (name || "").toLowerCase();
    if (lname === "running") {
      if (pace == null) return 9.8;
      if (pace <= 4) return 14.5;
      if (pace <= 5) return 12.8;
      if (pace <= 6) return 10.5;
      if (pace <= 7) return 9.0;
      if (pace <= 8) return 8.0;
      return 6.0;
    }
    if (lname === "walking") {
      if (pace == null) return 3.5;
      if (pace <= 9) return 5.0;
      if (pace <= 12) return 3.8;
      return 3.0;
    }
    return CARDIO_MET_TABLE[lname] != null ? CARDIO_MET_TABLE[lname] : 6.0;
  }

  function estimateExerciseCalories(ex, weightKg) {
    var w = weightKg != null ? weightKg : DEFAULT_BODYWEIGHT_KG;
    if (ex.type === "cardio") {
      var duration = ex.duration || 0;
      if (duration <= 0) return 0;
      return getCardioMET(ex.name, ex.pace) * w * (duration / 60);
    }
    var sets = ex.sets ? ex.sets.length : 0;
    return sets * STRENGTH_MET * w / 60;
  }

  function getCaloriesBurnedBreakdown(date, weightKg, steps) {
    var w = weightKg != null ? weightKg : DEFAULT_BODYWEIGHT_KG;
    var workouts = loadWorkouts().filter(function (wk) { return wk.date === date; });
    var parts = [];
    workouts.forEach(function (wk) {
      wk.exercises.forEach(function (ex) {
        var kcal = Math.round(estimateExerciseCalories(ex, w));
        if (kcal <= 0) return;
        var detail = ex.type === "cardio"
          ? (ex.duration || 0) + " min"
          : (ex.sets ? ex.sets.length : 0) + " sets";
        parts.push({ label: ex.name + " (" + detail + ")", kcal: kcal });
      });
    });
    if (steps) {
      var stepsKcal = Math.round(steps * w * STEPS_KCAL_PER_STEP_PER_KG);
      if (stepsKcal > 0) parts.push({ label: steps + " steps", kcal: stepsKcal });
    }
    var total = parts.reduce(function (sum, p) { return sum + p.kcal; }, 0);
    return { total: total, parts: parts };
  }

  function renderDayStatus(entry, date) {
    var el = document.getElementById("dayStatus");
    var parts = [];

    if (entry.dayType && DAY_TYPE_LABELS[entry.dayType]) {
      parts.push('<span class="day-badge">' + DAY_TYPE_LABELS[entry.dayType] + "</span>");
    }

    var breakdown = getCaloriesBurnedBreakdown(date, entry.weight, entry.steps);
    if (breakdown.total > 0) {
      var usedDefaultWeight = entry.weight == null;
      parts.push("<span>🔥 " + breakdown.total + " kcal burned (est." + (usedDefaultWeight ? ", " + DEFAULT_BODYWEIGHT_KG + " kg assumed" : "") + ")</span>");
    }

    if (parts.length === 0) {
      el.style.display = "none";
      el.innerHTML = "";
      return;
    }
    el.innerHTML = parts.join("");
    el.style.display = "flex";
  }

  function setDayTypeToggle(dayType) {
    currentDayType = dayType;
    document.querySelectorAll("#dayTypeToggle .segment").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.dayType === dayType);
    });
  }

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
    // Calories/protein/carbs/fat are no longer logged, but carry over any values a day
    // already has from before nutrient tracking was dropped, rather than silently wiping them.
    if (existing.calories != null) entry.calories = existing.calories;
    if (existing.protein != null) entry.protein = existing.protein;
    if (existing.carbs != null) entry.carbs = existing.carbs;
    if (existing.fat != null) entry.fat = existing.fat;
    if (steps !== "") entry.steps = Math.round(parseFloat(steps));
    if (water !== "") entry.water = parseFloat(water);
    if (cigarettes !== "") entry.cigarettes = Math.round(parseFloat(cigarettes));
    if (currentDayType) entry.dayType = currentDayType;

    if (Object.keys(entry).length === 0) {
      delete daily[date];
    } else {
      daily[date] = entry;
    }
    saveDaily(daily);
    // A manually-entered steps count for today is the user's authoritative "steps so
    // far" figure -- recalibrate the native baseline so it's the new reference point
    // instead of being silently overwritten by the next sync/auto-fill.
    if (date === todayISO() && entry.steps != null) recalibrateNativeSteps(entry.steps);
    toast("Saved " + formatDateLong(date));
    fillFormFromDate(date);
    renderToday();
  }

  // ---------- charts ----------

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  function roundN(n, decimals) {
    var factor = Math.pow(10, decimals);
    return Math.round(n * factor) / factor;
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

      if (ex.type === "cardio") {
        block.appendChild(buildCardioFields(ex));
      } else {
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
      }

      list.appendChild(block);
    });
  }

  function buildCardioFields(ex) {
    var wrap = document.createElement("div");
    wrap.className = "cardio-fields";

    var durationField = document.createElement("div");
    durationField.className = "mini-field";
    durationField.innerHTML = '<label>Duration (min)</label>';
    var durationInput = document.createElement("input");
    durationInput.type = "number";
    durationInput.inputMode = "decimal";
    durationInput.min = "0";
    durationInput.step = "1";
    durationInput.placeholder = "e.g. 30";
    durationInput.value = ex.duration != null ? ex.duration : "";
    durationInput.addEventListener("change", function () {
      var val = parseFloat(durationInput.value);
      ex.duration = isNaN(val) ? null : val;
    });
    durationField.appendChild(durationInput);

    var paceField = document.createElement("div");
    paceField.className = "mini-field";
    paceField.innerHTML = '<label>Pace (min/km)</label>';
    var paceInput = document.createElement("input");
    paceInput.type = "number";
    paceInput.inputMode = "decimal";
    paceInput.min = "0";
    paceInput.step = "0.1";
    paceInput.placeholder = "e.g. 5.5";
    paceInput.value = ex.pace != null ? ex.pace : "";
    paceInput.addEventListener("change", function () {
      var val = parseFloat(paceInput.value);
      ex.pace = isNaN(val) ? null : val;
    });
    paceField.appendChild(paceInput);

    wrap.appendChild(durationField);
    wrap.appendChild(paceField);
    return wrap;
  }

  function populateExerciseSelect(type) {
    var select = document.getElementById("exerciseSelect");
    select.innerHTML = "";

    if (type === "cardio") {
      EXERCISE_LIBRARY["Cardio"].forEach(function (name) {
        var option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
      });
    } else {
      Object.keys(EXERCISE_LIBRARY).forEach(function (group) {
        if (group === "Cardio") return;
        var optgroup = document.createElement("optgroup");
        optgroup.label = group;
        EXERCISE_LIBRARY[group].forEach(function (name) {
          var option = document.createElement("option");
          option.value = name;
          option.textContent = name;
          optgroup.appendChild(option);
        });
        select.appendChild(optgroup);
      });
    }

    var myExercises = loadCustomExercises().filter(function (ex) { return ex.type === type; });
    if (myExercises.length > 0) {
      var myGroup = document.createElement("optgroup");
      myGroup.label = "My Exercises";
      myExercises.forEach(function (ex) {
        var option = document.createElement("option");
        option.value = ex.name;
        option.textContent = ex.name;
        myGroup.appendChild(option);
      });
      select.appendChild(myGroup);
    }

    var customOption = document.createElement("option");
    customOption.value = CUSTOM_EXERCISE_VALUE;
    customOption.textContent = "Other (type your own)…";
    select.appendChild(customOption);
  }

  function setExerciseTypeToggle(type) {
    currentExerciseType = type;
    document.querySelectorAll("#exerciseTypeToggle .segment").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.exType === type);
    });
    populateExerciseSelect(type);
    var customInput = document.getElementById("exerciseCustomInput");
    customInput.value = "";
    customInput.style.display = "none";
  }

  function handleExerciseSelectChange() {
    var select = document.getElementById("exerciseSelect");
    var customInput = document.getElementById("exerciseCustomInput");
    var isCustom = select.value === CUSTOM_EXERCISE_VALUE;
    customInput.style.display = isCustom ? "block" : "none";
    if (isCustom) customInput.focus();
  }

  function handleAddExercise() {
    var select = document.getElementById("exerciseSelect");
    var customInput = document.getElementById("exerciseCustomInput");
    var isCustom = select.value === CUSTOM_EXERCISE_VALUE;
    var name = isCustom ? customInput.value.trim() : select.value;
    if (!name) { toast("Enter an exercise name"); return; }
    if (isCustom) saveCustomExerciseIfNew(name, currentExerciseType);
    if (currentExerciseType === "cardio") {
      currentExercises.push({ name: name, type: "cardio", duration: null, pace: null });
    } else {
      currentExercises.push({ name: name, type: "strength", sets: [] });
    }
    customInput.value = "";
    customInput.style.display = "none";
    select.selectedIndex = 0;
    setExerciseTypeToggle("strength");
    renderWorkoutBuilder();
  }

  function setDefaultWorkoutName(dateStr) {
    var def = getDefaultWorkoutSessionName(dateStr);
    document.getElementById("workoutName").value = def;
    lastAutoWorkoutName = def;
  }

  function handleWorkoutDateChange() {
    var nameInput = document.getElementById("workoutName");
    if (nameInput.value === lastAutoWorkoutName) {
      setDefaultWorkoutName(document.getElementById("workoutDate").value || todayISO());
    }
  }

  function handleSaveWorkout() {
    var date = document.getElementById("workoutDate").value || todayISO();
    var name = document.getElementById("workoutName").value.trim() || "Workout";
    var exercises = currentExercises.filter(function (ex) {
      return ex.type === "cardio" ? (ex.duration != null && ex.duration > 0) : ex.sets.length > 0;
    });

    if (exercises.length === 0) {
      toast("Add at least one set or a cardio duration");
      return;
    }

    var workouts = loadWorkouts();
    var wasEditing = !!editingWorkoutId;
    if (wasEditing) {
      var idx = workouts.findIndex(function (w) { return w.id === editingWorkoutId; });
      if (idx !== -1) workouts[idx] = { id: editingWorkoutId, date: date, name: name, exercises: exercises };
    } else {
      workouts.push({ id: makeId(), date: date, name: name, exercises: exercises });
    }
    saveWorkouts(workouts);
    editingWorkoutId = null;

    currentExercises = [];
    document.getElementById("workoutDate").value = todayISO();
    setDefaultWorkoutName(todayISO());
    renderWorkoutBuilder();
    updateWorkoutFormMode();
    toast(wasEditing ? "Workout updated" : "Workout saved");
    switchView("history");
  }

  function updateWorkoutFormMode() {
    document.getElementById("saveWorkoutBtn").textContent = editingWorkoutId ? "Update Workout" : "Save Workout";
    document.getElementById("cancelEditWorkoutBtn").style.display = editingWorkoutId ? "block" : "none";
  }

  function handleEditWorkout(id) {
    var workouts = loadWorkouts();
    var w = workouts.find(function (x) { return x.id === id; });
    if (!w) return;
    editingWorkoutId = id;
    document.getElementById("workoutDate").value = w.date;
    document.getElementById("workoutName").value = w.name;
    lastAutoWorkoutName = ""; // loaded name is real data, not an auto-generated placeholder
    currentExercises = JSON.parse(JSON.stringify(w.exercises));
    renderWorkoutBuilder();
    updateWorkoutFormMode();
    switchView("workout");
    toast("Editing workout — save to update it");
  }

  function handleCancelEditWorkout() {
    editingWorkoutId = null;
    currentExercises = [];
    document.getElementById("workoutDate").value = todayISO();
    setDefaultWorkoutName(todayISO());
    renderWorkoutBuilder();
    updateWorkoutFormMode();
  }

  // ---------- workout templates ----------

  function populateWorkoutTemplateSelect() {
    var select = document.getElementById("workoutTemplateSelect");
    var current = select.value;
    select.innerHTML = "";
    var placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select a template…";
    select.appendChild(placeholder);
    loadWorkoutTemplates().forEach(function (t) {
      var opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.name + " (" + t.exercises.length + ")";
      select.appendChild(opt);
    });
    if (current) select.value = current;
  }

  function handleLoadWorkoutTemplate() {
    var select = document.getElementById("workoutTemplateSelect");
    var id = select.value;
    if (!id) return;
    var template = loadWorkoutTemplates().find(function (t) { return t.id === id; });
    if (!template) return;
    if (currentExercises.length > 0 && !confirm('Replace the current exercise list with "' + template.name + '"?')) {
      select.value = "";
      return;
    }
    currentExercises = template.exercises.map(function (ex) {
      return ex.type === "cardio"
        ? { name: ex.name, type: "cardio", duration: null, pace: null }
        : { name: ex.name, type: "strength", sets: [] };
    });
    select.value = "";
    renderWorkoutBuilder();
    toast('Loaded "' + template.name + '" — fill in today\'s sets');
  }

  function handleSaveAsTemplate() {
    if (currentExercises.length === 0) { toast("Add exercises first"); return; }
    var nameInput = document.getElementById("templateNameInput");
    var name = nameInput.value.trim() || document.getElementById("workoutName").value.trim() || "My Routine";
    var templates = loadWorkoutTemplates();
    var exercises = currentExercises.map(function (ex) { return { name: ex.name, type: ex.type }; });
    var existingIdx = templates.findIndex(function (t) { return t.name.toLowerCase() === name.toLowerCase(); });
    if (existingIdx !== -1) {
      templates[existingIdx].exercises = exercises;
    } else {
      templates.push({ id: makeId(), name: name, exercises: exercises });
    }
    saveWorkoutTemplates(templates);
    nameInput.value = "";
    populateWorkoutTemplateSelect();
    renderWorkoutTemplateList();
    toast('Saved template "' + name + '"');
  }

  function renderWorkoutTemplateList() {
    var list = document.getElementById("workoutTemplateList");
    var templates = loadWorkoutTemplates();
    if (templates.length === 0) {
      list.innerHTML = '<div class="empty-state">No saved templates yet.</div>';
      return;
    }
    list.innerHTML = "";
    templates.forEach(function (t) {
      var item = document.createElement("div");
      item.className = "list-item";

      var info = document.createElement("div");
      var nameEl = document.createElement("div");
      nameEl.className = "list-item-title";
      nameEl.textContent = t.name;
      var detailEl = document.createElement("div");
      detailEl.className = "list-item-detail";
      detailEl.textContent = t.exercises.map(function (ex) { return ex.name; }).join(", ");
      info.appendChild(nameEl);
      info.appendChild(detailEl);

      var removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "remove";
      removeBtn.textContent = "✕";
      removeBtn.addEventListener("click", function () { handleRemoveWorkoutTemplate(t.id); });

      item.appendChild(info);
      item.appendChild(removeBtn);
      list.appendChild(item);
    });
  }

  function handleRemoveWorkoutTemplate(id) {
    var templates = loadWorkoutTemplates().filter(function (t) { return t.id !== id; });
    saveWorkoutTemplates(templates);
    populateWorkoutTemplateSelect();
    renderWorkoutTemplateList();
    toast("Template removed");
  }

  function handleDeleteWorkout(id) {
    if (!confirm("Delete this workout? This cannot be undone.")) return;
    var workouts = loadWorkouts().filter(function (w) { return w.id !== id; });
    saveWorkouts(workouts);
    if (editingWorkoutId === id) handleCancelEditWorkout();
    renderHistory();
    toast("Workout deleted");
  }

  // ---------- fasting ----------
  //
  // A fast starts when the user taps "Start Fast" and runs until they log any food,
  // which is what actually breaks it -- it can span multiple calendar days (e.g.
  // an extended fast), so it's tracked as its own timer rather than a per-day field.
  // No "cancel" escape hatch is offered once started: the only way out is logging
  // food, matching a fast being a real commitment rather than a toggle.

  var fastingTimerInterval = null;

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

  // If a fast is still running and has already crossed one or more midnights,
  // retroactively saves "hours fasted" for each full calendar day it's fully spanned
  // into that day's daily entry -- so History shows fasting progress for every day of a
  // multi-day fast, not just the day it's eventually broken. There's no way to run this
  // exactly at midnight while the app is closed, so it runs on app open/foreground and
  // catches up on any days that elapsed in the meantime.
  function snapshotFastingDays() {
    var fasting = loadFasting();
    if (!fasting.current) return;
    var startMs = new Date(fasting.current.start).getTime();
    var startDate = localDateISO(new Date(startMs));
    var today = todayISO();
    if (startDate >= today) return;

    var daily = loadDaily();
    var d = startDate;
    while (d < today) {
      var dayEndMs = new Date(addDaysISO(d, 1) + "T00:00:00").getTime();
      var dayStartMs = new Date(d + "T00:00:00").getTime();
      var segmentStart = Math.max(startMs, dayStartMs);
      var hours = Math.round(((dayEndMs - segmentStart) / 3600000) * 10) / 10;
      var entry = daily[d] || {};
      entry.fastedHours = hours;
      daily[d] = entry;
      d = addDaysISO(d, 1);
    }
    saveDaily(daily);
  }

  function startFast() {
    var fasting = loadFasting();
    fasting.current = { start: new Date().toISOString() };
    saveFasting(fasting);
    renderFastingStatus();
  }

  // Ends the active fast (if any) right now and logs its duration -- called
  // whenever real food gets logged, since eating is what breaks a fast.
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
    snapshotFastingDays();
    var fasting = loadFasting();
    var timerEl = document.getElementById("fastingTimer");
    var labelEl = document.getElementById("fastingLabel");
    var startBtn = document.getElementById("startFastBtn");
    if (!timerEl) return;

    clearInterval(fastingTimerInterval);
    fastingTimerInterval = null;

    if (fasting.current) {
      // No button shown at all while a fast is active -- the only way out is
      // logging food, which breaks it automatically.
      startBtn.style.display = "none";
      // Always include the date, not just the clock time -- a fast can run past
      // midnight (even several days), so "since 07:04" alone would be ambiguous
      // about which day it actually started.
      labelEl.textContent = "Fasting since " + formatDateShort(localDateISO(new Date(fasting.current.start))) +
        ", " + formatClockTime(fasting.current.start);
      var update = function () {
        var hours = (Date.now() - new Date(fasting.current.start).getTime()) / 3600000;
        timerEl.textContent = formatFastingDuration(hours);
      };
      update();
      fastingTimerInterval = setInterval(update, 60000);
    } else {
      startBtn.style.display = "inline-block";
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
    // Checking anything off today -- including water or black coffee -- breaks an
    // active fast, same as any other food or drink.
    if (checkbox.checked && date === todayISO()) breakFastNow();
  }

  // ---------- history view ----------

  function renderHistory() {
    var daily = loadDaily();
    var workouts = loadWorkouts();
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
    workouts.forEach(function (w) { dates[w.date] = true; });
    Object.keys(fastsByDate).forEach(function (d) { dates[d] = true; });
    Object.keys(foods).forEach(function (d) {
      if (FOOD_ITEMS.some(function (f) { return foods[d][f.key]; })) dates[d] = true;
    });

    var sorted = Object.keys(dates).sort().reverse();

    if (sorted.length === 0) {
      list.innerHTML = '<div class="empty-state">No entries yet. Log a day or a workout to get started.</div>';
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
        line.innerHTML = "<span>" + parts.join(" · ") + "</span>";
        wrap.appendChild(line);
      }

      (fastsByDate[date] || []).forEach(function (f) {
        var fastLine = document.createElement("div");
        fastLine.className = "h-line";
        fastLine.innerHTML = "<span>⏱️ Fasted " + formatFastingDuration(f.hours) + " (" +
          formatClockTime(f.start) + " → " + formatClockTime(f.end) + ")</span>";
        wrap.appendChild(fastLine);
      });

      if (entry && entry.fastedHours != null) {
        var fastSnapshotLine = document.createElement("div");
        fastSnapshotLine.className = "h-line";
        fastSnapshotLine.innerHTML = "<span>⏱️ Fasted " + formatFastingDuration(entry.fastedHours) + " (fast continued past midnight)</span>";
        wrap.appendChild(fastSnapshotLine);
      }

      var dayFoods = foods[date] || {};
      var eaten = FOOD_ITEMS.filter(function (f) { return dayFoods[f.key]; }).map(function (f) { return f.label; });
      if (eaten.length) {
        var foodLine = document.createElement("div");
        foodLine.className = "h-line";
        foodLine.innerHTML = "<span>🍽️ " + eaten.join(", ") + "</span>";
        wrap.appendChild(foodLine);
      }

      var dayWeight = entry ? entry.weight : null;
      workouts.filter(function (w) { return w.date === date; }).forEach(function (w) {
        var wDiv = document.createElement("div");
        wDiv.className = "h-workout";
        var totalSets = w.exercises.reduce(function (sum, ex) {
          return sum + (ex.type === "cardio" ? 0 : ex.sets.length);
        }, 0);
        var cardioCount = w.exercises.filter(function (ex) { return ex.type === "cardio"; }).length;
        var workoutKcal = Math.round(w.exercises.reduce(function (sum, ex) {
          return sum + estimateExerciseCalories(ex, dayWeight);
        }, 0));
        var summaryParts = [];
        if (totalSets > 0) summaryParts.push(totalSets + " sets");
        if (cardioCount > 0) summaryParts.push(cardioCount + " cardio");
        if (workoutKcal > 0) summaryParts.push("~" + workoutKcal + " kcal burned");

        var headerRow = document.createElement("div");
        headerRow.className = "h-workout-header";
        var titleWrap = document.createElement("div");
        titleWrap.innerHTML = "🏋️ <span class=\"h-workout-name\">" + w.name + "</span>" +
          (summaryParts.length ? " — " + summaryParts.join(", ") : "");
        headerRow.appendChild(titleWrap);

        var actionsWrap = document.createElement("div");
        actionsWrap.className = "h-workout-actions";
        var editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "icon-btn";
        editBtn.textContent = "Edit";
        editBtn.addEventListener("click", function () { handleEditWorkout(w.id); });
        var deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "icon-btn danger";
        deleteBtn.textContent = "Delete";
        deleteBtn.addEventListener("click", function () { handleDeleteWorkout(w.id); });
        actionsWrap.appendChild(editBtn);
        actionsWrap.appendChild(deleteBtn);
        headerRow.appendChild(actionsWrap);

        wDiv.appendChild(headerRow);

        var exList = document.createElement("ul");
        exList.className = "ex-list";
        w.exercises.forEach(function (ex) {
          var exKcal = Math.round(estimateExerciseCalories(ex, dayWeight));
          var exLi = document.createElement("li");
          var exName = document.createElement("div");
          exName.className = "ex-name";
          exName.textContent = ex.name + (exKcal > 0 ? " — ~" + exKcal + " kcal" : "");
          exLi.appendChild(exName);

          if (ex.type === "cardio") {
            var cardioLi = document.createElement("div");
            cardioLi.className = "set-list";
            var cardioParts = [];
            if (ex.duration != null) cardioParts.push(ex.duration + " min");
            if (ex.pace != null) cardioParts.push(ex.pace + " min/km");
            cardioLi.textContent = cardioParts.join(" @ ");
            exLi.appendChild(cardioLi);
          } else {
            var setList = document.createElement("ul");
            setList.className = "set-list";
            ex.sets.forEach(function (set, setIdx) {
              var setLi = document.createElement("li");
              setLi.textContent = "#" + (setIdx + 1) + " — " + set.reps + " reps @ " + set.weight + " kg";
              setList.appendChild(setLi);
            });
            exLi.appendChild(setList);
          }

          exList.appendChild(exLi);
        });
        wDiv.appendChild(exList);

        wrap.appendChild(wDiv);
      });

      list.appendChild(wrap);
    });
  }

  // ---------- data export / import / clear ----------

  async function handleExport() {
    var payload = {
      exportedAt: new Date().toISOString(),
      daily: loadDaily(),
      workouts: loadWorkouts(),
      foods: loadFoods(),
      customExercises: loadCustomExercises(),
      customWorkoutTemplates: loadWorkoutTemplates(),
      fasting: loadFasting()
    };
    var json = JSON.stringify(payload, null, 2);
    var filename = "gymlog-backup-" + todayISO() + ".json";

    var isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

    if (isNative) {
      try {
        var plugins = window.Capacitor.Plugins;
        await plugins.Filesystem.writeFile({ path: filename, data: json, directory: "CACHE", encoding: "utf8" });
        var uriResult = await plugins.Filesystem.getUri({ directory: "CACHE", path: filename });
        await plugins.Share.share({
          title: "Gym Log backup",
          text: "Gym Log backup " + todayISO(),
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
    if (payload.workouts) saveWorkouts(payload.workouts);
    if (payload.foods) saveFoods(payload.foods);
    if (payload.customExercises) saveCustomExercises(payload.customExercises);
    if (payload.customWorkoutTemplates) saveWorkoutTemplates(payload.customWorkoutTemplates);
    if (payload.fasting) { saveFasting(payload.fasting); renderFastingStatus(); }
    toast("Import complete");
    fillFormFromDate(document.getElementById("logDate").value || todayISO());
    resetWeightTrendDateInputs();
    resetTrendsDateInputs();
    renderToday();
    renderHistory();
    renderTrends();
    populateExerciseSelect(currentExerciseType);
    populateWorkoutTemplateSelect();
    renderFoodChecklist(document.getElementById("foodDate").value || todayISO());
    renderWorkoutTemplateList();
  }

  function handleClear() {
    if (!confirm("Erase all logged data on this device? This cannot be undone.")) return;
    localStorage.removeItem(STORAGE.daily);
    localStorage.removeItem(STORAGE.workouts);
    localStorage.removeItem(STORAGE.foods);
    localStorage.removeItem(STORAGE.customExercises);
    localStorage.removeItem(STORAGE.customWorkoutTemplates);
    localStorage.removeItem(STORAGE.fasting);
    currentExercises = [];
    editingWorkoutId = null;
    resetWeightTrendDateInputs();
    resetTrendsDateInputs();
    renderToday();
    renderHistory();
    renderTrends();
    renderFastingStatus();
    renderWorkoutBuilder();
    updateWorkoutFormMode();
    populateExerciseSelect(currentExerciseType);
    populateWorkoutTemplateSelect();
    renderFoodChecklist(document.getElementById("foodDate").value || todayISO());
    renderWorkoutTemplateList();
    toast("All data erased");
  }

  function getEarliestLoggedWeightDate() {
    var daily = loadDaily();
    var dates = Object.keys(daily).filter(function (d) { return daily[d].weight != null; }).sort();
    return dates.length ? dates[0] : null;
  }

  // ---------- init ----------

  function init() {
    seedWorkoutTemplatesIfNeeded();

    document.getElementById("headerDate").textContent = formatDateLong(todayISO());
    document.getElementById("logDate").value = todayISO();
    document.getElementById("workoutDate").value = todayISO();
    setDefaultWorkoutName(todayISO());
    document.getElementById("foodDate").value = todayISO();
    resetWeightTrendDateInputs();
    resetTrendsDateInputs();

    startStepsSync();

    fillFormFromDate(todayISO());

    document.querySelectorAll(".tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { switchView(btn.dataset.view); });
    });

    document.getElementById("dailyForm").addEventListener("submit", handleDailySubmit);
    document.getElementById("startFastBtn").addEventListener("click", startFast);
    renderFastingStatus();
    document.getElementById("logDate").addEventListener("change", function (e) {
      fillFormFromDate(e.target.value);
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

    populateExerciseSelect(currentExerciseType);
    document.getElementById("exerciseSelect").addEventListener("change", handleExerciseSelectChange);
    document.querySelectorAll("#exerciseTypeToggle .segment").forEach(function (btn) {
      btn.addEventListener("click", function () { setExerciseTypeToggle(btn.dataset.exType); });
    });
    document.getElementById("addExerciseBtn").addEventListener("click", handleAddExercise);
    document.getElementById("exerciseCustomInput").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); handleAddExercise(); }
    });
    document.getElementById("saveWorkoutBtn").addEventListener("click", handleSaveWorkout);
    document.getElementById("cancelEditWorkoutBtn").addEventListener("click", handleCancelEditWorkout);
    document.getElementById("workoutDate").addEventListener("change", handleWorkoutDateChange);

    populateWorkoutTemplateSelect();
    renderWorkoutTemplateList();
    document.getElementById("loadTemplateBtn").addEventListener("click", handleLoadWorkoutTemplate);
    document.getElementById("saveAsTemplateBtn").addEventListener("click", handleSaveAsTemplate);

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

    document.getElementById("foodDate").addEventListener("change", function (e) {
      renderFoodChecklist(e.target.value);
    });
    document.querySelectorAll("#foodChecklist input[data-food]").forEach(function (input) {
      input.addEventListener("change", handleFoodCheckboxChange);
    });

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
