#!/usr/bin/env python3
"""Query Google Play Console status, releases, tracks, and testers via the Developer API."""

import os
import sys
from google.oauth2 import service_account
from googleapiclient.discovery import build

KEY_FILE = os.environ.get(
    "PLAY_SERVICE_ACCOUNT_KEY",
    os.path.expanduser("~/.config/google-play/robinthood_service_account.json"),
)
PACKAGE = "com.edotwedo.robinthood"
SCOPES = ["https://www.googleapis.com/auth/androidpublisher"]


def main():
    if not os.path.exists(KEY_FILE):
        print(f"Error: Service account key not found at {KEY_FILE}")
        sys.exit(1)

    creds = service_account.Credentials.from_service_account_file(KEY_FILE, scopes=SCOPES)
    service = build("androidpublisher", "v3", credentials=creds)

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


if __name__ == "__main__":
    main()
