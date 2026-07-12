ALTER TABLE model_configs
  ADD COLUMN provider text NOT NULL DEFAULT 'yandex-ai-studio',
  ADD COLUMN api_kind text NOT NULL DEFAULT 'native',
  ADD CONSTRAINT model_configs_provider_check
    CHECK (provider IN ('yandex-ai-studio', 'gigachat', 'proxyapi')),
  ADD CONSTRAINT model_configs_api_kind_check
    CHECK (api_kind IN ('native', 'openai-compatible'));
