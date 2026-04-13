const mongoose = require('mongoose');
const AcademicClass = require('../models/AcademicClass');
require('dotenv').config();

const classes = [
  { name: 'Toddler', class_id: 'toddler', age_group: '1.5 - 2.5 years', description: 'Early childhood development program for toddlers' },
  { name: 'Pre-Nursery', class_id: 'pre-nursery', age_group: '2.5 - 3.5 years', description: 'Pre-nursery program for young learners' },
  { name: 'Nursery', class_id: 'nursery', age_group: '3.5 - 4.5 years', description: 'Nursery program for foundational learning' },
  { name: 'KG-1', class_id: 'kg-1', age_group: '4.5 - 5.5 years', description: 'Kindergarten 1 program for school readiness' },
];

async function seedClasses() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Clear existing classes
    await AcademicClass.deleteMany({});
    console.log('Cleared existing classes');
    
    // Insert new classes
    await AcademicClass.insertMany(classes);
    console.log('Classes seeded successfully');
    
    process.exit(0);
  } catch (error) {
    console.error('Error seeding classes:', error);
    process.exit(1);
  }
}

seedClasses();