#!/usr/bin/env python3
"""Root-only Coolify disaster recovery capture, Restic, and official Proton CLI.

No live service is stopped. Never prints command arguments or captured stderr,
which may contain credentials. Detailed failures remain in the root-only log.
"""
import argparse, datetime as dt, fcntl, hashlib, json, os, pathlib, re, secrets
import shutil, sqlite3, subprocess, sys, time, urllib.request

BASE = pathlib.Path('/var/lib/pickleballs-backup')
CONF = pathlib.Path('/root/.config/pickleballs-backup')
REMOTE = '/my-files/Coolify Backups'
STAGE = BASE / 'stage'
LABEL = 'com.pickleballs.backup-verification'
ENV = dict(os.environ, GNUPGHOME=str(CONF/'gnupg'),
           PASSWORD_STORE_DIR=str(CONF/'password-store'),
           PROTON_DRIVE_CREDENTIALS_STORE='pass', PROTON_DRIVE_LOG_LEVEL='WARNING',
           RESTIC_PASSWORD_FILE=str(CONF/'restic-password'))

def stamp(): return dt.datetime.now(dt.timezone.utc).isoformat()
def log(message): print(f'{stamp()} {message}', flush=True)
def save(path, value):
    path = pathlib.Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name+'.tmp'); tmp.write_text(json.dumps(value, indent=2)+'\n')
    tmp.chmod(0o600); tmp.replace(path)
def read(path): return json.loads(pathlib.Path(path).read_text())
def run(args, *, output=None, input_file=None, env=None, ok=(0,), timeout=3600):
    with open(BASE/'commands.log','ab') as err:
        p = subprocess.run([str(a) for a in args], env=env or ENV,
                           stdin=input_file, stdout=output or subprocess.PIPE,
                           stderr=err, timeout=timeout)
    if p.returncode not in ok:
        raise RuntimeError(f'{pathlib.Path(str(args[0])).name} failed ({p.returncode}); see root-only commands.log')
    return (p.stdout or b'').decode()
def dj(*args): return json.loads(run(['docker',*args]))
def env_of(c): return dict(x.split('=',1) for x in c['Config']['Env'])
def name(c): return c['Name'].lstrip('/')
def mount(c, dest): return pathlib.Path(next(m['Source'] for m in c['Mounts'] if m['Destination']==dest))
def digest(p):
    h=hashlib.sha256()
    with open(p,'rb') as f:
        for b in iter(lambda:f.read(4*1024*1024),b''): h.update(b)
    return h.hexdigest()
def rsync(source, target, *, delete=False, excludes=()):
    target=pathlib.Path(target); target.mkdir(parents=True, exist_ok=True)
    a=['rsync','-aHAX','--numeric-ids']
    if delete: a+=['--delete']
    for x in excludes: a += ['--exclude',x]
    run(a+[str(source).rstrip('/')+'/',str(target)+'/' ],ok=(0,24))
def proton(*args): return run(['proton-drive',*args],timeout=14400)
def remote_folder(path):
    # Only operates under the one user-approved top-level folder.
    if '..' in pathlib.PurePosixPath(path).parts or not (path==REMOTE or path.startswith(REMOTE+'/')): raise ValueError('Remote path outside backup folder')
    try: return proton('filesystem','info',path)
    except RuntimeError:
        parent,child=path.rsplit('/',1)
        return proton('filesystem','create-folder',parent,child)
def upload(paths, destination):
    if '..' in pathlib.PurePosixPath(destination).parts or not destination.startswith(REMOTE+'/'): raise ValueError('Unsafe destination')
    proton('filesystem','upload','-f','create-new-revision','-d','merge','-t',*paths,destination)
def inventory():
    ids=run(['docker','ps','-aq']).split()
    cs=dj('inspect',*ids)
    if any(c['Config'].get('Labels',{}).get(LABEL) for c in cs):
        raise RuntimeError('A previous verification container exists; inspect it before another run')
    if any('coolify-helper' in c['Config']['Image'] and c['State']['Running'] for c in cs):
        raise RuntimeError('Deployment in progress; retry on next timer')
    vs=dj('volume','inspect',*run(['docker','volume','ls','-q']).split())
    ns=dj('network','inspect',*run(['docker','network','ls','-q']).split())
    return cs,vs,ns

