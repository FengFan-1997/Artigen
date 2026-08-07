exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO price_versions (version, active, effective_at)
    VALUES (1, true, now())
    ON CONFLICT (version) DO UPDATE SET active = EXCLUDED.active;

    INSERT INTO price_skus (price_version_id, sku, credits, active)
    SELECT pv.id, seed.sku, seed.credits, true
      FROM price_versions pv
      CROSS JOIN (VALUES
        ('workshop.professional-portrait.v1', 5),
        ('workshop.old-photo.v1', 5),
        ('workshop.ingredient-layout-ai.v1', 10),
        ('workshop.background-scene.v1', 5)
      ) AS seed(sku, credits)
     WHERE pv.version = 1
    ON CONFLICT (price_version_id, sku)
    DO UPDATE SET credits = EXCLUDED.credits, active = true;

    INSERT INTO payment_packages (sku, title, amount_minor, currency, credits, active)
    VALUES
      ('credits.starter.v1', 'Starter', 990, 'CNY', 400, true),
      ('credits.standard.v1', 'Standard', 1990, 'CNY', 1000, true),
      ('credits.pro.v1', 'Pro', 4990, 'CNY', 3000, true),
      ('credits.ultimate.v1', 'Ultimate', 9990, 'CNY', 10000, true)
    ON CONFLICT (sku) DO UPDATE SET
      title = EXCLUDED.title,
      amount_minor = EXCLUDED.amount_minor,
      currency = EXCLUDED.currency,
      credits = EXCLUDED.credits,
      active = EXCLUDED.active;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM payment_packages WHERE sku IN (
      'credits.starter.v1','credits.standard.v1','credits.pro.v1','credits.ultimate.v1'
    );
    DELETE FROM price_skus WHERE sku IN (
      'workshop.professional-portrait.v1','workshop.old-photo.v1',
      'workshop.ingredient-layout-ai.v1','workshop.background-scene.v1'
    );
    DELETE FROM price_versions WHERE version = 1;
  `);
};
