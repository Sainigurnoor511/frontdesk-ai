alter table appointments
  add column if not exists cal_com_booking_uid text;

create index if not exists appointments_cal_com_booking_uid_idx
  on appointments (organization_id, cal_com_booking_uid)
  where cal_com_booking_uid is not null;