def pg_dumps(cs):
    out=[]
    for c in cs:
        e=env_of(c)
        if 'POSTGRES_USER' not in e or not c['State']['Running']: continue
        d=STAGE/'databases'/name(c); d.mkdir(parents=True,exist_ok=True)
        prefix=['docker','exec',c['Id']]
        with open(d/'globals.sql','wb') as f:
            run(prefix+['pg_dumpall','-U',e['POSTGRES_USER'],'--globals-only'],output=f)
        dbs=run(prefix+['psql','-X','-U',e['POSTGRES_USER'],'-d','postgres','-At','-c',
                       'SELECT datname FROM pg_database WHERE NOT datistemplate ORDER BY datname']).splitlines()
        files={}
        for database in dbs:
            filename=hashlib.sha256(database.encode()).hexdigest()+'.dump'
            with open(d/filename,'wb') as f:
                run(prefix+['pg_dump','-U',e['POSTGRES_USER'],'-Fc','--dbname',database],output=f)
            files[database]=filename
        rec={'container':name(c),'image':c['Image'],'user':e['POSTGRES_USER'], 'databases':files}
        save(d/'manifest.json',rec); out.append(rec)
        log(f'Captured PostgreSQL cluster {name(c)} ({len(files)} databases)')
    if len(out)!=2: raise RuntimeError('Expected both application and Coolify PostgreSQL clusters')
    return out

def s3_client(cs, endpoint=None):
    import boto3
    from botocore.config import Config
    app=next(c for c in cs if 'S3_ACCESS_KEY_ID' in env_of(c))
    e=env_of(app)
    if endpoint is None:
        g=next(c for c in cs if name(c).startswith('garage-'))
        ip=next(n['IPAddress'] for n in g['NetworkSettings']['Networks'].values() if n['IPAddress'])
        endpoint=f'http://{ip}:3900'
    return boto3.client('s3',endpoint_url=endpoint,region_name=e.get('S3_REGION','garage'),
                       aws_access_key_id=e['S3_ACCESS_KEY_ID'],aws_secret_access_key=e['S3_SECRET_ACCESS_KEY'],
                       config=Config(s3={'addressing_style':'path'},connect_timeout=10,read_timeout=120,
                                     retries={'max_attempts':3})),e['S3_BUCKET']

def export_media(cs):
    s3,bucket=s3_client(cs); d=STAGE/'media'; (d/'objects').mkdir(parents=True,exist_ok=True)
    manifest=read(d/'manifest.json') if (d/'manifest.json').exists() else {'bucket':bucket,'objects':{}}
    now=stamp(); total=0; downloaded=0
    # Keep earlier object copies too: a deletion during the DB dump must not make
    # a previously captured DB reference unrecoverable. Restic deduplicates these.
    for page in s3.get_paginator('list_objects_v2').paginate(Bucket=bucket):
        for obj in page.get('Contents',[]):
            key=obj['Key']; old=manifest['objects'].get(key); total+=1
            if not old or old['etag']!=obj['ETag'] or not (d/'objects'/old['sha256']).exists():
                response=s3.get_object(Bucket=bucket,Key=key,IfMatch=obj['ETag'])
                tmp=d/'download.tmp'; h=hashlib.sha256(); size=0
                with open(tmp,'wb') as f:
                    for b in response['Body'].iter_chunks(4*1024*1024):
                        if b: f.write(b); h.update(b); size+=len(b)
                response['Body'].close()
                if size!=obj['Size']: raise RuntimeError('Media length mismatch')
                sha=h.hexdigest(); tmp.replace(d/'objects'/sha)
                old={'sha256':sha,'size':size,'etag':obj['ETag'],
                     'content_type':response.get('ContentType','application/octet-stream'),
                     'metadata':response.get('Metadata',{})}
                manifest['objects'][key]=old; downloaded+=1
            old['last_seen']=now
    manifest['captured_at']=now; manifest['current_objects']=total
    save(d/'manifest.json',manifest)
    log(f'Exported {total} current media objects ({downloaded} new or changed)')

