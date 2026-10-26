using System.Reflection;
using RobinCode;

static class Checks
{
    static int count;
    static void Check(bool ok, string description)
    {
        if (!ok) throw new Exception(description);
        Console.WriteLine("PASS " + description);
        count++;
    }
    static T Field<T>(object target, string name) => (T)target.GetType().GetField(name, BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(target)!;
    static object? Call(object target, string name, params object[] args) => target.GetType().GetMethod(name, BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(target, args);
    static void Throws<T>(Action action, string description) where T : Exception
    {
        try { action(); throw new Exception("Did not reject: " + description); }
        catch (T) { Check(true, description); }
    }
    static async Task<CompletionResult> WaitForCancellation(CancellationToken token)
    {
        await Task.Delay(Timeout.Infinite, token);
        throw new Exception("Cancellation wait unexpectedly completed");
    }

    [STAThread]
    static int Main(string[] args)
    {
        string root = Path.Combine(Path.GetTempPath(), "RobinWorkspaceChecks-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            ApplicationConfiguration.Initialize();
            using (var empty = new WorkspaceForm(new WorkspaceStore(Path.Combine(root, "empty")), skipSetup: true, generator: (_, _, _) => throw new Exception("Empty workspace must not generate")))
            {
                empty.StartPosition = FormStartPosition.Manual;
                empty.Location = new Point(-20000, -20000);
                empty.ShowInTaskbar = false;
                empty.Show();
                Application.DoEvents();
                Check(Field<Panel>(empty, "welcome").Visible && !Field<TabControl>(empty, "tabs").Visible && !Field<Button>(empty, "send").Visible,
                    "empty workspace offers a project start instead of inactive editors and routing controls");
                using var preview = new Bitmap(empty.Width, empty.Height);
                empty.DrawToBitmap(preview, new Rectangle(Point.Empty, empty.Size));
                string emptyPreview = args.Length > 0 ? Path.Combine(Path.GetDirectoryName(Path.GetFullPath(args[0]))!, "empty-workspace.png") : Path.Combine(root, "empty-workspace.png");
                preview.Save(emptyPreview);
                Console.WriteLine("PREVIEW " + emptyPreview);
                var manualStore = Field<WorkspaceStore>(empty, "store");
                var manualProject = manualStore.Create("My handwritten draft", "Story & writing");
                Call(empty, "OpenProject", manualProject);
                Field<TextBox>(empty, "document").Text = "A draft I wrote myself";
                Check(Field<Button>(empty, "makeDocument").Visible, "handwritten first draft exposes Save draft without requiring an AI answer");
                Call(empty, "MakeDocument");
                Check(manualStore.ReadDocument(manualProject) == "A draft I wrote myself", "handwritten first draft becomes the persistent document without inference");
                var notesProject = manualStore.Create("Notes and Robin's draft", "Song & lyrics");
                Call(empty, "OpenProject", notesProject);
                Field<TextBox>(empty, "document").Text = "My original notes";
                Field<TextBox>(empty, "suggestion").Text = "Robin's new chorus";
                Call(empty, "UpdateEnabled");
                Check(Field<Button>(empty, "makeDocument").Text == "Save Robin's draft", "save action identifies Robin's answer when handwritten notes also exist");
                Call(empty, "MakeDocument");
                Check(manualStore.ReadDocument(notesProject) == "Robin's new chorus"
                    && File.ReadAllText(manualStore.Versions(notesProject).Single().Path) == "My original notes",
                    "saving Robin's answer keeps handwritten notes as a previous version");
                empty.Close();
            }
            var store = new WorkspaceStore(root);
            var p = store.Create("Midnight song", "Song & lyrics");
            store.SaveDocument(p, "Verse one\nChorus one", "");
            p.Conversation.Add(new("You", "Make it hopeful", DateTimeOffset.Now));
            p.Draft = "Change the chorus";
            store.Save(p);
            var reopened = new WorkspaceStore(root).ListProjects().Single();
            Check(reopened.Name == p.Name && reopened.Draft == p.Draft && reopened.Conversation.Count == 1, "project, conversation and unfinished request survive reopening");
            Check(store.ReadDocument(reopened) == "Verse one\nChorus one", "document remains an ordinary UTF-8 text file");
            store.SaveDocument(reopened, "Verse one\nChorus two", "Verse one\nChorus one");
            Check(File.ReadAllText(store.Versions(p).Single().Path) == "Verse one\nChorus one", "revision preserves previous document");
            File.WriteAllText(store.DocumentPath(p), "Edited in Notepad");
            Throws<IOException>(() => store.SaveDocument(p, "AI replacement", "Verse one\nChorus two"), "external edit cannot be silently overwritten");
            Check(store.ReadDocument(p) == "Edited in Notepad", "conflicting external document stays intact");
            using (store.AcquireProject(p)) Throws<IOException>(() => store.AcquireProject(p), "two windows cannot edit the same project concurrently");
            var bad = new ProjectEntry { Id = "../escape" };
            Throws<InvalidDataException>(() => store.Save(bad), "project identifier cannot escape workspace");
            var corrupt = Path.Combine(root, "Projects", Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(corrupt);
            File.WriteAllText(Path.Combine(corrupt, "Project.json"), "broken metadata");
            Check(store.ListProjects().Count == 1 && store.Warnings.Count == 1, "damaged project is reported without hiding healthy projects");
            Check(File.ReadAllText(Path.Combine(corrupt, "Project.json")) == "broken metadata", "damaged metadata preserved for recovery");
            Directory.Delete(corrupt, true);
            string prompt = ProjectContext.Build(p, "Verse one\nChorus two", "Rewrite only the chorus", true);
            Check(prompt.Contains("Verse one\nChorus two") && prompt.Contains("Make it hopeful") && prompt.Contains("COMPLETE replacement"), "revision includes actual document, conversation and complete-document instruction");
            Throws<InvalidOperationException>(() => ProjectContext.Build(p, new string('x', 80001), "Edit", true), "oversized document is rejected instead of silently truncated");
            using (var cts = new CancellationTokenSource())
            {
                cts.Cancel();
                Throws<OperationCanceledException>(() => FreeAggregator.RunPromptStreamAsync("Do not send", "auto", null, cts.Token).GetAwaiter().GetResult(), "cancelled cascade does not start another provider");
            }
            string download = Path.Combine(root, "Downloads");
            string desktop = Path.Combine(root, "Desktop");
            string installed = Path.Combine(root, "Programs");
            Directory.CreateDirectory(download);
            Directory.CreateDirectory(desktop);
            File.WriteAllText(Path.Combine(download, "RobinTHood.exe"), "fake test executable; never launched");
            File.WriteAllText(Path.Combine(download, "RobinTHood.dll"), "fake test assembly");
            File.WriteAllText(Path.Combine(download, "RobinTHood.runtimeconfig.json"), "{}");
            File.WriteAllText(Path.Combine(download, "RobinTHood.deps.json"), """
                {"runtimeTarget":{"name":"test"},"targets":{"test":{"Robin/1":{"runtime":{"RobinTHood.dll":{}},"native":{"required-native.dll":{}},"resources":{"fr/Robin.resources.dll":{}}}}}}
                """);
            File.WriteAllText(Path.Combine(download, "required-native.dll"), "required native dependency");
            Directory.CreateDirectory(Path.Combine(download, "fr"));
            File.WriteAllText(Path.Combine(download, "fr", "Robin.resources.dll"), "required translated resource");
            foreach (string name in new[] { "unrelated.txt", "unrelated.exe", "unrelated.dll", "unrelated.json" })
                File.WriteAllText(Path.Combine(download, name), "synthetic unrelated download");
            Directory.CreateDirectory(Path.Combine(download, "unrelated-folder"));
            File.WriteAllText(Path.Combine(download, "unrelated-folder", "notes.txt"), "synthetic unrelated folder");
            string shortcut = DesktopSetup.CreateShortcut(download, Path.Combine(download, "RobinTHood.exe"), desktop, installed);
            Check(!Directory.EnumerateFiles(installed, "unrelated.*", SearchOption.AllDirectories).Any()
                && !Directory.EnumerateDirectories(installed, "unrelated-folder", SearchOption.AllDirectories).Any(),
                "folder installation excludes unrelated Downloads files, executables, DLLs and folders");
            Check(Directory.EnumerateFiles(installed, "required-native.dll", SearchOption.AllDirectories).Count() == 1
                && Directory.EnumerateFiles(installed, "Robin.resources.dll", SearchOption.AllDirectories).Single().Contains(Path.DirectorySeparatorChar + "fr" + Path.DirectorySeparatorChar),
                "folder installation retains declared native dependencies and translated resources");
            File.WriteAllText(Path.Combine(download, "RobinTHood.deps.json"), """
                {"runtimeTarget":{"name":"test"},"targets":{"test":{"Robin/1":{"runtime":{"../outside.txt":{}}}}}}
                """);
            Throws<IOException>(() => DesktopSetup.CreateShortcut(download, Path.Combine(download, "RobinTHood.exe"), desktop, installed), "dependency manifest cannot copy a path outside the app folder");
            Directory.Delete(download, true);
            Check(File.Exists(shortcut) && Directory.EnumerateFiles(installed, "RobinTHood.exe", SearchOption.AllDirectories).Count() == 1, "desktop shortcut created with a stable app copy that survives removing Downloads");
            string single = Path.Combine(root, "SingleFileDownloads");
            Directory.CreateDirectory(single);
            File.WriteAllText(Path.Combine(single, "RobinTHood.exe"), "fake standalone executable; never launched");
            File.WriteAllText(Path.Combine(single, "unrelated.dll"), "not part of Robin");
            Directory.CreateDirectory(Path.Combine(single, "unrelated-folder"));
            File.WriteAllText(Path.Combine(single, "unrelated-folder", "notes.txt"), "not part of Robin");
            string singleInstall = Path.Combine(single, "installed");
            DesktopSetup.CreateShortcut(single, Path.Combine(single, "RobinTHood.exe"), desktop, singleInstall);
            Check(Directory.EnumerateFiles(singleInstall, "*", SearchOption.AllDirectories).Count() == 1
                && Directory.EnumerateFiles(singleInstall, "RobinTHood.exe", SearchOption.AllDirectories).Count() == 1,
                "single-file installation copies only the executable even with installation below the source folder");
            store.SaveSettings(new WorkspaceSettings { SetupComplete = true, OnlineAllowed = false });
            int generations = 0;
            bool fail = false;
            bool waitForCancel = false;
            Func<string, string, CancellationToken, Task<CompletionResult>> fake = (text, model, token) =>
            {
                if (model != "auto") throw new Exception("Workspace must select assistance automatically");
                generations++;
                if (waitForCancel) return WaitForCancellation(token);
                if (fail) return Task.FromResult(new CompletionResult(false, "offline-test", "", 0, "Provider unavailable"));
                return Task.FromResult(new CompletionResult(true, "offline-test", "Verse one\nA hopeful chorus", 0));
            };
            using (var form = new WorkspaceForm(store, skipSetup: true, generator: fake))
            {
                Call(form, "OpenProject", store.ListProjects().Single());
                var editor = Field<TextBox>(form, "document");
                Check(editor.Text == "Edited in Notepad", "workspace opens the actual document from disk");
                var input = Field<TextBox>(form, "input");
                input.Text = "Rewrite the chorus";
                ((Task)Call(form, "SendAsync")!).GetAwaiter().GetResult();
                Check(generations == 0, "local-only setting blocks online generation before any call");
                Field<WorkspaceSettings>(form, "settings").OnlineAllowed = true;
                ((Task)Call(form, "SendAsync")!).GetAwaiter().GetResult();
                Check(generations == 1 && editor.Text.ReplaceLineEndings("\n") == "Verse one\nA hopeful chorus", "successful revision updates the same document through actual UI flow");
                Check(store.ReadDocument(p) == editor.Text && store.Versions(p).Count == 2, "AI revision is persisted and previous external edit retained");
                fail = true;
                input.Text = "Try another chorus";
                string beforeFailure = store.ReadDocument(p);
                ((Task)Call(form, "SendAsync")!).GetAwaiter().GetResult();
                Check(store.ReadDocument(p) == beforeFailure && input.Text == "Try another chorus", "failed provider preserves document and request for retry");
                fail = false;
                waitForCancel = true;
                input.Text = "Cancel this revision";
                var pending = (Task)Call(form, "SendAsync")!;
                Check(!pending.IsCompleted && Field<Button>(form, "cancel").Enabled, "Stop is enabled while a real asynchronous request is active");
                // PerformClick ignores hidden controls; dispatch the real button's Click event
                // while keeping the test window off the user's desktop.
                typeof(Button).GetMethod("OnClick", BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(Field<Button>(form, "cancel"), [EventArgs.Empty]);
                var deadline = DateTime.UtcNow.AddSeconds(5);
                while (!pending.IsCompleted && DateTime.UtcNow < deadline) { Application.DoEvents(); Thread.Sleep(5); }
                Check(pending.IsCompletedSuccessfully && store.ReadDocument(p) == beforeFailure && input.Text == "Cancel this revision", "Stop cancels active generation and preserves document and request");
                waitForCancel = false;
                editor.Text += "\nWritten by hand";
                Check((bool)Call(form, "SaveActive")!, "manual document edit saves successfully");
                input.Text = "Remember this request";
                Call(form, "SaveActive");
                // Render without a visible window or online request.
                form.StartPosition = FormStartPosition.Manual;
                form.Location = new Point(-20000, -20000);
                form.ShowInTaskbar = false;
                form.Show();
                Application.DoEvents();
                form.PerformLayout();
                var intent = Field<ComboBox>(form, "mode");
                Check(TextRenderer.MeasureText(intent.Text, intent.Font).Width + SystemInformation.VerticalScrollBarWidth <= intent.ClientSize.Width,
                    "document-update choice fits without clipping at the current display scale");
                Check(editor.Lines.Length == 3, "Unix line endings from AI remain visible as separate lines in Windows editor");
                var talk = Field<TextBox>(form, "conversation");
                Field<TabControl>(form, "tabs").SelectedIndex = 1;
                Application.DoEvents();
                talk.Text = string.Join("\r\n", Enumerable.Range(0, 80).Select(i => $"Turn {i}: a line of the conversation that has to remain readable."));
                Application.DoEvents();
                talk.SelectionStart = talk.TextLength;
                talk.ScrollToCaret();
                Application.DoEvents();
                Check(talk.GetPositionFromCharIndex(0).Y < 0, "conversation scrolls so later messages can be read");
                var privacyLine = Field<Label>(form, "privacy");
                var formSettings = Field<WorkspaceSettings>(form, "settings");
                bool wasOnline = formSettings.OnlineAllowed;
                int originalWidth = form.Width;
                foreach (int width in new[] { originalWidth, form.MinimumSize.Width })
                {
                    form.Width = width;
                    form.PerformLayout();
                    foreach (bool on in new[] { true, false })
                    {
                        formSettings.OnlineAllowed = on;
                        Call(form, "UpdatePrivacy");
                        Check(privacyLine.Text.Contains("online") == on && privacyLine.Text.Contains("is off") == !on,
                            $"privacy line states plainly whether requests leave the computer (assistance {(on ? "on" : "off")})");
                        Check(TextRenderer.MeasureText(privacyLine.Text, privacyLine.Font).Width <= privacyLine.ClientSize.Width,
                            $"privacy line fits without clipping (assistance {(on ? "on" : "off")}, window {width}px)");
                    }
                }
                form.Width = originalWidth;
                formSettings.OnlineAllowed = wasOnline;
                Call(form, "UpdatePrivacy");
                using var bitmap = new Bitmap(form.Width, form.Height);
                form.DrawToBitmap(bitmap, new Rectangle(Point.Empty, form.Size));
                string screenshot = args.Length > 0 ? Path.GetFullPath(args[0]) : Path.Combine(root, "workspace.png");
                bitmap.Save(screenshot);
                Console.WriteLine("PREVIEW " + screenshot);
                form.Hide();
                Field<WorkspaceSettings>(form, "settings").OnlineAllowed = false;
                using var setupForm = (Form)Call(form, "CreateSetupDialog")!;
                setupForm.StartPosition = FormStartPosition.Manual;
                setupForm.Location = new Point(-20000, -20000);
                setupForm.ShowInTaskbar = false;
                setupForm.Show();
                Application.DoEvents();
                var setupControls = setupForm.Controls[0].Controls.Cast<Control>().ToList();
                var online = setupControls.OfType<CheckBox>().First(c => c.Text.StartsWith("Enable Robin"));
                Check(!online.Checked, "onboarding leaves online assistance off by default");
                using var setupBitmap = new Bitmap(setupForm.Width, setupForm.Height);
                setupForm.DrawToBitmap(setupBitmap, new Rectangle(Point.Empty, setupForm.Size));
                string setupPreview = Path.Combine(Path.GetDirectoryName(screenshot)!, "onboarding-preview.png");
                setupBitmap.Save(setupPreview);
                Console.WriteLine("PREVIEW " + setupPreview);
                setupControls.OfType<CheckBox>().First(c => c.Text.StartsWith("Put Robin")).Checked = false;
                setupControls.OfType<Button>().Single().PerformClick();
                Check(store.LoadSettings().SetupComplete && !store.LoadSettings().OnlineAllowed, "onboarding finishes without installing a shortcut or enabling cloud requests");
            }
            using (var form = new WorkspaceForm(store, skipSetup: true, generator: fake))
            {
                var restored = store.ListProjects().Single();
                Call(form, "OpenProject", restored);
                Check(Field<TextBox>(form, "document").Text.EndsWith("Written by hand") && Field<TextBox>(form, "input").Text == "Remember this request", "closing and reopening restores manual edits and unfinished request");
                Check(Field<TextBox>(form, "conversation").Text.Contains("A hopeful chorus"), "reopened workspace displays prior conversation");
                Call(form, "TryOpenByRequest", "bring back Midnight song");
                Check(Field<Label>(form, "status").Text.Contains("already open"), "saved project can be found by a plain-language request locally");
            }
            using (var form = new WorkspaceForm(store, skipSetup: true, generator: fake))
            {
                Check(!Field<Button>(form, "updateButton").Visible, "no update button without an update check");
            }
            using (var current = new WorkspaceForm(store, skipSetup: true, generator: fake, updateCheck: _ => Task.FromResult<UpdateInfo?>(null)))
            {
                current.StartPosition = FormStartPosition.Manual;
                current.Location = new Point(-20000, -20000);
                current.ShowInTaskbar = false;
                current.Show();
                for (int i = 0; i < 20 && !Field<Label>(current, "updateLine").Text.Contains("up to date"); i++) { Application.DoEvents(); Thread.Sleep(10); }
                var line = Field<Label>(current, "updateLine");
                Check(line.Visible && line.Text.Contains("up to date") && !Field<Button>(current, "updateButton").Visible,
                    "a current copy says it is up to date instead of hiding the update check");
                current.Hide();
            }
            using (var offline = new WorkspaceForm(store, skipSetup: true, generator: fake,
                       updateCheck: _ => Task.FromException<UpdateInfo?>(new UpdateCheckException("Couldn't reach GitHub."))))
            {
                offline.StartPosition = FormStartPosition.Manual;
                offline.Location = new Point(-20000, -20000);
                offline.ShowInTaskbar = false;
                offline.Show();
                for (int i = 0; i < 20 && !Field<Label>(offline, "updateLine").Text.Contains("couldn't"); i++) { Application.DoEvents(); Thread.Sleep(10); }
                var line = Field<Label>(offline, "updateLine");
                Check(line.Text.Contains("couldn't check") && !line.Text.Contains("up to date") && !Field<Button>(offline, "updateButton").Visible,
                    "an offline or rate-limited check never claims the copy is up to date");
                offline.Hide();
            }
            var offered = new UpdateInfo(new Version(9, 9, 9), "v9.9.9", new Uri("https://example.invalid/RobinTHood.exe"), 1, new string('0', 64));
            using (var form = new WorkspaceForm(store, skipSetup: true, generator: fake, updateCheck: _ => Task.FromResult<UpdateInfo?>(offered),
                       updateInstall: (_, _, _) => throw new IOException("offline test"), applyUpdate: false))
            {
                form.StartPosition = FormStartPosition.Manual;
                form.Location = new Point(-20000, -20000);
                form.ShowInTaskbar = false;
                form.Show();
                for (int i = 0; i < 20 && !Field<Button>(form, "updateButton").Visible; i++) { Application.DoEvents(); Thread.Sleep(10); }
                var button = Field<Button>(form, "updateButton");
                Check(button.Visible && button.Text == "Update to v9.9.9", "available update shows a one-click update button with its version");
                var settingsButton = button.Parent!.Controls.OfType<Button>().Single(b => b.Text == "Settings");
                Check(button.Height >= 30 && button.Bottom <= settingsButton.Top && button.Top >= 0,
                    "update button is actually on screen, just above Settings (not collapsed behind the project list)");
                using var bitmap = new Bitmap(form.Width, form.Height);
                form.DrawToBitmap(bitmap, new Rectangle(Point.Empty, form.Size));
                string updatePreview = Path.Combine(args.Length > 0 ? Path.GetDirectoryName(Path.GetFullPath(args[0]))! : root, "update-available.png");
                bitmap.Save(updatePreview);
                Console.WriteLine("PREVIEW " + updatePreview);
                form.Hide();
            }

            // Update lifecycle, offline: the install is a controllable fake and relaunch is recorded, never run.
            var relaunched = new List<string>();
            var relaunchField = typeof(WorkspaceForm).GetField("Relaunch", BindingFlags.NonPublic | BindingFlags.Static)!;
            var realRelaunch = relaunchField.GetValue(null);
            relaunchField.SetValue(null, new Action<string>(relaunched.Add));
            void Pump(Func<bool> until) { for (int i = 0; i < 300 && !until(); i++) { Application.DoEvents(); Thread.Sleep(5); } }
            int autoInstalls = 0;
            var auto = new WorkspaceForm(store, skipSetup: true, generator: fake, updateCheck: _ => Task.FromResult<UpdateInfo?>(offered),
                updateInstall: (_, _, _) => { autoInstalls++; return Task.FromResult(@"C:\updates\auto.exe"); })
                { StartPosition = FormStartPosition.Manual, Location = new Point(-20000, -20000), ShowInTaskbar = false };
            auto.Show();
            Pump(() => auto.IsDisposed);
            Check(autoInstalls == 1 && auto.IsDisposed && relaunched.SequenceEqual([@"C:\updates\auto.exe"]),
                "a newer release downloads and restarts without asking");
            relaunched.Clear();
            WorkspaceForm UpdateForm(Func<UpdateInfo, IProgress<int>, CancellationToken, Task<string>> install)
            {
                var f = new WorkspaceForm(store, skipSetup: true, generator: fake, updateCheck: _ => Task.FromResult<UpdateInfo?>(offered), updateInstall: install, applyUpdate: false)
                    { StartPosition = FormStartPosition.Manual, Location = new Point(-20000, -20000), ShowInTaskbar = false };
                f.Show();
                Pump(() => Field<Button>(f, "updateButton").Visible);
                Call(f, "OpenProject", store.ListProjects().Single());
                return f;
            }
            try
            {
                // 1. Editing during a download cannot re-enable the button or start a second install.
                int installs = 0;
                var hold = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
                var form = UpdateForm((_, _, token) => { installs++; token.Register(() => hold.TrySetCanceled(token)); return hold.Task; });
                var first = (Task)Call(form, "RunUpdateAsync", offered)!;
                Field<TextBox>(form, "document").AppendText(" edited during download");
                Application.DoEvents();
                Check(!Field<Button>(form, "updateButton").Enabled, "editing during an update download keeps the update button disabled");
                var second = (Task)Call(form, "RunUpdateAsync", offered)!;
                Pump(() => second.IsCompleted);
                Check(installs == 1, "a second update request while one is downloading does nothing");

                // 2. Closing during the download stops it, cleans up through the installer's cancellation, then closes without relaunching.
                form.Close();
                Check(!form.IsDisposed && Field<Label>(form, "status").Text.Contains("Stopping the update"), "closing during a download first stops the download");
                Pump(() => form.IsDisposed);
                Check(form.IsDisposed && first.IsCompleted && relaunched.Count == 0, "after the download stops the window closes and nothing is relaunched");

                // 3. A cancelled close keeps the installed update; the next accepted close relaunches it.
                form = UpdateForm((_, _, _) => Task.FromResult(@"C:\updates\RobinTHood.exe"));
                int vetoes = 1;
                form.FormClosing += (_, e) => { if (vetoes-- > 0) e.Cancel = true; };
                var done = (Task)Call(form, "RunUpdateAsync", offered)!;
                Pump(() => done.IsCompleted);
                var restart = Field<Button>(form, "updateButton");
                Check(!form.IsDisposed && restart.Enabled && restart.Text == "Restart to finish update" && relaunched.Count == 0,
                    "a cancelled automatic close keeps the update ready behind 'Restart to finish update'");
                restart.PerformClick();
                Pump(() => form.IsDisposed);
                Check(form.IsDisposed && relaunched.SequenceEqual([@"C:\updates\RobinTHood.exe"]), "the next accepted close relaunches the installed update exactly once");

                // 4. A failed install leaves the app usable and the button available to try again.
                form = UpdateForm((_, _, _) => Task.FromException<string>(new IOException("fingerprint mismatch")));
                var failed = (Task)Call(form, "RunUpdateAsync", offered)!;
                Pump(() => failed.IsCompleted);
                Check(Field<Button>(form, "updateButton").Enabled && Field<Label>(form, "status").Text.Contains("still works") && !form.IsDisposed,
                    "a failed update reports the problem and leaves the current version running");
                form.Close();
                Pump(() => form.IsDisposed);
                Check(relaunched.Count == 1, "closing after a failed update relaunches nothing");
            }
            finally { relaunchField.SetValue(null, realRelaunch); }
            File.Delete(store.DocumentPath(p));
            Throws<IOException>(() => store.ReadDocument(p), "missing document is reported instead of silently recreated");
            Console.WriteLine($"{count} checks passed; no online providers called.");
            return 0;
        }
        catch (Exception ex) { Console.Error.WriteLine(ex); return 1; }
        finally { Directory.Delete(root, true); }
    }
}
