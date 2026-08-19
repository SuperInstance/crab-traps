-- P3 — vector nerves (docs/REEF-DESIGN.md §3). Edges learn where they came
-- from: 'traveled' (players walked it — ant-trail traffic) vs 'discovered'
-- (Vectorize noticed two room centroids converge; the nerves propose, the
-- skeleton formalizes). Applied with:
--   wrangler d1 migrations apply DB --local   (dev)
--   wrangler d1 migrations apply DB --remote (first deploy)

ALTER TABLE edges ADD COLUMN kind TEXT NOT NULL DEFAULT 'traveled';