def garage_snapshot(cs):
    c=next(c for c in cs if name(c).startswith('garage-'))
    meta=mount(c,'/var/lib/garage/meta'); data=mount(c,'/var/lib/garage/data')
    before=set((meta/'snapshots').iterdir()) if (meta/'snapshots').exists() else set()
    run(['docker','exec',c['Id'],'/garage','meta','snapshot'])
    created=set((meta/'snapshots').iterdir())-before
    if len(created)!=1: raise RuntimeError('Cannot identify this run\'s Garage snapshot safely')
    latest=created.pop()
    if not (latest/'db.lmdb').is_file(): raise RuntimeError('Unsupported Garage snapshot format')
    target=STAGE/'garage'
    rsync(meta,target/'meta',delete=True,excludes=('db.lmdb','snapshots','*.tmp'))
    (target/'meta'/'db.lmdb').mkdir(exist_ok=True)
    shutil.copy2(latest/'db.lmdb',target/'meta'/'db.lmdb'/'data.mdb')
    # Blocks are immutable; keep earlier blocks if live GC removed them. The
    # logical object export is an independent recovery path and is verified too.
    rsync(data,target/'data')
    shutil.copy2(mount(c,'/etc/garage.toml'),target/'garage.toml')
    if latest.parent==meta/'snapshots' and not latest.is_symlink():
        # Only the temporary native snapshot created by THIS run; the staged
        # copy remains. Existing/manual snapshots are never pruned here.
        shutil.rmtree(latest)
    log('Captured native Garage metadata snapshot and data blocks')

def host_files(cs,vs):
    root=STAGE/'host'; root.mkdir(parents=True,exist_ok=True)
    covered=set()
    for c in cs:
        for m in c['Mounts']:
            if m['Type']=='volume':
                if (('POSTGRES_USER' in env_of(c) and c['State']['Running']) or name(c).startswith('garage-') or name(c)=='coolify-redis'):
                    covered.add(m['Name'])
    for c in cs:
        binds=[m for m in c['Mounts'] if m['Type']=='bind' and not pathlib.Path(m['Source']).is_socket()]
        supported=(name(c) in {'coolify','coolify-proxy','coolify-sentinel'} or name(c).startswith('garage-')
                   or ('POSTGRES_USER' in env_of(c) and c['State']['Running'])
                   or all(m['Source']=='/data/pickleballs/next-static' for m in binds))
        if binds and not supported: raise RuntimeError('Unclassified persistent bind-mount service; review its backup adapter')
    unknown=[v['Name'] for v in vs if v['Name'] not in covered]
    if unknown: raise RuntimeError('Unclassified persistent Docker volumes; add a safe backup adapter')
    paths=['/etc','/root','/home','/opt','/usr/local','/data','/var/spool/cron','/var/lib/tailscale','/var/lib/cloud','/var/lib/systemd']
    for c in cs:
        for m in c['Mounts']:
            s=m['Source']
            if m['Type']=='bind' and not pathlib.Path(s).is_socket() and not any(s==p or s.startswith(p+'/') for p in paths): paths.append(s)
    excludes=('.cache','.npm','node_modules','.config/pickleballs-backup','*.sock')
    for p in paths:
        src=pathlib.Path(p)
        if not src.exists(): continue
        dst=root/p.lstrip('/')
        if src.is_dir(): rsync(src,dst,delete=True,excludes=excludes)
        elif src.is_file(): dst.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(src,dst)
    # Sentinel uses SQLite. Copy its live DB using SQLite's backup API, not a
    # potentially torn copy of database/WAL files.
    sentinel=pathlib.Path('/data/coolify/sentinel')
    if sentinel.exists():
        for p in sentinel.rglob('*'):
            if not p.is_file(): continue
            with open(p,'rb') as f: is_sqlite=f.read(16)==b'SQLite format 3\x00'
            if is_sqlite:
                dst=root/str(p).lstrip('/')
                dst.unlink(missing_ok=True)
                with sqlite3.connect(f'file:{p}?mode=ro',uri=True,timeout=30) as source:
                    with sqlite3.connect(dst) as target: source.backup(target)
                shutil.copystat(p,dst)
                os.chown(dst,p.stat().st_uid,p.stat().st_gid)
                for suffix in ('-wal','-shm'): pathlib.Path(str(dst)+suffix).unlink(missing_ok=True)
    redis=next(c for c in cs if name(c)=='coolify-redis')
    reenv=dict(ENV,REDISCLI_AUTH=env_of(redis)['REDIS_PASSWORD'])
    rd=STAGE/'redis'; rd.mkdir(exist_ok=True)
    # redis-cli --rdb creates an online point-in-time RDB via replication protocol.
    run(['docker','exec','-e','REDISCLI_AUTH',redis['Id'],'redis-cli','--rdb','/tmp/pickleballs-backup.rdb'],env=reenv)
    run(['docker','cp',redis['Id']+':/tmp/pickleballs-backup.rdb',rd/'dump.rdb'])
    run(['docker','exec',redis['Id'],'redis-check-rdb','/tmp/pickleballs-backup.rdb'])
    original_rdb=mount(redis,'/data')/'dump.rdb'
    if original_rdb.exists():
        shutil.copystat(original_rdb,rd/'dump.rdb')
        os.chown(rd/'dump.rdb',original_rdb.stat().st_uid,original_rdb.stat().st_gid)
    coolify=next(c for c in cs if name(c)=='coolify')
    envlines=(root/'data/coolify/source/.env').read_text().splitlines()
    key=next(line.split('=',1)[1].strip().strip(chr(34)+chr(39)) for line in envlines if line.startswith('APP_KEY='))
    if key!=env_of(coolify)['APP_KEY']: raise RuntimeError('Saved Coolify APP_KEY does not match running instance')
    log('Captured host files, checked Coolify APP_KEY, SQLite, and verified Redis RDB')

