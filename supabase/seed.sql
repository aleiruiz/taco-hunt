-- Fictional development fixtures only. Never promote this data to production.
insert into app_private.spots(id,name,normalized_name,neighborhood,latitude,longitude,status,source_type,last_verified_at)
select ('20000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
       'Tacos Demo ' || lpad(n::text,2,'0'), 'tacos demo ' || lpad(n::text,2,'0'),
       (array['Centro','Obispado','Mitras','San Jerónimo','Contry'])[1 + ((n - 1) % 5)],
       (25.6866 + ((n - 1) % 5) * 0.008)::numeric(9,6),
       (-100.3161 + ((n - 1) % 5) * 0.009)::numeric(9,6),
       'approved','fictional',null
from generate_series(1,10) as n;

insert into app_private.spot_tacos(spot_id,taco_type_id,status)
select s.id,t.id,'approved'
from app_private.spots s cross join app_private.taco_types t
where s.source_type='fictional' and t.slug in ('pastor','barbacoa');
