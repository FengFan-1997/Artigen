#!/usr/bin/env node

process.env.ARTIGEN_AGENT_SMOKE_PROFILE = 'production';
require('./run-agent-dev-login-smoke');
