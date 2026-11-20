from sqlalchemy.pool import NullPool

from app.database import async_database_url, engine_options


def test_on_vercel_each_session_opens_its_own_connection_and_sql_is_not_echoed():
    assert engine_options({"VERCEL": "1"}) == {"poolclass": NullPool}


def test_elsewhere_the_default_pool_is_kept_and_sql_is_not_echoed():
    assert engine_options({}) == {}


def test_sql_is_echoed_only_when_asked_for():
    assert engine_options({"SQL_ECHO": "true"}) == {"echo": True}
    assert engine_options({"SQL_ECHO": "1"}) == {}


def test_a_local_url_only_gets_the_asyncpg_driver():
    assert (
        async_database_url("postgresql://village:village@localhost:5432/village_sqwhere")
        == "postgresql+asyncpg://village:village@localhost:5432/village_sqwhere"
    )


def test_a_neon_url_drops_channel_binding_and_turns_sslmode_into_ssl():
    url = async_database_url(
        "postgresql://ada@ep-lagos-1.eu-central-1.aws.neon.tech/neondb"
        "?sslmode=require&channel_binding=require"
    )
    assert url == (
        "postgresql+asyncpg://ada@ep-lagos-1.eu-central-1.aws.neon.tech/neondb?ssl=require"
    )


def test_an_explicit_ssl_setting_is_kept():
    url = async_database_url("postgresql://ada@db.example/app?ssl=require")
    assert url == "postgresql+asyncpg://ada@db.example/app?ssl=require"
