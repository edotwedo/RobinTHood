#!/usr/bin/env python3
"""Query Google Play Console status, or upload and deploy an AAB release bundle."""

import argparse
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


def deploy_bundle(service, aab_path, track_name="track001"):
    if not os.path.exists(aab_path):
        print(f"Error: Bundle file not found at {aab_path}")
        sys.exit(1)

    print(f"=== Deploying AAB to Google Play ({PACKAGE}) ===")
    print(f"Bundle file: {aab_path}")
    print(f"Target track: {track_name}")

    edit = service.edits().insert(packageName=PACKAGE, body={}).execute()
    edit_id = edit["id"]
    print(f"Created edit: {edit_id}")

    try:
        print("Uploading AAB bundle (this may take a few moments)...")
        media = MediaFileUpload(aab_path, mimetype="application/octet-stream", resumable=True)
        bundle_resp = service.edits().bundles().upload(
            packageName=PACKAGE,
            editId=edit_id,
            media_body=media,
        ).execute()
        version_code = bundle_resp.get("versionCode")
        print(f"✓ Upload successful. Assigned versionCode: {version_code}")

        track_body = {
            "track": track_name,
            "releases": [
                {
                    "name": f"{version_code}",
                    "versionCodes": [str(version_code)],
                    "status": "completed",
                }
            ],
        }
        track_resp = service.edits().tracks().update(
            packageName=PACKAGE,
            editId=edit_id,
            track=track_name,
            body=track_body,
        ).execute()
        print(f"✓ Track updated for '{track_name}': {track_resp.get('track')}")

        commit_resp = service.edits().commit(packageName=PACKAGE, editId=edit_id).execute()
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


def main():
    parser = argparse.ArgumentParser(description="Google Play Developer API CLI")
    parser.add_argument("--deploy", "--upload", dest="bundle_path", help="Path to .aab bundle file to upload and deploy")
    parser.add_argument("--track", default="track001", help="Target release track (default: track001)")
    args = parser.parse_args()

    if not os.path.exists(KEY_FILE):
        print(f"Error: Service account key not found at {KEY_FILE}")
        sys.exit(1)

    creds = service_account.Credentials.from_service_account_file(KEY_FILE, scopes=SCOPES)
    service = build("androidpublisher", "v3", credentials=creds)

    if args.bundle_path:
        deploy_bundle(service, args.bundle_path, track_name=args.track)
    else:
        query_status(service)


if __name__ == "__main__":
    main()

