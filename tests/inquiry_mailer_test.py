import importlib.util
import json
from pathlib import Path
import smtplib
import sqlite3
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('mailer', Path(__file__).parents[1] / 'scripts/inquiry-mailer.py')
mailer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mailer)


class SMTP:
    sent = 0
    fail = None
    def __init__(self, *args, **kwargs): pass
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def login(self, *args):
        if self.fail == 'auth': raise smtplib.SMTPAuthenticationError(535, b'failure')
    def send_message(self, message):
        type(self).sent += 1
        if self.fail == 'timeout': raise TimeoutError()
        return {}


class DeliveryTest(unittest.TestCase):
    def test_success_is_not_sent_twice(self):
        self.check_delivery(None, 'accepted', 1)
    def test_ambiguous_send_is_held(self):
        self.check_delivery('timeout', 'hold', 1)
    def test_auth_failure_retries_without_sending(self):
        self.check_delivery('auth', 'failed', 0)
    def check_delivery(self, failure, state, count):
        SMTP.sent, SMTP.fail = 0, failure
        with tempfile.TemporaryDirectory() as folder:
            Path(folder, 'inquiries.jsonl').write_text(json.dumps({'id':'test-id','name':'Тест','phone':'+70000000000'}) + '\n')
            for _ in range(2):
                mailer.run(folder, 'sender@example.com', 'recipient@example.com', 'test', SMTP)
            with sqlite3.connect(Path(folder, 'mail-delivery.sqlite')) as db:
                self.assertEqual(db.execute('SELECT state FROM delivery').fetchone()[0], state)
            self.assertEqual(SMTP.sent, count)


if __name__ == '__main__': unittest.main()
