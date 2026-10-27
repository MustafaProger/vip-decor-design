#!/usr/bin/env python3
"""Finish www TLS after DNS propagation; stop this one-time timer on success."""
import pathlib, socket, subprocess, time
expected='151.248.116.210'
for name in ('vip2d.ru','www.vip2d.ru'):
    try: addresses={item[4][0] for item in socket.getaddrinfo(name,80,type=socket.SOCK_STREAM)}
    except socket.gaierror:
        print('DNS not ready:',name,flush=True);raise SystemExit(0)
    if addresses != {expected}:
        print('DNS not ready:',name,flush=True);raise SystemExit(0)
marker=pathlib.Path('/var/lib/vipdecor-tls-last-attempt')
if marker.exists() and time.time()-marker.stat().st_mtime<3600:
    print('Previous attempt less than an hour ago; waiting.',flush=True);raise SystemExit(0)
marker.touch(mode=0o600)
subprocess.run(['certbot','certonly','--webroot','-w','/var/www/acme','--cert-name','vip2d.ru','-d','vip2d.ru','-d','www.vip2d.ru','--expand','--non-interactive','--agree-tos','--email','vipdecordesign@yandex.ru'],check=True)
config=pathlib.Path('/etc/nginx/sites-available/vip-decor')
old=config.read_text()
new=old.replace('    ssl_reject_handshake on;', '''    ssl_certificate /etc/letsencrypt/live/vip2d.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/vip2d.ru/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    return 301 https://vip2d.ru$request_uri;''')
config.write_text(new)
try: subprocess.run(['nginx','-t'],check=True)
except Exception:
    config.write_text(old);raise
subprocess.run(['systemctl','reload','nginx'],check=True)
subprocess.run(['systemctl','disable','--now','vip-decor-tls.timer'],check=True)
print('TLS complete for vip2d.ru and www.vip2d.ru; webroot renewal configured.',flush=True)
