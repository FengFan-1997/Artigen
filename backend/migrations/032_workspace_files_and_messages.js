exports.up = (pgm) => {
  pgm.sql(
    "ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_byte_size_check",
  );
  pgm.addConstraint("assets", "assets_byte_size_check", {
    check: "byte_size > 0 OR (byte_size = 0 AND mime_type = 'text/plain')",
  });
  pgm.sql(
    "ALTER TABLE agent_run_payloads DROP CONSTRAINT IF EXISTS agent_run_payloads_kind_check",
  );
  pgm.addConstraint("agent_run_payloads", "agent_run_payloads_kind_check", {
    check:
      "kind IN ('objective','user_input','approval_context','browser_profile','public_message')",
  });
  pgm.addColumn("agent_run_payloads", { message_key: { type: "text" } });
  pgm.createIndex("agent_run_payloads", ["run_id", "message_key"], {
    unique: true,
    where: "message_key IS NOT NULL",
    name: "agent_public_message_key_idx",
  });
  pgm.addColumn("design_conversations", {
    source_run_id: {
      type: "uuid",
      references: "agent_runs",
      onDelete: "SET NULL",
    },
  });
  pgm.createTable("workspace_files", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    project_id: {
      type: "uuid",
      notNull: true,
      references: "creative_projects",
      onDelete: "CASCADE",
    },
    path: { type: "text", notNull: true },
    revision: { type: "integer", notNull: true, default: 0 },
    created_at: {
      type: "timestamptz",
      default: pgm.func("now()"),
      notNull: true,
    },
    updated_at: {
      type: "timestamptz",
      default: pgm.func("now()"),
      notNull: true,
    },
  });
  pgm.addConstraint("workspace_files", "workspace_file_path_unique", {
    unique: ["project_id", "path"],
  });
  pgm.createTable("workspace_file_versions", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    file_id: {
      type: "uuid",
      notNull: true,
      references: "workspace_files",
      onDelete: "CASCADE",
    },
    revision: { type: "integer", notNull: true },
    asset_id: {
      type: "uuid",
      notNull: true,
      references: "assets",
      onDelete: "RESTRICT",
    },
    origin_artifact_id: {
      type: "uuid",
      references: "agent_artifacts",
      onDelete: "SET NULL",
    },
    created_at: {
      type: "timestamptz",
      default: pgm.func("now()"),
      notNull: true,
    },
  });
  pgm.addConstraint(
    "workspace_file_versions",
    "workspace_file_revision_unique",
    { unique: ["file_id", "revision"] },
  );
  pgm.createTable("workspace_repositories", {
    project_id: {
      type: "uuid",
      primaryKey: true,
      references: "creative_projects",
      onDelete: "CASCADE",
    },
    owner: { type: "text", notNull: true },
    repository: { type: "text", notNull: true },
  });
};
// Application rollback is additive: keep user files/messages and roll back the UI.
exports.down = () => {
  throw new Error(
    "WORKSPACE_USER_DATA_DOWN_MIGRATION_REQUIRES_EXPLICIT_EXPORT",
  );
};
