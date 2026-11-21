"""Tests for play_status.promote. Run: python3 -m unittest scripts/test_play_status.py"""
import os
import sys
import types
import unittest
from unittest import mock

# The Google client libraries are only needed for real calls; stub them for the tests.
for name in ("google", "google.oauth2", "google.oauth2.service_account", "googleapiclient",
             "googleapiclient.discovery", "googleapiclient.http"):
    sys.modules.setdefault(name, types.ModuleType(name))
sys.modules["google.oauth2"].service_account = sys.modules["google.oauth2.service_account"]
sys.modules["googleapiclient.discovery"].build = None
sys.modules["googleapiclient.http"].MediaFileUpload = None
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import play_status  # noqa: E402


def fake_service(track001_releases):
    service = mock.MagicMock()
    edits = service.edits.return_value
    edits.insert.return_value.execute.return_value = {"id": "e1"}
    edits.tracks.return_value.get.return_value.execute.return_value = {"releases": track001_releases}
    return service, edits


class PromoteTest(unittest.TestCase):
    def test_staged_rollout_goes_to_production(self):
        service, edits = fake_service([{"versionCodes": ["33"]}])
        play_status.promote(service, 33, 0.2, notes="hello")
        body = edits.tracks.return_value.update.call_args.kwargs["body"]
        self.assertEqual(body["track"], "production")
        self.assertEqual(body["releases"][0]["status"], "inProgress")
        self.assertEqual(body["releases"][0]["userFraction"], 0.2)
        self.assertEqual(body["releases"][0]["releaseNotes"][0]["text"], "hello")
        edits.commit.assert_called_once()

    def test_full_release_is_completed_without_fraction(self):
        release = play_status.production_release(33, 1.0)
        self.assertEqual(release["status"], "completed")
        self.assertNotIn("userFraction", release)

    def test_untested_build_is_refused_and_edit_discarded(self):
        service, edits = fake_service([{"versionCodes": ["32"]}])
        with self.assertRaises(SystemExit):
            play_status.promote(service, 33, 0.2)
        edits.tracks.return_value.update.assert_not_called()
        edits.commit.assert_not_called()
        edits.delete.assert_called_once()

    def test_bad_fraction_is_refused(self):
        for bad in (0, -0.1, 1.5):
            with self.assertRaises(ValueError):
                play_status.production_release(33, bad)

    def test_reuses_testing_notes_when_none_given(self):
        notes = [{"language": "en-US", "text": "from testing"}]
        service, edits = fake_service([{"versionCodes": ["33"], "releaseNotes": notes}])
        play_status.promote(service, 33, 0.5)
        body = edits.tracks.return_value.update.call_args.kwargs["body"]
        self.assertEqual(body["releases"][0]["releaseNotes"], notes)


if __name__ == "__main__":
    unittest.main()