def images(cs):
    d=STAGE/'images'; d.mkdir(exist_ok=True)
    ids=sorted(set(c['Image'] for c in cs)); records=dj('image','inspect',*ids)
    wanted=set()
    for image_id in ids:
        filename=image_id.replace(':','-')+'.tar'; wanted.add(filename)
        if not (d/filename).exists():
            run(['docker','image','save','-o',d/(filename+'.tmp'),image_id])
            (d/(filename+'.tmp')).replace(d/filename)
    # Only generated staging archives; previous copies stay in Restic snapshots.
    for p in d.glob('*.tar'):
        if p.name not in wanted: p.unlink()
    save(STAGE/'inventory'/'images.json',records)
    log(f'Preserved {len(ids)} exact container images')

def verify_databases(stage):
    cs=read(stage/'inventory'/'containers.json'); media=read(stage/'media'/'manifest.json')
    counts={}; required=set()
    for mf in sorted((stage/'databases').glob('*/manifest.json')):
        spec=read(mf); clone='pb-backup-verify-'+secrets.token_hex(5)
        envfile=BASE/(clone+'.env')
        envfile.write_text('POSTGRES_USER=backup_restore_admin\nPOSTGRES_PASSWORD='+secrets.token_hex(24)+'\nPOSTGRES_DB=postgres\n')
        envfile.chmod(0o600)
        try:
            run(['docker','run','-d','--name',clone,'--label',LABEL+'=true','--network','none',
                 '--env-file',envfile,spec['image']])
            for attempt in range(60):
                try: run(['docker','exec',clone,'pg_isready','-U','backup_restore_admin'],timeout=5); break
                except RuntimeError: time.sleep(1)
            else: raise RuntimeError('Verification PostgreSQL did not become ready')
            with open(mf.parent/'globals.sql','rb') as f:
                run(['docker','exec','-i',clone,'psql','-X','-v','ON_ERROR_STOP=1','-U','backup_restore_admin','-d','postgres'],input_file=f)
            for db,filename in spec['databases'].items():
                if db!='postgres': run(['docker','exec',clone,'createdb','-U','backup_restore_admin','-O',spec['user'],db])
                with open(mf.parent/filename,'rb') as f:
                    run(['docker','exec','-i',clone,'pg_restore','--exit-on-error','-U','backup_restore_admin','-d',db],input_file=f)
                prefix=['docker','exec',clone,'psql','-X','-U','backup_restore_admin','-d',db,'-At','-c']
                count=run(prefix+["SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema')"]).strip()
                counts[spec['container']+'/'+db]={'tables':int(count)}
                if db=='pickleballs':
                    query='''SELECT "objectKey" FROM "TaskProofImage" WHERE "objectKey" IS NOT NULL
                    UNION SELECT "objectKey" FROM "MediaUpload" WHERE ready
                    UNION SELECT "posterKey" FROM "MediaUpload" WHERE ready AND "posterKey" IS NOT NULL
                    UNION SELECT "objectKey" FROM "TimeblockChatAttachment" WHERE ready'''
                    required.update(run(prefix+[query]).splitlines())
                    for table in ('User','TaskProof','MediaUpload'):
                        counts[spec['container']+'/'+db][table]=int(run(prefix+[f'SELECT count(*) FROM "{table}"']).strip())
        finally:
            # Names are random and carry a dedicated label. Never touch live containers.
            try: run(['docker','rm','-f','-v',clone],ok=(0,1))
            finally: envfile.unlink(missing_ok=True)
    absent=required-set(media['objects'])
    if absent: raise RuntimeError(f'{len(absent)} DB media references are absent; retry capture')
    for obj in media['objects'].values():
        p=stage/'media'/'objects'/obj['sha256']
        if not p.exists() or p.stat().st_size!=obj['size'] or digest(p)!=obj['sha256']:
            raise RuntimeError('Media archive checksum failure')
    result={'verified_at':stamp(),'databases':counts,'required_media_keys':len(required),
            'archived_media_objects':len(media['objects']),'required_keys':sorted(required)}
    save(stage/'verification.json',result)
    log(f'Restored both PostgreSQL clusters; verified {len(required)} DB media references and all media checksums')
    return result

