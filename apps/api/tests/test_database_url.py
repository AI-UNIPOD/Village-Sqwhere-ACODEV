from app.database import async_database_url


def test_a_local_url_only_gets_the_asyncpg_driver():
    assert (
        async_database_url("postgresql://village:village@localhost:5432/village_sqwhere")
        == "postgresql+asyncpg://village:village@localhost:5432/village_sqwhere"
    )


def test_a_neon_url_drops_channel_binding_and_turns_sslmode_into_ssl():
    url = async_database_url(
        "postgresql://ada:s3cret@ep-lagos-1.eu-central-1.aws.neon.tech/neondb"
        "?sslmode=require&channel_binding=require"
    )
    assert url == (
        "postgresql+asyncpg://ada:s3cret@ep-lagos-1.eu-central-1.aws.neon.tech/neondb?ssl=require"
    )


def test_an_explicit_ssl_setting_is_kept():
    url = async_database_url("postgresql://ada:pw@db.example/app?ssl=require")
    assert url == "postgresql+asyncpg://ada:pw@db.example/app?ssl=require"
