"""The countries a developer can name on their profile: the 54 African countries, as ISO 3166-1
alpha-2 codes. The landing page lists the same countries with alpha-3 codes in
apps/web/app/landing/gather.ts, so a change here needs the same change there.
docs/decisions/2026-11-14-profile-country.md
"""

AFRICAN_COUNTRY_CODES = frozenset(
    (
        "DZ AO BJ BW BF BI CV CM CF TD KM CG CD DJ EG GQ ER SZ ET GA GM GH GN GW CI KE LS LR "
        "LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW"
    ).split()
)
