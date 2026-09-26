# Every night

Malmoi automatically publishes saved, unpublished changes once a day.

Once a night at 18:00 UTC, Malmoi checks up to 50 ready projects that are connected and not archived. Projects with saved values that have not been published use the same pull request path; an open pull request is updated instead of creating a second one.

## Automatic publishing {#nightly}

The nightly run does not discard translator work. If a project cannot publish, its values remain saved and the next run can report the same project again.
