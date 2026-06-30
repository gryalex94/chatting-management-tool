-- ============================================
-- CHATTING MANAGEMENT TOOL — DATABASE SCHEMA
-- Run this in Supabase SQL Editor (supabase.com → your project → SQL Editor)
-- ============================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. ORGANISATIONS
-- ============================================
CREATE TABLE organisations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. USERS (managers, admins, etc.)
-- ============================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id UUID UNIQUE, -- links to Supabase Auth user
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'head_manager', 'manager', 'chatter', 'va')),
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  invited_by UUID REFERENCES users(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. CREATORS (the social pages/accounts)
-- ============================================
CREATE TABLE creators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4. CREATOR-MANAGER ASSIGNMENTS
-- ============================================
CREATE TABLE creator_manager_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  creator_id UUID REFERENCES creators(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, creator_id)
);

-- ============================================
-- 5. CHATTERS
-- ============================================
CREATE TABLE chatters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'new_monitoring', 'developing', 'experienced')),
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 6. SHIFTS
-- ============================================
CREATE TABLE shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Europe/Amsterdam',
  shift_type TEXT NOT NULL DEFAULT 'regular' CHECK (shift_type IN ('regular', 'overtime', 'rotation', 'custom')),
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 7. CHATTER-CREATOR-SHIFT ASSIGNMENTS
-- ============================================
CREATE TABLE chatter_creator_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chatter_id UUID REFERENCES chatters(id) ON DELETE CASCADE,
  creator_id UUID REFERENCES creators(id) ON DELETE CASCADE,
  shift_id UUID REFERENCES shifts(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  familiarization_ends_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true
);

-- ============================================
-- 8. INVITATIONS
-- ============================================
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'head_manager', 'manager', 'chatter', 'va')),
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  invited_by UUID REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days'
);

-- ============================================
-- 9. WEEKLY CYCLES
-- ============================================
CREATE TABLE cycles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  closed_by UUID REFERENCES users(id),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 10. TASKS
-- ============================================
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT NOT NULL DEFAULT 'custom' CHECK (task_type IN (
    'auto_daily_checkup', 'auto_dialogue_check', 'auto_content_tracking',
    'auto_whale_check', 'auto_call_prep', 'auto_anomaly_check',
    'auto_spot_check', 'ai_generated', 'custom'
  )),
  priority INTEGER NOT NULL DEFAULT 4 CHECK (priority BETWEEN 1 AND 7),
  status TEXT NOT NULL DEFAULT 'pool' CHECK (status IN (
    'pool', 'claimed', 'in_progress', 'completed', 'pending_review', 'confirmed', 'rolled_over'
  )),
  assigned_to UUID REFERENCES users(id),
  claimed_by UUID REFERENCES users(id),
  creator_id UUID REFERENCES creators(id),
  chatter_id UUID REFERENCES chatters(id),
  is_recurring BOOLEAN DEFAULT false,
  recurrence_pattern TEXT CHECK (recurrence_pattern IN ('daily', 'weekly', 'per_cycle')),
  requires_screenshots BOOLEAN DEFAULT true,
  rollover_counter INTEGER DEFAULT 0,
  ai_analysis_id UUID, -- will reference ai_analysis_results once that table exists
  cycle_id UUID REFERENCES cycles(id),
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  claimed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- ============================================
-- 11. TASK TIMER LOGS
-- ============================================
CREATE TABLE task_timer_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL CHECK (action IN ('start', 'pause', 'resume', 'complete')),
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 12. TASK ATTACHMENTS (proof of work)
-- ============================================
CREATE TABLE task_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  chatter_id UUID REFERENCES chatters(id),
  attachment_type TEXT NOT NULL CHECK (attachment_type IN ('bad_case', 'good_case')),
  file_url TEXT NOT NULL,
  label TEXT, -- tag describing what was good/bad
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 13. CHATTER MISTAKES
-- ============================================
CREATE TABLE chatter_mistakes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chatter_id UUID REFERENCES chatters(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN (
    'long_response_time', 'poor_selling_pushy', 'poor_selling_soft',
    'missing_notes', 'afk_issue', 'script_quality',
    'not_adding_to_lists', 'poor_price_development', 'poor_price_negotiation',
    'lack_of_aftercare', 'poor_horny_talk', 'poor_shift_handover', 'other'
  )),
  description TEXT,
  reported_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 14. CHATTER PENALTIES
