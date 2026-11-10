#!/usr/bin/env python3
"""Query Google Play Console status, or upload and deploy an AAB release bundle."""

import argparse
import json
import os
import sys
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

KEY_FILE = os.environ.get(
    "PLAY_SERVICE_ACCOUNT_KEY",
    os.path.expanduser("~/.config/google-play/robinthood_service_account.json"),
)
PACKAGE = "com.edotwedo.robinthood"
SCOPES = ["https://www.googleapis.com/auth/androidpublisher"]


def app_version_code():
    """The Android versionCode in android-app/app.json, or None if it can't be read."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "android-app", "app.json")
    try:
        with open(path) as f:
            return int(json.load(f)["expo"]["android"]["versionCode"])
    except (OSError, KeyError, TypeError, ValueError):
        return None


def deploy_bundle(service, aab_path, track_name="track001", release_notes=None):
    if not os.path.exists(aab_path):
        print(f"Error: Bundle file not found at {aab_path}")
        sys.exit(1)

    print(f"=== Deploying AAB to Google Play ({PACKAGE}) ===")
    print(f"Bundle file: {aab_path}")
    print(f"Target track: {track_name}")

    if not release_notes:
        for candidate in ["RELEASE_NOTES.txt", "android-app/dist/release-notes.txt", "android-app/RELEASE_NOTES.txt"]:
            candidate_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", candidate)
            if os.path.exists(candidate_path):
                try:
                    with open(candidate_path, "r", encoding="utf-8") as f:
                        release_notes = f.read().strip()
                        print(f"Loaded release notes from {candidate}")
                        break
                except Exception:
                    pass

    edit = service.edits().insert(packageName=PACKAGE, body={}).execute()
    edit_id = edit["id"]
    print(f"Created edit: {edit_id}")

    try:
        # A push that doesn't bump versionCode rebuilds a code Play already has, and Play
        # rejects the upload. That is not a failed deploy, so skip it (issue #47).
        local_code = app_version_code()
        known = {int(b["versionCode"]) for b in service.edits().bundles().list(
            packageName=PACKAGE, editId=edit_id).execute().get("bundles", []) if b.get("versionCode") is not None}
        if local_code is not None and local_code in known:
            print(f"versionCode {local_code} is already on Play; nothing to deploy. Bump it to release.")
            service.edits().delete(packageName=PACKAGE, editId=edit_id).execute()
            return

        print("Uploading AAB bundle (this may take a few moments)...")
        media = MediaFileUpload(aab_path, mimetype="application/octet-stream", resumable=True)
        bundle_resp = service.edits().bundles().upload(
            packageName=PACKAGE,
            editId=edit_id,
            media_body=media,
        ).execute()
        version_code = bundle_resp.get("versionCode")
        print(f"✓ Upload successful. Assigned versionCode: {version_code}")

        release_entry = {
            "name": f"{version_code}",
            "versionCodes": [str(version_code)],
            "status": "completed",
        }
        if release_notes and release_notes.strip():
            release_entry["releaseNotes"] = [
                {
                    "language": "en-US",
                    "text": release_notes.strip()[:500],
                }
            ]

        track_body = {
            "track": track_name,
            "releases": [release_entry],
        }
        track_resp = service.edits().tracks().update(
            packageName=PACKAGE,
            editId=edit_id,
            track=track_name,
            body=track_body,
        ).execute()
        print(f"✓ Track updated for '{track_name}': {track_resp.get('track')}")

        try:
            commit_resp = service.edits().commit(packageName=PACKAGE, editId=edit_id).execute()
        except Exception as ce:
            print(f"! Standard commit returned error ({ce}), attempting commit with changesNotSentForReview=True...")
            commit_resp = service.edits().commit(
                packageName=PACKAGE,
                editId=edit_id,
                changesNotSentForReview=True
            ).execute()
        print(f"✓ Edit committed successfully! Edit ID: {commit_resp.get('id')}")
        print(f"★ Successfully deployed version {version_code} to track '{track_name}'!")
        return version_code
    except Exception as e:
        print(f"✗ Deployment failed: {e}")
        try:
            service.edits().delete(packageName=PACKAGE, editId=edit_id).execute()
        except Exception:
            pass
        raise


def query_status(service):
    print(f"=== Google Play Status for {PACKAGE} ===")
    edit = service.edits().insert(packageName=PACKAGE, body={}).execute()
    edit_id = edit["id"]

    try:
        tracks = service.edits().tracks().list(packageName=PACKAGE, editId=edit_id).execute()
        for t in tracks.get("tracks", []):
            name = t.get("track")
            releases = t.get("releases", [])
            if releases:
                print(f"\n[Track: {name}]")
                for r in releases:
                    status = r.get("status")
                    codes = ", ".join(r.get("versionCodes", []))
                    rel_name = r.get("name", "unnamed")
                    print(f"  • {rel_name} (code {codes}) -> Status: {status}")

        print("\n[Testers Configuration]")
        for track_name in ["track001", "internal", "alpha", "beta"]:
            try:
                testers = service.edits().testers().get(packageName=PACKAGE, editId=edit_id, track=track_name).execute()
                groups = testers.get("googleGroups", [])
                if groups:
                    print(f"  • {track_name}: {', '.join(groups)}")
            except Exception:
                pass

        print("\n[Recent Reviews]")
        try:
            reviews = service.reviews().list(packageName=PACKAGE).execute()
            rev_list = reviews.get("reviews", [])
            if not rev_list:
                print("  No reviews submitted yet.")
            else:
                for rev in rev_list[:5]:
                    c = rev.get("comments", [{}])[0].get("userComment", {})
                    print(f"  ★ {c.get('starRating')}/5: {c.get('text', '')[:100]}")
        except Exception as e:
            print(f"  Reviews API: {e}")

    finally:
        service.edits().delete(packageName=PACKAGE, editId=edit_id).execute()

    print("\n✓ Query completed successfully.")


def update_track_notes(service, track_name, notes):
    """Update release notes on the current active release for a track."""
    edit = service.edits().insert(packageName=PACKAGE, body={}).execute()
    edit_id = edit["id"]
    try:
        track_data = service.edits().tracks().get(packageName=PACKAGE, editId=edit_id, track=track_name).execute()
        releases = track_data.get("releases", [])
        if not releases:
            print(f"No releases found on track '{track_name}'")
            return
        active_rel = releases[0]
        active_rel["releaseNotes"] = [
            {
                "language": "en-US",
                "text": notes.strip()[:500]
            }
        ]
        service.edits().tracks().update(packageName=PACKAGE, editId=edit_id, track=track_name, body={"track": track_name, "releases": [active_rel]}).execute()
        service.edits().commit(packageName=PACKAGE, editId=edit_id).execute()
        print(f"✓ Release notes updated on track '{track_name}' for release {active_rel.get('name') or active_rel.get('versionCodes')}")
    finally:
        try:
            service.edits().delete(packageName=PACKAGE, editId=edit_id).execute()
        except Exception:
            pass


def main():
    parser = argparse.ArgumentParser(description="Google Play Developer API CLI")
    parser.add_argument("--deploy", "--upload", dest="bundle_path", help="Path to .aab bundle file to upload and deploy")
    parser.add_argument("--track", default="track001", help="Target release track (default: track001)")
    parser.add_argument("--notes", help="Release notes text for this release")
    parser.add_argument("--notes-file", help="Path to file containing release notes")
    args = parser.parse_args()

    if not os.path.exists(KEY_FILE):
        print(f"Error: Service account key not found at {KEY_FILE}")
        sys.exit(1)

    notes = args.notes
    if args.notes_file and os.path.exists(args.notes_file):
        with open(args.notes_file, "r", encoding="utf-8") as f:
            notes = f.read().strip()

    creds = service_account.Credentials.from_service_account_file(KEY_FILE, scopes=SCOPES)
    service = build("androidpublisher", "v3", credentials=creds)

    if args.bundle_path:
        deploy_bundle(service, args.bundle_path, track_name=args.track, release_notes=notes)
    elif notes:
        update_track_notes(service, args.track, notes)
    else:
        query_status(service)


if __name__ == "__main__":
    main()

