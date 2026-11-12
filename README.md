# RobinTHood

A Windows workspace for songs, stories and ideas. Keep a document and its conversation together, reopen a project later, and revise the same work.

[Download the latest Windows release](https://github.com/edotwedo/RobinTHood/releases/latest). Download `RobinTHood.exe` from the release assets and open it. The published Windows executable includes its runtime; no separate .NET installation is needed.

## First use

Setup offers a desktop shortcut and optional writing assistance. The shortcut keeps an app copy outside Downloads, so you have a consistent place to open Robin.

Start a project, give it a name, and write in its document. Robin saves your edits automatically. Reopen the project from the project list to continue where you left off.

To work with Robin, enable writing assistance in Setup and choose **Ask Robin**. Choose **Save Robin's draft** to adopt an answer as your document. **Update my document** revises the saved document after a complete answer arrives. Earlier document versions are available under **Project options → Previous versions**.

**Project options → Export a copy…** saves a separate copy for use elsewhere. **Open project folder** shows where that project's files live.

## Use your Obsidian vault

Robin can use your own notes. In **Settings**, choose **Choose vault folder…** and pick the folder you open in Obsidian. When you ask Robin, the notes most related to your request are sent along with it, up to about 12,000 characters. **Don't use a vault** turns this off.

What Robin never sends:

- **Private notes.** A note with `robin: private` or `private: true` in its frontmatter, or a `private` tag, is never read.
- **Frontmatter.** The block between the `---` lines at the top of a note stays on your computer.
- **Secrets.** Values in `_vault_secrets.json` at the top of your vault, and values of frontmatter keys such as `password`, `token`, `api_key` or `pin`, are replaced with `[hidden]` in the notes Robin sends.
- **Hidden folders.** `.obsidian`, `.trash`, `.git` and other folders starting with a dot are skipped.

Your own document isn't changed. Secrets in it are sent as written, so keep them out of project documents.

Example `_vault_secrets.json`:

```json
{
  "wifi": "correct-horse-battery",
  "bank pin": "4821"
}
```

Example private note:

```markdown
---
robin: private
---
Things Robin should never see.
```

## Where your work goes

Projects, documents, conversations and previous versions are stored on this PC under `%LOCALAPPDATA%\RobinTHood\Workspace`. There is no cloud sync. Back up that folder to keep another copy of your workspace. An exported document is a separate copy, not the complete project history.

Writing assistance requires internet access and is off until you enable it. When you ask Robin, your request, current document and recent conversation are sent to an AI service. You can write, save and reopen projects with assistance switched off.

## Updates

On opening, Robin checks GitHub for a newer release without sending project text. A newer release is downloaded, checked against its size and SHA-256, and used to replace this program file. Projects and any other files stay where they are. Robin then restarts into the new copy.

## Scope

This release helps with text: lyrics, drafts, notes and creative planning. It does not generate audio recordings or images. Online assistance availability depends on the external services.
