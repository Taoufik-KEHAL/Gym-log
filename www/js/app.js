(function () {
  "use strict";

  var STORAGE = {
    daily: "gymlog.daily",       // { "2026-07-27": { weight, sleepHours, calories, protein, carbs, fat, steps, dayType } }
    workouts: "gymlog.workouts", // [ { id, date, name, exercises: [{name, sets:[{reps,weight}]}] } ]
    settings: "gymlog.settings", // reserved for future use; currently unused
    foodlog: "gymlog.foodlog",   // { "2026-07-27": [ {id, name, grams, calories, protein, carbs, fat} ] }
    customFoods: "gymlog.customfoods", // [ { id, name, per100: {calories, protein, carbs, fat} } ]
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

  var CUSTOM_FOOD_SEED = [
    { name: "Perly nature (Jaouda fromage frais)", per100: { calories: 101, protein: 7.6, carbs: 0, fat: 0 } },
    { name: "Joly thon au naturel (canned tuna in water)", per100: { calories: 108.8, protein: 24.8, carbs: 0.6, fat: 0.8 } },
    { name: "Horse minced meat", per100: { calories: 133, protein: 21.4, carbs: 0, fat: 4.8 } },
    { name: "Beef minced meat (5-10% fat)", per100: { calories: 176, protein: 20.0, carbs: 0, fat: 10.0 } },
    { name: "Chicken breast (skinless)", per100: { calories: 165, protein: 31.0, carbs: 0, fat: 3.6 } },
    { name: "Eggs (whole, boiled)", per100: { calories: 155, protein: 13.0, carbs: 1.1, fat: 11.0 } },
    { name: "Rice (white, cooked)", per100: { calories: 130, protein: 2.7, carbs: 28.0, fat: 0.3 } },
    { name: "Tajine (chicken/meat + veg, home-style)", per100: { calories: 130, protein: 12.0, carbs: 8.0, fat: 6.0 } },
    { name: "Couscous (cooked, plain)", per100: { calories: 112, protein: 3.8, carbs: 23.2, fat: 0.2 } },
    { name: "Msemen (Moroccan flatbread, plain)", per100: { calories: 330, protein: 7.0, carbs: 45.0, fat: 14.0 } },
    { name: "Mille-feuille (pastry)", per100: { calories: 340, protein: 4.5, carbs: 32.0, fat: 22.0 } },
    { name: "Nuts (mixed, raw)", per100: { calories: 600, protein: 20.0, carbs: 20.0, fat: 54.0 } }
  ];

  var selectedFoodProduct = null; // { name, per100: { calories, protein, carbs, fat } }
  var currentQtyMode = "grams"; // 'grams' | 'units', for the food-quantity form
  var editingFoodLogEntry = null; // { date, id } while editing an already-logged entry's quantity

  var OFF_SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl";
  var USDA_SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";
  var USDA_NUTRIENT_IDS = { calories: 1008, protein: 1003, carbs: 1005, fat: 1004 };
  var foodSearchDebounceTimer = null;
  var foodSearchAbortControllers = [];

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

  function loadSettings() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE.settings) || "{}");
    } catch (e) {
      return {};
    }
  }

  function saveSettings(settings) {
    localStorage.setItem(STORAGE.settings, JSON.stringify(settings));
  }

  function loadFoodLog() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE.foodlog) || "{}");
    } catch (e) {
      return {};
    }
  }

  function saveFoodLog(log) {
    localStorage.setItem(STORAGE.foodlog, JSON.stringify(log));
  }

  function loadCustomFoods() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE.customFoods) || "[]");
    } catch (e) {
      return [];
    }
  }

  function saveCustomFoods(list) {
    localStorage.setItem(STORAGE.customFoods, JSON.stringify(list));
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

  function seedCustomFoodsIfNeeded() {
    if (localStorage.getItem(STORAGE.customFoods) != null) return;
    var seeded = CUSTOM_FOOD_SEED.map(function (f) {
      return { id: makeId(), name: f.name, per100: f.per100 };
    });
    saveCustomFoods(seeded);
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

  var editingMyFoodId = null;

  function renderCustomFoodList() {
    var list = document.getElementById("customFoodList");
    var foods = loadCustomFoods();
    if (foods.length === 0) {
      list.innerHTML = '<div class="empty-state">No foods saved yet.</div>';
      return;
    }
    list.innerHTML = "";
    foods.forEach(function (f) {
      var item = document.createElement("div");
      item.className = "food-log-item";

      var info = document.createElement("div");
      var nameEl = document.createElement("div");
      nameEl.className = "food-log-name";
      nameEl.textContent = f.name;
      var macrosEl = document.createElement("div");
      macrosEl.className = "food-log-macros";
      macrosEl.textContent = f.per100.calories + " kcal · " + f.per100.protein + " g protein · " +
        f.per100.carbs + " g carbs · " + f.per100.fat + " g fat (per 100g)";
      info.appendChild(nameEl);
      info.appendChild(macrosEl);

      var actions = document.createElement("div");
      actions.className = "food-log-actions";

      var editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "icon-btn";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", function () { handleEditMyFood(f.id); });

      var removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "remove";
      removeBtn.textContent = "✕";
      removeBtn.addEventListener("click", function () { handleRemoveMyFood(f.id); });

      actions.appendChild(editBtn);
      actions.appendChild(removeBtn);

      item.appendChild(info);
      item.appendChild(actions);
      list.appendChild(item);
    });
  }

  function handleAddMyFood() {
    var name = document.getElementById("myFoodName").value.trim();
    if (!name) { toast("Enter a food name"); return; }
    var per100 = {
      calories: parseFloat(document.getElementById("myFoodCalories").value) || 0,
      protein: parseFloat(document.getElementById("myFoodProtein").value) || 0,
      carbs: parseFloat(document.getElementById("myFoodCarbs").value) || 0,
      fat: parseFloat(document.getElementById("myFoodFat").value) || 0
    };
    var foods = loadCustomFoods();

    if (editingMyFoodId) {
      var idx = foods.findIndex(function (f) { return f.id === editingMyFoodId; });
      if (idx !== -1) foods[idx] = { id: editingMyFoodId, name: name, per100: per100 };
      saveCustomFoods(foods);
      handleCancelEditMyFood();
      renderCustomFoodList();
      toast("Updated " + name);
      return;
    }

    foods.push({ id: makeId(), name: name, per100: per100 });
    saveCustomFoods(foods);

    ["myFoodName", "myFoodCalories", "myFoodProtein", "myFoodCarbs", "myFoodFat"].forEach(function (id) {
      document.getElementById(id).value = "";
    });
    renderCustomFoodList();
    toast("Added to My Foods");
  }

  function handleEditMyFood(id) {
    var food = loadCustomFoods().find(function (f) { return f.id === id; });
    if (!food) return;
    editingMyFoodId = id;
    document.getElementById("myFoodName").value = food.name;
    document.getElementById("myFoodCalories").value = food.per100.calories;
    document.getElementById("myFoodProtein").value = food.per100.protein;
    document.getElementById("myFoodCarbs").value = food.per100.carbs;
    document.getElementById("myFoodFat").value = food.per100.fat;
    document.getElementById("addMyFoodBtn").textContent = "Update food";
    document.getElementById("cancelEditMyFoodBtn").style.display = "inline-block";
    document.getElementById("myFoodName").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function handleCancelEditMyFood() {
    editingMyFoodId = null;
    ["myFoodName", "myFoodCalories", "myFoodProtein", "myFoodCarbs", "myFoodFat"].forEach(function (id) {
      document.getElementById(id).value = "";
    });
    document.getElementById("addMyFoodBtn").textContent = "Add to My Foods";
    document.getElementById("cancelEditMyFoodBtn").style.display = "none";
  }

  function handleRemoveMyFood(id) {
    var foods = loadCustomFoods().filter(function (f) { return f.id !== id; });
    saveCustomFoods(foods);
    if (editingMyFoodId === id) handleCancelEditMyFood();
    renderCustomFoodList();
    toast("Removed from My Foods");
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
    if (name === "food") renderFoodLog(document.getElementById("foodDate").value || todayISO());
    if (name === "trends") renderTrends();
    if (name === "data") { renderCustomFoodList(); renderWorkoutTemplateList(); }
  }

  // ---------- today view ----------

  function renderToday() {
    var daily = loadDaily();
    var today = document.getElementById("logDate").value || todayISO();
    var entry = daily[today] || {};
    document.getElementById("sumWeight").textContent = entry.weight != null ? entry.weight : "—";
    document.getElementById("sumSleep").textContent = entry.sleepHours != null ? entry.sleepHours : "—";
    document.getElementById("sumCalories").textContent = entry.calories != null ? entry.calories : "—";
    renderCaloriesVsBurned(entry, today, daily);
    renderCalorieTarget(today, entry, daily);
    document.getElementById("sumProtein").textContent = entry.protein != null ? entry.protein : "—";
    document.getElementById("sumCarbs").textContent = entry.carbs != null ? entry.carbs : "—";
    document.getElementById("sumFat").textContent = entry.fat != null ? entry.fat : "—";
    document.getElementById("sumSteps").textContent = entry.steps != null ? entry.steps : "—";
    document.getElementById("sumWater").textContent = entry.water != null ? entry.water : "—";
    document.getElementById("sumCigarettes").textContent = entry.cigarettes != null ? entry.cigarettes : "—";
    renderDayStatus(entry, today);
    renderWeightTrend(daily);
  }

  function renderCaloriesVsBurned(entry, date, daily) {
    var el = document.getElementById("sumCaloriesGoal");
    var bmr = computeBMRForDate(date, entry, daily);
    if (entry.calories == null || bmr == null) {
      el.textContent = "";
      el.className = "stat-sub";
      return;
    }
    var diff = entry.calories - bmr;
    el.textContent = (diff > 0 ? "+" : "") + diff + " vs BMR";
    el.className = "stat-sub";
  }

  // Suggested intake for a day: Maintenance minus a 500-750 kcal deficit, never below BMR.
  function computeSuggestedCalorieRange(date, entry, daily) {
    var maintenance = getMaintenanceForDay(date, entry, daily);
    var bmr = computeBMRForDate(date, entry, daily);
    if (maintenance == null || bmr == null) return null;
    var high = Math.round((maintenance - 500) / 10) * 10;
    var low = Math.round((maintenance - 750) / 10) * 10;
    high = Math.max(high, bmr);
    low = Math.max(low, bmr);
    if (low > high) low = high;
    return { low: low, high: high };
  }

  function renderCalorieTarget(date, entry, daily) {
    var el = document.getElementById("sumCaloriesTarget");
    var range = computeSuggestedCalorieRange(date, entry, daily);
    if (range == null) {
      el.textContent = "";
      return;
    }
    el.textContent = range.low === range.high
      ? "Target " + range.low
      : "Target " + range.low + "–" + range.high;
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

  function syncStepsFromDevice(silent) {
    if (!nativeStepsAvailable()) return;
    window.Capacitor.Plugins.Steps.getTodaySteps().then(function (result) {
      document.getElementById("stepsInput").value = result.steps;
      if (!silent) toast("Synced " + result.steps + " steps from phone");
    }).catch(function () {
      if (!silent) toast("Couldn't read steps from phone");
    });
  }

  // Recalibrates the native baseline so future sensor reads (auto-fill, the sync
  // button, the periodic background check) report the given "steps so far today"
  // value plus whatever new steps happen from now on, instead of the device's own
  // possibly-stale baseline overwriting it.
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
    if (entry.steps == null && iso === todayISO()) syncStepsFromDevice(true);
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
    // Calories/protein/carbs/fat are maintained by the Food tab, not this form; carry them over untouched.
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
    { key: "sleepHours", canvasId: "trendsSleepChart", emptyId: "trendsSleepEmpty" },
    { key: "water", canvasId: "trendsWaterChart", emptyId: "trendsWaterEmpty" },
    { key: "cigarettes", canvasId: "trendsCigarettesChart", emptyId: "trendsCigarettesEmpty" },
    { key: "protein", canvasId: "trendsProteinChart", emptyId: "trendsProteinEmpty" },
    { key: "carbs", canvasId: "trendsCarbsChart", emptyId: "trendsCarbsEmpty" },
    { key: "fat", canvasId: "trendsFatChart", emptyId: "trendsFatEmpty" },
    { key: "steps", canvasId: "trendsStepsChart", emptyId: "trendsStepsEmpty" }
  ];

  function renderMetricTrend(cfg, daily, range) {
    var points = Object.keys(daily)
      .filter(function (d) { return d >= range.start && d <= range.end && daily[d][cfg.key] != null; })
      .sort()
      .map(function (d) { return { date: d, value: daily[d][cfg.key] }; });
    drawLineChart(cfg.canvasId, cfg.emptyId, points);
  }

  function renderCaloriesTrend(daily, range) {
    var dates = Object.keys(daily).filter(function (d) { return d >= range.start && d <= range.end; }).sort();
    var intakePoints = [];
    var burnedPoints = [];
    var bmrPoints = [];
    var maintenancePoints = [];
    dates.forEach(function (d) {
      var entry = daily[d];
      if (entry.calories != null) intakePoints.push({ date: d, value: entry.calories });
      var burned = Math.round(getCaloriesBurnedBreakdown(d, entry.weight, entry.steps).total);
      if (burned > 0) burnedPoints.push({ date: d, value: burned });
      var bmr = computeBMRForDate(d, entry, daily);
      if (bmr != null) bmrPoints.push({ date: d, value: bmr });
      var maintenance = getMaintenanceForDay(d, entry, daily);
      if (maintenance != null) maintenancePoints.push({ date: d, value: maintenance });
    });

    var isDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    var accentColor = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || (isDark ? "#5ec2a0" : "#1f8f6c");
    var accent2Color = getComputedStyle(document.documentElement).getPropertyValue("--accent-2").trim() || "#f0a03c";
    var accent3Color = getComputedStyle(document.documentElement).getPropertyValue("--accent-3").trim() || "#5b9bd5";
    var textDimColor = getComputedStyle(document.documentElement).getPropertyValue("--text-dim").trim() || "#9aa1ac";

    var series = [
      { points: intakePoints, color: accentColor },
      { points: burnedPoints, color: accent2Color }
    ];

    var bmrLegend = document.getElementById("trendsCaloriesBmrLegend");
    if (bmrPoints.length > 0) {
      series.push({ points: bmrPoints, color: textDimColor, dashed: true });
      bmrLegend.style.display = "flex";
    } else {
      bmrLegend.style.display = "none";
    }

    var maintenanceLegend = document.getElementById("trendsCaloriesMaintenanceLegend");
    if (maintenancePoints.length > 0) {
      series.push({ points: maintenancePoints, color: accent3Color, dashed: true });
      maintenanceLegend.style.display = "flex";
    } else {
      maintenanceLegend.style.display = "none";
    }

    var today = todayISO();
    var todayEntry = daily[today];
    var todayIntake = todayEntry && todayEntry.calories != null ? todayEntry.calories : null;
    var todayBurned = Math.round(getCaloriesBurnedBreakdown(today, todayEntry && todayEntry.weight, todayEntry && todayEntry.steps).total);
    var todayBmr = computeBMRForDate(today, todayEntry, daily);
    var todayMaintenance = getMaintenanceForDay(today, todayEntry, daily);

    document.getElementById("trendsCaloriesIntakeLegendLabel").textContent =
      todayIntake != null ? "Intake (" + todayIntake + ")" : "Intake";
    document.getElementById("trendsCaloriesBurnedLegendLabel").textContent = "Burned (" + todayBurned + ")";
    if (bmrPoints.length > 0) {
      document.getElementById("trendsCaloriesBmrLegendLabel").textContent =
        todayBmr != null ? "BMR (" + todayBmr + ")" : "BMR";
    }
    if (maintenancePoints.length > 0) {
      document.getElementById("trendsCaloriesMaintenanceLegendLabel").textContent =
        todayMaintenance != null ? "Maintenance (" + todayMaintenance + ")" : "Maintenance";
    }

    renderCalorieAlignment(todayIntake, todayBmr, todayMaintenance);
    drawMultiLineChart("trendsCaloriesChart", "trendsCaloriesEmpty", series);
  }

  function renderCalorieAlignment(todayIntake, bmr, todayMaintenance) {
    var el = document.getElementById("trendsCaloriesAlignment");
    if (todayIntake == null || todayMaintenance == null) {
      el.style.display = "none";
      el.innerHTML = "";
      return;
    }
    var remaining = todayMaintenance - todayIntake;
    var icon, label, cls;
    var notes = [];
    if (remaining >= 0) {
      icon = "🟢"; label = "In deficit"; cls = "status-good";
      notes.push(remaining + " kcal under maintenance");
    } else {
      icon = "🔴"; label = "Over maintenance"; cls = "status-bad";
      notes.push(Math.abs(remaining) + " kcal over maintenance");
    }
    if (bmr != null && todayIntake < bmr) {
      notes.push("⚠️ below BMR (" + bmr + ")");
    }
    el.innerHTML = '<span class="day-badge ' + cls + '">' + icon + " " + label + "</span>" +
      "<span>" + notes.join(" · ") + "</span>";
    el.style.display = "flex";
  }

  function renderTrends() {
    var daily = loadDaily();
    var range = getTrendsRange();
    renderCaloriesTrend(daily, range);
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
      item.className = "food-log-item";

      var info = document.createElement("div");
      var nameEl = document.createElement("div");
      nameEl.className = "food-log-name";
      nameEl.textContent = t.name;
      var detailEl = document.createElement("div");
      detailEl.className = "food-log-macros";
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
      labelEl.textContent = "Fasting since " + formatClockTime(fasting.current.start);
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

  // ---------- food log ----------

  function clearFoodSearchState() {
    clearTimeout(foodSearchDebounceTimer);
    foodSearchAbortControllers.forEach(function (c) { c.abort(); });
    foodSearchAbortControllers = [];
    document.getElementById("foodSearchResults").innerHTML = "";
    document.getElementById("foodSearchStatus").style.display = "none";
  }

  function handleFoodSearchInput() {
    var query = document.getElementById("foodSearchInput").value.trim();
    clearFoodSearchState();
    if (query.length < 2) return;
    foodSearchDebounceTimer = setTimeout(function () { runFoodSearch(query); }, 450);
  }

  function fetchWithRetry(url, options, retries) {
    return fetch(url, options).catch(function (err) {
      if (retries <= 0 || (err && err.name === "AbortError")) throw err;
      return new Promise(function (resolve) { setTimeout(resolve, 700); })
        .then(function () { return fetchWithRetry(url, options, retries - 1); });
    });
  }

  function parseServingGrams(text) {
    if (!text) return null;
    var match = String(text).match(/([\d.]+)\s*g\b/i);
    return match ? parseFloat(match[1]) : null;
  }

  function searchOpenFoodFacts(query, signal) {
    var url = OFF_SEARCH_URL + "?json=1&action=process&page_size=8" +
      "&search_terms=" + encodeURIComponent(query) +
      "&fields=product_name,brands,nutriments,serving_size";

    return fetchWithRetry(url, signal ? { signal: signal } : {}, 1)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        return (data.products || [])
          .filter(function (p) { return p.product_name && p.nutriments && p.nutriments["energy-kcal_100g"] != null; })
          .map(function (p) {
            return {
              name: p.product_name,
              brand: p.brands || "",
              source: "Open Food Facts",
              servingGrams: parseServingGrams(p.serving_size),
              per100: {
                calories: p.nutriments["energy-kcal_100g"] || 0,
                protein: p.nutriments["proteins_100g"] || 0,
                carbs: p.nutriments["carbohydrates_100g"] || 0,
                fat: p.nutriments["fat_100g"] || 0
              }
            };
          });
      });
  }

  function searchUsdaFdc(query, apiKey, signal) {
    var url = USDA_SEARCH_URL + "?api_key=" + encodeURIComponent(apiKey) +
      "&query=" + encodeURIComponent(query) + "&pageSize=8";

    return fetchWithRetry(url, signal ? { signal: signal } : {}, 1)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        return (data.foods || [])
          .map(function (f) {
            var nutrients = f.foodNutrients || [];
            function nutrientValue(id) {
              var found = nutrients.filter(function (n) { return n.nutrientId === id; })[0];
              return found ? found.value : 0;
            }
            var servingGrams = (f.servingSize != null && /^g/i.test(f.servingSizeUnit || "")) ? f.servingSize : null;
            return {
              name: f.description,
              brand: f.brandOwner || f.dataType || "",
              source: "USDA FoodData Central",
              servingGrams: servingGrams,
              per100: {
                calories: nutrientValue(USDA_NUTRIENT_IDS.calories),
                protein: nutrientValue(USDA_NUTRIENT_IDS.protein),
                carbs: nutrientValue(USDA_NUTRIENT_IDS.carbs),
                fat: nutrientValue(USDA_NUTRIENT_IDS.fat)
              }
            };
          })
          .filter(function (p) { return p.name && p.per100.calories > 0; });
      });
  }

  function searchMyFoods(query) {
    var q = query.toLowerCase();
    var matches = loadCustomFoods()
      .filter(function (f) { return f.name.toLowerCase().indexOf(q) !== -1; })
      .map(function (f) {
        return { name: f.name, brand: "", source: "My Foods", servingGrams: null, per100: f.per100 };
      });
    return Promise.resolve(matches);
  }

  function sourceRank(source) {
    if (source === "My Foods") return 0;
    if (source === "USDA FoodData Central") return 1;
    return 2;
  }

  function sortFoodResults(products) {
    return products.slice().sort(function (a, b) {
      var rankDiff = sourceRank(a.source) - sourceRank(b.source);
      if (rankDiff !== 0) return rankDiff;
      var aBranded = a.brand ? 1 : 0;
      var bBranded = b.brand ? 1 : 0;
      return aBranded - bBranded;
    });
  }

  function runFoodSearch(query) {
    var statusEl = document.getElementById("foodSearchStatus");
    var resultsEl = document.getElementById("foodSearchResults");

    foodSearchAbortControllers.forEach(function (c) { c.abort(); });
    foodSearchAbortControllers = [];

    resultsEl.innerHTML = "";
    statusEl.textContent = "Searching…";
    statusEl.style.display = "block";

    var settings = loadSettings();
    var searches = [searchMyFoods(query)];

    if (settings.usdaApiKey) {
      var usdaController = (typeof AbortController !== "undefined") ? new AbortController() : null;
      if (usdaController) foodSearchAbortControllers.push(usdaController);
      searches.push(searchUsdaFdc(query, settings.usdaApiKey, usdaController && usdaController.signal));
    }

    var offController = (typeof AbortController !== "undefined") ? new AbortController() : null;
    if (offController) foodSearchAbortControllers.push(offController);
    searches.push(searchOpenFoodFacts(query, offController && offController.signal));

    Promise.allSettled(searches).then(function (results) {
      var anyFailed = results.some(function (r) { return r.status === "rejected" && !(r.reason && r.reason.name === "AbortError"); });
      var anyAborted = results.some(function (r) { return r.status === "rejected" && r.reason && r.reason.name === "AbortError"; });
      if (anyAborted) return; // a newer search superseded this one

      var products = [];
      results.forEach(function (r) {
        if (r.status === "fulfilled") products = products.concat(r.value);
      });

      if (products.length === 0) {
        statusEl.textContent = anyFailed
          ? "Open Food Facts couldn't be reached right now (their server is sometimes flaky) — try again in a moment, add a free USDA FoodData Central key in Data for a more reliable source, or add it below."
          : "No results. Try another search or add it below.";
        statusEl.style.display = "block";
        return;
      }
      statusEl.style.display = "none";
      renderFoodSearchResults(sortFoodResults(products));
    });
  }

  function renderFoodSearchResults(products) {
    var resultsEl = document.getElementById("foodSearchResults");
    resultsEl.innerHTML = "";
    products.forEach(function (p) {
      var li = document.createElement("li");
      var kcal = Math.round(p.per100.calories);
      var sourceTag = p.source === "My Foods" ? "MINE" : (p.source === "USDA FoodData Central" ? "USDA" : "OFF");

      var name = document.createElement("div");
      name.className = "food-result-name";
      name.innerHTML = '<span class="food-source-tag">' + sourceTag + "</span>";
      name.appendChild(document.createTextNode(p.name));

      var meta = document.createElement("div");
      meta.className = "food-result-meta";
      meta.textContent = (p.brand ? p.brand + " · " : "") + kcal + " kcal / 100 g";

      li.appendChild(name);
      li.appendChild(meta);
      li.addEventListener("click", function () { selectFoodProduct(p); });
      resultsEl.appendChild(li);
    });
  }

  function setQtyMode(mode) {
    currentQtyMode = mode;
    document.querySelectorAll("#quantityModeToggle .segment").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.qtyMode === mode);
    });
    document.getElementById("gramsField").style.display = mode === "grams" ? "block" : "none";
    document.getElementById("unitsField").style.display = mode === "units" ? "grid" : "none";
    updateFoodPreview();
  }

  function getEffectiveGrams() {
    if (currentQtyMode === "units") {
      var units = parseFloat(document.getElementById("foodUnitsInput").value) || 0;
      var perUnit = parseFloat(document.getElementById("foodUnitGramsInput").value) || 0;
      return units * perUnit;
    }
    return parseFloat(document.getElementById("foodGramsInput").value) || 0;
  }

  function selectFoodProduct(p) {
    selectedFoodProduct = p;
    document.getElementById("foodQuantityName").textContent = p.name;
    document.getElementById("foodGramsInput").value = 100;
    document.getElementById("foodUnitsInput").value = 1;
    document.getElementById("foodUnitGramsInput").value = 50;
    document.getElementById("foodQuantityCard").style.display = "block";
    clearFoodSearchState();
    setQtyMode("grams");
  }

  function updateFoodPreview() {
    if (!selectedFoodProduct) return;
    var grams = getEffectiveGrams();
    var factor = grams / 100;
    var cal = Math.round(selectedFoodProduct.per100.calories * factor);
    var protein = Math.round(selectedFoodProduct.per100.protein * factor);
    var carbs = Math.round(selectedFoodProduct.per100.carbs * factor);
    var fat = Math.round(selectedFoodProduct.per100.fat * factor);
    document.getElementById("foodPreview").innerHTML =
      "<span><strong>" + cal + "</strong> kcal</span>" +
      "<span><strong>" + protein + "</strong> g protein</span>" +
      "<span><strong>" + carbs + "</strong> g carbs</span>" +
      "<span><strong>" + fat + "</strong> g fat</span>";
  }

  function handleAddFoodFromSearch() {
    if (!selectedFoodProduct) return;
    var grams = getEffectiveGrams();
    if (grams <= 0) { toast("Enter a quantity"); return; }
    var factor = grams / 100;
    var updated = {
      grams: Math.round(grams),
      calories: Math.round(selectedFoodProduct.per100.calories * factor),
      protein: Math.round(selectedFoodProduct.per100.protein * factor),
      carbs: Math.round(selectedFoodProduct.per100.carbs * factor),
      fat: Math.round(selectedFoodProduct.per100.fat * factor)
    };
    if (currentQtyMode === "units") {
      updated.units = parseFloat(document.getElementById("foodUnitsInput").value) || 0;
      updated.unitGrams = parseFloat(document.getElementById("foodUnitGramsInput").value) || 0;
    }

    if (editingFoodLogEntry) {
      updateFoodLogEntryQuantity(editingFoodLogEntry.date, editingFoodLogEntry.id, updated);
      editingFoodLogEntry = null;
    } else {
      var date = document.getElementById("foodDate").value || todayISO();
      updated.id = makeId();
      updated.name = selectedFoodProduct.name;
      addFoodEntry(date, updated);
      breakFastNow();
    }

    selectedFoodProduct = null;
    document.getElementById("foodQuantityCard").style.display = "none";
    document.getElementById("addFoodBtn").textContent = "Add to log";
    document.getElementById("cancelEditFoodLogBtn").style.display = "none";
    document.getElementById("foodSearchInput").value = "";
    clearFoodSearchState();
  }

  function startEditFoodLogEntry(date, id) {
    var entries = loadFoodLog()[date] || [];
    var entry = null;
    entries.forEach(function (e) { if (e.id === id) entry = e; });
    if (!entry) return;
    editingFoodLogEntry = { date: date, id: id };

    var per100Factor = entry.grams > 0 ? 100 / entry.grams : 0;
    selectedFoodProduct = {
      name: entry.name,
      per100: {
        calories: entry.calories * per100Factor,
        protein: entry.protein * per100Factor,
        carbs: entry.carbs * per100Factor,
        fat: entry.fat * per100Factor
      }
    };

    document.getElementById("foodQuantityName").textContent = "Edit: " + entry.name;
    document.getElementById("foodQuantityCard").style.display = "block";
    document.getElementById("addFoodBtn").textContent = "Update log entry";
    document.getElementById("cancelEditFoodLogBtn").style.display = "inline-block";
    document.getElementById("foodSearchInput").value = "";
    clearFoodSearchState();

    if (entry.units != null) {
      document.getElementById("foodUnitsInput").value = entry.units;
      document.getElementById("foodUnitGramsInput").value = entry.unitGrams;
      setQtyMode("units");
    } else {
      document.getElementById("foodGramsInput").value = entry.grams;
      setQtyMode("grams");
    }
    document.getElementById("foodQuantityCard").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function cancelEditFoodLogEntry() {
    editingFoodLogEntry = null;
    selectedFoodProduct = null;
    document.getElementById("foodQuantityCard").style.display = "none";
    document.getElementById("addFoodBtn").textContent = "Add to log";
    document.getElementById("cancelEditFoodLogBtn").style.display = "none";
  }

  function updateFoodLogEntryQuantity(date, id, updated) {
    var log = loadFoodLog();
    var entries = log[date] || [];
    var idx = -1;
    entries.forEach(function (entry, i) { if (entry.id === id) idx = i; });
    if (idx === -1) return;
    var old = entries[idx];
    var next = {
      id: old.id,
      name: old.name,
      grams: updated.grams,
      calories: updated.calories,
      protein: updated.protein,
      carbs: updated.carbs,
      fat: updated.fat
    };
    if (updated.units != null) {
      next.units = updated.units;
      next.unitGrams = updated.unitGrams;
    }
    entries[idx] = next;
    saveFoodLog(log);

    var daily = loadDaily();
    var d = daily[date];
    if (d) {
      d.calories = Math.max(0, (d.calories || 0) - old.calories + updated.calories);
      d.protein = Math.max(0, (d.protein || 0) - old.protein + updated.protein);
      d.carbs = Math.max(0, (d.carbs || 0) - old.carbs + updated.carbs);
      d.fat = Math.max(0, (d.fat || 0) - old.fat + updated.fat);
      saveDaily(daily);
    }

    toast("Updated food log");
    renderFoodLog(date);
    syncTodayIfSameDate(date);
  }

  function handleSaveNewFood() {
    var name = document.getElementById("newFoodName").value.trim();
    if (!name) { toast("Enter a food name"); return; }
    var per100 = {
      calories: Math.round(parseFloat(document.getElementById("newFoodCalories").value) || 0),
      protein: Math.round(parseFloat(document.getElementById("newFoodProtein").value) || 0),
      carbs: Math.round(parseFloat(document.getElementById("newFoodCarbs").value) || 0),
      fat: Math.round(parseFloat(document.getElementById("newFoodFat").value) || 0)
    };

    var customFoods = loadCustomFoods();
    customFoods.push({ id: makeId(), name: name, per100: per100 });
    saveCustomFoods(customFoods);
    renderCustomFoodList();

    ["newFoodName", "newFoodCalories", "newFoodProtein", "newFoodCarbs", "newFoodFat"].forEach(function (id) {
      document.getElementById(id).value = "";
    });
    document.getElementById("newFoodCard").style.display = "none";

    toast("Saved to My Foods");
    selectFoodProduct({ name: name, per100: per100 });
  }

  function addFoodEntry(date, entry) {
    var log = loadFoodLog();
    log[date] = log[date] || [];
    log[date].push(entry);
    saveFoodLog(log);

    var daily = loadDaily();
    var d = daily[date] || {};
    d.calories = (d.calories || 0) + entry.calories;
    d.protein = (d.protein || 0) + entry.protein;
    d.carbs = (d.carbs || 0) + entry.carbs;
    d.fat = (d.fat || 0) + entry.fat;
    daily[date] = d;
    saveDaily(daily);

    toast("Added to food log");
    renderFoodLog(date);
    syncTodayIfSameDate(date);
  }

  function removeFoodEntry(date, id) {
    var log = loadFoodLog();
    var entries = log[date] || [];
    var idx = -1;
    entries.forEach(function (entry, i) { if (entry.id === id) idx = i; });
    if (idx === -1) return;
    var removed = entries.splice(idx, 1)[0];
    saveFoodLog(log);

    var daily = loadDaily();
    var d = daily[date];
    if (d) {
      d.calories = Math.max(0, (d.calories || 0) - removed.calories);
      d.protein = Math.max(0, (d.protein || 0) - removed.protein);
      d.carbs = Math.max(0, (d.carbs || 0) - removed.carbs);
      d.fat = Math.max(0, (d.fat || 0) - removed.fat);
      saveDaily(daily);
    }

    if (editingFoodLogEntry && editingFoodLogEntry.date === date && editingFoodLogEntry.id === id) {
      cancelEditFoodLogEntry();
    }

    toast("Removed from food log");
    renderFoodLog(date);
    syncTodayIfSameDate(date);
  }

  function syncTodayIfSameDate(date) {
    if (date === (document.getElementById("logDate").value || todayISO())) {
      fillFormFromDate(date);
      renderToday();
    }
  }

  function renderFoodLog(date) {
    var list = document.getElementById("foodLogList");
    var totalsEl = document.getElementById("foodLogTotals");
    var entries = loadFoodLog()[date] || [];

    if (entries.length === 0) {
      list.innerHTML = '<div class="empty-state">No food logged for this day.</div>';
      totalsEl.style.display = "none";
      return;
    }

    list.innerHTML = "";
    var totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
    entries.forEach(function (entry) {
      totals.calories += entry.calories;
      totals.protein += entry.protein;
      totals.carbs += entry.carbs;
      totals.fat += entry.fat;

      var item = document.createElement("div");
      item.className = "food-log-item";

      var info = document.createElement("div");
      var nameEl = document.createElement("div");
      nameEl.className = "food-log-name";
      var qtyLabel = entry.units != null
        ? " (" + entry.units + " × " + entry.unitGrams + " g = " + entry.grams + " g)"
        : (entry.grams != null ? " (" + entry.grams + " g)" : "");
      nameEl.textContent = entry.name + qtyLabel;
      var macrosEl = document.createElement("div");
      macrosEl.className = "food-log-macros";
      macrosEl.textContent = entry.calories + " kcal · " + entry.protein + " g protein · " + entry.carbs + " g carbs · " + entry.fat + " g fat";
      info.appendChild(nameEl);
      info.appendChild(macrosEl);

      var actions = document.createElement("div");
      actions.className = "food-log-actions";

      var editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "icon-btn";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", function () { startEditFoodLogEntry(date, entry.id); });

      var removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "remove";
      removeBtn.textContent = "✕";
      removeBtn.addEventListener("click", function () { removeFoodEntry(date, entry.id); });

      actions.appendChild(editBtn);
      actions.appendChild(removeBtn);

      item.appendChild(info);
      item.appendChild(actions);
      list.appendChild(item);
    });

    totalsEl.innerHTML = '<span class="day-badge">Total</span>' +
      "<span>" + totals.calories + " kcal</span>" +
      "<span>" + totals.protein + " g protein</span>" +
      "<span>" + totals.carbs + " g carbs</span>" +
      "<span>" + totals.fat + " g fat</span>";
    totalsEl.style.display = "flex";
  }

  // ---------- history view ----------

  function renderHistory() {
    var daily = loadDaily();
    var workouts = loadWorkouts();
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
        if (entry.calories != null) parts.push(entry.calories + " kcal");
        if (entry.protein != null) parts.push(entry.protein + " g protein");
        if (entry.carbs != null) parts.push(entry.carbs + " g carbs");
        if (entry.fat != null) parts.push(entry.fat + " g fat");
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
      settings: loadSettings(),
      foodlog: loadFoodLog(),
      customFoods: loadCustomFoods(),
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
    if (payload.settings) saveSettings(payload.settings);
    if (payload.foodlog) saveFoodLog(payload.foodlog);
    if (payload.customFoods) saveCustomFoods(payload.customFoods);
    if (payload.customExercises) saveCustomExercises(payload.customExercises);
    if (payload.customWorkoutTemplates) saveWorkoutTemplates(payload.customWorkoutTemplates);
    if (payload.fasting) { saveFasting(payload.fasting); renderFastingStatus(); }
    toast("Import complete");
    fillProfileForm();
    fillFormFromDate(document.getElementById("logDate").value || todayISO());
    resetWeightTrendDateInputs();
    resetTrendsDateInputs();
    renderToday();
    renderHistory();
    renderTrends();
    populateExerciseSelect(currentExerciseType);
    populateWorkoutTemplateSelect();
    renderFoodLog(document.getElementById("foodDate").value || todayISO());
    renderCustomFoodList();
    renderWorkoutTemplateList();
  }

  function handleClear() {
    if (!confirm("Erase all logged data on this device? This cannot be undone.")) return;
    localStorage.removeItem(STORAGE.daily);
    localStorage.removeItem(STORAGE.workouts);
    localStorage.removeItem(STORAGE.settings);
    localStorage.removeItem(STORAGE.foodlog);
    localStorage.removeItem(STORAGE.customFoods);
    localStorage.removeItem(STORAGE.customExercises);
    localStorage.removeItem(STORAGE.customWorkoutTemplates);
    localStorage.removeItem(STORAGE.fasting);
    currentExercises = [];
    editingWorkoutId = null;
    handleCancelEditMyFood();
    fillProfileForm();
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
    renderFoodLog(document.getElementById("foodDate").value || todayISO());
    renderCustomFoodList();
    renderWorkoutTemplateList();
    toast("All data erased");
  }

  // ---------- settings ----------

  function getEarliestLoggedWeightDate() {
    var daily = loadDaily();
    var dates = Object.keys(daily).filter(function (d) { return daily[d].weight != null; }).sort();
    return dates.length ? dates[0] : null;
  }

  function getLatestLoggedWeight() {
    var daily = loadDaily();
    var dates = Object.keys(daily).filter(function (d) { return daily[d].weight != null; }).sort();
    if (dates.length === 0) return null;
    var date = dates[dates.length - 1];
    return { weight: daily[date].weight, date: date };
  }

  var currentSex = "male";

  function setSexToggle(sex) {
    currentSex = sex;
    document.querySelectorAll("#sexToggle .segment").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.sex === sex);
    });
  }

  function fillProfileForm() {
    var settings = loadSettings();
    document.getElementById("ageInput").value = settings.age != null ? settings.age : "";
    document.getElementById("heightInput").value = settings.heightCm != null ? settings.heightCm : "";
    setSexToggle(settings.sex || "male");
    document.getElementById("usdaApiKeyInput").value = settings.usdaApiKey || "";
  }

  function handleUsdaKeyChange() {
    var key = document.getElementById("usdaApiKeyInput").value.trim();
    var settings = loadSettings();
    if (key !== "") settings.usdaApiKey = key; else delete settings.usdaApiKey;
    saveSettings(settings);
    toast(key !== "" ? "USDA API key saved" : "USDA API key removed");
  }

  function handleProfileChange() {
    var age = document.getElementById("ageInput").value;
    var height = document.getElementById("heightInput").value;
    var settings = loadSettings();
    if (age !== "") settings.age = Math.round(parseFloat(age)); else delete settings.age;
    if (height !== "") settings.heightCm = Math.round(parseFloat(height)); else delete settings.heightCm;
    settings.sex = currentSex;
    saveSettings(settings);
    renderToday();
    renderTrends();
  }

  // That day's own logged weight, else the most recently logged weight before it, else the
  // closest logged weight overall, else a default. Used so BMR reflects the body weight
  // that was actually true on that day instead of always using today's latest weigh-in.
  function resolveWeightForDate(date, entry, daily) {
    if (entry && entry.weight != null) return entry.weight;
    var priorDates = Object.keys(daily).filter(function (d) { return d < date && daily[d].weight != null; }).sort();
    if (priorDates.length > 0) return daily[priorDates[priorDates.length - 1]].weight;
    var latest = getLatestLoggedWeight();
    return latest ? latest.weight : DEFAULT_BODYWEIGHT_KG;
  }

  // Mifflin-St Jeor: resting energy burn only (no activity), for a given body weight.
  function computeBMRForWeight(weight) {
    var settings = loadSettings();
    if (settings.age == null || settings.heightCm == null || weight == null) return null;
    var bmr = 10 * weight + 6.25 * settings.heightCm - 5 * settings.age + (settings.sex === "female" ? -161 : 5);
    return Math.round(bmr / 10) * 10;
  }

  // BMR for a specific day, using that day's own weight where available.
  function computeBMRForDate(date, entry, daily) {
    return computeBMRForWeight(resolveWeightForDate(date, entry, daily));
  }

  // Total expenditure for a specific day: resting burn (BMR, using that day's weight) + that day's activity burn.
  function getMaintenanceForDay(date, entry, daily) {
    var bmr = computeBMRForDate(date, entry, daily);
    if (bmr == null) return null;
    var burned = Math.round(getCaloriesBurnedBreakdown(date, entry && entry.weight, entry && entry.steps).total);
    return bmr + burned;
  }

  // ---------- init ----------

  function init() {
    seedCustomFoodsIfNeeded();
    seedWorkoutTemplatesIfNeeded();

    document.getElementById("headerDate").textContent = formatDateLong(todayISO());
    document.getElementById("logDate").value = todayISO();
    document.getElementById("workoutDate").value = todayISO();
    setDefaultWorkoutName(todayISO());
    document.getElementById("foodDate").value = todayISO();
    resetWeightTrendDateInputs();
    resetTrendsDateInputs();

    document.getElementById("syncStepsBtn").style.display = nativeStepsAvailable() ? "block" : "none";

    fillFormFromDate(todayISO());

    document.querySelectorAll(".tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { switchView(btn.dataset.view); });
    });

    document.getElementById("dailyForm").addEventListener("submit", handleDailySubmit);
    document.getElementById("syncStepsBtn").addEventListener("click", function () { syncStepsFromDevice(false); });
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

    fillProfileForm();
    document.querySelectorAll("#sexToggle .segment").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setSexToggle(btn.dataset.sex);
        handleProfileChange();
      });
    });
    document.getElementById("ageInput").addEventListener("change", handleProfileChange);
    document.getElementById("heightInput").addEventListener("change", handleProfileChange);
    document.getElementById("usdaApiKeyInput").addEventListener("change", handleUsdaKeyChange);

    renderCustomFoodList();
    document.getElementById("addMyFoodBtn").addEventListener("click", handleAddMyFood);

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

    document.getElementById("cancelEditMyFoodBtn").addEventListener("click", handleCancelEditMyFood);

    document.getElementById("foodSearchInput").addEventListener("input", handleFoodSearchInput);
    document.getElementById("foodGramsInput").addEventListener("input", updateFoodPreview);
    document.getElementById("foodUnitsInput").addEventListener("input", updateFoodPreview);
    document.getElementById("foodUnitGramsInput").addEventListener("input", updateFoodPreview);
    document.querySelectorAll("#quantityModeToggle .segment").forEach(function (btn) {
      btn.addEventListener("click", function () { setQtyMode(btn.dataset.qtyMode); });
    });
    document.getElementById("addFoodBtn").addEventListener("click", handleAddFoodFromSearch);
    document.getElementById("cancelEditFoodLogBtn").addEventListener("click", cancelEditFoodLogEntry);
    document.getElementById("showNewFoodBtn").addEventListener("click", function () {
      var card = document.getElementById("newFoodCard");
      card.style.display = card.style.display === "none" ? "block" : "none";
    });
    document.getElementById("saveNewFoodBtn").addEventListener("click", handleSaveNewFood);
    document.getElementById("foodDate").addEventListener("change", function (e) {
      renderFoodLog(e.target.value);
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
    renderFoodLog(todayISO());
    renderTrends();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
