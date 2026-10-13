# Coolify server disaster recovery

This is a custom backup workflow using PostgreSQL exports, Garage's native
metadata snapshot, a separate S3 object export, Restic, and Proton's official CLI.
It does not modify Coolify. It is not a disk image or a one-click Coolify restore.

## Where everything lives

One Proton Drive folder: `Coolify Backups`.

- `recovery-kit/`: these instructions, the backup/verification program, and the
  Restic password. Proton encrypts these files. Keep account access and Proton
  recovery information somewhere independent of the failed server.
- `repositories/YYYY-MM/`: a standard encrypted Restic repository for each UTC
  month. Each repository is independently restorable and deduplicates its hourly
  snapshots. Snapshots upload only after their data and indexes succeed.
- `status/`: last successful upload and last independent cloud restore report.
- `probe/`: the small initial connection test.

No cloud backup is automatically deleted or pruned. This deliberately favors
recoverability while real storage growth is measured. Hourly snapshots remain
available within each monthly repository. Review storage monthly before defining
an automatic expiration policy. This is not a promise of unlimited retention.
Local disk use is checked before capture; a job refuses to run below 25 GiB free.
Older local repositories require reviewed cleanup. Restore drills retain only
the latest successful downloaded/restored working copy; failed scratch copies
and stale verification containers are automatically cleaned up.

## Coverage and limits

Included:

- Every non-template database and cluster roles/passwords from both PostgreSQL
  clusters, including application records, jobs, auth state, and Coolify state.
- All objects visible to the application's Garage bucket credential, their
  metadata and SHA-256 hashes. Previously captured objects are retained too.
- Garage's native consistent metadata snapshot, identity/layout, and data blocks.
- An online Redis RDB snapshot and SQLite online backups for Sentinel databases.
- `/data`, `/etc`, `/root`, `/home`, `/opt`, `/usr/local`, system cron spool,
  Tailscale, cloud-init, and systemd state, plus additional file/directory Docker
  bind mounts. This includes Coolify's APP_KEY, SSH keys, credentials, Compose
  configurations, application secrets, certificates, and retained static assets.
- Container/network/volume/image inventories, package inventory, and exact image
  tar archives. Images are immutable IDs, not just mutable tags such as `latest`.

Excluded: rebuildable OS files, Docker layer/build caches, package caches,
`node_modules`, sockets, temporary files, and the backup client's Proton session.
The failed host's Proton session is unnecessary: sign in again on the new host.
External account ownership and remotely managed Cloudflare/DNS configuration
remain in those external accounts. Keep access to them and your Git provider.

SQL snapshots are consistent per database; this is not an atomic snapshot of the
entire machine. Dumps and files are captured over a recorded interval. A completed
capture restores both SQL clusters into network-isolated containers and verifies
that finalized application media references exist in the object archive. Pending
uploads and in-flight jobs may need retrying after a disaster. The current adapter
expects two PostgreSQL clusters, one Garage service, and Coolify Redis. An unknown
Docker volume causes failure rather than silently claiming complete coverage.
New services/buckets or major schema changes require a coverage review.

## Get the backup without the old machine

1. Use a clean replacement Ubuntu x86-64 machine with adequate disk space and
   install Docker Engine/Compose, Restic, Python 3 with boto3, and the official
   Proton Drive CLI. Match the saved Docker version where practical.
2. Sign into Proton using `proton-drive auth login`. Configure a supported
   credential store. You do not need any credential file from the old machine.
3. Download `Coolify Backups/recovery-kit` and the desired monthly repository
   using Proton Drive or its CLI. Keep these local files accessible only to root.
4. Check and extract the repository, using the DOWNLOADED recovery password:

   ```sh
   export RESTIC_REPOSITORY=/recovery/2026-10
   export RESTIC_PASSWORD_FILE=/recovery/recovery-kit/restic-password
   restic check --read-data
   restic snapshots
   restic restore SNAPSHOT_ID --target /recovery/restored
   ```

   Replace the example month and `SNAPSHOT_ID` with the chosen recovery point.
   The captured tree is under
   `/recovery/restored/var/lib/pickleballs-backup/stage`.
   Set `STAGE` to that directory for the remaining steps.

## Restore order on an empty replacement host

Do not execute these steps against a running production installation. Keep the
old machine off and keep the public tunnel and app worker stopped until checks
pass. Do not start two copies of the worker against the same live database.

1. Read `capture.json`, `verification.json`, and `inventory/*.json`. The inventories
   include secrets: do not paste or publish them.
2. Load every saved image with `docker load -i IMAGE.tar`. Reapply the original
   `RepoTags` from `inventory/images.json` to their recorded immutable image IDs.
   Use `--pull never` when starting the saved Compose configurations.
