// routes/lunchMenuRoutes.js
const express = require('express');
const router = express.Router();
const LunchMenu = require('../models/LunchMenu');

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const isValidDay = (day) => DAY_ORDER.includes(day);
const isValidTime = (time) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(time);

// ==================== GET FULL WEEK ====================
// Returns all 7 days, in Monday->Sunday order, each with meals sorted by time.
// Optional ?class_id= filters to a specific class's menu.
router.get('/', async (req, res) => {
  try {
    const { class_id } = req.query;
    const week = await LunchMenu.getFullWeek(class_id || null);
    res.json({ success: true, data: week });
  } catch (error) {
    console.error('Error fetching lunch menu week:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== GET CURRENT MEAL (today, right now) ====================
// Must come before /:day so 'current' isn't treated as a day name.
router.get('/current', async (req, res) => {
  try {
    const { class_id } = req.query;
    const todayName = DAY_ORDER[(new Date().getDay() + 6) % 7]; // JS: Sun=0 -> map to Mon-first order

    const query = { day: todayName };
    if (class_id) query.class_id = class_id;

    const menu = await LunchMenu.findOne(query);
    if (!menu) {
      return res.json({ success: true, data: null, message: `No menu configured for ${todayName}` });
    }

    const currentMeal = menu.getCurrentMeal();
    res.json({
      success: true,
      data: {
        day: menu.day,
        current_meal: currentMeal,
        all_meals: menu.meals,
      },
    });
  } catch (error) {
    console.error('Error fetching current meal:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== GET ONE DAY ====================
router.get('/:day', async (req, res) => {
  try {
    const { day } = req.params;
    if (!isValidDay(day)) {
      return res.status(400).json({ success: false, message: 'Invalid day name' });
    }

    const { class_id } = req.query;
    const query = { day };
    if (class_id) query.class_id = class_id;

    const menu = await LunchMenu.findOne(query);
    if (!menu) {
      return res.json({ success: true, data: { day, meals: [], class_id: class_id || null, is_active: true } });
    }

    res.json({ success: true, data: menu });
  } catch (error) {
    console.error('Error fetching lunch menu day:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== CREATE OR REPLACE A DAY'S FULL MEAL LIST ====================
// Upserts by day (+class_id). Body: { day, class_id?, meals: [...], notes? }
router.post('/', async (req, res) => {
  try {
    const { day, class_id, meals, notes, is_active } = req.body;

    if (!isValidDay(day)) {
      return res.status(400).json({ success: false, message: 'Invalid or missing day' });
    }

    const mealList = Array.isArray(meals) ? meals : [];
    for (const meal of mealList) {
      if (!meal.time || !isValidTime(meal.time)) {
        return res.status(400).json({ success: false, message: `Each meal needs a valid time (HH:mm). Got: ${meal.time}` });
      }
      if (!meal.items || meal.items.length === 0) {
        return res.status(400).json({ success: false, message: 'Each meal needs at least one item' });
      }
    }

    const normalizedMeals = mealList.map((meal, index) => ({
      meal_number: index + 1,
      meal_label: meal.meal_label || `Meal ${index + 1}`,
      meal_name: meal.meal_name || '',
      time: meal.time,
      items: meal.items || [],
      description: meal.description || '',
      is_active: meal.is_active !== undefined ? meal.is_active : true,
    }));

    const query = { day };
    if (class_id) query.class_id = class_id;
    else query.class_id = null;

    let menu = await LunchMenu.findOne(query);

    if (menu) {
      menu.meals = normalizedMeals;
      menu.notes = notes !== undefined ? notes : menu.notes;
      menu.is_active = is_active !== undefined ? is_active : menu.is_active;
      await menu.save();
    } else {
      menu = new LunchMenu({
        day,
        class_id: class_id || null,
        meals: normalizedMeals,
        notes: notes || '',
        is_active: is_active !== undefined ? is_active : true,
      });
      await menu.save();
    }

    res.status(201).json({ success: true, message: `Menu for ${day} saved`, data: menu });
  } catch (error) {
    console.error('Error saving lunch menu day:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// ==================== ADD A SINGLE MEAL TO A DAY ====================
router.post('/:day/meal', async (req, res) => {
  try {
    const { day } = req.params;
    const { class_id, meal_label, meal_name, time, items, description } = req.body;

    if (!isValidDay(day)) {
      return res.status(400).json({ success: false, message: 'Invalid day' });
    }
    if (!time || !isValidTime(time)) {
      return res.status(400).json({ success: false, message: 'A valid time (HH:mm) is required' });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one food item is required' });
    }

    const query = { day };
    if (class_id) query.class_id = class_id;
    else query.class_id = null;

    let menu = await LunchMenu.findOne(query);
    if (!menu) {
      menu = new LunchMenu({ day, class_id: class_id || null, meals: [] });
    }

    const nextNumber = menu.meals.length + 1;
    menu.meals.push({
      meal_number: nextNumber,
      meal_label: meal_label || `Meal ${nextNumber}`,
      meal_name: meal_name || '',
      time,
      items,
      description: description || '',
      is_active: true,
    });

    await menu.save();

    res.status(201).json({ success: true, message: 'Meal added successfully', data: menu });
  } catch (error) {
    console.error('Error adding meal:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// ==================== UPDATE A SINGLE MEAL ====================
router.put('/:day/meal/:mealId', async (req, res) => {
  try {
    const { day, mealId } = req.params;
    const { class_id, meal_label, meal_name, time, items, description, is_active } = req.body;

    if (!isValidDay(day)) {
      return res.status(400).json({ success: false, message: 'Invalid day' });
    }
    if (time && !isValidTime(time)) {
      return res.status(400).json({ success: false, message: 'Time must be in HH:mm format' });
    }

    const query = { day };
    if (class_id) query.class_id = class_id;

    const menu = await LunchMenu.findOne(query);
    if (!menu) {
      return res.status(404).json({ success: false, message: 'Menu day not found' });
    }

    const meal = menu.meals.id(mealId);
    if (!meal) {
      return res.status(404).json({ success: false, message: 'Meal not found' });
    }

    if (meal_label !== undefined) meal.meal_label = meal_label;
    if (meal_name !== undefined) meal.meal_name = meal_name;
    if (time !== undefined) meal.time = time;
    if (items !== undefined) meal.items = items;
    if (description !== undefined) meal.description = description;
    if (is_active !== undefined) meal.is_active = is_active;

    await menu.save();

    res.json({ success: true, message: 'Meal updated successfully', data: menu });
  } catch (error) {
    console.error('Error updating meal:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// ==================== DELETE A SINGLE MEAL ====================
router.delete('/:day/meal/:mealId', async (req, res) => {
  try {
    const { day, mealId } = req.params;
    const { class_id } = req.query;

    if (!isValidDay(day)) {
      return res.status(400).json({ success: false, message: 'Invalid day' });
    }

    const query = { day };
    if (class_id) query.class_id = class_id;

    const menu = await LunchMenu.findOne(query);
    if (!menu) {
      return res.status(404).json({ success: false, message: 'Menu day not found' });
    }

    const meal = menu.meals.id(mealId);
    if (!meal) {
      return res.status(404).json({ success: false, message: 'Meal not found' });
    }

    meal.deleteOne();
    await menu.save();

    res.json({ success: true, message: 'Meal deleted successfully', data: menu });
  } catch (error) {
    console.error('Error deleting meal:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== DELETE AN ENTIRE DAY'S MENU ====================
router.delete('/:day', async (req, res) => {
  try {
    const { day } = req.params;
    const { class_id } = req.query;

    if (!isValidDay(day)) {
      return res.status(400).json({ success: false, message: 'Invalid day' });
    }

    const query = { day };
    if (class_id) query.class_id = class_id;
    else query.class_id = null;

    const menu = await LunchMenu.findOneAndDelete(query);
    if (!menu) {
      return res.status(404).json({ success: false, message: 'Menu day not found' });
    }

    res.json({ success: true, message: `Menu for ${day} deleted` });
  } catch (error) {
    console.error('Error deleting lunch menu day:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== TOGGLE DAY ACTIVE STATUS ====================
router.patch('/:day/status', async (req, res) => {
  try {
    const { day } = req.params;
    const { is_active, class_id } = req.body;

    if (!isValidDay(day)) {
      return res.status(400).json({ success: false, message: 'Invalid day' });
    }

    const query = { day };
    if (class_id) query.class_id = class_id;

    const menu = await LunchMenu.findOneAndUpdate(
      query,
      { is_active: !!is_active, updated_at: Date.now() },
      { new: true }
    );

    if (!menu) {
      return res.status(404).json({ success: false, message: 'Menu day not found' });
    }

    res.json({ success: true, data: menu });
  } catch (error) {
    console.error('Error toggling menu status:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;