def verify_garage(stage):
    cs=read(stage/'inventory'/'containers.json')
    g=next(c for c in cs if name(c).startswith('garage-'))
    media=read(stage/'media'/'manifest.json')
    check=read(stage/'verification.json')
    clone='pb-backup-garage-'+secrets.token_hex(5)
    work=BASE/clone; work.mkdir()
    network=clone+'-isolated'
    shutil.copytree(stage/'garage'/'meta',work/'meta')
    shutil.copytree(stage/'garage'/'data',work/'data')
    envfile=work/'garage.env'
    envfile.write_text(''.join(k+'='+v+'\n' for k,v in env_of(g).items()))
    try:
        run(['docker','network','create','--internal','--label',LABEL+'=true',network])
        run(['docker','run','-d','--name',clone,'--label',LABEL+'=true','--network',network,
             '--env-file',envfile,'--mount',f'type=bind,src={work}/meta,dst=/var/lib/garage/meta',
             '--mount',f'type=bind,src={work}/data,dst=/var/lib/garage/data',
             '--mount',f'type=bind,src={stage}/garage/garage.toml,dst=/etc/garage.toml,readonly',
             '--entrypoint','/garage',g['Image'],'server'])
        c=dj('inspect',clone)[0]
        ip=c['NetworkSettings']['Networks'][network]['IPAddress']
        s3,bucket=s3_client(cs,f'http://{ip}:3900')
        for attempt in range(60):
            try: s3.list_objects_v2(Bucket=bucket,MaxKeys=1); break
            except Exception: time.sleep(1)
        else: raise RuntimeError('Isolated Garage restore did not become ready')
        keys=set(check['required_keys']) | {k for k,v in media['objects'].items() if v['last_seen']==media['captured_at']}
        repaired=0; byte_count=0
        for key in sorted(keys):
            obj=media['objects'][key]
            def downloaded_hash():
                response=s3.get_object(Bucket=bucket,Key=key); h=hashlib.sha256()
                try:
                    for b in response['Body'].iter_chunks(4*1024*1024):
                        if b: h.update(b)
                finally: response['Body'].close()
                return h.hexdigest()
            try: good=downloaded_hash()==obj['sha256']
            except Exception: good=False
            if not good:
                # The file export bridges a deletion/change between SQL and
                # Garage snapshots. This writes ONLY to the isolated clone.
                with open(stage/'media'/'objects'/obj['sha256'],'rb') as f:
                    s3.put_object(Bucket=bucket,Key=key,Body=f,ContentType=obj['content_type'],Metadata=obj['metadata'])
                if downloaded_hash()!=obj['sha256']: raise RuntimeError('Restored Garage object hash mismatch')
                repaired+=1
            byte_count+=obj['size']
        log(f'Isolated Garage served {len(keys)} verified objects ({byte_count} bytes; {repaired} recovered from logical export)')
        return {'objects':len(keys),'bytes':byte_count,'repaired_from_export':repaired}
    finally:
        run(['docker','rm','-f','-v',clone],ok=(0,1))
        run(['docker','network','rm',network],ok=(0,1))
        shutil.rmtree(work)

def verify_redis(stage):
    cs=read(stage/'inventory'/'containers.json'); redis=next(c for c in cs if name(c)=='coolify-redis')
    run(['docker','run','--rm','--network','none','--label',LABEL+'=true',
         '--mount',f'type=bind,src={stage}/redis/dump.rdb,dst=/backup.rdb,readonly',
         '--entrypoint','redis-check-rdb',redis['Image'],'/backup.rdb'])
    log('Restored Redis snapshot passed redis-check-rdb')

