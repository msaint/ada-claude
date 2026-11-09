-- Socratic tutoring additions:
--  * placement diagnostics and final mixed assessments are session kinds;
--  * evidence records whether a success was "prompted" (given right after
--    working on the same concept) or "unprompted" recall, which mastery needs.
alter table sessions drop constraint sessions_kind_check;
alter table sessions add constraint sessions_kind_check check (kind in ('lesson','review','placement','assessment'));
alter table assessment_evidence add column recall text not null default 'unprompted'
  check (recall in ('prompted','unprompted'));
