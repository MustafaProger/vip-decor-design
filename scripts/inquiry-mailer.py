#!/usr/bin/env python3
"""Send saved enquiries without coupling their persistence to SMTP availability."""
import fcntl
import json
import os
from pathlib import Path
import smtplib
import sqlite3
import ssl
from email.message import EmailMessage
from email.utils import formatdate


def message_for(record, sender, recipient):
    message = EmailMessage()
    message['From'] = sender
    message['To'] = recipient
    message['Subject'] = 'VIP Decor — новая заявка с сайта'
    message['Message-ID'] = f'<vip-decor-{record["id"]}@vip2d.ru>'
    message['Date'] = formatdate(localtime=False)
    if record.get('email'):
        message['Reply-To'] = record['email']
    fields = [('Номер', 'id'), ('Дата', 'createdAt'), ('Имя', 'name'),
              ('Телефон', 'phone'), ('Email', 'email'),
              ('Комментарий', 'comment'), ('Источник и заказ', 'context')]
    body = ['Заявка сохранена в CMS: https://vip2d.ru/admin', '']
    body.extend(f'{title}: {record.get(key, "")}' for title, key in fields)
    if record.get('selection'):
        body.append('Параметры подбора: ' + json.dumps(record['selection'], ensure_ascii=False))
    message.set_content('\n'.join(body))
    return message


def run(directory, sender, recipient, password, smtp_factory=smtplib.SMTP_SSL):
    directory = Path(directory)
    journal = directory / 'inquiries.jsonl'
    if not journal.exists():
        return
    lock = (directory / 'mail.lock').open('a')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        lock.close()
        return
    db = sqlite3.connect(directory / 'mail-delivery.sqlite')
    os.chmod(directory / 'mail-delivery.sqlite', 0o600)
    db.execute('CREATE TABLE IF NOT EXISTS delivery (id TEXT PRIMARY KEY, state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, error TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)')
    # An interrupted DATA transfer must be reconciled before another send.
    db.execute("UPDATE delivery SET state='hold',error='interrupted_send' WHERE state='sending'")
    db.commit()
    try:
        for line in journal.read_text().splitlines():
            try:
                record = json.loads(line)
                record_id = record['id']
            except (ValueError, KeyError):
                continue
            existing = db.execute('SELECT state,attempts FROM delivery WHERE id=?', (record_id,)).fetchone()
            if existing and (existing[0] in ('accepted', 'hold') or existing[1] >= 5):
                continue
            message = message_for(record, sender, recipient)
            db.execute("INSERT OR IGNORE INTO delivery(id,state) VALUES(?,'pending')", (record_id,))
            db.execute('UPDATE delivery SET attempts=attempts+1 WHERE id=?', (record_id,))
            db.commit()
            transfer_started = False
            try:
                with smtp_factory('smtp.yandex.ru', 465, timeout=25, context=ssl.create_default_context()) as smtp:
                    smtp.login(sender, password)
                    db.execute("UPDATE delivery SET state='sending',updated_at=CURRENT_TIMESTAMP WHERE id=?", (record_id,))
                    db.commit()
                    transfer_started = True
                    refused = smtp.send_message(message)
                    if refused:
                        raise smtplib.SMTPRecipientsRefused(refused)
                    db.execute("UPDATE delivery SET state='accepted',error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?", (record_id,))
                    db.commit()
                    transfer_started = False
                    print(f'mail accepted id={record_id}', flush=True)
            except Exception as error:
                # QUIT can fail after a confirmed successful send.
                if db.execute('SELECT state FROM delivery WHERE id=?', (record_id,)).fetchone()[0] == 'accepted':
                    continue
                definite_rejection = isinstance(error, (smtplib.SMTPRecipientsRefused, smtplib.SMTPSenderRefused, smtplib.SMTPDataError))
                state = 'hold' if transfer_started and not definite_rejection else 'failed'
                db.execute('UPDATE delivery SET state=?,error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?', (state, type(error).__name__, record_id))
                db.commit()
                print(f'mail {state} id={record_id} reason={type(error).__name__}', flush=True)
    finally:
        db.close()
        lock.close()


if __name__ == '__main__':
    credentials = Path(os.environ.get('CREDENTIALS_DIRECTORY', '/etc/vip-decor'))
    password = (credentials / 'smtp-password').read_text().strip()
    run(os.environ.get('INQUIRY_DATA_DIR', '/var/lib/vipdecor/runtime'),
        os.environ['SMTP_USER'], os.environ['INQUIRY_MAIL_TO'], password)
