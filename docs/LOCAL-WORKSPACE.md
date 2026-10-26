# Robin's creative workspace (desktop 0.3 preview)

Robin now opens around projects rather than a disposable prompt/output pair.
Create a song, story, art brief, music plan, or another named project. The sidebar
keeps recent projects; search by name or ask `open Midnight song` / `bring back
Midnight song` inside a project. Ambiguous matches require choosing a project.

## First launch

Setup explains local storage and offers a desktop shortcut. Choosing the shortcut
copies the application and its runtime dependencies to
`%LOCALAPPDATA%\Programs\RobinTHood\<build hash>` before creating the link. The
download can then be removed. Existing versions are left intact. No administrator
access, account, purchase or machine-wide installation is needed. Setup remains
available as Settings in the sidebar.

Online assistance is **off by default**. Enabling it sends the current project's
document, request and bounded recent conversation to an online model provider.
There is no cloud document storage or synchronization. The everyday workspace
selects routes automatically; it has no provider/model selector and does not
discover or run PC Ollama models. With assistance switched off, writing and
reopening projects still work.

The empty workspace offers Start a project. With a project open, the primary
actions are Ask Robin and saving a draft as a document. Rename, previous versions,
opening the folder and exporting a copy live under Project options. Routine edits
save automatically; Save changes appears only for recovered/conflicting drafts.

## Documents and continuity

Projects live under `%LOCALAPPDATA%\RobinTHood\Workspace\Projects\<id>`. This
avoids using the commonly cloud-synced Windows Documents folder as the default.
`Open project folder` reveals the exact location. Files are not encrypted; other
software with access to this Windows account can read them. Back up the workspace
folder yourself if you need recovery from device failure.

- `Project.json` contains the title, project type, conversation, last answer and
  unfinished request. Drafts autosave after a short pause.
- `Document.txt` is an ordinary UTF-8 document. `Save draft as document` turns the
  latest answer into the project's working file. You can also write directly in
  the document pane and save that first draft.
- `Update my document` sends the current document with the instruction, then
  replaces that same file only after a successful complete answer. Failed or
  stopped requests leave the document intact. `Talk it through` saves an answer
  to the conversation without replacing the document.
- Direct edits autosave. Previous document contents are kept in `Versions` before
  replacement. Preview and restore them using `Previous versions`. Restoring also
  retains the version it replaces. Normal editing Undo works in the text editor.
- A changed external file causes a conflict instead of an overwrite. The in-app
  draft is retained in metadata; `Save changes` requires confirmation before a
  recovered/conflicting draft replaces the current file. The external version is
  archived. Only one Robin window may edit a given project at a time.
- `Export a copy` creates a text copy elsewhere. The working original remains in
  the project's folder; the exported copy is not linked for ongoing updates.

Conversation history remains on disk; only recent turns fitting the context budget
are sent on each request. Documents over 80,000 characters are refused for AI
revision rather than silently truncated. Online free providers may impose smaller
limits and can refuse requests. Text documents are supported in this preview;
audio, image generation, rich Word documents, document import and automatic backups
are not implemented.

## Verification

Build: `dotnet build RobinCode.csproj -c Release`

Offline regression checks (temporary workspace; no provider calls):
`dotnet run --project tests/WorkspaceChecks/WorkspaceChecks.csproj -c Release -- <absolute-preview-png-path>`

The checks exercise durable projects and conversation, document revisions and
versions, external conflicts, concurrent-window exclusion, path validation,
corrupt metadata preservation, context construction, cancellation, a real Windows
shortcut created entirely in a temporary sandbox, local-only enforcement, success
and failure through the UI generation handler, onboarding, and restart continuity.
They render workspace and onboarding previews for visual inspection. Actual model
quality, fresh-machine execution and long-running provider capacity are separate
unverified checks. A bounded live run on 2026-10-25 produced 64 answers from 67
root requests using 73 HTTP attempts, with three safety cancellations. It stopped
at the first rate limit; this does not establish sustained or unlimited capacity.

2026-10-26 interface verification: 31 workspace checks pass, including a real
empty state, saving a handwritten first draft without AI, automatic route
selection, persistence and interruption safety.
Workspace, empty-state and setup renders were inspected. Lightweight single-worker
compilation passes without warnings; no local model or live provider was used.

Ihalp verification, 2026-10-25: 28 offline checks passed; release build and
self-contained win-x64 publish succeeded. Workspace and onboarding renders were
inspected; Windows LF display and onboarding wrapping issues were corrected.
Preview: `Desktop\RobinTHood-Workspace-Preview\RobinTHood.exe`.

A free `megazword run --free-only --review` review ran on nvidia-lightning. Its
findings included nonexistent code and an incorrect assertion that
`Environment.ProcessPath` is not a .NET API; this is not treated as a trustworthy
review approval. Cancellation, locking, external-edit conflict rejection and real
shortcut creation were independently checked by the offline harness. A human or
another seat can review this branch before integrating it into the public build.
