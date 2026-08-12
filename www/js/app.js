(function () {
  "use strict";

  var STORAGE = {
    daily: "gymlog.daily",       // { "2026-07-27": { weight, sleepHours, calories, protein, carbs, fat, steps, dayType } }
    workouts: "gymlog.workouts", // [ { id, date, name, exercises: [{name, sets:[{reps,weight}]}] } ]
    settings: "gymlog.settings", // { restCalories, workoutCalories, cardioCalories, age, heightCm, activityLevel, sex }
    foodlog: "gymlog.foodlog",   // { "2026-07-27": [ {id, name, grams, calories, protein, carbs, fat} ] }
    customFoods: "gymlog.customfoods", // [ { id, name, per100: {calories, protein, carbs, fat} } ]
    customExercises: "gymlog.customExercises", // [ { name, type: 'strength' | 'cardio' } ]
    customWorkoutTemplates: "gymlog.customWorkoutTemplates" // [ { id, name, exercises: [{name, type}] } ]
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

  var DEFAULT_BODYWEIGHT_KG = 75; // used to estimate calories burned when no weight is logged for the day
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

  var ACTIVITY_MULTIPLIERS = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    very_active: 1.9
  };
  var ACTIVITY_LEVEL_LABELS = {
    sedentary: "Sedentary",
    light: "Light",
    moderate: "Moderate",
    active: "Active",
    very_active: "Very active"
  };
  var ACTIVE_DAY_STEPS_THRESHOLD = 8000; // steps on a day with no logged workout still count as "active"
  var currentSex = "male"; // 'male' | 'female', for the maintenance-calorie form
  // Fixed deficit for all calorie targets (rest/workout/cardio) — evidence-based range for
  // fat loss while preserving muscle is ~10-25% below maintenance; not user-adjustable.
  var FIXED_DEFICIT_PCT = 25;
  // Bumped whenever the target-computation policy changes, so installs with targets computed
  // under an older policy (e.g. the old per-day-type deficit %s) force a one-time recompute.
  var CALORIE_TARGET_POLICY = "fixed25";
  var MIN_HEALTHY_DEFICIT_PCT = 10; // below this, unlikely to produce meaningful fat loss
  var MAX_HEALTHY_DEFICIT_PCT = 25; // above this, risks muscle loss / unsustainable
  var MIN_HEALTHY_WEEKLY_LOSS_PCT = 0.5; // % of bodyweight per week
  var MAX_HEALTHY_WEEKLY_LOSS_PCT = 1.0; // % of bodyweight per week

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
    syncMaintenanceTargets(computeMaintenanceCalories());
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

  function todayISO() {
    var d = new Date();
    var tz = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tz).toISOString().slice(0, 10);
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
    if (name === "data") { renderMaintenanceEstimate(); renderCustomFoodList(); renderWorkoutTemplateList(); }
  }

  // ---------- today view ----------

  var KPI_TREND_CONFIG = [
    { key: "weight", elId: "sumWeightTrend", decimals: 1 },
    { key: "sleepHours", elId: "sumSleepTrend", decimals: 1 },
    { key: "calories", elId: "sumCaloriesTrend", decimals: 0 },
    { key: "protein", elId: "sumProteinTrend", decimals: 0 },
    { key: "carbs", elId: "sumCarbsTrend", decimals: 0 },
    { key: "fat", elId: "sumFatTrend", decimals: 0 },
    { key: "steps", elId: "sumStepsTrend", decimals: 0 },
    { key: "water", elId: "sumWaterTrend", decimals: 1 },
    { key: "cigarettes", elId: "sumCigarettesTrend", decimals: 0 }
  ];

  function renderKpiTrend(cfg, daily, dateISO) {
    var el = document.getElementById(cfg.elId);
    var todayVal = daily[dateISO] ? daily[dateISO][cfg.key] : null;
    var yestVal = daily[addDaysISO(dateISO, -1)] ? daily[addDaysISO(dateISO, -1)][cfg.key] : null;

    var parts = [];
    if (todayVal != null && yestVal != null) {
      var diff = roundN(todayVal - yestVal, cfg.decimals);
      parts.push((diff > 0 ? "+" : "") + diff + " vs yday");
    }

    var vals = [];
    for (var i = 0; i < 7; i++) {
      var entry = daily[addDaysISO(dateISO, -i)];
      if (entry && entry[cfg.key] != null) vals.push(entry[cfg.key]);
    }
    if (vals.length > 0) {
      var avg = vals.reduce(function (sum, v) { return sum + v; }, 0) / vals.length;
      parts.push("7d avg " + roundN(avg, cfg.decimals));
    }

    if (parts.length === 0) {
      el.style.display = "none";
      el.textContent = "";
      return;
    }
    el.textContent = parts.join(" · ");
    el.style.display = "block";
  }

  function renderToday() {
    var daily = loadDaily();
    var today = document.getElementById("logDate").value || todayISO();
    var entry = daily[today] || {};
    document.getElementById("sumWeight").textContent = entry.weight != null ? entry.weight : "—";
    document.getElementById("sumSleep").textContent = entry.sleepHours != null ? entry.sleepHours : "—";
    document.getElementById("sumCalories").textContent = entry.calories != null ? entry.calories : "—";
    renderCaloriesGoalDelta(entry);
    document.getElementById("sumProtein").textContent = entry.protein != null ? entry.protein : "—";
    document.getElementById("sumCarbs").textContent = entry.carbs != null ? entry.carbs : "—";
    document.getElementById("sumFat").textContent = entry.fat != null ? entry.fat : "—";
    document.getElementById("sumSteps").textContent = entry.steps != null ? entry.steps : "—";
    document.getElementById("sumWater").textContent = entry.water != null ? entry.water : "—";
    document.getElementById("sumCigarettes").textContent = entry.cigarettes != null ? entry.cigarettes : "—";
    KPI_TREND_CONFIG.forEach(function (cfg) { renderKpiTrend(cfg, daily, today); });
    renderDayStatus(entry, today);
    renderWeightTrend(daily);
  }

  var DAY_TYPE_CALORIE_SETTINGS_KEY = {
    rest: "restCalories",
    workout: "workoutCalories",
    cardio: "cardioCalories"
  };

  function renderCaloriesGoalDelta(entry) {
    var el = document.getElementById("sumCaloriesGoal");
    var settings = loadSettings();
    var settingsKey = DAY_TYPE_CALORIE_SETTINGS_KEY[entry.dayType];
    var target = settingsKey ? settings[settingsKey] : null;
    if (target == null) {
      el.textContent = "";
      el.className = "stat-sub";
      return;
    }
    var consumed = entry.calories != null ? entry.calories : 0;
    var remaining = target - consumed;
    if (remaining > 0) {
      el.textContent = remaining + " kcal remaining";
      el.className = "stat-sub diff-under";
    } else if (remaining === 0) {
      el.textContent = "On goal";
      el.className = "stat-sub diff-under";
    } else {
      el.textContent = Math.abs(remaining) + " kcal over";
      el.className = "stat-sub diff-over";
    }
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
    toast("Saved " + formatDateLong(date));
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

  function buildFlatDateSeries(start, end, value) {
    var points = [];
    var d = start;
    while (d <= end) {
      points.push({ date: d, value: value });
      d = addDaysISO(d, 1);
    }
    return points;
  }

  function renderCaloriesTrend(daily, range) {
    var settings = loadSettings();
    var dates = Object.keys(daily).filter(function (d) { return d >= range.start && d <= range.end; }).sort();
    var intakePoints = [];
    var burnedPoints = [];
    var goalPoints = [];
    dates.forEach(function (d) {
      var entry = daily[d];
      if (entry.calories != null) intakePoints.push({ date: d, value: entry.calories });
      var burned = Math.round(getCaloriesBurnedBreakdown(d, entry.weight, entry.steps).total);
      if (burned > 0) burnedPoints.push({ date: d, value: burned });
      var goalSettingsKey = DAY_TYPE_CALORIE_SETTINGS_KEY[entry.dayType];
      var goal = goalSettingsKey ? settings[goalSettingsKey] : null;
      if (goal != null) goalPoints.push({ date: d, value: goal });
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

    var today = todayISO();
    var todayEntry = daily[today];
    var todayIntake = todayEntry && todayEntry.calories != null ? todayEntry.calories : null;
    var todayBurned = Math.round(getCaloriesBurnedBreakdown(today, todayEntry && todayEntry.weight, todayEntry && todayEntry.steps).total);
    var todayGoalKey = todayEntry && DAY_TYPE_CALORIE_SETTINGS_KEY[todayEntry.dayType];
    var todayGoal = todayGoalKey ? settings[todayGoalKey] : null;

    document.getElementById("trendsCaloriesIntakeLegendLabel").textContent =
      todayIntake != null ? "Intake (" + todayIntake + ")" : "Intake";
    document.getElementById("trendsCaloriesBurnedLegendLabel").textContent = "Burned (" + todayBurned + ")";

    var goalLegend = document.getElementById("trendsCaloriesGoalLegend");
    if (goalPoints.length > 0) {
      series.push({ points: goalPoints, color: accent3Color });
      goalLegend.style.display = "flex";
      document.getElementById("trendsCaloriesGoalLegendLabel").textContent =
        todayGoal != null ? "Goal (" + todayGoal + ")" : "Goal";
    } else {
      goalLegend.style.display = "none";
    }

    var maintenance = (intakePoints.length > 0 || burnedPoints.length > 0) ? computeMaintenanceCalories() : null;
    var maintenanceLegend = document.getElementById("trendsCaloriesMaintenanceLegend");
    if (maintenance) {
      series.push({ points: buildFlatDateSeries(range.start, range.end, maintenance.tdee), color: textDimColor, dashed: true });
      maintenanceLegend.style.display = "flex";
      var maintenanceKind = maintenance.method === "measured" ? "measured" : "estimated";
      document.getElementById("trendsCaloriesMaintenanceLabel").textContent = "Maintenance, " + maintenanceKind + " (" + maintenance.tdee + " kcal)";
    } else {
      maintenanceLegend.style.display = "none";
    }

    renderCalorieAlignment(todayIntake, todayGoal, maintenance);
    drawMultiLineChart("trendsCaloriesChart", "trendsCaloriesEmpty", series);
  }

  function renderCalorieAlignment(todayIntake, todayGoal, maintenance) {
    var el = document.getElementById("trendsCaloriesAlignment");
    if (todayGoal == null || !maintenance) {
      el.style.display = "none";
      el.innerHTML = "";
      return;
    }

    var deficitPct = Math.round(((maintenance.tdee - todayGoal) / maintenance.tdee) * 100);
    var deficitHealthy = deficitPct >= MIN_HEALTHY_DEFICIT_PCT && deficitPct <= MAX_HEALTHY_DEFICIT_PCT;
    var deficitNote = deficitPct < 0
      ? "goal is " + Math.abs(deficitPct) + "% above maintenance (surplus)"
      : "goal is " + deficitPct + "% below maintenance";

    var intakeHealthy = null;
    var intakeNote = "";
    if (todayIntake != null) {
      var intakeDiffPct = Math.round(((todayIntake - todayGoal) / todayGoal) * 100);
      intakeHealthy = Math.abs(intakeDiffPct) <= 10;
      intakeNote = intakeDiffPct > 0
        ? "intake is " + intakeDiffPct + "% over today's goal"
        : intakeDiffPct < 0
          ? "intake is " + Math.abs(intakeDiffPct) + "% under today's goal"
          : "intake matches today's goal";
    }

    // Weight-loss rate is the metric muscle-preservation research actually targets
    // (0.5-1.0% of bodyweight/week) — only available once measured maintenance kicks in,
    // since that's the same 14+ day window this needs to be meaningful.
    var rateHealthy = null;
    var rateNote = "";
    if (maintenance.method === "measured" && maintenance.measured && maintenance.measured.weightStart) {
      var m = maintenance.measured;
      var ratePctPerWeek = (m.weightChangeKg / m.periodDays * 7) / m.weightStart * 100;
      rateHealthy = ratePctPerWeek >= MIN_HEALTHY_WEEKLY_LOSS_PCT && ratePctPerWeek <= MAX_HEALTHY_WEEKLY_LOSS_PCT;
      rateNote = ratePctPerWeek > 0
        ? "losing " + ratePctPerWeek.toFixed(1) + "%/week"
        : ratePctPerWeek < 0
          ? "gaining " + Math.abs(ratePctPerWeek).toFixed(1) + "%/week"
          : "weight stable";
    }

    var checks = 1 + (intakeHealthy == null ? 0 : 1) + (rateHealthy == null ? 0 : 1);
    var passCount = (deficitHealthy ? 1 : 0) + (intakeHealthy ? 1 : 0) + (rateHealthy ? 1 : 0);
    var icon, label, cls;
    if (passCount === checks) { icon = "🟢"; label = "Aligned"; cls = "status-good"; }
    else if (passCount === 0) { icon = "🔴"; label = "Not aligned"; cls = "status-bad"; }
    else { icon = "🟡"; label = "Partially aligned"; cls = "status-warn"; }

    var notes = [deficitNote];
    if (intakeHealthy != null) notes.push(intakeNote);
    if (rateHealthy != null) notes.push(rateNote);
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

  // ---------- food log ----------

  function clearFoodSearchState() {
    document.getElementById("foodSearchResults").innerHTML = "";
    document.getElementById("foodSearchStatus").style.display = "none";
  }

  function handleFoodSearchInput() {
    var query = document.getElementById("foodSearchInput").value.trim();
    if (query.length < 2) { clearFoodSearchState(); return; }

    var matches = loadCustomFoods()
      .filter(function (f) { return f.name.toLowerCase().indexOf(query.toLowerCase()) !== -1; })
      .map(function (f) { return { name: f.name, per100: f.per100 }; });

    var statusEl = document.getElementById("foodSearchStatus");
    if (matches.length === 0) {
      document.getElementById("foodSearchResults").innerHTML = "";
      statusEl.textContent = "No matching food yet — add it below.";
      statusEl.style.display = "block";
      return;
    }
    statusEl.style.display = "none";
    renderFoodSearchResults(matches);
  }

  function renderFoodSearchResults(products) {
    var resultsEl = document.getElementById("foodSearchResults");
    resultsEl.innerHTML = "";
    products.forEach(function (p) {
      var li = document.createElement("li");
      var kcal = Math.round(p.per100.calories);

      var name = document.createElement("div");
      name.className = "food-result-name";
      name.textContent = p.name;

      var meta = document.createElement("div");
      meta.className = "food-result-meta";
      meta.textContent = kcal + " kcal / 100 g";

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
    var date = document.getElementById("foodDate").value || todayISO();
    var entry = {
      id: makeId(),
      name: selectedFoodProduct.name,
      grams: Math.round(grams),
      calories: Math.round(selectedFoodProduct.per100.calories * factor),
      protein: Math.round(selectedFoodProduct.per100.protein * factor),
      carbs: Math.round(selectedFoodProduct.per100.carbs * factor),
      fat: Math.round(selectedFoodProduct.per100.fat * factor)
    };
    if (currentQtyMode === "units") {
      entry.units = parseFloat(document.getElementById("foodUnitsInput").value) || 0;
      entry.unitGrams = parseFloat(document.getElementById("foodUnitGramsInput").value) || 0;
    }
    addFoodEntry(date, entry);

    selectedFoodProduct = null;
    document.getElementById("foodQuantityCard").style.display = "none";
    document.getElementById("foodSearchInput").value = "";
    clearFoodSearchState();
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

      var removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "remove";
      removeBtn.textContent = "✕";
      removeBtn.addEventListener("click", function () { removeFoodEntry(date, entry.id); });

      item.appendChild(info);
      item.appendChild(removeBtn);
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

    var dates = {};
    Object.keys(daily).forEach(function (d) { dates[d] = true; });
    workouts.forEach(function (w) { dates[w.date] = true; });

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
      customWorkoutTemplates: loadWorkoutTemplates()
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
    if (payload.daily) saveDaily(payload.daily);
    if (payload.workouts) saveWorkouts(payload.workouts);
    if (payload.settings) saveSettings(payload.settings);
    if (payload.foodlog) saveFoodLog(payload.foodlog);
    if (payload.customFoods) saveCustomFoods(payload.customFoods);
    if (payload.customExercises) saveCustomExercises(payload.customExercises);
    if (payload.customWorkoutTemplates) saveWorkoutTemplates(payload.customWorkoutTemplates);
    toast("Import complete");
    fillSettingsForm();
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
    currentExercises = [];
    editingWorkoutId = null;
    handleCancelEditMyFood();
    fillSettingsForm();
    resetWeightTrendDateInputs();
    resetTrendsDateInputs();
    renderToday();
    renderHistory();
    renderTrends();
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

  function fillSettingsForm() {
    var settings = loadSettings();
    document.getElementById("restCaloriesInput").value = settings.restCalories != null ? settings.restCalories : "";
    document.getElementById("workoutCaloriesInput").value = settings.workoutCalories != null ? settings.workoutCalories : "";
    document.getElementById("cardioCaloriesInput").value = settings.cardioCalories != null ? settings.cardioCalories : "";
    document.getElementById("ageInput").value = settings.age != null ? settings.age : "";
    document.getElementById("heightInput").value = settings.heightCm != null ? settings.heightCm : "";
    document.getElementById("activityLevelSelect").value = settings.activityLevel || "moderate";
    setSexToggle(settings.sex || "male");
    renderMaintenanceEstimate();
  }

  function persistTargetsAndDeficits() {
    var rest = document.getElementById("restCaloriesInput").value;
    var workout = document.getElementById("workoutCaloriesInput").value;
    var cardio = document.getElementById("cardioCaloriesInput").value;
    var settings = loadSettings();
    if (rest !== "") settings.restCalories = Math.round(parseFloat(rest)); else delete settings.restCalories;
    if (workout !== "") settings.workoutCalories = Math.round(parseFloat(workout)); else delete settings.workoutCalories;
    if (cardio !== "") settings.cardioCalories = Math.round(parseFloat(cardio)); else delete settings.cardioCalories;
    saveSettings(settings);
    renderToday();
  }

  function handleSettingsChange() {
    persistTargetsAndDeficits();
    toast("Targets saved");
  }

  // ---------- maintenance calories ----------

  function setSexToggle(sex) {
    currentSex = sex;
    document.querySelectorAll("#sexToggle .segment").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.sex === sex);
    });
  }

  function getLatestLoggedWeight() {
    var daily = loadDaily();
    var dates = Object.keys(daily).filter(function (d) { return daily[d].weight != null; }).sort();
    if (dates.length === 0) return null;
    var date = dates[dates.length - 1];
    return { weight: daily[date].weight, date: date };
  }

  function getEarliestLoggedWeightDate() {
    var daily = loadDaily();
    var dates = Object.keys(daily).filter(function (d) { return daily[d].weight != null; }).sort();
    return dates.length ? dates[0] : null;
  }

  function computeActivityLevelFromHistory() {
    var end = todayISO();
    var start = addDaysISO(end, -6);
    var daily = loadDaily();
    var loggedDays = Object.keys(daily).filter(function (d) { return d >= start && d <= end; });
    if (loggedDays.length < 4) return null;

    var activeDates = {};
    loggedDays.forEach(function (d) {
      var entry = daily[d];
      if (entry.dayType === "workout" || entry.dayType === "cardio") activeDates[d] = true;
      if (entry.steps != null && entry.steps >= ACTIVE_DAY_STEPS_THRESHOLD) activeDates[d] = true;
    });
    loadWorkouts().forEach(function (w) {
      if (w.date >= start && w.date <= end) activeDates[w.date] = true;
    });

    var activeCount = Object.keys(activeDates).length;
    var level;
    if (activeCount <= 1) level = "sedentary";
    else if (activeCount <= 3) level = "light";
    else if (activeCount <= 5) level = "moderate";
    else if (activeCount === 6) level = "active";
    else level = "very_active";

    return { level: level, activeDays: activeCount, loggedDays: loggedDays.length };
  }

  function renderActivityAutoSuggestion() {
    var hint = document.getElementById("activityAutoSuggestion");
    var suggestion = computeActivityLevelFromHistory();
    if (!suggestion) {
      hint.style.display = "none";
      return;
    }
    hint.innerHTML = "📊 Based on your last " + suggestion.loggedDays + " logged days (" + suggestion.activeDays +
      " active), your activity level looks like <strong>" + ACTIVITY_LEVEL_LABELS[suggestion.level] + "</strong>.";
    hint.style.display = "block";
  }

  var MEASURED_MAINTENANCE_WINDOW_DAYS = 28;
  var MEASURED_MAINTENANCE_MIN_DAYS = 14;

  function daysBetweenISO(a, b) {
    var da = new Date(a + "T00:00:00");
    var db = new Date(b + "T00:00:00");
    return Math.round((db - da) / 86400000);
  }

  // avg_kcal_intake = average(daily logged calories) over the period
  // weight_start / weight_end = 7-day average weight at the start/end of the period
  // weight_change_kg = weight_start - weight_end (positive = loss)
  // total_deficit_kcal = weight_change_kg * 7700; daily_deficit_kcal = total_deficit_kcal / days
  // TDEE = avg_kcal_intake + daily_deficit_kcal
  function computeMeasuredMaintenance() {
    var daily = loadDaily();
    var weightDates = Object.keys(daily).filter(function (d) { return daily[d].weight != null; }).sort();
    if (weightDates.length === 0) return null;

    var earliest = weightDates[0];
    var end = weightDates[weightDates.length - 1];
    var start = addDaysISO(end, -(MEASURED_MAINTENANCE_WINDOW_DAYS - 1));
    if (start < earliest) start = earliest;
    var periodDays = daysBetweenISO(start, end) + 1;
    if (periodDays < MEASURED_MAINTENANCE_MIN_DAYS) return null;

    function avgWeightInWindow(winStart, winEnd) {
      var vals = [];
      var d = winStart;
      while (d <= winEnd) {
        if (daily[d] && daily[d].weight != null) vals.push(daily[d].weight);
        d = addDaysISO(d, 1);
      }
      return vals.length >= 3 ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : null;
    }

    var weightStart = avgWeightInWindow(start, addDaysISO(start, 6));
    var weightEnd = avgWeightInWindow(addDaysISO(end, -6), end);
    if (weightStart == null || weightEnd == null) return null;

    var calorieVals = [];
    var d = start;
    while (d <= end) {
      if (daily[d] && daily[d].calories != null) calorieVals.push(daily[d].calories);
      d = addDaysISO(d, 1);
    }
    if (calorieVals.length < 7) return null;
    var avgIntake = calorieVals.reduce(function (a, b) { return a + b; }, 0) / calorieVals.length;

    var weightChangeKg = weightStart - weightEnd;
    var totalDeficitKcal = weightChangeKg * 7700;
    var dailyDeficitKcal = totalDeficitKcal / periodDays;
    var tdee = Math.round((avgIntake + dailyDeficitKcal) / 10) * 10;

    return {
      tdee: tdee,
      avgIntake: Math.round(avgIntake),
      weightStart: weightStart,
      weightEnd: weightEnd,
      weightChangeKg: weightChangeKg,
      periodDays: periodDays,
      loggedCalorieDays: calorieVals.length,
      start: start,
      end: end
    };
  }

  function computeMaintenanceCalories() {
    var measured = computeMeasuredMaintenance();
    if (measured) return { tdee: measured.tdee, method: "measured", measured: measured };

    var settings = loadSettings();
    var age = settings.age;
    var heightCm = settings.heightCm;
    if (age == null || heightCm == null) return null;

    var latest = getLatestLoggedWeight();
    var weight = latest ? latest.weight : DEFAULT_BODYWEIGHT_KG;

    var bmr = 10 * weight + 6.25 * heightCm - 5 * age + (currentSex === "female" ? -161 : 5);
    var multiplier = ACTIVITY_MULTIPLIERS[settings.activityLevel] || ACTIVITY_MULTIPLIERS.moderate;
    var tdee = Math.round((bmr * multiplier) / 10) * 10;

    return { tdee: tdee, method: "formula", weight: weight, usedDefaultWeight: !latest, weightDate: latest ? latest.date : null };
  }

  function applyMaintenanceTargets(result, showToast) {
    var target = Math.round((result.tdee * (1 - FIXED_DEFICIT_PCT / 100)) / 10) * 10;
    document.getElementById("restCaloriesInput").value = target;
    document.getElementById("workoutCaloriesInput").value = target;
    document.getElementById("cardioCaloriesInput").value = target;
    persistTargetsAndDeficits();
    var settings = loadSettings();
    settings.maintenanceTdeeForTargets = result.tdee;
    settings.calorieTargetPolicy = CALORIE_TARGET_POLICY;
    saveSettings(settings);
    if (showToast) toast("Calorie targets updated");
  }

  // Keeps the calorie targets following the maintenance estimate: any time the estimate
  // moves (or hasn't been applied yet, or the target-computation policy changed), the
  // targets are recomputed from it.
  function syncMaintenanceTargets(result) {
    if (!result) return;
    var settings = loadSettings();
    if (settings.calorieTargetPolicy === CALORIE_TARGET_POLICY && settings.maintenanceTdeeForTargets === result.tdee) return;
    applyMaintenanceTargets(result, false);
  }

  function renderMaintenanceEstimate() {
    renderActivityAutoSuggestion();
    var el = document.getElementById("maintenanceResult");
    var result = computeMaintenanceCalories();
    syncMaintenanceTargets(result);
    if (!result) {
      el.innerHTML = "<span>Enter your age and height above to estimate maintenance calories.</span>";
      el.style.display = "flex";
      return;
    }
    var label, note;
    if (result.method === "measured") {
      var m = result.measured;
      var changeAbs = Math.abs(m.weightChangeKg).toFixed(1);
      var trendWord = m.weightChangeKg > 0 ? "lost" : (m.weightChangeKg < 0 ? "gained" : "held steady on");
      label = "Measured maintenance: ";
      note = "from " + m.periodDays + " days of your data (" + formatDateShort(m.start) + "–" + formatDateShort(m.end) +
        "): avg intake " + m.avgIntake + " kcal, " + trendWord + " " + changeAbs + " kg";
    } else {
      label = "Estimated maintenance: ";
      note = result.usedDefaultWeight
        ? DEFAULT_BODYWEIGHT_KG + " kg assumed — log a weight on Today for a real estimate"
        : "using " + result.weight + " kg from " + formatDateLong(result.weightDate) + " (log weight + calories daily to switch to a measured estimate)";
    }
    el.innerHTML = '<span class="day-badge">' + label + result.tdee + " kcal</span>" +
      "<span>" + note + "</span>";
    el.style.display = "flex";
  }

  function handleMaintenanceInputChange() {
    var age = document.getElementById("ageInput").value;
    var height = document.getElementById("heightInput").value;
    var activityLevel = document.getElementById("activityLevelSelect").value;
    var settings = loadSettings();
    if (age !== "") settings.age = Math.round(parseFloat(age)); else delete settings.age;
    if (height !== "") settings.heightCm = Math.round(parseFloat(height)); else delete settings.heightCm;
    settings.activityLevel = activityLevel;
    settings.sex = currentSex;
    saveSettings(settings);
    renderMaintenanceEstimate();
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

    fillFormFromDate(todayISO());

    document.querySelectorAll(".tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { switchView(btn.dataset.view); });
    });

    document.getElementById("dailyForm").addEventListener("submit", handleDailySubmit);
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

    fillSettingsForm();
    document.getElementById("restCaloriesInput").addEventListener("change", handleSettingsChange);
    document.getElementById("workoutCaloriesInput").addEventListener("change", handleSettingsChange);
    document.getElementById("cardioCaloriesInput").addEventListener("change", handleSettingsChange);

    document.querySelectorAll("#sexToggle .segment").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setSexToggle(btn.dataset.sex);
        handleMaintenanceInputChange();
      });
    });
    document.getElementById("ageInput").addEventListener("change", handleMaintenanceInputChange);
    document.getElementById("heightInput").addEventListener("change", handleMaintenanceInputChange);
    document.getElementById("activityLevelSelect").addEventListener("change", handleMaintenanceInputChange);

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
    document.getElementById("showNewFoodBtn").addEventListener("click", function () {
      var card = document.getElementById("newFoodCard");
      card.style.display = card.style.display === "none" ? "block" : "none";
    });
    document.getElementById("saveNewFoodBtn").addEventListener("click", handleSaveNewFood);
    document.getElementById("foodDate").addEventListener("change", function (e) {
      renderFoodLog(e.target.value);
    });

    window.addEventListener("resize", function () { renderToday(); renderTrends(); });

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