def verify_web(stage):
    """Boot the saved web image against a newly restored, isolated database."""
    from urllib.parse import urlsplit, urlunsplit
    cs=read(stage/'inventory'/'containers.json')
    web=next(c for c in cs if 'WORKER_HEALTH_URL' in env_of(c))
    mf=next(p for p in (stage/'databases').glob('*/manifest.json') if 'pickleballs' in read(p)['databases'])
    spec=read(mf); token=secrets.token_hex(5)
    db='pb-backup-webdb-'+token; app='pb-backup-web-'+token; network=app+'-isolated'
    work=BASE/app; work.mkdir()
    db_env=work/'db.env'; app_env=work/'web.env'
    db_env.write_text('POSTGRES_USER=backup_restore_admin\nPOSTGRES_PASSWORD='+secrets.token_hex(24)+'\nPOSTGRES_DB=postgres\n')
    e=env_of(web)
    for k in ('DATABASE_URL','DIRECT_DATABASE_URL'):
        parts=urlsplit(e[k]); auth=parts.netloc.rsplit('@',1)[0]
        e[k]=urlunsplit(parts._replace(netloc=auth+'@'+db+':5432'))
    e['NEXT_TELEMETRY_DISABLED']='1'
    app_env.write_text(''.join(k+'='+v+'\n' for k,v in e.items()))
    try:
        run(['docker','network','create','--internal','--label',LABEL+'=true',network])
        run(['docker','run','-d','--name',db,'--label',LABEL+'=true','--network',network,'--env-file',db_env,spec['image']])
        for attempt in range(60):
            try: run(['docker','exec',db,'pg_isready','-U','backup_restore_admin'],timeout=5); break
            except RuntimeError: time.sleep(1)
        else: raise RuntimeError('Web restore database did not become ready')
        with open(mf.parent/'globals.sql','rb') as f:
            run(['docker','exec','-i',db,'psql','-X','-v','ON_ERROR_STOP=1','-U','backup_restore_admin','-d','postgres'],input_file=f)
        run(['docker','exec',db,'createdb','-U','backup_restore_admin','-O',spec['user'],'pickleballs'])
        with open(mf.parent/spec['databases']['pickleballs'],'rb') as f:
            run(['docker','exec','-i',db,'pg_restore','--exit-on-error','-U','backup_restore_admin','-d','pickleballs'],input_file=f)
        run(['docker','run','-d','--name',app,'--label',LABEL+'=true','--network',network,'--env-file',app_env,web['Image']])
        ip=dj('inspect',app)[0]['NetworkSettings']['Networks'][network]['IPAddress']
        for attempt in range(90):
            try:
                with urllib.request.urlopen(f'http://{ip}:3000/api/health',timeout=3) as response: health=json.load(response)
                if health.get('status')=='ok': break
            except Exception: pass
            time.sleep(1)
        else: raise RuntimeError('Restored web image did not become healthy')
        with urllib.request.urlopen(f'http://{ip}:3000/sign-in',timeout=20) as response:
            html=response.read()
            if response.status!=200 or b'<html' not in html: raise RuntimeError('Restored sign-in page failed')
        log('Saved web image booted against restored DB; health and sign-in returned HTTP 200')
        return {'health':health,'sign_in_http':200,'network':'internal-only; no published ports; production worker not started'}
    finally:
        for c in (app,db): run(['docker','rm','-f','-v',c],ok=(0,1))
        run(['docker','network','rm',network],ok=(0,1))
        shutil.rmtree(work)

def capture():
    cs,vs,ns=inventory(); STAGE.mkdir(parents=True,exist_ok=True)
    if shutil.disk_usage(BASE).free < 25*1024**3: raise RuntimeError('Less than 25 GiB free; backup stopped before filling disk')
    save(STAGE/'inventory'/'containers.json',cs); save(STAGE/'inventory'/'volumes.json',vs); save(STAGE/'inventory'/'networks.json',ns)
    started=stamp(); pg_dumps(cs); export_media(cs); garage_snapshot(cs); host_files(cs,vs); images(cs)
    for filename,cmd in [('packages.txt',['dpkg-query','-W']),('docker-version.txt',['docker','version']),
                         ('systemd-timers.txt',['systemctl','list-timers','--all','--no-pager']),
                         ('disks.txt',['lsblk','-f'])]:
        (STAGE/'inventory'/filename).write_text(run(cmd))
    current=set(run(['docker','ps','-aq','--no-trunc']).split())
    if current!=set(c['Id'] for c in cs): raise RuntimeError('Containers changed during capture; retry after deployment')
    result=verify_databases(STAGE)
    save(STAGE/'capture.json',{'started_at':started,'finished_at':stamp(),'schema_version':1,
                             'consistency':'Per-database SQL snapshots plus verified immutable media references; not an atomic host snapshot',
                             'containers':len(cs),'volumes':len(vs)})
    return result

