# Troubleshooting

Find the next step when GitHub access, setup, or repository syncing fails.

## Restore GitHub access {#github-access}

If the GitHub App installation or user connection is unavailable, reconnect it from Account or the project settings. A sign-in method and the GitHub App connection are separate, so fixing one does not silently replace the other.

## Resolve workflow failures {#workflow-failures}

Check the Actions log for the generated workflow path, `PUSH_TOKEN`, allowed actions, and the selected base branch. A missing installation or action policy can stop a run before the request reaches the project.

## Resolve rejected updates {#rejected-updates}

A `409` stale-commit response means the workflow sent an older repository commit; run it again from the current base branch. A `400` response means the request payload or configured file set failed validation. Read the response reason before changing the project configuration.
