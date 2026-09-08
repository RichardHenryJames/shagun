-- Production seed: one normal draft city, no venues, media or auth credentials.
-- Reapplying this file never changes an operator's edits or lifecycle decisions.
insert into shagun.cities (name, slug, state, country, description, status)
values (
  'Hazaribag', 'hazaribag', 'Jharkhand', 'India',
  'Wedding venue information for Hazaribag. Listings are added after editorial research.',
  'draft'
)
on conflict (slug) do nothing;