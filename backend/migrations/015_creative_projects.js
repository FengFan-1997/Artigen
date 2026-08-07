exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('creative_projects', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users',
      onDelete: 'RESTRICT'
    },
    title: { type: 'text', notNull: true },
    status: {
      type: 'text',
      notNull: true,
      default: 'active',
      check: "status IN ('active','archived','trashed')"
    },
    cover_asset_id: {
      type: 'uuid',
      references: 'assets',
      onDelete: 'SET NULL'
    },
    revision: {
      type: 'bigint',
      notNull: true,
      default: 1,
      check: 'revision >= 1'
    },
    deleted_at: { type: 'timestamptz' },
    purge_after: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('creative_projects', 'creative_projects_shape_check', {
    check: `
      length(title) BETWEEN 1 AND 160
      AND (
        (status <> 'trashed' AND deleted_at IS NULL AND purge_after IS NULL)
        OR
        (status = 'trashed' AND deleted_at IS NOT NULL AND purge_after IS NOT NULL)
      )
    `
  });
  pgm.createIndex('creative_projects', ['user_id', 'updated_at'], {
    name: 'creative_projects_user_updated_idx'
  });
  pgm.createIndex('creative_projects', ['purge_after'], {
    name: 'creative_projects_purge_idx',
    where: "status='trashed'"
  });

  pgm.createTable('creative_project_payloads', {
    project_id: {
      type: 'uuid',
      primaryKey: true,
      references: 'creative_projects',
      onDelete: 'CASCADE'
    },
    algorithm: { type: 'text', notNull: true, default: 'aes-256-gcm-v1' },
    key_version: { type: 'text', notNull: true, default: 'v1' },
    iv: { type: 'bytea', notNull: true },
    auth_tag: { type: 'bytea', notNull: true },
    ciphertext: { type: 'bytea', notNull: true },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('creative_project_payloads', 'creative_project_payload_crypto_shape_check', {
    check: `
      algorithm = 'aes-256-gcm-v1'
      AND octet_length(iv) = 12
      AND octet_length(auth_tag) = 16
      AND octet_length(ciphertext) BETWEEN 1 AND 262144
    `
  });

  pgm.createTable('project_asset_links', {
    project_id: {
      type: 'uuid',
      notNull: true,
      references: 'creative_projects',
      onDelete: 'CASCADE'
    },
    asset_id: {
      type: 'uuid',
      notNull: true,
      references: 'assets',
      onDelete: 'RESTRICT'
    },
    role: {
      type: 'text',
      notNull: true,
      check: "role IN ('product','style','scene','logo','result','export')"
    },
    label: { type: 'text', notNull: true, default: '' },
    position: {
      type: 'integer',
      notNull: true,
      default: 0,
      check: 'position >= 0'
    },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('project_asset_links', 'project_asset_links_unique', {
    unique: ['project_id', 'asset_id', 'role']
  });
  pgm.addConstraint('project_asset_links', 'project_asset_links_label_check', {
    check: 'length(label) <= 160'
  });
  pgm.createIndex('project_asset_links', ['project_id', 'role', 'position'], {
    name: 'project_asset_links_project_role_idx'
  });

  pgm.createTable('project_versions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    project_id: {
      type: 'uuid',
      notNull: true,
      references: 'creative_projects',
      onDelete: 'CASCADE'
    },
    parent_version_id: {
      type: 'uuid',
      references: 'project_versions',
      onDelete: 'SET NULL'
    },
    task_id: {
      type: 'uuid',
      unique: true,
      references: 'tool_tasks',
      onDelete: 'RESTRICT'
    },
    output_asset_id: {
      type: 'uuid',
      references: 'assets',
      onDelete: 'RESTRICT'
    },
    status: {
      type: 'text',
      notNull: true,
      default: 'pending',
      check: "status IN ('pending','success','failed','cancelled')"
    },
    profile_id: { type: 'text', notNull: true, default: '' },
    aspect_ratio: { type: 'text', notNull: true, default: '' },
    seed: { type: 'bigint' },
    quoted_credits: {
      type: 'integer',
      notNull: true,
      default: 0,
      check: 'quoted_credits >= 0'
    },
    is_favorite: { type: 'boolean', notNull: true, default: false },
    algorithm: { type: 'text', notNull: true, default: 'aes-256-gcm-v1' },
    key_version: { type: 'text', notNull: true, default: 'v1' },
    iv: { type: 'bytea', notNull: true },
    auth_tag: { type: 'bytea', notNull: true },
    ciphertext: { type: 'bytea', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('project_versions', 'project_versions_crypto_shape_check', {
    check: `
      length(profile_id) <= 80
      AND length(aspect_ratio) <= 16
      AND (seed IS NULL OR seed BETWEEN 0 AND 9999999999)
      AND algorithm = 'aes-256-gcm-v1'
      AND octet_length(iv) = 12
      AND octet_length(auth_tag) = 16
      AND octet_length(ciphertext) BETWEEN 1 AND 262144
    `
  });
  pgm.createIndex('project_versions', ['project_id', 'created_at'], {
    name: 'project_versions_project_created_idx'
  });
  pgm.createIndex('project_versions', ['project_id', 'is_favorite'], {
    name: 'project_versions_favorite_idx',
    where: 'is_favorite=true'
  });

  pgm.addColumns('tool_tasks', {
    project_id: {
      type: 'uuid',
      references: 'creative_projects',
      onDelete: 'RESTRICT'
    },
    parent_version_id: {
      type: 'uuid',
      references: 'project_versions',
      onDelete: 'SET NULL'
    }
  });
  pgm.createIndex('tool_tasks', ['project_id', 'created_at'], {
    name: 'tool_tasks_project_created_idx',
    where: 'project_id IS NOT NULL'
  });

  pgm.sql(`
    ALTER TABLE assets
      DROP CONSTRAINT IF EXISTS assets_retention_class_check;
    ALTER TABLE assets
      ADD CONSTRAINT assets_retention_class_check
      CHECK (
        retention_class IN (
          'temporary-input','generated-output','editor-transfer','project-owned','other'
        )
      );

    INSERT INTO price_versions (version, active, effective_at)
    VALUES (2, true, now())
    ON CONFLICT (version) DO UPDATE
      SET active=EXCLUDED.active, effective_at=LEAST(price_versions.effective_at, EXCLUDED.effective_at);

    INSERT INTO price_skus (price_version_id, sku, credits, active, metadata)
    SELECT target.id, source.sku, source.credits, source.active, source.metadata
      FROM price_versions target
      JOIN LATERAL (
        SELECT ps.sku, ps.credits, ps.active, ps.metadata
          FROM price_skus ps
          JOIN price_versions pv ON pv.id=ps.price_version_id
         WHERE pv.version=1
      ) source ON true
     WHERE target.version=2
    ON CONFLICT (price_version_id, sku)
    DO UPDATE SET
      credits=EXCLUDED.credits,
      active=EXCLUDED.active,
      metadata=EXCLUDED.metadata;

    UPDATE price_skus
       SET metadata=metadata || '{"providerCostMinor":5,"minimumGrossMargin":0.5}'::jsonb
     WHERE price_version_id=(SELECT id FROM price_versions WHERE version=2)
       AND sku='ai-design.generate.v1';

    INSERT INTO price_skus (price_version_id, sku, credits, active, metadata)
    SELECT id, 'ai-design.product-reference.v1', 60, true,
           '{"operation":"generate","profileId":"product-reference-v1","providerCostMinor":30,"minimumGrossMargin":0.5}'::jsonb
      FROM price_versions
     WHERE version=2
    ON CONFLICT (price_version_id, sku)
    DO UPDATE SET
      credits=EXCLUDED.credits,
      active=true,
      metadata=EXCLUDED.metadata;

    UPDATE price_versions SET active=(version=2);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    UPDATE price_versions SET active=(version=1) WHERE version IN (1,2);
    DELETE FROM price_skus
     WHERE price_version_id IN (SELECT id FROM price_versions WHERE version=2);
    DELETE FROM price_versions WHERE version=2;

    ALTER TABLE assets
      DROP CONSTRAINT IF EXISTS assets_retention_class_check;
    UPDATE assets
       SET retention_class='generated-output',
           expires_at=COALESCE(expires_at,clock_timestamp()+interval '30 days')
     WHERE retention_class='project-owned';
    ALTER TABLE assets
      ADD CONSTRAINT assets_retention_class_check
      CHECK (
        retention_class IN ('temporary-input','generated-output','editor-transfer','other')
      );
  `);
  pgm.dropIndex('tool_tasks', ['project_id', 'created_at'], {
    name: 'tool_tasks_project_created_idx',
    ifExists: true
  });
  pgm.dropColumns('tool_tasks', ['project_id', 'parent_version_id']);
  pgm.dropTable('project_versions', { ifExists: true, cascade: true });
  pgm.dropTable('project_asset_links', { ifExists: true, cascade: true });
  pgm.dropTable('creative_project_payloads', { ifExists: true, cascade: true });
  pgm.dropTable('creative_projects', { ifExists: true, cascade: true });
};
