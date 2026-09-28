# Privacy of contributions and moderation

Taco Hunt uses the API as the only path to product data. The mobile app never receives database credentials and never queries private tables directly.

Reports are private. A report's author can only receive the identifier, target, reason, status, and date of their own request; their email, name, internal note, and the moderator's identity are never published. The admin queue also does not expose the reporter's identifier to normal clients. Reports do not hide content automatically, and per-user and per-network-address write limits apply.

Pending proposals are visible to their author and to admins. Duplicate suggestions only query approved stands within 100 meters and return name, neighborhood, public coordinates, distance, and a match classification. Pending proposals, private notes, or data about the user who proposed the stand are never included.

No user location history is stored. A stand's coordinates are stand data and must not be confused with a personal location. Review text is never sent to telemetry; analytics must keep only aggregated counts.