-- ============================================
CREATE TABLE chatter_penalties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chatter_id UUID REFERENCES chatters(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  issued_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 15. CHATTER PERFORMANCE REVIEWS
-- ============================================
CREATE TABLE chatter_performance_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chatter_id UUID REFERENCES chatters(id) ON DELETE CASCADE,
  notes TEXT NOT NULL,
  reviewed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 16. DATA IMPORTS (tracking uploaded files)
-- ============================================
CREATE TABLE data_imports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL CHECK (report_type IN ('message_dashboard', 'employee_report', 'creator_statistics')),
  file_name TEXT NOT NULL,
  file_url TEXT,
  uploaded_by UUID REFERENCES users(id),
  report_date DATE NOT NULL,
  row_count INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 17. MESSAGES (from Message Dashboard report)
-- ============================================
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_id UUID REFERENCES data_imports(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL, -- chatter name
  creator_name TEXT NOT NULL,
  creator_id UUID REFERENCES creators(id),
  fan_message TEXT, -- raw HTML
  creator_message TEXT, -- raw HTML
  fan_message_text TEXT, -- stripped text
  creator_message_text TEXT, -- stripped text
  sent_time TIME,
  sent_date DATE,
  sent_datetime TIMESTAMPTZ,
  replay_time_raw TEXT, -- original string like "0m 39s"
  replay_time_seconds INTEGER, -- parsed to seconds
  price DECIMAL(10,2) DEFAULT 0,
  purchased BOOLEAN DEFAULT false,
  source TEXT,
  status TEXT,
  sent_to_display TEXT, -- "Dragonknight (u177154572)"
  sent_to_username TEXT, -- "u177154572"
  sent_to_nickname TEXT, -- "Dragonknight"
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 18. EMPLOYEE DAILY STATS (from Employee Report)
-- ============================================
CREATE TABLE employee_daily_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_id UUID REFERENCES data_imports(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  chatter_name TEXT NOT NULL,
  chatter_email TEXT,
  chatter_id UUID REFERENCES chatters(id),
  creator_name TEXT,
  creator_id UUID REFERENCES creators(id),
  -- Revenue
  sales DECIMAL(10,2) DEFAULT 0,
  ppv_sales DECIMAL(10,2) DEFAULT 0,
  tips DECIMAL(10,2) DEFAULT 0,
  dm_sales DECIMAL(10,2) DEFAULT 0,
  -- Volume
  messages_sent INTEGER DEFAULT 0,
  ppvs_sent INTEGER DEFAULT 0,
  golden_ratio DECIMAL(5,2) DEFAULT 0,
  ppvs_unlocked INTEGER DEFAULT 0,
  unlock_rate DECIMAL(5,2) DEFAULT 0,
  -- Mass messages
  mass_msg_sales DECIMAL(10,2) DEFAULT 0,
  of_mass_msg_sales DECIMAL(10,2) DEFAULT 0,
  -- Fan metrics
  fans_chatted INTEGER DEFAULT 0,
  fans_who_spent INTEGER DEFAULT 0,
  fan_cvr DECIMAL(5,2) DEFAULT 0,
  avg_earnings_per_spender DECIMAL(10,2) DEFAULT 0,
  -- Quality
  character_count INTEGER DEFAULT 0,
  response_time_scheduled TEXT,
  response_time_clocked TEXT,
  response_time_scheduled_seconds INTEGER,
  response_time_clocked_seconds INTEGER,
  -- Hours
  scheduled_hours_raw TEXT,
  clocked_hours_raw TEXT,
  scheduled_minutes INTEGER DEFAULT 0,
  clocked_minutes INTEGER DEFAULT 0,
  -- Efficiency
  sales_per_hour DECIMAL(10,2) DEFAULT 0,
  messages_per_hour DECIMAL(10,2) DEFAULT 0,
  fans_per_hour DECIMAL(10,2) DEFAULT 0,
  -- Meta
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 19. CREATOR DAILY STATS (from Creator Statistics report)
-- ============================================
CREATE TABLE creator_daily_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_id UUID REFERENCES data_imports(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  creator_name TEXT NOT NULL,
  creator_id UUID REFERENCES creators(id),
  -- Revenue
  subscription_net DECIMAL(10,2) DEFAULT 0,
  new_subscriptions_net DECIMAL(10,2) DEFAULT 0,
  recurring_subscriptions_net DECIMAL(10,2) DEFAULT 0,
  tips_net DECIMAL(10,2) DEFAULT 0,
  total_earnings_net DECIMAL(10,2) DEFAULT 0,
  contribution_pct DECIMAL(5,2) DEFAULT 0,
  -- Platform
  of_ranking DECIMAL(5,2),
  following INTEGER DEFAULT 0,
  -- Fans
  fans_renew_on INTEGER DEFAULT 0,
  renew_on_pct DECIMAL(5,2) DEFAULT 0,
  new_fans INTEGER DEFAULT 0,
  active_fans INTEGER DEFAULT 0,
  expired_fan_change INTEGER DEFAULT 0,
  -- Message revenue
  message_net DECIMAL(10,2) DEFAULT 0,
  creator_group TEXT,
  -- Averages
  avg_spend_per_spender DECIMAL(10,2) DEFAULT 0,
  avg_spend_per_transaction DECIMAL(10,2) DEFAULT 0,
  avg_earnings_per_fan DECIMAL(10,2) DEFAULT 0,
  avg_subscription_length_raw TEXT,
  avg_subscription_length_days INTEGER DEFAULT 0,
  -- Meta
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 20. SUBSCRIBERS
-- ============================================
CREATE TABLE subscribers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username TEXT NOT NULL, -- universal key (e.g. "u177154572")
  display_name TEXT,
  total_spend DECIMAL(10,2) DEFAULT 0,
  classification TEXT DEFAULT 'unclassified' CHECK (classification IN ('whale', 'ps', 'regular', 'unclassified')),
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  first_seen DATE,
  last_seen DATE,
  last_spend_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(username, organisation_id)
);

-- ============================================
-- 21. COMPUTED: CHATTER DAILY METRICS
-- ============================================
CREATE TABLE chatter_daily_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chatter_id UUID REFERENCES chatters(id) ON DELETE CASCADE,
  creator_id UUID REFERENCES creators(id),
  report_date DATE NOT NULL,
  -- Sales trends
  sales_today DECIMAL(10,2) DEFAULT 0,
  sales_7day_avg DECIMAL(10,2) DEFAULT 0,
  sales_30day_avg DECIMAL(10,2) DEFAULT 0,
  sales_today_vs_avg_pct DECIMAL(5,2) DEFAULT 0, -- e.g. -30 means 30% below avg
  -- Response time
  response_time_avg_seconds INTEGER DEFAULT 0,
  response_time_p50_seconds INTEGER DEFAULT 0,
  response_time_p75_seconds INTEGER DEFAULT 0,
  response_time_p90_seconds INTEGER DEFAULT 0,
  response_time_trend TEXT CHECK (response_time_trend IN ('improving', 'stable', 'degrading')),
  -- Quality
  chars_per_message DECIMAL(7,2) DEFAULT 0,
  golden_ratio DECIMAL(5,2) DEFAULT 0,
  unlock_rate DECIMAL(5,2) DEFAULT 0,
  -- Workload
  workload_score DECIMAL(5,2) DEFAULT 0,
  workload_status TEXT CHECK (workload_status IN ('overloaded', 'healthy', 'light', 'afk')),
  messages_sent INTEGER DEFAULT 0,
  fans_chatted INTEGER DEFAULT 0,
  active_conversations INTEGER DEFAULT 0,
  -- AFK
  afk_gaps_count INTEGER DEFAULT 0,
  afk_gaps_longest_minutes INTEGER DEFAULT 0,
  -- Meta
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(chatter_id, creator_id, report_date)
);

-- ============================================
-- 22. ANOMALY FLAGS
-- ============================================
CREATE TABLE anomaly_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chatter_id UUID REFERENCES chatters(id),
  creator_id UUID REFERENCES creators(id),
  report_date DATE NOT NULL,
  flag_type TEXT NOT NULL CHECK (flag_type IN (
    'high_response_time', 'afk_gap', 'sales_crash', 'zero_sales',
    'low_effort_messages', 'ppv_spam', 'whale_neglect', 'chargeback',
    'workload_overload', 'post_familiarization_regression'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('high', 'medium', 'low')),
  details JSONB, -- subscriber usernames, specific values, context
  task_id UUID REFERENCES tasks(id),
  ai_analysis_id UUID, -- references ai_analysis_results
  resolved BOOLEAN DEFAULT false,
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 23. SELLING PATTERNS
-- ============================================
CREATE TABLE selling_patterns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  chatter_id UUID REFERENCES chatters(id),
  creator_id UUID REFERENCES creators(id),
  subscriber_username TEXT,
  price_offered DECIMAL(10,2),
  was_purchased BOOLEAN,
  surrounding_messages JSONB, -- messages before and after for context
  report_date DATE,
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 24. SHIFT HANDOVERS
-- ============================================
CREATE TABLE shift_handovers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id UUID REFERENCES creators(id),
  subscriber_username TEXT,
  chatter_a_id UUID REFERENCES chatters(id),
  chatter_a_last_message_time TIMESTAMPTZ,
  chatter_b_id UUID REFERENCES chatters(id),
  chatter_b_first_message_time TIMESTAMPTZ,
  gap_minutes INTEGER,
  report_date DATE,
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 25. AI PROMPT TEMPLATES
-- ============================================
CREATE TABLE ai_prompt_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  prompt_text TEXT NOT NULL,
  input_spec JSONB, -- which data to pull
  output_format JSONB, -- expected JSON schema
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('auto', 'scheduled', 'manual')),
  trigger_config JSONB, -- which flags trigger it, or schedule
  ai_provider TEXT NOT NULL DEFAULT 'grok' CHECK (ai_provider IN ('grok', 'claude')),
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  editable_by_head_manager BOOLEAN DEFAULT false,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 26. AI PROMPT VERSION HISTORY
-- ============================================
CREATE TABLE ai_prompt_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID REFERENCES ai_prompt_templates(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  prompt_text TEXT NOT NULL,
  input_spec JSONB,
  output_format JSONB,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 27. AI ANALYSIS RESULTS
-- ============================================
CREATE TABLE ai_analysis_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID REFERENCES ai_prompt_templates(id),
  template_version INTEGER,
  chatter_id UUID REFERENCES chatters(id),
  creator_id UUID REFERENCES creators(id),
  input_data JSONB, -- the data that was sent to AI
  output_data JSONB, -- the structured response from AI
  ai_provider TEXT,
  tokens_used INTEGER,
  cost_estimate DECIMAL(10,4),
  report_date DATE,
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 28. MISTAKE CATEGORIES (admin-editable)
-- ============================================
CREATE TABLE mistake_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE, -- e.g. "long_response_time"
  description TEXT,
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES for performance
-- ============================================

-- Messages: frequent queries by date, sender, creator
CREATE INDEX idx_messages_sent_date ON messages(sent_date);
CREATE INDEX idx_messages_sender ON messages(sender_name);
CREATE INDEX idx_messages_creator ON messages(creator_id);
CREATE INDEX idx_messages_subscriber ON messages(sent_to_username);
CREATE INDEX idx_messages_import ON messages(import_id);

-- Employee stats: by date and chatter
CREATE INDEX idx_employee_stats_date ON employee_daily_stats(report_date);
CREATE INDEX idx_employee_stats_chatter ON employee_daily_stats(chatter_id);
CREATE INDEX idx_employee_stats_creator ON employee_daily_stats(creator_id);

-- Creator stats: by date and creator
CREATE INDEX idx_creator_stats_date ON creator_daily_stats(report_date);
CREATE INDEX idx_creator_stats_creator ON creator_daily_stats(creator_id);

-- Tasks: by status, cycle, org
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_cycle ON tasks(cycle_id);
CREATE INDEX idx_tasks_org ON tasks(organisation_id);
CREATE INDEX idx_tasks_chatter ON tasks(chatter_id);

-- Anomaly flags: by date and resolved status
CREATE INDEX idx_anomaly_flags_date ON anomaly_flags(report_date);
CREATE INDEX idx_anomaly_flags_resolved ON anomaly_flags(resolved);

-- Chatter metrics: by date
CREATE INDEX idx_chatter_metrics_date ON chatter_daily_metrics(report_date);
CREATE INDEX idx_chatter_metrics_chatter ON chatter_daily_metrics(chatter_id);

-- Subscribers: by username
CREATE INDEX idx_subscribers_username ON subscribers(username);
CREATE INDEX idx_subscribers_classification ON subscribers(classification);

-- Selling patterns: by date and chatter
CREATE INDEX idx_selling_patterns_date ON selling_patterns(report_date);
CREATE INDEX idx_selling_patterns_chatter ON selling_patterns(chatter_id);

-- ============================================
-- INSERT DEFAULT MISTAKE CATEGORIES
-- ============================================
INSERT INTO mistake_categories (name, slug, description) VALUES
  ('Long Response Time', 'long_response_time', 'Response time exceeds acceptable threshold'),
  ('Poor Selling - Too Pushy', 'poor_selling_pushy', 'Overly aggressive sales approach'),
  ('Poor Selling - Too Soft', 'poor_selling_soft', 'Not enough initiative in selling'),
  ('Missing Notes', 'missing_notes', 'Failed to add notes to subscriber conversations'),
  ('AFK Issue', 'afk_issue', 'Extended away-from-keyboard period during shift'),
  ('Script Quality', 'script_quality', 'Scripted, low-effort, or copy-paste responses'),
  ('Not Adding to Lists', 'not_adding_to_lists', 'Failed to categorize subscribers into proper lists'),
  ('Poor Price Development', 'poor_price_development', 'Not checking spending habits before pricing'),
  ('Poor Price Negotiation', 'poor_price_negotiation', 'Bad negotiation tactics on pricing'),
  ('Lack of Aftercare', 'lack_of_aftercare', 'No follow-up or emotional support after interactions'),
  ('Poor Horny Talk', 'poor_horny_talk', 'Low quality, generic, or context-inappropriate adult conversation'),
  ('Poor Shift Handover', 'poor_shift_handover', 'Bad transition between shifts'),
  ('Other', 'other', 'Other issue not covered by predefined categories');

-- ============================================
-- INSERT DEFAULT SHIFTS
-- ============================================
-- Note: These will be linked to an organisation after the first org is created.
-- For now, we create a function to auto-create defaults when a new org is made.

CREATE OR REPLACE FUNCTION create_default_shifts()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO shifts (name, start_time, end_time, timezone, shift_type, organisation_id, is_default)
  VALUES
    ('Middle Shift', '10:00', '18:00', 'Europe/Amsterdam', 'regular', NEW.id, true),
    ('EU Prime Shift', '18:00', '02:00', 'Europe/Amsterdam', 'regular', NEW.id, true),
    ('US Prime Shift', '02:00', '10:00', 'Europe/Amsterdam', 'regular', NEW.id, true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_default_shifts
  AFTER INSERT ON organisations
  FOR EACH ROW
  EXECUTE FUNCTION create_default_shifts();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE creators ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_manager_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatters ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatter_creator_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_timer_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatter_mistakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatter_penalties ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatter_performance_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatter_daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomaly_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE selling_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_handovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_analysis_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE mistake_categories ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS, so our backend (using service_role_key) can access everything.
-- For the frontend (using anon key), we'll add policies as needed.
-- For now, allow authenticated users to read data from their own organisation.

-- Helper function: get user's org from their auth ID
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS UUID AS $$
  SELECT organisation_id FROM users WHERE auth_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: get user's role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM users WHERE auth_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Basic RLS policies: users can read data in their own organisation
-- (Backend uses service_role which bypasses these, so these are for direct Supabase client access)

CREATE POLICY "Users can view own org" ON organisations
  FOR SELECT USING (id = get_user_org_id());

CREATE POLICY "Users can view org members" ON users
  FOR SELECT USING (organisation_id = get_user_org_id());

CREATE POLICY "Users can view org creators" ON creators
  FOR SELECT USING (organisation_id = get_user_org_id());

CREATE POLICY "Users can view org chatters" ON chatters
  FOR SELECT USING (organisation_id = get_user_org_id());

CREATE POLICY "Users can view org shifts" ON shifts
  FOR SELECT USING (organisation_id = get_user_org_id());

CREATE POLICY "Users can view org tasks" ON tasks
  FOR SELECT USING (organisation_id = get_user_org_id());

CREATE POLICY "Users can view org messages" ON messages
  FOR SELECT USING (organisation_id = get_user_org_id());

CREATE POLICY "Users can view org employee stats" ON employee_daily_stats
  FOR SELECT USING (organisation_id = get_user_org_id());

CREATE POLICY "Users can view org creator stats" ON creator_daily_stats
  FOR SELECT USING (organisation_id = get_user_org_id());

CREATE POLICY "Users can view org subscribers" ON subscribers
  FOR SELECT USING (organisation_id = get_user_org_id());

CREATE POLICY "Users can view org metrics" ON chatter_daily_metrics
  FOR SELECT USING (organisation_id = get_user_org_id());

CREATE POLICY "Users can view org anomaly flags" ON anomaly_flags
  FOR SELECT USING (organisation_id = get_user_org_id());

CREATE POLICY "Users can view org cycles" ON cycles
  FOR SELECT USING (organisation_id = get_user_org_id());

CREATE POLICY "Users can view mistake categories" ON mistake_categories
  FOR SELECT USING (organisation_id = get_user_org_id() OR organisation_id IS NULL);

CREATE POLICY "Users can view org chatter mistakes" ON chatter_mistakes
  FOR SELECT USING (
    chatter_id IN (SELECT id FROM chatters WHERE organisation_id = get_user_org_id())
  );

CREATE POLICY "Users can view org penalties" ON chatter_penalties
  FOR SELECT USING (
    chatter_id IN (SELECT id FROM chatters WHERE organisation_id = get_user_org_id())
  );

CREATE POLICY "Users can view org reviews" ON chatter_performance_reviews
  FOR SELECT USING (
    chatter_id IN (SELECT id FROM chatters WHERE organisation_id = get_user_org_id())
  );

CREATE POLICY "Users can view org imports" ON data_imports
  FOR SELECT USING (organisation_id = get_user_org_id());

CREATE POLICY "Users can view org selling patterns" ON selling_patterns
  FOR SELECT USING (organisation_id = get_user_org_id());

CREATE POLICY "Users can view org handovers" ON shift_handovers
  FOR SELECT USING (organisation_id = get_user_org_id());

CREATE POLICY "Users can view org prompts" ON ai_prompt_templates
  FOR SELECT USING (organisation_id = get_user_org_id());

CREATE POLICY "Users can view org prompt versions" ON ai_prompt_versions
  FOR SELECT USING (
    template_id IN (SELECT id FROM ai_prompt_templates WHERE organisation_id = get_user_org_id())
  );

CREATE POLICY "Users can view org AI results" ON ai_analysis_results
  FOR SELECT USING (organisation_id = get_user_org_id());

CREATE POLICY "Users can view org task attachments" ON task_attachments
  FOR SELECT USING (
    task_id IN (SELECT id FROM tasks WHERE organisation_id = get_user_org_id())
  );

CREATE POLICY "Users can view org timer logs" ON task_timer_logs
  FOR SELECT USING (
    task_id IN (SELECT id FROM tasks WHERE organisation_id = get_user_org_id())
  );

CREATE POLICY "Users can view org creator assignments" ON creator_manager_assignments
  FOR SELECT USING (
    creator_id IN (SELECT id FROM creators WHERE organisation_id = get_user_org_id())
  );

CREATE POLICY "Users can view org chatter assignments" ON chatter_creator_assignments
  FOR SELECT USING (
    chatter_id IN (SELECT id FROM chatters WHERE organisation_id = get_user_org_id())
  );

CREATE POLICY "Users can view org invitations" ON invitations
  FOR SELECT USING (organisation_id = get_user_org_id());

-- ============================================
-- STORAGE BUCKET for file uploads (screenshots, attachments)
-- ============================================
-- Run this in Supabase dashboard → Storage → Create new bucket
-- Bucket name: "attachments"
-- Public: false (private bucket)
-- Or via SQL:
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', false)
ON CONFLICT DO NOTHING;

-- Allow authenticated users to upload to their org's folder
CREATE POLICY "Authenticated users can upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'attachments' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view" ON storage.objects
  FOR SELECT USING (bucket_id = 'attachments' AND auth.role() = 'authenticated');