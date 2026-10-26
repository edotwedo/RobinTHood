# RobinTHood

A Windows workspace for songs, stories and ideas. Keep a document and its conversation together, reopen a project later, and revise the same work.

[Download the latest Windows release](https://github.com/edotwedo/RobinTHood/releases/latest). Download `RobinTHood.exe` from the release assets and open it. The published Windows executable includes its runtime; no separate .NET installation is needed.

## First use

Setup offers a desktop shortcut and optional writing assistance. The shortcut keeps an app copy outside Downloads, so you have a consistent place to open Robin.

Start a project, give it a name, and write in its document. Robin saves your edits automatically. Reopen the project from the project list to continue where you left off.

To work with Robin, enable writing assistance in Setup and choose **Ask Robin**. Choose **Save Robin's draft** to adopt an answer as your document. **Update my document** revises the saved document after a complete answer arrives. Earlier document versions are available under **Project options → Previous versions**.

**Project options → Export a copy…** saves a separate copy for use elsewhere. **Open project folder** shows where that project's files live.

## Where your work goes

Projects, documents, conversations and previous versions are stored on this PC under `%LOCALAPPDATA%\RobinTHood\Workspace`. There is no cloud sync. Back up that folder to keep another copy of your workspace. An exported document is a separate copy, not the complete project history.

Writing assistance requires internet access and is off until you enable it. When you ask Robin, your request, current document and recent conversation are sent to an AI service. You can write, save and reopen projects with assistance switched off.

## Updates

On opening, Robin checks GitHub for a newer release without sending project text. Nothing installs until you choose the update button and confirm. Robin verifies the downloaded executable's size and SHA-256 before installation. Follow the restart prompt to finish updating.

## Scope

This release helps with text: lyrics, drafts, notes and creative planning. It does not generate audio recordings or images. Online assistance availability depends on the external services.
