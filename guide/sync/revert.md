# Undo and resync

Project owners can restore the last sent translations or replace project values from the repository.

Revert and manual Sync are separate owner-only controls. Revert restores the selected key's last delivery-confirmed database value; Sync replaces project values with the repository. Neither compares the current repository value with the edited value to choose a winner.

## Revert to last sent {#revert}

Choose Revert to last sent for a selected key when its unsent cells should return to the last value included in a confirmed delivery. The server-issued confirmation is required, and the review flag remains until the value is reviewed again.

## Sync from the repository {#resync}

Use Sync only after confirming that editor work may be discarded. The server-issued approval fingerprint protects the action. Editors can see that this control is unavailable but cannot run it.
