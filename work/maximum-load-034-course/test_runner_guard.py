"""Lightweight filesystem/receipt tests only; no compiler/browser/host/process."""
from pathlib import Path
import hashlib, json, tempfile, unittest
from runner_guard import IGNORE_BYTES, digest, verify_source, finalize_report

class Guards(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);self.source=self.root/'source';self.source.mkdir();self.out=self.root/'out';self.out.mkdir()
        (self.source/'fixture_test.go').write_text('package fixture\n')
        (self.source/'.gitignore').write_bytes(IGNORE_BYTES)
        self.lock=self.root/'lock.json';self.lock.write_text(json.dumps({'base_lock_sha256':'fixture-only','files':{'fixture_test.go':digest(self.source/'fixture_test.go')}}))
        self.expected=digest(self.lock)
    def guard(self):return verify_source(self.source,self.lock,self.expected)
    def test_exact_inventory_allows_only_pinned_ignore(self):
        self.assertEqual(self.guard()['exact_inventory_files'],2)
        (self.source/'injected_test.go').write_text('package fixture\nfunc init(){}\n')
        with self.assertRaisesRegex(ValueError,'inventory drift'):self.guard()
    def test_changed_missing_and_symlink_fail(self):
        (self.source/'fixture_test.go').write_text('package changed\n')
        with self.assertRaisesRegex(ValueError,'bytes changed'):self.guard()
        (self.source/'fixture_test.go').unlink()
        with self.assertRaisesRegex(ValueError,'inventory drift'):self.guard()
        (self.source/'fixture_test.go').symlink_to(self.lock)
        with self.assertRaisesRegex(ValueError,'symlinks rejected'):self.guard()
    def test_lock_or_ignore_substitution_fails(self):
        (self.source/'.gitignore').write_text('*')
        with self.assertRaisesRegex(ValueError,'bytes changed'):self.guard()
        self.lock.write_text('{}')
        with self.assertRaisesRegex(ValueError,'source-lock bytes changed'):self.guard()
    def test_initial_guard_failure_finalizes_without_workload(self):
        (self.source/'extra.go').write_text('package extra\n');report={'status':'running','stages':[]}
        try:self.guard()
        except ValueError as error:report.update(status='failed',failure=repr(error))
        original=report['failure'];self.assertFalse(finalize_report(self.out,report,self.guard))
        result=json.loads((self.out/'receipt.json').read_text());self.assertEqual(result['failure'],original);self.assertEqual(result['stages'],[]);self.assertIn('finished',result)
    def test_final_drift_retains_original_failure_and_artifacts(self):
        (self.out/'workload.log').write_text('original failure\n');report={'status':'failed','failure':'original test error'}
        (self.source/'extra.go').write_text('package extra\n');self.assertFalse(finalize_report(self.out,report,self.guard))
        result=json.loads((self.out/'receipt.json').read_text());self.assertEqual(result['failure'],'original test error');self.assertEqual(result['artifacts']['workload.log'],digest(self.out/'workload.log'));self.assertFalse(result['source_verified_after'])
    def test_final_only_failure_turns_success_into_failure(self):
        report={'status':'passed'};(self.source/'fixture_test.go').write_text('drift')
        self.assertFalse(finalize_report(self.out,report,self.guard));self.assertEqual(report['status'],'failed');self.assertIn('finalization_failures',report)

if __name__=='__main__':unittest.main()
