"""Safety invariants for publishing recoverable snapshots, no Docker/network."""
import importlib.util, json, pathlib, tempfile, unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('backup',pathlib.Path(__file__).with_name('backup.py'))
b=importlib.util.module_from_spec(spec); spec.loader.exec_module(b)

class BackupSafetyTests(unittest.TestCase):
    def test_remote_operations_cannot_escape_approved_folder(self):
        with patch.object(b,'proton') as p:
            for unsafe in ('/my-files','/my-files/Personal','/my-files/Coolify Backups Elsewhere', b.REMOTE+'/../Personal'):
                with self.assertRaises(ValueError): b.remote_folder(unsafe)
                with self.assertRaises(ValueError): b.upload([],unsafe)
            p.assert_not_called()

    def test_data_upload_failure_never_publishes_snapshot_or_success(self):
        self.run_publish(fail=True)

    def test_snapshots_are_published_after_data_and_recovery_kit(self):
        self.run_publish(fail=False)

    def run_publish(self,fail):
        with tempfile.TemporaryDirectory() as td:
            root=pathlib.Path(td); conf=root/'config'; conf.mkdir(); (conf/'restic-password').write_text('test-only\n')
            events=[]
            def upload(paths,dest):
                names=[pathlib.Path(p).name for p in paths]; events.append(names)
                if names==['config','keys','data','index'] and fail: raise RuntimeError('test transport failed')
            def restic(repo,*args,**kwargs):
                if args[0]=='backup': return json.dumps({'message_type':'summary','snapshot_id':'test-snapshot','total_bytes_processed':123})
                return ''
            with patch.object(b,'BASE',root),patch.object(b,'CONF',conf),patch.object(b,'STAGE',root/'stage'),\
                 patch.object(b,'capture',return_value={'required_keys':[]}),patch.object(b,'restic',side_effect=restic),\
                 patch.object(b,'remote_folder'),patch.object(b,'recovery_kit',side_effect=lambda:events.append(['recovery-kit'])),\
                 patch.object(b,'upload',side_effect=upload),patch.object(b,'log'):
                if fail:
                    with self.assertRaises(RuntimeError): b.backup()
                    self.assertNotIn(['snapshots'],events)
                    self.assertFalse((root/'last-success.json').exists())
                else:
                    b.backup()
                    self.assertEqual(events[:3],[['recovery-kit'],['config','keys','data','index'],['snapshots']])
                    self.assertTrue((root/'last-success.json').exists())

    def test_stopped_extra_database_volume_is_not_silently_skipped(self):
        with tempfile.TemporaryDirectory() as td, patch.object(b,'STAGE',pathlib.Path(td)), patch.object(b,'rsync') as copy:
            c={'Name':'/extra-db','Config':{'Env':['POSTGRES_USER=postgres']},
               'State':{'Running':False},'Mounts':[{'Type':'volume','Name':'wanted-db'}]}
            with self.assertRaisesRegex(RuntimeError,'Unclassified persistent Docker volumes'):
                b.host_files([c],[{'Name':'wanted-db'}])
            copy.assert_not_called()

    def test_missing_archived_media_payload_fails_closed(self):
        # A DB reference appearing in a dump without the matching object cannot
        # be mistaken for a complete backup. Actual dump restore is integration-tested.
        with tempfile.TemporaryDirectory() as td:
            root=pathlib.Path(td); (root/'inventory').mkdir(); (root/'databases').mkdir(); (root/'media'/'objects').mkdir(parents=True)
            (root/'inventory'/'containers.json').write_text('[]')
            (root/'media'/'manifest.json').write_text(json.dumps({'objects':{'key':{'sha256':'missing','size':1}}}))
            with self.assertRaisesRegex(RuntimeError,'checksum failure'): b.verify_databases(root)
            self.assertFalse((root/'verification.json').exists())

if __name__=='__main__': unittest.main()
