-- 11za RAG AI - Final Production Schema for Supabase
-- Canonical schema only. Run this in Supabase SQL editor.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- -----------------------------------------------------------------------------
-- Shared helpers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- Users
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    avatar_url TEXT,
    timezone TEXT,
    account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'inactive', 'suspended')),
    preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_status);

CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
        NEW.raw_user_meta_data ->> 'avatar_url'
    )
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, public.users.full_name),
        avatar_url = COALESCE(EXCLUDED.avatar_url, public.users.avatar_url),
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_handle_new_auth_user ON auth.users;
CREATE TRIGGER trg_handle_new_auth_user
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- Bot profiles, intents, and prompt templates
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS bot_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    system_prompt TEXT NOT NULL DEFAULT '',
    model_provider TEXT NOT NULL DEFAULT 'groq',
    model_name TEXT,
    temperature NUMERIC(3,2) NOT NULL DEFAULT 0.20,
    rag_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, name)
);

CREATE TRIGGER trg_bot_profiles_updated_at
BEFORE UPDATE ON bot_profiles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_bot_profiles_user_active ON bot_profiles(user_id, is_active);

CREATE TABLE IF NOT EXISTS bot_intents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bot_profile_id UUID NOT NULL REFERENCES bot_profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    keywords TEXT[] NOT NULL DEFAULT '{}'::text[],
    guidance TEXT,
    priority INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (bot_profile_id, name)
);

CREATE TRIGGER trg_bot_intents_updated_at
BEFORE UPDATE ON bot_intents
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_bot_intents_user_profile_active ON bot_intents(user_id, bot_profile_id, is_active);

CREATE TABLE IF NOT EXISTS prompt_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bot_profile_id UUID NOT NULL REFERENCES bot_profiles(id) ON DELETE CASCADE,
    prompt_type TEXT NOT NULL CHECK (prompt_type IN ('system', 'welcome', 'fallback', 'tool', 'summary')),
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (bot_profile_id, prompt_type, version)
);

CREATE TRIGGER trg_prompt_templates_updated_at
BEFORE UPDATE ON prompt_templates
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_prompt_templates_user_profile_active ON prompt_templates(user_id, bot_profile_id, is_active);

-- -----------------------------------------------------------------------------
-- WhatsApp numbers and webhooks
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS whatsapp_numbers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bot_profile_id UUID NOT NULL REFERENCES bot_profiles(id) ON DELETE CASCADE,
    phone_number TEXT NOT NULL,
    display_name TEXT,
    provider TEXT NOT NULL DEFAULT 'whatsapp',
    auth_token TEXT,
    origin TEXT,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    verified_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, phone_number)
);

CREATE TRIGGER trg_whatsapp_numbers_updated_at
BEFORE UPDATE ON whatsapp_numbers
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_whatsapp_numbers_user_bot ON whatsapp_numbers(user_id, bot_profile_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_numbers_phone ON whatsapp_numbers(phone_number);

CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    whatsapp_number_id UUID NOT NULL REFERENCES whatsapp_numbers(id) ON DELETE CASCADE,
    webhook_key UUID NOT NULL DEFAULT gen_random_uuid(),
    secret TEXT NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
    provider_name TEXT NOT NULL DEFAULT 'whatsapp',
    callback_url TEXT,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    last_verified_at TIMESTAMPTZ,
    last_received_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (whatsapp_number_id),
    UNIQUE (webhook_key)
);

CREATE TRIGGER trg_webhooks_updated_at
BEFORE UPDATE ON webhooks
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_webhooks_user_number ON webhooks(user_id, whatsapp_number_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_key ON webhooks(webhook_key);

-- -----------------------------------------------------------------------------
-- Knowledge base sources
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS knowledge_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bot_profile_id UUID NOT NULL REFERENCES bot_profiles(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL CHECK (source_type IN ('file', 'google_sheet', 'google_doc', 'manual')),
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed', 'archived')),
    external_reference TEXT,
    source_url TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, source_type, external_reference)
);

