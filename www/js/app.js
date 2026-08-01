(function () {
  "use strict";

  var STORAGE = {
    daily: "gymlog.daily",       // { "2026-07-27": { weight, sleepHours, calories, protein, carbs, fat, steps, dayType } }
    workouts: "gymlog.workouts", // [ { id, date, name, exercises: [{name, sets:[{reps,weight}]}] } ]
    settings: "gymlog.settings", // { restCalories, workoutCalories }
    foodlog: "gymlog.foodlog",   // { "2026-07-27": [ {id, name, grams, calories, protein, carbs, fat} ] }
    customFoods: "gymlog.customfoods", // [ { id, name, per100: {calories, protein, carbs, fat} } ]
    customExercises: "gymlog.customExercises" // [ { name, type: 'strength' | 'cardio' } ]
  };

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

  var OFF_SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl";
  var USDA_SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";
  var USDA_NUTRIENT_IDS = { calories: 1008, protein: 1003, carbs: 1005, fat: 1004 };
  var foodSearchAbortControllers = [];
  var foodSearchDebounceTimer = null;
  var selectedFoodProduct = null; // { name, source, servingGrams, per100: { calories, protein, carbs, fat } }
  var currentQtyMode = "grams"; // 'grams' | 'units', for the food-quantity form

  var DEFAULT_BODYWEIGHT_KG = 75; // used to estimate calories burned when no weight is logged for the day
  var STRENGTH_MET = 6.0; // general resistance training, ~1 minute assumed per set
  var STEPS_KCAL_PER_STEP_PER_KG = 0.0005; // rough walking-equivalent burn per step per kg bodyweight
  var CARDIO_MET_TABLE = {
    "cycling": 7.5,
    "rowing machine": 7.0,
    "jump rope": 10.0,
    "stair climber": 8.0,
    "elliptical": 5.0
  };

  var ACTIVITY_MULTIPLIERS = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    very_active: 1.9
  };
  var currentSex = "male"; // 'male' | 'female', for the maintenance-calorie form
  var WORKOUT_DAY_DEFICIT_PCT = 0.02; // 2% below maintenance, applied by "Use as my calorie targets"
  var REST_DAY_DEFICIT_PCT = 0.10; // 10% below maintenance, applied by "Use as my calorie targets"

  var currentExercises = []; // in-progress workout builder state
  var editingWorkoutId = null; // id of the workout being edited, or null when building a new one
  var currentDayType = null; // 'rest' | 'workout' | null, for the Today form
  var currentExerciseType = "strength"; // 'strength' | 'cardio', for the exercise about to be added

  var CUSTOM_EXERCISE_VALUE = "__custom__";

  var EXERCISE_LIBRARY = {
    "Chest": ["Bench Press", "Incline Bench Press", "Decline Bench Press", "Dumbbell Bench Press", "Incline Dumbbell Press", "Chest Fly", "Cable Crossover", "Push-Up", "Dips"],
    "Back": ["Deadlift", "Pull-Up", "Chin-Up", "Lat Pulldown", "Barbell Row", "Dumbbell Row", "T-Bar Row", "Seated Cable Row", "Face Pull", "Shrugs"],
    "Shoulders": ["Overhead Press", "Dumbbell Shoulder Press", "Arnold Press", "Lateral Raise", "Front Raise", "Rear Delt Fly", "Upright Row"],
    "Legs": ["Squat", "Front Squat", "Leg Press", "Lunges", "Bulgarian Split Squat", "Romanian Deadlift", "Leg Curl", "Leg Extension", "Calf Raise", "Hip Thrust"],
    "Arms": ["Barbell Curl", "Dumbbell Curl", "Hammer Curl", "Preacher Curl", "Tricep Pushdown", "Tricep Extension", "Skull Crusher", "Close-Grip Bench Press"],
    "Core": ["Plank", "Crunch", "Sit-Up", "Hanging Leg Raise", "Russian Twist", "Cable Woodchopper", "Ab Wheel Rollout"],
    "Cardio": ["Running", "Walking", "Cycling", "Rowing Machine", "Jump Rope", "Stair Climber", "Elliptical"]
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

      var removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "remove";
      removeBtn.textContent = "✕";
      removeBtn.addEventListener("click", function () { handleRemoveMyFood(f.id); });

      item.appendChild(info);
      item.appendChild(removeBtn);
      list.appendChild(item);
    });
  }

  function handleAddMyFood() {
    var name = document.getElementById("myFoodName").value.trim();
    if (!name) { toast("Enter a food name"); return; }
    var food = {
      id: makeId(),
      name: name,
      per100: {
        calories: parseFloat(document.getElementById("myFoodCalories").value) || 0,
        protein: parseFloat(document.getElementById("myFoodProtein").value) || 0,
        carbs: parseFloat(document.getElementById("myFoodCarbs").value) || 0,
        fat: parseFloat(document.getElementById("myFoodFat").value) || 0
      }
    };
    var foods = loadCustomFoods();
    foods.push(food);
    saveCustomFoods(foods);

    ["myFoodName", "myFoodCalories", "myFoodProtein", "myFoodCarbs", "myFoodFat"].forEach(function (id) {
      document.getElementById(id).value = "";
    });
    renderCustomFoodList();
    toast("Added to My Foods");
  }

  function handleRemoveMyFood(id) {
    var foods = loadCustomFoods().filter(function (f) { return f.id !== id; });
    saveCustomFoods(foods);
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
    if (name === "food") renderFoodLog(document.getElementById("foodDate").value || todayISO());
    if (name === "data") { renderMaintenanceEstimate(); renderCustomFoodList(); }
  }

  // ---------- today view ----------

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
    renderDayStatus(entry);
    renderLogTodayHint(entry, today);
    drawWeightChart(daily);
  }

  function renderLogTodayHint(entry, date) {
    var el = document.getElementById("logTodayHint");
    var breakdown = getCaloriesBurnedBreakdown(date, entry.weight, entry.steps);
    if (breakdown.total <= 0) {
      el.textContent = "Calories, protein, carbs and fat fill in automatically as you log food on the Food tab — you can still edit them here directly.";
      return;
    }
    var detail = breakdown.parts.map(function (p) { return p.label + " — " + p.kcal + " kcal"; }).join(", ");
    el.textContent = "🔥 Estimated " + breakdown.total + " kcal burned today: " + detail + ".";
  }

  function renderCaloriesGoalDelta(entry) {
    var el = document.getElementById("sumCaloriesGoal");
    var settings = loadSettings();
    var target = entry.dayType === "rest" ? settings.restCalories : entry.dayType === "workout" ? settings.workoutCalories : null;
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

  function renderDayStatus(entry) {
    var el = document.getElementById("dayStatus");
    var parts = [];

    if (entry.dayType) {
      var label = entry.dayType === "rest" ? "😴 Rest day" : "🏋️ Workout day";
      parts.push('<span class="day-badge">' + label + "</span>");
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
    document.getElementById("caloriesInput").value = entry.calories != null ? entry.calories : "";
    document.getElementById("proteinInput").value = entry.protein != null ? entry.protein : "";
    document.getElementById("carbsInput").value = entry.carbs != null ? entry.carbs : "";
    document.getElementById("fatInput").value = entry.fat != null ? entry.fat : "";
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
    var calories = document.getElementById("caloriesInput").value;
    var protein = document.getElementById("proteinInput").value;
    var carbs = document.getElementById("carbsInput").value;
    var fat = document.getElementById("fatInput").value;
    var steps = document.getElementById("stepsInput").value;
    var water = document.getElementById("waterInput").value;
    var cigarettes = document.getElementById("cigarettesInput").value;

    var daily = loadDaily();
    var entry = {};
    if (weight !== "") entry.weight = parseFloat(weight);
    if (sleepHours !== "") entry.sleepHours = parseFloat(sleepHours);
    if (calories !== "") entry.calories = Math.round(parseFloat(calories));
    if (protein !== "") entry.protein = Math.round(parseFloat(protein));
    if (carbs !== "") entry.carbs = Math.round(parseFloat(carbs));
    if (fat !== "") entry.fat = Math.round(parseFloat(fat));
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
    document.getElementById("workoutName").value = "";
    document.getElementById("workoutDate").value = todayISO();
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
    currentExercises = JSON.parse(JSON.stringify(w.exercises));
    renderWorkoutBuilder();
    updateWorkoutFormMode();
    switchView("workout");
    toast("Editing workout — save to update it");
  }

  function handleCancelEditWorkout() {
    editingWorkoutId = null;
    currentExercises = [];
    document.getElementById("workoutName").value = "";
    document.getElementById("workoutDate").value = todayISO();
    renderWorkoutBuilder();
    updateWorkoutFormMode();
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
          ? "Open Food Facts couldn't be reached right now (their server is sometimes flaky) — try again in a moment, add a free USDA FoodData Central key in Data for a more reliable source, or log a custom food."
          : "No results. Try another search or log a custom food.";
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
      name.innerHTML = '<span class="food-source-tag">' + sourceTag + "</span>" + p.name;

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
    document.getElementById("foodUnitGramsInput").value = p.servingGrams || 50;
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

  function handleAddCustomFood() {
    var date = document.getElementById("foodDate").value || todayISO();
    var name = document.getElementById("customFoodName").value.trim();
    if (!name) { toast("Enter a food name"); return; }
    var entry = {
      id: makeId(),
      name: name,
      calories: Math.round(parseFloat(document.getElementById("customFoodCalories").value) || 0),
      protein: Math.round(parseFloat(document.getElementById("customFoodProtein").value) || 0),
      carbs: Math.round(parseFloat(document.getElementById("customFoodCarbs").value) || 0),
      fat: Math.round(parseFloat(document.getElementById("customFoodFat").value) || 0)
    };
    addFoodEntry(date, entry);

    ["customFoodName", "customFoodCalories", "customFoodProtein", "customFoodCarbs", "customFoodFat"].forEach(function (id) {
      document.getElementById(id).value = "";
    });
    document.getElementById("customFoodCard").style.display = "none";
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

    list.innerHTML = "";
    sorted.forEach(function (date) {
      var wrap = document.createElement("div");
      wrap.className = "history-entry";

      var dateEl = document.createElement("div");
      dateEl.className = "h-date";
      dateEl.textContent = formatDateLong(date);
      if (daily[date] && daily[date].dayType) {
        var badge = document.createElement("span");
        badge.className = "day-type-badge";
        badge.textContent = daily[date].dayType === "rest" ? "😴 Rest day" : "🏋️ Workout day";
        dateEl.appendChild(badge);
      }
      wrap.appendChild(dateEl);

      var entry = daily[date];
      if (entry) {
        var line = document.createElement("div");
        line.className = "h-line";
        var parts = [];
        if (entry.weight != null) parts.push(entry.weight + " kg");
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
      customExercises: loadCustomExercises()
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
    toast("Import complete");
    fillSettingsForm();
    fillFormFromDate(document.getElementById("logDate").value || todayISO());
    renderToday();
    renderHistory();
    populateExerciseSelect(currentExerciseType);
    renderFoodLog(document.getElementById("foodDate").value || todayISO());
    renderCustomFoodList();
  }

  function handleClear() {
    if (!confirm("Erase all logged data on this device? This cannot be undone.")) return;
    localStorage.removeItem(STORAGE.daily);
    localStorage.removeItem(STORAGE.workouts);
    localStorage.removeItem(STORAGE.settings);
    localStorage.removeItem(STORAGE.foodlog);
    localStorage.removeItem(STORAGE.customFoods);
    localStorage.removeItem(STORAGE.customExercises);
    currentExercises = [];
    editingWorkoutId = null;
    fillSettingsForm();
    renderToday();
    renderHistory();
    renderWorkoutBuilder();
    updateWorkoutFormMode();
    populateExerciseSelect(currentExerciseType);
    renderFoodLog(document.getElementById("foodDate").value || todayISO());
    renderCustomFoodList();
    toast("All data erased");
  }

  // ---------- settings ----------

  function fillSettingsForm() {
    var settings = loadSettings();
    document.getElementById("restCaloriesInput").value = settings.restCalories != null ? settings.restCalories : "";
    document.getElementById("workoutCaloriesInput").value = settings.workoutCalories != null ? settings.workoutCalories : "";
    document.getElementById("usdaApiKeyInput").value = settings.usdaApiKey || "";
    document.getElementById("ageInput").value = settings.age != null ? settings.age : "";
    document.getElementById("heightInput").value = settings.heightCm != null ? settings.heightCm : "";
    document.getElementById("activityLevelSelect").value = settings.activityLevel || "moderate";
    setSexToggle(settings.sex || "male");
    renderMaintenanceEstimate();
  }

  function handleSettingsChange() {
    var rest = document.getElementById("restCaloriesInput").value;
    var workout = document.getElementById("workoutCaloriesInput").value;
    var settings = loadSettings();
    if (rest !== "") settings.restCalories = Math.round(parseFloat(rest)); else delete settings.restCalories;
    if (workout !== "") settings.workoutCalories = Math.round(parseFloat(workout)); else delete settings.workoutCalories;
    saveSettings(settings);
    toast("Targets saved");
    renderToday();
  }

  function handleUsdaKeyChange() {
    var key = document.getElementById("usdaApiKeyInput").value.trim();
    var settings = loadSettings();
    if (key !== "") settings.usdaApiKey = key; else delete settings.usdaApiKey;
    saveSettings(settings);
    toast(key !== "" ? "USDA API key saved" : "USDA API key removed");
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

  function computeMaintenanceCalories() {
    var settings = loadSettings();
    var age = settings.age;
    var heightCm = settings.heightCm;
    if (age == null || heightCm == null) return null;

    var latest = getLatestLoggedWeight();
    var weight = latest ? latest.weight : DEFAULT_BODYWEIGHT_KG;

    var bmr = 10 * weight + 6.25 * heightCm - 5 * age + (currentSex === "female" ? -161 : 5);
    var multiplier = ACTIVITY_MULTIPLIERS[settings.activityLevel] || ACTIVITY_MULTIPLIERS.moderate;
    var tdee = Math.round((bmr * multiplier) / 10) * 10;

    return { tdee: tdee, weight: weight, usedDefaultWeight: !latest, weightDate: latest ? latest.date : null };
  }

  function renderMaintenanceEstimate() {
    var el = document.getElementById("maintenanceResult");
    var result = computeMaintenanceCalories();
    if (!result) {
      el.innerHTML = "<span>Enter your age and height above to estimate maintenance calories.</span>";
      el.style.display = "flex";
      return;
    }
    var weightNote = result.usedDefaultWeight
      ? DEFAULT_BODYWEIGHT_KG + " kg assumed — log a weight on Today for a real estimate"
      : "using " + result.weight + " kg from " + formatDateLong(result.weightDate);
    el.innerHTML = '<span class="day-badge">Estimated maintenance: ' + result.tdee + " kcal</span>" +
      "<span>" + weightNote + "</span>";
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

  function handleApplyMaintenance() {
    var result = computeMaintenanceCalories();
    if (!result) {
      toast("Enter your age and height first");
      return;
    }
    var workoutTarget = Math.round((result.tdee * (1 - WORKOUT_DAY_DEFICIT_PCT)) / 10) * 10;
    var restTarget = Math.round((result.tdee * (1 - REST_DAY_DEFICIT_PCT)) / 10) * 10;
    document.getElementById("restCaloriesInput").value = restTarget;
    document.getElementById("workoutCaloriesInput").value = workoutTarget;
    handleSettingsChange();
  }

  // ---------- init ----------

  function init() {
    seedCustomFoodsIfNeeded();

    document.getElementById("headerDate").textContent = formatDateLong(todayISO());
    document.getElementById("logDate").value = todayISO();
    document.getElementById("workoutDate").value = todayISO();
    document.getElementById("foodDate").value = todayISO();

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

    fillSettingsForm();
    document.getElementById("restCaloriesInput").addEventListener("change", handleSettingsChange);
    document.getElementById("workoutCaloriesInput").addEventListener("change", handleSettingsChange);
    document.getElementById("usdaApiKeyInput").addEventListener("change", handleUsdaKeyChange);

    document.querySelectorAll("#sexToggle .segment").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setSexToggle(btn.dataset.sex);
        handleMaintenanceInputChange();
      });
    });
    document.getElementById("ageInput").addEventListener("change", handleMaintenanceInputChange);
    document.getElementById("heightInput").addEventListener("change", handleMaintenanceInputChange);
    document.getElementById("activityLevelSelect").addEventListener("change", handleMaintenanceInputChange);
    document.getElementById("applyMaintenanceBtn").addEventListener("click", handleApplyMaintenance);

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

    document.getElementById("foodSearchInput").addEventListener("input", handleFoodSearchInput);
    document.getElementById("foodGramsInput").addEventListener("input", updateFoodPreview);
    document.getElementById("foodUnitsInput").addEventListener("input", updateFoodPreview);
    document.getElementById("foodUnitGramsInput").addEventListener("input", updateFoodPreview);
    document.querySelectorAll("#quantityModeToggle .segment").forEach(function (btn) {
      btn.addEventListener("click", function () { setQtyMode(btn.dataset.qtyMode); });
    });
    document.getElementById("addFoodBtn").addEventListener("click", handleAddFoodFromSearch);
    document.getElementById("showCustomFoodBtn").addEventListener("click", function () {
      var card = document.getElementById("customFoodCard");
      card.style.display = card.style.display === "none" ? "block" : "none";
    });
    document.getElementById("addCustomFoodBtn").addEventListener("click", handleAddCustomFood);
    document.getElementById("foodDate").addEventListener("change", function (e) {
      renderFoodLog(e.target.value);
    });

    window.addEventListener("resize", function () { renderToday(); });

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("sw.js").catch(function () {});
      });
    }

    renderToday();
    renderHistory();
    renderFoodLog(todayISO());
  }

  document.addEventListener("DOMContentLoaded", init);
})();
