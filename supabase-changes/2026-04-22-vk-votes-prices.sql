-- Separate VK Votes prices for crystal purchase options.
-- Backend falls back to price_stars if price_vk_votes is null,
-- but it is better to fill dedicated VK prices explicitly.

alter table public.crystal_purchase_options
add column if not exists price_vk_votes integer null;