CREATE TRIGGER trg_knowledge_sources_updated_at
BEFORE UPDATE ON knowledge_sources
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_knowledge_sources_user_bot ON knowledge_sources(user_id, bot_profile_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_sources_type_status ON knowledge_sources(source_type, status);

CREATE TABLE IF NOT EXISTS files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bot_profile_id UUID NOT NULL REFERENCES bot_profiles(id) ON DELETE CASCADE,
    knowledge_source_id UUID NOT NULL UNIQUE REFERENCES knowledge_sources(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    mime_type TEXT,
    file_size BIGINT,
    storage_bucket TEXT,
    storage_path TEXT,
    checksum TEXT,
    processing_status TEXT NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'processed', 'failed')),
    chunk_count INTEGER NOT NULL DEFAULT 0,
    processed_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_files_updated_at
BEFORE UPDATE ON files
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_files_user_bot ON files(user_id, bot_profile_id);
CREATE INDEX IF NOT EXISTS idx_files_status ON files(processing_status);

CREATE TABLE IF NOT EXISTS google_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bot_profile_id UUID NOT NULL REFERENCES bot_profiles(id) ON DELETE CASCADE,
    knowledge_source_id UUID NOT NULL UNIQUE REFERENCES knowledge_sources(id) ON DELETE CASCADE,
    integration_type TEXT NOT NULL CHECK (integration_type IN ('sheet', 'doc')),
    external_id TEXT NOT NULL,
    external_name TEXT,
    sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'syncing', 'synced', 'failed', 'disabled')),
    row_count INTEGER NOT NULL DEFAULT 0,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    last_synced_at TIMESTAMPTZ,
    last_sync_error TEXT,
    sync_cursor TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, integration_type, external_id)
);

CREATE TRIGGER trg_google_integrations_updated_at
BEFORE UPDATE ON google_integrations
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_google_integrations_user_bot ON google_integrations(user_id, bot_profile_id);
CREATE INDEX IF NOT EXISTS idx_google_integrations_type_status ON google_integrations(integration_type, sync_status);

-- -----------------------------------------------------------------------------
-- RAG chunks and embeddings
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bot_profile_id UUID NOT NULL REFERENCES bot_profiles(id) ON DELETE CASCADE,
    knowledge_source_id UUID NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
    file_id UUID REFERENCES files(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    content_hash TEXT,
    embedding VECTOR(1024),
    chunk_type TEXT NOT NULL DEFAULT 'text',
    source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (knowledge_source_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_user_source ON knowledge_chunks(user_id, knowledge_source_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_user_file ON knowledge_chunks(user_id, file_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_file_chunk ON knowledge_chunks(file_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100) WHERE embedding IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Chat sessions and chat history
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bot_profile_id UUID NOT NULL REFERENCES bot_profiles(id) ON DELETE CASCADE,
    whatsapp_number_id UUID REFERENCES whatsapp_numbers(id) ON DELETE SET NULL,
    session_key TEXT NOT NULL UNIQUE,
    channel TEXT NOT NULL DEFAULT 'web' CHECK (channel IN ('web', 'whatsapp')),
    title TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_message_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_chat_sessions_updated_at
BEFORE UPDATE ON chat_sessions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_bot ON chat_sessions(user_id, bot_profile_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_last_message ON chat_sessions(last_message_at DESC);

CREATE TABLE IF NOT EXISTS chat_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bot_profile_id UUID NOT NULL REFERENCES bot_profiles(id) ON DELETE CASCADE,
    chat_session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    whatsapp_number_id UUID REFERENCES whatsapp_numbers(id) ON DELETE SET NULL,
    role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
    content TEXT NOT NULL,
    external_message_id TEXT,
    token_count INTEGER,
    content_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_chat_history_updated_at
BEFORE UPDATE ON chat_history
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_chat_history_session_created ON chat_history(chat_session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_history_user_created ON chat_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_history_role ON chat_history(role);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_is_owner ON users
FOR ALL
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY bot_profiles_is_owner ON bot_profiles
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY bot_intents_is_owner ON bot_intents
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY prompt_templates_is_owner ON prompt_templates
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY whatsapp_numbers_is_owner ON whatsapp_numbers
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY webhooks_is_owner ON webhooks
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY knowledge_sources_is_owner ON knowledge_sources
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY files_is_owner ON files
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY google_integrations_is_owner ON google_integrations
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY knowledge_chunks_is_owner ON knowledge_chunks
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY chat_sessions_is_owner ON chat_sessions
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY chat_history_is_owner ON chat_history
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