def restic(repo,*args, password=None):
    e=dict(ENV,RESTIC_REPOSITORY=str(repo))
    if password: e['RESTIC_PASSWORD_FILE']=str(password)
    return run(['restic',*args],env=e,timeout=14400)
def recovery_kit():
    kit=BASE/'recovery-kit'; kit.mkdir(exist_ok=True)
    shutil.copy2(CONF/'restic-password',kit/'restic-password')
    shutil.copy2(pathlib.Path(__file__),kit/'backup.py')
    doc=pathlib.Path(__file__).with_name('RECOVERY.md')
    if not doc.exists(): raise RuntimeError('Recovery instructions missing')
    shutil.copy2(doc,kit/'RECOVERY.md')
    # Proton encrypts these files. The repository key must survive loss of host.
    remote_folder(REMOTE+'/recovery-kit'); upload(list(kit.iterdir()),REMOTE+'/recovery-kit')

def backup():
    result=capture()
    month=dt.datetime.now(dt.timezone.utc).strftime('%Y-%m')
    repo=BASE/'repositories'/month
    repo.parent.mkdir(exist_ok=True)
    if not (CONF/'restic-password').exists():
        (CONF/'restic-password').write_text(secrets.token_urlsafe(48)+'\n'); (CONF/'restic-password').chmod(0o600)
    if not (repo/'config').exists(): restic(repo,'init')
    raw=restic(repo,'backup',STAGE,'--host','pickleballs','--tag','full','--json')
    summary=next(json.loads(line) for line in raw.splitlines() if json.loads(line).get('message_type')=='summary')
    restic(repo,'check')
    log(f'Created checked Restic snapshot {summary["snapshot_id"]}')
    remote_folder(REMOTE+'/repositories'); remote_folder(REMOTE+'/repositories/'+month)
    recovery_kit()
    dest=REMOTE+'/repositories/'+month
    # Publish manifests LAST. A partial upload cannot advertise a snapshot whose
    # required encrypted packs/indexes have not successfully uploaded.
    log('Uploading encrypted data and indexes to Proton')
    upload([repo/'config',repo/'keys',repo/'data',repo/'index'],dest)
    log('Data upload complete; publishing snapshot manifests')
    upload([repo/'snapshots'],dest)
    receipt={'uploaded_at':stamp(),'repository':month,'snapshot':summary['snapshot_id'],
             'local_restore_verification':{k:v for k,v in result.items() if k!='required_keys'},
             'bytes_processed':summary.get('total_bytes_processed'),
             'cloud_restore_verified':False}
    save(BASE/'last-success.json',receipt)
    remote_folder(REMOTE+'/status'); upload([BASE/'last-success.json'],REMOTE+'/status')
    log('Full backup uploaded to Proton; snapshot published after its data')
    return receipt

def remote_verify(month):
    if not re.fullmatch(r'\d{4}-\d{2}',month): raise ValueError('Invalid repository month')
    local_repo=BASE/'repositories'/month
    if not (local_repo/'config').exists(): raise RuntimeError('Local repository needed to estimate safe restore-test disk space')
    repo_bytes=sum(p.stat().st_size for p in local_repo.rglob('*') if p.is_file())
    restored_bytes=json.loads(restic(local_repo,'stats','latest','--mode','restore-size','--json'))['total_size']
    if shutil.disk_usage(BASE).free < repo_bytes+3*restored_bytes+25*1024**3:
        raise RuntimeError('Insufficient free disk for a safe full cloud restore drill')
    target=BASE/'remote-verification'/dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    target.mkdir(parents=True)
    log('Downloading recovery kit and encrypted repository from Proton')
    proton('filesystem','download','-f','remove','-d','merge',REMOTE+'/recovery-kit',target)
    proton('filesystem','download','-f','remove','-d','merge',REMOTE+'/repositories/'+month,target)
    repo=target/month; password=target/'recovery-kit'/'restic-password'
    log('Cloud download complete; checking all encrypted data packs')
    restic(repo,'check','--read-data',password=password)
    snapshots=json.loads(restic(repo,'snapshots','--json',password=password))
    snapshot=max(snapshots,key=lambda x:x['time'])['id']
    restored=target/'restored'
    log('Downloaded repository integrity passed; extracting the snapshot')
    restic(repo,'restore',snapshot,'--target',restored,password=password)
    stage=restored/str(STAGE).lstrip('/')
    # Load exact image archives downloaded from Proton, then use their immutable IDs.
    for p in (stage/'images').glob('*.tar'): run(['docker','load','-i',p])
    result=verify_databases(stage)
    result['garage']=verify_garage(stage)
    verify_redis(stage)
    result['web']=verify_web(stage)
    receipt={'verified_at':stamp(),'repository':month,'snapshot':snapshot,
             'source':'Fresh Proton download, downloaded recovery key, full Restic read-data check',
             'result':{k:v for k,v in result.items() if k!='required_keys'},'download_directory':str(target)}
    save(BASE/'last-cloud-restore.json',receipt)
    upload([BASE/'last-cloud-restore.json'],REMOTE+'/status')
    cleanup_verification_downloads()
    log('CLOUD RESTORE VERIFIED: independently downloaded backup and key')
    return receipt

