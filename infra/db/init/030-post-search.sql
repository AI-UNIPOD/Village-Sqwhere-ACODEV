-- Search over posts (docs/decisions/2026-11-19-feed-ranking-and-search.md).
-- The API searches with the same expression whether or not this index exists, so applying it
-- only makes search fast as posts grow. Safe to run again.
-- The strings in translate() are app/services/feed_rank.py FOLD_FROM and FOLD_TO: a test keeps
-- them equal, and the planner only uses the index when the expression is the same.

CREATE INDEX IF NOT EXISTS posts_search_idx ON posts USING gin ((
    setweight(to_tsvector('simple'::regconfig, translate(lower(coalesce(title, '')), 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿẹọṣÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝẸỌṢ', 'aaaaaaceeeeiiiinooooouuuuyyeosaaaaaaceeeeiiiinooooouuuuyeos')), 'A') ||
    setweight(to_tsvector('simple'::regconfig, translate(lower(body), 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿẹọṣÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝẸỌṢ', 'aaaaaaceeeeiiiinooooouuuuyyeosaaaaaaceeeeiiiinooooouuuuyeos')), 'B')
)) WHERE deleted_at IS NULL;
