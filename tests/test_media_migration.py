import importlib.util, json, pathlib, sqlite3, tempfile, unittest
spec=importlib.util.spec_from_file_location('migration',pathlib.Path(__file__).parents[1]/'scripts/migrate-clean-media.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class MediaMigrationTest(unittest.TestCase):
    def test_dry_run_idempotence_and_reverse_preserve_other_data(self):
        with tempfile.TemporaryDirectory() as folder:
            dbpath=pathlib.Path(folder)/'cms.sqlite';manifest=pathlib.Path(folder)/'map.json'
            manifest.write_text(json.dumps([{'src':'/source-media/old.webp','target':'/images/catalog-clean-20261104/new.webp'},{'src':'/source-media/alias.webp','target':'/images/catalog-clean-20261104/new.webp'}]))
            db=sqlite3.connect(dbpath)
            db.executescript('CREATE TABLE entities(kind,id,body,version,updated_at); CREATE TABLE meta(key,value); CREATE TABLE inquiries(id,body);')
            product={'image':'/source-media/old.webp','gallery':['/source-media/old.webp','/source-media/alias.webp','/keep.webp'],'price':3950,'title':'Ткань','options':{'цвет':'05'}}
            db.execute('INSERT INTO entities VALUES (?,?,?,?,?)',('product','1',json.dumps(product),7,'before'))
            db.execute('INSERT INTO meta VALUES (?,?)',('content',json.dumps({'hero':'/source-media/old.webp'})))
            db.execute('INSERT INTO inquiries VALUES (?,?)',('existing','unchanged'));db.commit()
            def read():return json.loads(db.execute('SELECT body FROM entities').fetchone()[0])
            self.assertEqual(m.migrate(dbpath,manifest)['changed'],2);self.assertEqual(read(),product)
            result=m.migrate(dbpath,manifest,True)
            self.assertTrue(pathlib.Path(result['backup']).exists())
            self.assertEqual(read(),{**product,'image':'/images/catalog-clean-20261104/new.webp','gallery':['/images/catalog-clean-20261104/new.webp','/images/catalog-clean-20261104/new.webp','/keep.webp']})
            self.assertEqual(db.execute('SELECT version FROM entities').fetchone()[0],8)
            self.assertEqual(m.migrate(dbpath,manifest,True)['changed'],0)
            changed=read();changed['price']=4200
            db.execute('UPDATE entities SET body=?',(json.dumps(changed),));db.commit()
            m.migrate(dbpath,manifest,True,restore_from=result['backup'])
            self.assertEqual(read(),{**product,'price':4200})
            self.assertEqual(db.execute('SELECT * FROM inquiries').fetchall(),[('existing','unchanged')])
            db.close()

if __name__=='__main__':unittest.main()
