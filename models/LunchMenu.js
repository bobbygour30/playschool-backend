// models/LunchMenu.js
const mongoose = require('mongoose');

// A single meal slot within a day — "Meal 1", "Meal 2", "Meal 3" etc,
// each tied to a specific time so the day's meals can always be shown
// in chronological order regardless of the order they were entered.
const mealSchema = new mongoose.Schema({
  meal_number: {
    type: Number,
    required: true,
    min: 1,
  },
  meal_label: {
    // Auto-derived display label e.g. "Meal 1" — kept editable in case
    // a school wants to call it "Breakfast" instead of "Meal 1".
    type: String,
    required: true,
    trim: true,
  },
  meal_name: {
    // Optional friendly name, e.g. "Breakfast", "Mid-Morning Snack",
    // "Lunch", "Evening Snack". Separate from meal_label so the numbered
    // slot and the descriptive name can both be shown.
    type: String,
    default: '',
    trim: true,
  },
  time: {
    // 24-hour "HH:mm" so meals sort correctly and can be compared.
    type: String,
    required: true,
    match: /^([01]\d|2[0-3]):([0-5]\d)$/,
  },
  items: [{
    type: String,
    trim: true,
  }],
  description: {
    type: String,
    default: '',
    trim: true,
  },
  is_active: {
    type: Boolean,
    default: true,
  },
}, { _id: true, timestamps: false });

const lunchMenuSchema = new mongoose.Schema({
  day: {
    type: String,
    required: true,
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    unique: true, // one menu document per day of the week
  },
  // Optional: scope a menu to a specific class. Null/undefined = applies
  // to all classes (the common case for a playschool with one shared menu).
  class_id: {
    type: String,
    default: null,
  },
  meals: [mealSchema],
  notes: {
    type: String,
    default: '',
  },
  is_active: {
    type: Boolean,
    default: true,
  },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

// Keep meals sorted by time whenever the document is saved, so any
// consumer (frontend, API) always receives them in chronological order
// without needing to re-sort.
lunchMenuSchema.pre('save', function (next) {
  this.updated_at = Date.now();

  if (Array.isArray(this.meals) && this.meals.length > 0) {
    this.meals.sort((a, b) => (a.time > b.time ? 1 : a.time < b.time ? -1 : 0));

    // Re-number meal_number sequentially based on time order, and keep
    // meal_label in sync ("Meal 1", "Meal 2"...) unless it was manually
    // renamed to something else — since meal_label is free text, we only
    // auto-generate it when it matches the default "Meal N" pattern.
    this.meals.forEach((meal, index) => {
      const expectedOldLabel = `Meal ${meal.meal_number}`;
      meal.meal_number = index + 1;
      if (!meal.meal_label || meal.meal_label === expectedOldLabel || /^Meal \d+$/.test(meal.meal_label)) {
        meal.meal_label = `Meal ${index + 1}`;
      }
    });
  }

  next();
});

lunchMenuSchema.index({ day: 1 });
lunchMenuSchema.index({ class_id: 1 });

// Static helper: get the full week, ordered Monday -> Sunday, with each
// day's meals already sorted by time.
lunchMenuSchema.statics.getFullWeek = async function (classId = null) {
  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const query = classId ? { class_id: classId } : {};
  const days = await this.find(query);

  const byDay = {};
  days.forEach((d) => { byDay[d.day] = d; });

  return dayOrder.map((day) => byDay[day] || { day, meals: [], class_id: classId || null, is_active: true });
};

// Instance helper: what meal is "current" right now, based on server time
// — the meal whose time is the latest one that has already started today.
lunchMenuSchema.methods.getCurrentMeal = function () {
  if (!Array.isArray(this.meals) || this.meals.length === 0) return null;

  const now = new Date();
  const nowStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const sorted = [...this.meals].sort((a, b) => (a.time > b.time ? 1 : a.time < b.time ? -1 : 0));
  let current = null;
  for (const meal of sorted) {
    if (meal.time <= nowStr) {
      current = meal;
    }
  }
  return current || sorted[0];
};

module.exports = mongoose.model('LunchMenu', lunchMenuSchema);