3. Restore `host/data` to `/data`, preserving owners, permissions, ACLs, and xattrs
   (`rsync -aHAX --numeric-ids`). Recover `/opt`, `/usr/local`, home directories,
   and relevant host configuration. Review `/etc` rather than overwriting hardware
   configuration such as fstab, network interfaces, or machine-id on a new host.
4. Restore the original Coolify SSH keys in `/data/coolify/ssh` and arrange root SSH
   authorization using their public keys. Preserve your new administrator access.
   Restore the original `/data/coolify/source/.env`, especially `APP_KEY`. The SQL
   backup alone cannot decrypt Coolify's stored secrets without that exact key.
5. Recreate named volumes and custom Docker networks from the inventories. Map
   restored volumes to the mount destinations in `containers.json`. Do not copy
   raw PostgreSQL files from a live system: use the SQL exports below.
6. Restore each PostgreSQL cluster into an EMPTY volume with its saved image and
   original PGDATA/mount destination. Initialize it with a temporary bootstrap
   superuser named `backup_restore_admin`, using `--network none`. Restore
   `databases/CONTAINER/globals.sql` with `psql -v ON_ERROR_STOP=1`, create each
   database listed in its `manifest.json` with its original owner, then run
   `pg_restore --exit-on-error` on each corresponding dump. The built-in `postgres`
   database already exists and does not need creation. The verification function
   in `backup.py` demonstrates the exact commands, but its throwaway containers
   are NOT a persistent production restoration procedure.
7. Populate Garage's metadata volume from `garage/meta`, data volume from
   `garage/data`, and restore its TOML and original environment from the container
   inventory. Preserve `node_key`, cluster layout, and the original RPC secret.
   Start it on an isolated network first. Its image is saved in the backup.
8. Check every current object and every required DB reference against
   `media/manifest.json`. Payload files are `media/objects/SHA256`. If an object
   is missing, broken, or changed between the database and Garage captures, PUT
   its archived payload back into the restored bucket with its recorded content
   type and metadata. `verify_garage()` in the included script performs this
   operation ONLY in a disposable isolated clone, followed by SHA-256 validation.
9. Place `redis/dump.rdb` into the Redis volume with the original ownership.
   Run the saved Redis image's `redis-check-rdb` before starting it.
10. Start Coolify from its saved `/data/coolify/source` Compose files and `.env`,
    using `docker compose --env-file .env -f docker-compose.yml -f docker-compose.prod.yml up -d --pull never`,
    then restore/start the proxy, database and Garage services using their saved
    Compose configurations. Confirm Coolify can decrypt credentials and connect
    to the replacement host. Adjust host IP/SSH settings if necessary.
11. Start the saved web/static services, verify login and several media files,
    then start exactly one worker. Verify both releases at
    `/api/health?release=1`. Review restored queued work before reconnecting
    outbound integrations. Do not automatically replay or reverse migrations.
12. Rejoin Tailscale as appropriate, then enable the saved Cloudflare tunnel.
    Confirm public health, login, uploads, video ranges, and background jobs.
    Finally sign the backup client into Proton and resume the backup schedule.

The OS installation, hardware/network adjustments, and external-account access
are manual recovery steps. A successful isolated data restore does not prove the
entire public deployment on replacement hardware; perform that final smoke test
before declaring the disaster resolved.

## Operations on the existing server

Root-owned code: `/usr/local/lib/pickleballs-backup/backup.py`.
Root-only working data/logs: `/var/lib/pickleballs-backup`.
Root-only credentials: `/root/.config/pickleballs-backup`.

```sh
systemctl status pickleballs-backup.service
systemctl list-timers 'pickleballs-backup*'
journalctl -u pickleballs-backup.service --since yesterday
python3 /usr/local/lib/pickleballs-backup/backup.py backup
python3 /usr/local/lib/pickleballs-backup/backup.py verify-remote --month YYYY-MM
```

When started with `--notify`, failures alert the existing deployment Discord webhook.
Enable that option only with the channel owner's approval.
Manual test invocations do not send alerts unless `--notify` is supplied.
No secret or private object name is included in the alert. A dead server cannot
send its own failure alert; independent dead-man monitoring remains a separate
requirement. Check Proton's last-success timestamp after a server/network outage.

A separate weekly cloud restore downloads the repository and recovery key anew,
checks ALL encrypted pack data, loads the saved images, restores both SQL clusters,
validates all exported media hashes, reads the objects through an isolated Garage
instance, checks Redis, and boots the saved web image against a fresh restored
application database to check health and the sign-in page. Test containers have no published ports, no Docker
socket, and no external network access. The production containers are not changed by the drill, and no cloned worker or
public tunnel is started. Verification results are uploaded to the same status folder.
