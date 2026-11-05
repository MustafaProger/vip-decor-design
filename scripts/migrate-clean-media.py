#!/usr/bin/env python3
"""Replace exact media URLs only; dry-run by default, SQLite backup before apply."""
import argparse, datetime, json, pathlib, sqlite3

def replace_urls(value, mapping):
    if isinstance(value, str):
        return mapping.get(value, value)
    if isinstance(value, list):
        return [replace_urls(item, mapping) for item in value]
    if isinstance(value, dict):
        return {key: replace_urls(item, mapping) for key, item in value.items()}
    return value

def restore_urls(current, original, mapping):
    if isinstance(original,str):
        return original if original in mapping and current==mapping[original] else current
    if isinstance(current,list) and isinstance(original,list):
        return [restore_urls(v,original[i],mapping) if i<len(original) else v for i,v in enumerate(current)]
    if isinstance(current,dict) and isinstance(original,dict):
        return {k:restore_urls(v,original[k],mapping) if k in original else v for k,v in current.items()}
    return current

def migrate(database, manifest, apply=False, reverse=False, restore_from=None):
    if not pathlib.Path(database).is_file(): raise FileNotFoundError(database)
    entries=json.loads(pathlib.Path(manifest).read_text())
    mapping={row['src']: row['target'] for row in entries}
    if any(not k.startswith(('/source-media/','/images/')) or not v.startswith('/images/catalog-clean-20261104/') for k,v in mapping.items()) and not reverse:
        raise ValueError('Unexpected media path in manifest')
    if reverse: mapping={v:k for k,v in mapping.items()}
    if len(mapping)!=len(entries): raise ValueError('Duplicate mapping; use --restore-from for aliases')
    originals={}
    if restore_from:
        previous=sqlite3.connect('file:'+str(pathlib.Path(restore_from).resolve())+'?mode=ro',uri=True)
        originals={(kind,id):json.loads(body) for kind,id,body in previous.execute('SELECT kind,id,body FROM entities')}
        row=previous.execute("SELECT value FROM meta WHERE key='content'").fetchone()
        if row:originals[('meta','content')]=json.loads(row[0])
        previous.close()
    def transform(value,kind,id):
        return restore_urls(value,originals.get((kind,id)),mapping) if restore_from else replace_urls(value,mapping)
    db=sqlite3.connect(database)
    db.execute('PRAGMA busy_timeout=10000')
    backup=None
    if apply:
        stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        backup=str(database)+'.before-media-'+stamp+'.sqlite'
        with sqlite3.connect(backup) as dest: db.backup(dest)
        pathlib.Path(backup).chmod(0o600)
    changes=[]
    db.execute('BEGIN IMMEDIATE' if apply else 'BEGIN')
    try:
        now=datetime.datetime.now(datetime.timezone.utc).isoformat()
        for kind,id,body in db.execute('SELECT kind,id,body FROM entities').fetchall():
            old=json.loads(body);new=transform(old,kind,id)
            if old==new:continue
            changes.append({'kind':kind,'id':id})
            if apply:db.execute('UPDATE entities SET body=?, version=version+1, updated_at=? WHERE kind=? AND id=?',(json.dumps(new,ensure_ascii=False),now,kind,id))
        row=db.execute("SELECT value FROM meta WHERE key='content'").fetchone()
        if row:
            old=json.loads(row[0]);new=transform(old,'meta','content')
            if old!=new:
                changes.append({'kind':'meta','id':'content'})
                if apply:db.execute("UPDATE meta SET value=? WHERE key='content'",(json.dumps(new,ensure_ascii=False),))
        db.commit() if apply else db.rollback()
    except BaseException:
        db.rollback();raise
    finally:db.close()
    return {'applied':apply,'reverse':reverse,'restoreFrom':str(restore_from) if restore_from else None,'backup':backup,'changed':len(changes),'entities':changes}

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('database');parser.add_argument('manifest')
    parser.add_argument('--apply',action='store_true');parser.add_argument('--reverse',action='store_true')
    parser.add_argument('--restore-from',help='Restore only migrated URLs from the pre-migration SQLite backup')
    args=parser.parse_args()
    print(json.dumps(migrate(args.database,args.manifest,args.apply,args.reverse,args.restore_from),ensure_ascii=False,indent=2))
