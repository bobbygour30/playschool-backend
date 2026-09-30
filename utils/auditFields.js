// utils/auditFields.js  (NEW)
//
// Gives every financial record the same audit trail:
//   created_by_name, created_at, last_modified_by(+_name), last_modified_at
// (Archive / void reason, archived-by and archived date live on the Archive entry.)
//
// Usage in a model:   const auditFields = require('../utils/auditFields');
//                     mySchema.plugin(auditFields);      // BEFORE mongoose.model(...)
// Usage in a route:   const { stampCreate, stampUpdate } = require('../utils/auditFields');
//                     new Model({ ...data, ...stampCreate(getActor(req)) })
//                     Model.findByIdAndUpdate(id, { ...data, ...stampUpdate(getActor(req)) })

const auditFields = (schema) => {
  const add = {};
  if (!schema.path('created_at')) add.created_at = { type: Date, default: Date.now };
  if (!schema.path('created_by_name')) add.created_by_name = { type: String, default: '' };
  if (!schema.path('last_modified_by')) add.last_modified_by = { type: String, default: null };
  if (!schema.path('last_modified_by_name')) add.last_modified_by_name = { type: String, default: '' };
  if (!schema.path('last_modified_at')) add.last_modified_at = { type: Date, default: Date.now };
  schema.add(add);

  // Records created by the system (auto-generated recurring invoices, student registration
  // invoices, etc.) have no logged-in user, so label them instead of leaving them blank.
  // The 60-second check keeps old records that are being RESTORED from archive untouched.
  schema.pre('save', function (next) {
    if (this.isNew && !this.created_by_name) {
      const ageMs = Date.now() - new Date(this.created_at || Date.now()).getTime();
      if (ageMs < 60000) {
        this.created_by_name = 'System (auto-generated)';
        if (!this.last_modified_by_name) this.last_modified_by_name = 'System (auto-generated)';
      }
    }
    next();
  });
};

const stampCreate = (actor = {}) => {
  const now = new Date();
  return {
    created_at: now,
    created_by_name: actor.name || 'Admin',
    last_modified_by: actor.id || null,
    last_modified_by_name: actor.name || 'Admin',
    last_modified_at: now,
  };
};

const stampUpdate = (actor = {}) => ({
  last_modified_by: actor.id || null,
  last_modified_by_name: actor.name || 'Admin',
  last_modified_at: new Date(),
});

module.exports = auditFields;
module.exports.stampCreate = stampCreate;
module.exports.stampUpdate = stampUpdate;