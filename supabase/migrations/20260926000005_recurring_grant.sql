-- The next_due trigger runs as the calling user and needs the (pure, non-exposed) schedule helper.
grant execute on function private.recurring_occurrence(date, text, int, int) to authenticated;
