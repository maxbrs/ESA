from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    spreadsheet_id: str
    credentials_path: str = "credentials.json"
    # When deploying to a server, set this to the full JSON of your service account
    # key file (copy-paste the contents of credentials.json as a single-line env var).
    # If set, credentials_path is ignored.
    google_credentials_json: str | None = None

settings = Settings()
