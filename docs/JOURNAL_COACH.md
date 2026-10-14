# Journal and Coach

Both clients use labelled outlined fields, habit checkboxes, explicit save/reset actions, and the shared visual tokens. iOS retains native date and menu pickers.

## Morning check-in

A check-in belongs to a Pod, bed side and **wake date in the Pod timezone**. Switching a browser or phone timezone must not move that date. Ratings, temperature comfort, three habits and up to 500 UTF-16 code units of notes are supported; native text truncation preserves complete graphemes. Saved notes remain on the Pod. Unsaved drafts remain in app memory while it is open, including when navigating away. Closing/reloading the app loses unsaved drafts.

`GET /api/journal?side=left&days=30&date=2026-10-01` returns the recent `entries` and `patterns`, plus `selectedDate`, `selected` (an entry or null), and `timeZone`. The selected entry is read independently of the trend range. Selecting an older date therefore loads its saved entry instead of presenting an empty form that could overwrite it. The date parameter is optional for older callers.

New clients require the `selectedDate` response marker before enabling editing. Update the server and client together; older servers receive an update instruction. Invalid calendar dates, sides and ranges are rejected before storage/analytics work. POST and DELETE retain the existing strict entry/date schemas.

Save captures its original date/side and prevents duplicate in-flight saves in that app instance. Completion clears only the draft that was submitted. A newer draft is retained, and refreshes do not silently replace unsaved edits. This is local draft protection; simultaneous writes from two separate devices still use last-write-wins storage.

## Coach

Choose 7, 30 or 90 days. **Local calculations** produce deterministic summaries without an LLM or external sharing; their question field is hidden because the calculation does not use a question. Configured model providers enable the question field and the explicit numerical-summary/question sharing checkbox.

Permission is consumed when each request starts, including a failed request. A retry requires checking the box again. The result labels the selected side and range. Changing provider, question or range removes the old result. Switching sides or leaving the screen cancels the client request and retires its response, so a late result cannot appear under a different form. A provider may still finish work already accepted by the server; client cancellation is not a billing cancellation guarantee.

The request sends numerical analytics and habit associations, not saved journal notes. Question text is sent as entered. The UI explains this before sharing. Provider keys remain server configuration, and unavailable providers stay disabled. Failure to load provider availability leaves local calculations usable with a retry action.

Demo mode labels its simulated provider **Demo model · no external calls**. Both clients read deterministic coaching generated from `shared/fixtures/sleep-demo.json` for each history range. These fixtures verify presentation and request lifecycle, not model quality or clinical accuracy.

See [validation evidence](VALIDATION.md) for executed checks. Real provider accounts, signed-device integrations and physical Pod behavior remain separate qualification work.
