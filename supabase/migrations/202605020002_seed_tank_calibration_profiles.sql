insert into public.tank_calibration_profiles (
  profile_key, name, formula_type, diameter_cm, radius_cm, length_cm, max_dipstick_cm, nominal_label, calculated_full_liters, rounded_full_liters, is_verified, is_owner_only
)
values
  ('ugt_16kl_202x488','16KL nominal / 4000 USG horizontal UGT — 202 cm diameter × 488 cm length','horizontal_cylinder',202,101,488,202,'16KL / 4000 USG',15639.1246897235,15639,true,true),
  ('ugt_12kl_split_half_203x183','12KL split tank half-compartment — 203 cm diameter × 183 cm length','horizontal_cylinder',203,101.5,183,203,'6KL compartment inside 12KL split tank',5922.8815435265,5923,true,true),
  ('ugt_12kl_single_203x366','12KL single horizontal UGT — 203 cm diameter × 366 cm length','horizontal_cylinder',203,101.5,366,203,'12KL single tank',11845.7630870530,11846,true,true)
on conflict (profile_key) do update
set
  name = excluded.name,
  formula_type = excluded.formula_type,
  diameter_cm = excluded.diameter_cm,
  radius_cm = excluded.radius_cm,
  length_cm = excluded.length_cm,
  max_dipstick_cm = excluded.max_dipstick_cm,
  nominal_label = excluded.nominal_label,
  calculated_full_liters = excluded.calculated_full_liters,
  rounded_full_liters = excluded.rounded_full_liters,
  is_verified = excluded.is_verified,
  is_owner_only = excluded.is_owner_only,
  updated_at = now();
