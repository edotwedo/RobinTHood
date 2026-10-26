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
            string shortcut = DesktopSetup.CreateShortcut(download, Path.Combine(download, "RobinTHood.exe"), desktop, installed);
            Directory.Delete(download, true);
            Check(File.Exists(shortcut) && Directory.EnumerateFiles(installed, "RobinTHood.exe", SearchOption.AllDirectories).Count() == 1, "desktop shortcut created with a stable app copy that survives removing Downloads");
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
            File.Delete(store.DocumentPath(p));
            Throws<IOException>(() => store.ReadDocument(p), "missing document is reported instead of silently recreated");
            Console.WriteLine($"{count} checks passed; no online providers called.");
            return 0;
        }
        catch (Exception ex) { Console.Error.WriteLine(ex); return 1; }
        finally { Directory.Delete(root, true); }
    }
}
