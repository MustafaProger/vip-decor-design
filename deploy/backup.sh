#!/bin/sh
set -eu
umask 077
exec 9>/run/lock/vip-decor-backup.lock
flock -n 9 || exit 0
stamp=$(date -u +%Y%m%dT%H%M%SZ)
dest=/var/backups/vip-decor/$stamp
mkdir -p "$dest"
# Pause only the mail sender so accepted deliveries and its ledger stay aligned.
# The website and CMS continue serving requests throughout the snapshot.
mail_active=$(systemctl is-active vip-decor-mail.timer || true)
trap '[ "$mail_active" != active ] || systemctl start vip-decor-mail.timer' EXIT
systemctl stop vip-decor-mail.timer
attempt=0
while systemctl is-active --quiet vip-decor-mail.service; do
    attempt=$((attempt + 1))
    [ "$attempt" -lt 120 ] || exit 1
    sleep 1
done
python3 /usr/local/lib/vip-decor/backup-runtime.py /var/lib/vipdecor/runtime "$dest"
cp /etc/vip-decor/site.env "$dest/site.env"
if [ -f /etc/vip-decor/smtp-password ]; then
    install -m 600 /etc/vip-decor/smtp-password "$dest/smtp-password"
fi
if [ -f /etc/vip-decor/push-vapid.json ]; then
    cp /etc/vip-decor/push-vapid.json "$dest/push-vapid.json"
fi
readlink -f /opt/vip-decor/current > "$dest/release.txt"
[ "$mail_active" != active ] || systemctl start vip-decor-mail.timer
trap - EXIT
find /var/backups/vip-decor -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf -- {} +
