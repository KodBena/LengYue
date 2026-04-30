# Sample assets

This directory ships data assets bundled with the backend so a
first-time user has something to look at before they've imported
their own SGFs.

## `cards.sample.db`

A single-user, anonymized SQLite snapshot of a real personal
workspace, intended to populate the SPA's database tab with example
content the moment a fresh install boots. Loading the sample is
opt-in — see `backend/scripts/load_sample.py`.

The shipped sample contains:

- One user, `local_user` (passwordless, matching the
  ALLOW_PASSWORDLESS_LOGIN local-install default).
- Their cards, game sources, normalized positions, and document
  state at the time of capture.
- Anonymized `game_source.description` fields (set to NULL) — the
  only PII concern flagged was importing-user pathnames leaking
  into descriptions.
- SGF content (`raw_content`, `canonical_content`), tag names, and
  player names left intact — these are study material, not PII.

The sample is regenerated from the project author's personal
database via `backend/scripts/make_sample_db.py`. See that script's
docstring for the regeneration procedure if a future release wants
to refresh the asset.

## Loading the sample

From the umbrella root:

    python backend/scripts/load_sample.py

This copies `backend/samples/cards.sample.db` to `backend/cards.db`,
which is what the backend reads at startup. The script refuses to
clobber an existing `cards.db` unless `--force` is passed (in which
case it moves the existing file to a timestamped `.bak.` sibling
before the copy).

## Why opt-in

A sample database is helpful for first-impression UX but unwanted
on machines where the user has already started building their own
workspace. The opt-in shape avoids surprising users with someone
else's content; the database tab being empty on a fresh install is
the honest signal that no data is loaded yet.
