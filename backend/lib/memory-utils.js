const ensureUserMemoryShape = (userId, v) => {
  const id = String(userId || 'anonymous');
  const base =
    v && typeof v === 'object'
      ? v
      : {
          user_id: id,
          meta: {},
          core_memory: [],
          short_term_buffer: []
        };
  base.user_id = typeof base.user_id === 'string' && base.user_id.trim() ? base.user_id : id;
  base.meta = base.meta && typeof base.meta === 'object' ? base.meta : {};
  base.core_memory = Array.isArray(base.core_memory) ? base.core_memory : [];
  base.short_term_buffer = Array.isArray(base.short_term_buffer) ? base.short_term_buffer : [];
  return base;
};

module.exports = {
  ensureUserMemoryShape
};
