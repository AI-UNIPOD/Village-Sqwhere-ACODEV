import pytest

from tests.conftest import resolve_test_database_url

DEV_URL = "postgresql://village:village@localhost:5432/village_sqwhere"
TEST_URL = "postgresql://village:village@localhost:5432/village_sqwhere_test"


def test_a_separate_database_ending_in_test_is_accepted() -> None:
    assert resolve_test_database_url(TEST_URL, DEV_URL, in_ci=False) == TEST_URL


def test_the_development_database_is_refused() -> None:
    with pytest.raises(RuntimeError, match="same as DATABASE_URL.*Set TEST_DATABASE_URL to"):
        resolve_test_database_url(DEV_URL, DEV_URL, in_ci=False)


@pytest.mark.parametrize(
    "name", ["village_staging", "latest", ""], ids=["other name", "test without underscore", "none"]
)
def test_a_database_whose_name_does_not_end_in_test_is_refused(name: str) -> None:
    url = f"postgresql://village:village@localhost:5432/{name}"
    with pytest.raises(RuntimeError, match="must end in _test.*Set TEST_DATABASE_URL to"):
        resolve_test_database_url(url, DEV_URL, in_ci=False)


def test_no_test_database_is_refused_outside_ci() -> None:
    with pytest.raises(RuntimeError, match="TEST_DATABASE_URL is required"):
        resolve_test_database_url(None, DEV_URL, in_ci=False)


def test_ci_without_a_test_database_uses_its_own() -> None:
    assert resolve_test_database_url(None, DEV_URL, in_ci=True) == DEV_URL
