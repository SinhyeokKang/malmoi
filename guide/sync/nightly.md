# Every night

Malmoi automatically publishes saved, unpublished changes once a day.

The production cron checks projects once a night. Projects with saved values that have not been sent are published through the same pull request path; an open pull request is updated instead of creating a second one.

## Automatic publishing {#nightly}

The nightly run does not discard editor work. If a project cannot publish, its values remain unsent and the next run can report the same project again.
