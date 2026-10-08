-- K3: the mage class. players.class_id was created with an inline check listing the four original
-- classes (0015_classes.sql); widen it to allow 'mage'. Existing rows are unaffected. The constraint name is
-- the one Postgres generates for an inline column check; if it was ever renamed, drop the old check by hand.
alter table players drop constraint if exists players_class_id_check;
alter table players add constraint players_class_id_check
  check (class_id in ('warrior', 'archer', 'cleric', 'rogue', 'mage'));
