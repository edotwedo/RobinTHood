# Vault click-through on Windows

Run this on Windows with a build of branch `claude/obsidian-vault` before merging PR #64. Use a throwaway vault, not a real diary. The phrases below are fake.

1. Start RobinTHood. If the welcome window is not already open, click **Settings** at the bottom of the sidebar. The window title is "Welcome to RobinTHood". Leave **Enable Robin's writing assistance** checked.
2. In File Explorer, make a folder named `Robin vault test`. Inside it, make an empty folder named `.obsidian`, and a file `Harbor lights.md` whose text is `Verse ideas about the harbor at night`.
3. Back in RobinTHood, click **Choose vault folder…** and pick `Robin vault test`. The label should name that folder and say notes marked `robin: private` are never read.
4. Click **Open my workspace**. The status line should say related vault notes are sent online.
5. Open a project (name it `Harbor`). In the document, click **Ask Robin** and send `Write a chorus about the harbor lights`. Wait for the answer. It may use the harbor note. That means the vault was read.
6. Add `Diary.md` to the vault, with this exact text, including the first three dashes:
   ```
   ---
   robin: private
   ---
   The code word is pier-nine-private.
   ```
   Ask `What is the code word in my notes?` The answer must not contain `pier-nine-private`.
7. Add `_vault_secrets.json` in the vault root containing `{ "bank": "9876-5432" }`. Add `Login.md` containing `The harbor account number is 9876-5432.` Ask `What is the harbor account number in my notes?` The answer must contain `[hidden]` and must not contain `9876-5432`.
8. Click **Settings**, then **Don't use a vault**, then **Open my workspace**. The label should say `Obsidian vault: none. Robin uses only this project.` The status line should no longer say vault notes are sent.
9. Close RobinTHood completely and start it again. Click **Settings**. It should still say `Obsidian vault: none`.
10. Choose `Robin vault test` again, click **Open my workspace**, quit, and start RobinTHood once more. **Settings** should still show `Robin vault test`. Then click **Don't use a vault** and **Open my workspace** so this test vault is not left connected.

Delete `Robin vault test` when you are done. Do not point Robin at your real vault for this pass.