def cleanup_verification_downloads():
    parent=BASE/'remote-verification'
    if not parent.exists(): return
    receipt=BASE/'last-cloud-restore.json'
    keep=read(receipt).get('download_directory') if receipt.exists() else None
    for p in parent.iterdir():
        if p.is_dir() and re.fullmatch(r'\d{8}T\d{6}Z',p.name) and str(p)!=keep:
            shutil.rmtree(p)

def cleanup_stale_verifiers():
    # Called only with the global job lock held. A killed verification process
    # must not leave disposable DBs running or permanently block future backups.
    ids=run(['docker','ps','-aq','--filter','label='+LABEL+'=true']).split()
    if ids:
        for c in dj('inspect',*ids):
            if not re.fullmatch(r'pb-backup-(verify|garage|web|webdb)-[0-9a-f]{10}',name(c)):
                raise RuntimeError('Unexpected container with backup verification label')
            run(['docker','rm','-f','-v',c['Id']])
    nets=run(['docker','network','ls','-q','--filter','label='+LABEL+'=true']).split()
    for net in nets:
        record=dj('network','inspect',net)[0]
        if record['Containers']: raise RuntimeError('Verification network still has attached containers')
        run(['docker','network','rm',net])
    for p in BASE.iterdir():
        if p.is_dir() and re.fullmatch(r'pb-backup-(garage|web)-[0-9a-f]{10}',p.name): shutil.rmtree(p)
        if p.is_file() and re.fullmatch(r'pb-backup-verify-[0-9a-f]{10}\.env',p.name): p.unlink()

def notify_failure():
    # Uses the deployment alert channel already configured for this server.
    try:
        cs=dj('inspect',*run(['docker','ps','-q']).split())
        url=next(env_of(c)['DEPLOYMENT_DISCORD_WEBHOOK'] for c in cs if env_of(c).get('DEPLOYMENT_DISCORD_WEBHOOK'))
        payload=json.dumps({'content':'Server backup failed. Check `systemctl status pickleballs-backup` and the root-only backup log. Last successful backup may be stale.'}).encode()
        req=urllib.request.Request(url,data=payload,headers={'Content-Type':'application/json','User-Agent':'PickleballsBackup/1.0'})
        with urllib.request.urlopen(req,timeout=15) as response: response.read()
    except Exception: log('Backup failure notification could not be delivered')

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('command',choices=['capture','backup','verify-remote']); parser.add_argument('--month'); parser.add_argument('--notify',action='store_true')
    args=parser.parse_args()
    if os.geteuid()!=0: raise SystemExit('Run as root')
    os.umask(0o077); BASE.mkdir(parents=True,exist_ok=True); CONF.mkdir(parents=True,exist_ok=True)
    BASE.chmod(0o700); CONF.chmod(0o700)
    with open(BASE/'job.lock','w') as lock:
        try: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError: log('Another backup/verification is active; skipped'); return
        try:
            cleanup_stale_verifiers()
            cleanup_verification_downloads()
            if args.command=='capture': capture()
            elif args.command=='backup': backup()
            else: remote_verify(args.month or dt.datetime.now(dt.timezone.utc).strftime('%Y-%m'))
        except Exception as exc:
            # Error strings from third-party clients can contain object names or
            # credentials. Keep them only in the root-owned diagnostic log.
            import traceback
            with open(BASE/'commands.log','a') as f: traceback.print_exc(file=f)
            save(BASE/'last-failure.json',{'failed_at':stamp(),'command':args.command,'error_type':type(exc).__name__})
            log('FAILED; details are in the root-only commands.log')

            if args.notify: notify_failure()
            raise SystemExit(1)

if __name__=='__main__': main()
