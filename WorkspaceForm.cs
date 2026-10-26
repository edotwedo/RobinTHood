namespace RobinCode;

/// <summary>The everyday creative workspace. Provider details stay out of the writing flow.</summary>
public sealed class WorkspaceForm : Form
{
    readonly WorkspaceStore store;
    readonly WorkspaceSettings settings;
    readonly Func<string, string, CancellationToken, Task<CompletionResult>> generate;
    readonly bool skipSetup;
    readonly Func<CancellationToken, Task<UpdateInfo?>>? updateCheck;
    readonly Func<UpdateInfo, IProgress<int>, CancellationToken, Task<string>> updateInstall;
    readonly Button updateButton = ActionButton("Update available");
    UpdateInfo? availableUpdate;
    string? relaunchAfterClose;
    CancellationTokenSource? updateDownload;
    // Replaced only by offline checks, which must never start a real process.
    static Action<string> Relaunch = Updater.Relaunch;
    bool closeWhenUpdateStops;
    readonly ListBox projects = new() { Dock = DockStyle.Fill, BorderStyle = BorderStyle.None, IntegralHeight = false, ItemHeight = 34 };
    readonly TextBox search = new() { Dock = DockStyle.Top, PlaceholderText = "Find a project by name…" };
    readonly Label searchCaption = new() { Text = "Search projects", Dock = DockStyle.Top, Height = 30, Padding = new Padding(0, 4, 0, 0) };
    readonly TextBox document = Editor("Your document will live here. Write here, or ask Robin for a first draft.");
    readonly TextBox conversation = Editor("Your conversation stays with this project.");
    readonly TextBox suggestion = Editor("Ask Robin for a draft, then save it as your document.");
    readonly TextBox input = Editor("What would you like to make or change?  Ctrl+Enter to send.");
    readonly Label heading = new() { AutoSize = true, Font = new Font("Segoe UI", 18, FontStyle.Bold), Text = "Welcome to Robin" };
    readonly Label saved = new() { AutoSize = false, Dock = DockStyle.Bottom, Height = 28, AutoEllipsis = true };
    readonly Label status = new() { Dock = DockStyle.Bottom, Height = 32, Padding = new Padding(12, 6, 0, 0), Text = "Start a project, or continue something you love." };
    readonly Label privacy = new() { Dock = DockStyle.Top, Height = 34, Padding = new Padding(0, 8, 0, 0) };
    readonly TabControl tabs = new() { Dock = DockStyle.Fill };
    readonly ComboBox mode = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 270 };
    readonly Panel welcome = new() { Dock = DockStyle.Fill, Padding = new Padding(28) };
    readonly FlowLayoutPanel toolbar = new() { Dock = DockStyle.Top, Height = 48, AutoScroll = true };
    readonly Panel compose = new() { Dock = DockStyle.Bottom, Height = 190, Padding = new Padding(0, 12, 0, 0) };
    readonly Button projectActions = ActionButton("Project options ▾");
    readonly ContextMenuStrip projectMenu = new();
    readonly Button send = ActionButton("Ask Robin");
    readonly Button makeDocument = ActionButton("Save draft as document");
    readonly Button saveChanges = ActionButton("Save changes");
    readonly Button cancel = ActionButton("Stop");
    readonly System.Windows.Forms.Timer saveTimer = new() { Interval = 650 };
    readonly List<Control> busyDisabled = [];
    ProjectEntry? active;
    FileStream? projectLock;
    string expectedDocument = "";
    bool loading, busy, conflict;
    CancellationTokenSource? cancellation;

    public WorkspaceForm(WorkspaceStore? workspace = null, bool skipSetup = false,
        Func<string, string, CancellationToken, Task<CompletionResult>>? generator = null,
        Func<CancellationToken, Task<UpdateInfo?>>? updateCheck = null,
        Func<UpdateInfo, IProgress<int>, CancellationToken, Task<string>>? updateInstall = null)
    {
        this.updateCheck = updateCheck;
        this.updateInstall = updateInstall ?? ((update, progress, token) => Updater.InstallAsync(update, progress, token));
        store = workspace ?? new WorkspaceStore();
        settings = store.LoadSettings();
        this.skipSetup = skipSetup;
        generate = generator ?? ((prompt, model, token) => FreeAggregator.RunPromptStreamAsync(prompt, model, null, token,
            message => { if (!IsDisposed && IsHandleCreated) BeginInvoke(new Action(() => { if (!IsDisposed) status.Text = message; })); }));
        Text = "RobinTHood — Your creative workspace";
        StartPosition = FormStartPosition.CenterScreen;
        Size = new Size(1160, 830);
        MinimumSize = new Size(940, 720);
        Font = new Font("Segoe UI", 10);
        BackColor = Color.FromArgb(247, 248, 243);
        ForeColor = Color.FromArgb(30, 53, 43);
        BuildLayout();
        saveTimer.Tick += (_, _) => { saveTimer.Stop(); SaveActive(); };
        document.TextChanged += (_, _) => { QueueSave(); UpdateEnabled(); };
        input.TextChanged += (_, _) => QueueSave();
        search.TextChanged += (_, _) => RefreshProjects();
        projects.SelectedIndexChanged += (_, _) =>
        {
            if (loading || projects.SelectedItem is not ProjectEntry p || p.Id == active?.Id) return;
            OpenProject(p);
        };
        input.KeyDown += async (_, e) =>
        {
            if (e.Control && e.KeyCode == Keys.Enter) { e.SuppressKeyPress = true; await SendAsync(); }
        };
        send.Click += async (_, _) => await SendAsync();
        cancel.Click += (_, _) => cancellation?.Cancel();
        makeDocument.Click += (_, _) => MakeDocument();
        saveChanges.Click += (_, _) =>
        {
            if (active is null) return;
            if (conflict)
            {
                if (MessageBox.Show(this, "Save the recovered draft as the current document? The file currently on disk will be kept in Previous versions.", "Keep this draft", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
                try { expectedDocument = store.ReadDocument(active); conflict = false; }
                catch (Exception ex) { ShowError(ex); return; }
            }
            SaveActive();
        };
        mode.Items.AddRange(["Talk it through", "Update my document"]);
        mode.SelectedIndex = 0;
        RefreshProjects();
        UpdateEnabled();
    }

    static string DisplayText(string text) => text.ReplaceLineEndings("\r\n");

    sealed class DocumentEditor : TextBox
    {
        [System.Diagnostics.CodeAnalysis.AllowNull]
        public override string Text { get => base.Text; set => base.Text = DisplayText(value ?? ""); }
    }

    static TextBox Editor(string placeholder) => new DocumentEditor()
    {
        Multiline = true, ScrollBars = ScrollBars.Vertical, AcceptsReturn = true,
        Dock = DockStyle.Fill, BorderStyle = BorderStyle.FixedSingle,
        Font = new Font("Segoe UI", 11), PlaceholderText = placeholder, MaxLength = 0
    };

    static Button ActionButton(string text) => new()
    {
        Text = text, AutoSize = true, Height = 34, MinimumSize = new Size(70, 34),
        FlatStyle = FlatStyle.Flat, BackColor = Color.White, Margin = new Padding(0, 0, 8, 6)
    };

    void BuildLayout()
    {
        var sidebar = new Panel { Dock = DockStyle.Left, Width = 250, Padding = new Padding(16), BackColor = Color.FromArgb(229, 237, 226) };
        var brand = new Label { Text = "RobinTHood", Dock = DockStyle.Top, Height = 48, Font = new Font("Segoe UI", 16, FontStyle.Bold) };
        var tagline = new Label { Text = "A place for your ideas", Dock = DockStyle.Top, Height = 32 };
        var newProject = ActionButton("+ New project");
        newProject.Dock = DockStyle.Top;
        newProject.Height = 40;
        newProject.Click += (_, _) => NewProject();
        busyDisabled.Add(newProject);
        var recentLabel = new Label { Text = "YOUR PROJECTS", Dock = DockStyle.Top, Height = 38, Padding = new Padding(0, 16, 0, 0), Font = new Font("Segoe UI", 9, FontStyle.Bold) };
        var setup = ActionButton("Settings");
        setup.Dock = DockStyle.Bottom;
        setup.Height = 42;
        setup.Click += (_, _) => ShowSetup();
        var local = new Label { Text = "Saved on this computer.", Dock = DockStyle.Bottom, Height = 40, Font = new Font("Segoe UI", 9) };
        updateButton.Dock = DockStyle.Bottom;
        updateButton.Height = 42;
        updateButton.Visible = false;
        updateButton.Click += async (_, _) => await InstallUpdateAsync();
        busyDisabled.Add(updateButton);
        search.AccessibleName = "Search projects";
        sidebar.Controls.AddRange([projects, search, searchCaption, recentLabel, newProject, tagline, brand, local, updateButton, setup]);
        var main = new Panel { Dock = DockStyle.Fill, Padding = new Padding(22, 16, 22, 8) };
        var header = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 52, WrapContents = false };
        header.Controls.Add(heading);
        projectMenu.Items.Add("Previous versions", null, (_, _) => ShowVersions());
        projectMenu.Items.Add("Rename project", null, (_, _) => RenameProject());
        projectMenu.Items.Add("Open project folder", null, (_, _) => Safe(() => DesktopSetup.OpenFolder(active is null ? store.Root : store.ProjectFolder(active))));
        projectMenu.Items.Add("Export a copy…", null, (_, _) => Export());
        projectActions.Click += (_, _) => projectMenu.Show(projectActions, new Point(0, projectActions.Height));
        toolbar.Controls.AddRange([makeDocument, saveChanges, projectActions]);
        busyDisabled.Add(projectActions);
        conversation.ReadOnly = true;
        suggestion.ReadOnly = true;
        foreach (var (name, editor) in new[] { ("Your document", document), ("Conversation", conversation), ("Latest answer", suggestion) })
        {
            var page = new TabPage(name) { Padding = new Padding(10), BackColor = Color.White };
            page.Controls.Add(editor);
            tabs.TabPages.Add(page);
        }
        var actions = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 48, Padding = new Padding(0, 8, 0, 0), WrapContents = false, AutoScroll = true };
        cancel.Enabled = false;
        actions.Controls.AddRange([mode, send, cancel]);
        compose.Controls.Add(input);
        compose.Controls.Add(actions);
        var introduction = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true, FlowDirection = FlowDirection.TopDown, WrapContents = false };
        introduction.Controls.Add(new Label { Text = "What would you like to create?", AutoSize = true, Font = new Font("Segoe UI", 20, FontStyle.Bold), Margin = new Padding(0, 24, 0, 16) });
        introduction.Controls.Add(new Label { Text = "A song. A story. A new idea.\n\nStart a project and Robin will keep your drafts,\nconversation and revisions together for next time.", AutoSize = true, Margin = new Padding(0, 0, 0, 24) });
        var startProject = ActionButton("Start a project");
        startProject.Click += (_, _) => NewProject();
        introduction.Controls.Add(startProject);
        welcome.Controls.Add(introduction);
        main.Controls.Add(welcome);
        main.Controls.Add(tabs);
        main.Controls.Add(compose);
        main.Controls.Add(saved);
        main.Controls.Add(toolbar);
        main.Controls.Add(privacy);
        main.Controls.Add(header);
        Controls.Add(main);
        Controls.Add(sidebar);
        Controls.Add(status);
    }

    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);
        if (!skipSetup && !settings.SetupComplete && !ShowSetup()) { Close(); return; }
        if (!string.IsNullOrEmpty(settings.LastProjectId))
        {
            var last = store.ListProjects().FirstOrDefault(p => p.Id == settings.LastProjectId);
            if (last is not null) OpenProject(last);
        }
        UpdatePrivacy();
        _ = CheckForUpdateAsync();
    }

    async Task CheckForUpdateAsync()
    {
        if (updateCheck is null) return;
        var update = await updateCheck(CancellationToken.None);
        if (update is null || IsDisposed) return;
        availableUpdate = update;
        updateButton.Text = $"Update to v{update.Version}";
        updateButton.Visible = true;
    }

    async Task InstallUpdateAsync()
    {
        // Already installed: the button now finishes the update by restarting.
        if (relaunchAfterClose is not null) { Close(); return; }
        if (availableUpdate is not { } update || busy || updateDownload is not null) return;
        string size = update.Size > 0 ? $" ({update.Size / 1048576.0:0.#} MB)" : "";
        if (MessageBox.Show(this, $"Download RobinTHood v{update.Version}{size} from GitHub and restart? Your work is saved first.",
                "Update RobinTHood", MessageBoxButtons.OKCancel, MessageBoxIcon.Information) != DialogResult.OK) return;
        await RunUpdateAsync(update);
    }

    async Task RunUpdateAsync(UpdateInfo update)
    {
        if (busy || updateDownload is not null || relaunchAfterClose is not null) return;
        if (!SaveActive()) return;
        var download = updateDownload = new CancellationTokenSource();
        UpdateEnabled();
        try
        {
            var progress = new Progress<int>(percent => { if (!IsDisposed && updateDownload is not null) status.Text = $"Downloading the update… {percent}%"; });
            string executable = await updateInstall(update, progress, download.Token);
            if (download.IsCancellationRequested)
                status.Text = "Update installed. It opens next time you start RobinTHood from its shortcut.";
            else
            {
                // Kept until a close is actually accepted, so a cancelled close can't lose it.
                relaunchAfterClose = executable;
                updateButton.Text = "Restart to finish update";
                status.Text = "Update ready. Restarting RobinTHood…";
            }
        }
        catch (OperationCanceledException) when (download.IsCancellationRequested)
        {
            status.Text = "Update stopped. Your current version still works.";
        }
        catch (Exception ex)
        {
            status.Text = "Update didn't finish: " + ex.Message + " Your current version still works.";
        }
        finally
        {
            updateDownload = null;
            download.Dispose();
            if (!IsDisposed) UpdateEnabled();
        }
        if (closeWhenUpdateStops) { closeWhenUpdateStops = false; Close(); }
        else if (relaunchAfterClose is not null)
        {
            Close();
            if (!IsDisposed && Visible) status.Text = "Update ready. Choose Restart to finish update when you're done.";
        }
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        base.OnFormClosed(e);
        if (relaunchAfterClose is { } executable)
        {
            try { Relaunch(executable); }
            catch (Exception ex) { MessageBox.Show("The update is installed but couldn't start: " + ex.Message + "\nOpen RobinTHood again to use it.", "Update RobinTHood"); }
        }
    }

    Form CreateSetupDialog()
    {
        var dialog = new Form { Text = "Welcome to RobinTHood", Size = new Size(760, 760), MinimumSize = new Size(650, 600), StartPosition = FormStartPosition.CenterParent, Font = Font, MinimizeBox = false, MaximizeBox = false };
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(24), ColumnCount = 1, RowCount = 8 };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        for (int i = 0; i < 8; i++) layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.Controls.Add(new Label { Text = "Your ideas, ready when you are.", AutoSize = true, Font = new Font("Segoe UI", 18, FontStyle.Bold) });
        layout.Controls.Add(new Label { Text = "Robin keeps your projects, conversations and documents together on this computer. No account. No cloud sync.\n\nLyrics, stories and art briefs are text documents; Robin doesn't create audio or image files yet.", AutoSize = true, MaximumSize = new Size(570, 0), Margin = new Padding(0, 18, 0, 12) });
        layout.Controls.Add(new Label { Text = "Your workspace:\n" + store.Root + "\nYou can open its folder from any project.", AutoSize = true, MaximumSize = new Size(570, 0) });
        var online = new CheckBox { Text = "Enable Robin's writing assistance", Checked = settings.OnlineAllowed, AutoSize = true, MaximumSize = new Size(560, 0), Margin = new Padding(0, 16, 0, 10) };
        var shortcut = new CheckBox { Text = "Put Robin on my desktop (keeps an app copy outside Downloads)", Checked = true, AutoSize = true, MaximumSize = new Size(560, 0) };
        layout.Controls.Add(online);
        layout.Controls.Add(shortcut);
        layout.Controls.Add(new Label { Text = "Robin needs an internet connection to respond. Your request, current document and recent conversation are sent to an AI service. Your projects stay on this computer, without cloud sync. You can write and reopen them with assistance switched off.\n\nWhen it opens, Robin asks GitHub whether a newer version exists. No project text is sent, and nothing installs unless you choose Update.", AutoSize = true, MaximumSize = new Size(570, 0), Margin = new Padding(0, 12, 0, 12) });
        var done = ActionButton("Open my workspace");
        done.Click += (_, _) =>
        {
            try
            {
                if (shortcut.Checked) DesktopSetup.CreateShortcut();
                settings.OnlineAllowed = online.Checked;
                settings.SetupComplete = true;
                store.SaveSettings(settings);
                dialog.DialogResult = DialogResult.OK;
            }
            catch (Exception ex) { MessageBox.Show(dialog, "Setup couldn't finish: " + ex.Message + "\nYou can uncheck the shortcut and continue.", "Setup", MessageBoxButtons.OK, MessageBoxIcon.Information); }
        };
        layout.Controls.Add(done);
        layout.AutoScroll = true;
        dialog.Controls.Add(layout);
        layout.SizeChanged += (_, _) =>
        {
            int width = Math.Max(200, layout.ClientSize.Width - layout.Padding.Horizontal - 24);
            foreach (Control control in layout.Controls)
                if (control is Label or CheckBox) control.MaximumSize = new Size(width, 0);
        };
        return dialog;
    }

    bool ShowSetup()
    {
        using var dialog = CreateSetupDialog();
        bool result = dialog.ShowDialog(this) == DialogResult.OK;
        UpdatePrivacy();
        return result;
    }

    void RefreshProjects()
    {
        loading = true;
        try
        {
            var all = store.ListProjects();
            search.Visible = searchCaption.Visible = all.Count > 0;
            projects.Items.Clear();
            foreach (var p in all.Where(p => p.Name.Contains(search.Text.Trim(), StringComparison.OrdinalIgnoreCase))) projects.Items.Add(p);
            for (int i = 0; i < projects.Items.Count; i++) if (((ProjectEntry)projects.Items[i]).Id == active?.Id) projects.SelectedIndex = i;
            if (store.Warnings.Count > 0) status.Text = store.Warnings[0];
        }
        catch (Exception ex) { ShowError(ex); }
        finally { loading = false; }
    }

    void NewProject()
    {
        if (!SaveActive()) return;
        using var dialog = new Form { Text = "What would you like to create?", Size = new Size(500, 310), StartPosition = FormStartPosition.CenterParent, Font = Font, FormBorderStyle = FormBorderStyle.FixedDialog, MaximizeBox = false, MinimizeBox = false };
        var layout = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, Padding = new Padding(22), WrapContents = false };
        layout.Controls.Add(new Label { Text = "Give your project a name", AutoSize = true });
        var name = new TextBox { Width = 425, PlaceholderText = "e.g. Midnight song" };
        var kind = new ComboBox { Width = 425, DropDownStyle = ComboBoxStyle.DropDownList };
        kind.Items.AddRange(["Song & lyrics", "Story & writing", "Art brief & ideas", "Music plan", "Anything else"]);
        kind.SelectedIndex = 0;
        var create = ActionButton("Create project");
        create.Click += (_, _) => { if (string.IsNullOrWhiteSpace(name.Text)) { name.Focus(); return; } dialog.DialogResult = DialogResult.OK; };
        layout.Controls.AddRange([name, kind, new Label { Text = "Robin will keep this project for you automatically.", AutoSize = true, Margin = new Padding(0, 14, 0, 14) }, create]);
        dialog.Controls.Add(layout);
        dialog.AcceptButton = create;
        if (dialog.ShowDialog(this) != DialogResult.OK) return;
        Safe(() => { var p = store.Create(name.Text, kind.Text); search.Clear(); OpenProject(p); });
    }

    void OpenProject(ProjectEntry project)
    {
        if (project.Id == active?.Id) return;
        if (busy || !SaveActive()) { RefreshProjects(); return; }
        FileStream? nextLock = null;
        try
        {
            nextLock = store.AcquireProject(project);
            string text = store.ReadDocument(project);
            projectLock?.Dispose();
            projectLock = nextLock;
            nextLock = null;
            active = project;
            expectedDocument = text;
            conflict = project.DocumentDraft is not null && DisplayText(project.DocumentDraft) != DisplayText(text) && project.HasDocument;
            loading = true;
            document.Text = project.DocumentDraft ?? text;
            input.Text = project.Draft;
            suggestion.Text = project.Suggestion;
            RenderConversation();
            heading.Text = project.Name;
            mode.SelectedIndex = project.HasDocument ? 1 : 0;
            settings.LastProjectId = project.Id;
            store.SaveSettings(settings);
            tabs.SelectedIndex = project.HasDocument || project.DocumentDraft is not null ? 0 : 1;
            UpdateSaved();
            status.Text = conflict ? "Recovered an unsaved draft. Review it, then choose Save changes to keep it." : "Pick up where you left off.";
        }
        catch (Exception ex) { ShowError(ex); }
        finally { nextLock?.Dispose(); loading = false; RefreshProjects(); UpdateEnabled(); }
    }

    void QueueSave()
    {
        if (loading || active is null) return;
        saved.Text = "Saving on this computer…";
        saveTimer.Stop();
        saveTimer.Start();
    }

    bool SaveActive()
    {
        saveTimer.Stop();
        if (active is null || loading) return true;
        try
        {
            active.Draft = input.Text;
            active.DocumentDraft = document.Text == DisplayText(expectedDocument) ? null : document.Text;
            store.Save(active); // Recover edits even if writing the visible document fails.
            if (active.HasDocument && document.Text != DisplayText(expectedDocument))
            {
                if (conflict) { saved.Text = "Draft saved locally · review and choose Save changes"; return false; }
                store.SaveDocument(active, document.Text, expectedDocument);
                expectedDocument = document.Text;
                active.DocumentDraft = null;
                store.Save(active);
            }
            UpdateSaved();
            return true;
        }
        catch (Exception ex) { conflict = true; saved.Text = "Document not saved · draft kept locally if possible"; ShowError(ex); return false; }
        finally { UpdateEnabled(); }
    }

    void UpdateSaved() => saved.Text = active is null ? "" : $"Saved on this computer · {active.Name}" + (active.HasDocument ? " · Document.txt" : " · Project draft");

    void MakeDocument()
    {
        if (active is null) return;
        string text = !string.IsNullOrWhiteSpace(suggestion.Text) ? suggestion.Text : document.Text;
        if (string.IsNullOrWhiteSpace(text)) { status.Text = "Write a draft or ask Robin for one first."; return; }
        if (active.HasDocument && MessageBox.Show(this, "Replace your document with the latest answer? The current document will stay in Previous versions.", "Use this answer", MessageBoxButtons.YesNo) != DialogResult.Yes) return;
        try
        {
            if (!SaveActive()) return;
            if (!active.HasDocument && !string.IsNullOrWhiteSpace(document.Text)
                && DisplayText(document.Text) != DisplayText(text))
            {
                // Keep handwritten notes as a previous version before adopting Robin's draft.
                store.SaveDocument(active, document.Text, expectedDocument);
                expectedDocument = document.Text;
            }
            store.SaveDocument(active, text, expectedDocument);
            expectedDocument = text;
            active.DocumentDraft = null;
            store.Save(active);
            loading = true; document.Text = text; loading = false;
            mode.SelectedIndex = 1;
            tabs.SelectedIndex = 0;
            UpdateSaved();
            UpdateEnabled();
            status.Text = "This is your document now. Ask for a change, or edit it yourself.";
        }
        catch (Exception ex) { ShowError(ex); }
        finally { loading = false; UpdateEnabled(); }
    }

    async Task SendAsync()
    {
        if (busy || active is null || string.IsNullOrWhiteSpace(input.Text)) return;
        if (!SaveActive()) return;
        string instruction = input.Text.Trim();
        if (TryOpenByRequest(instruction)) return;
        if (!settings.OnlineAllowed)
        {
            status.Text = "Turn on Robin's writing assistance in Settings to get a response. You can keep writing here.";
            return;
        }
        bool update = mode.SelectedIndex == 1;
        if (update && !active.HasDocument) { status.Text = "Save a draft as your document first, or switch to Talk it through."; return; }
        string prompt;
        try { prompt = ProjectContext.Build(active, document.Text, instruction, update); }
        catch (Exception ex) { ShowError(ex); return; }
        var project = active;
        string original = document.Text;
        busy = true;
        cancellation = new CancellationTokenSource(TimeSpan.FromMinutes(3));
        UpdateEnabled();
        status.Text = update ? "Robin is revising your document. The saved version stays safe until the answer is complete…" : "Robin is thinking…";
        try
        {
            project.Conversation.Add(new("You", instruction, DateTimeOffset.Now));
            store.Save(project);
            RenderConversation();
            var result = await generate(prompt, "auto", cancellation.Token);
            cancellation.Token.ThrowIfCancellationRequested();
            if (!result.Success || string.IsNullOrWhiteSpace(result.OutputText)) throw new InvalidOperationException(string.IsNullOrWhiteSpace(result.ErrorMessage) ? "Robin didn't return an answer. Try again." : result.ErrorMessage);
            string answer = DisplayText(result.OutputText);
            project.Suggestion = answer;
            project.Conversation.Add(new("Robin", answer, DateTimeOffset.Now));
            // Preserve the answer before touching the actual document.
            store.Save(project);
            suggestion.Text = answer;
            RenderConversation();
            if (update)
            {
                store.SaveDocument(project, answer, original);
                expectedDocument = answer;
                loading = true; document.Text = answer; loading = false;
                project.DocumentDraft = null;
                tabs.SelectedIndex = 0;
            }
            else tabs.SelectedIndex = 2;
            loading = true; input.Clear(); loading = false;
            project.Draft = "";
            store.Save(project);
            UpdateSaved();
            status.Text = update ? "Document updated · the earlier version is in Project options → Previous versions." : "Draft kept with your project. Like it? Choose Save Robin's draft.";
        }
        catch (OperationCanceledException) { status.Text = "Stopped. Your document is unchanged; your request is still here."; }
        catch (Exception ex) { ShowError(ex); }
        finally
        {
            loading = false;
            busy = false;
            cancellation.Dispose();
            cancellation = null;
            UpdateEnabled();
            RefreshProjects();
        }
    }

    bool TryOpenByRequest(string request)
    {
        var prefixes = new[] { "open ", "bring back ", "continue project " };
        var prefix = prefixes.FirstOrDefault(p => request.StartsWith(p, StringComparison.OrdinalIgnoreCase));
        if (prefix is null) return false;
        string query = request[prefix.Length..].Trim().Trim('"', '\'');
        var all = store.ListProjects();
        var matches = all.Where(p => p.Name.Equals(query, StringComparison.OrdinalIgnoreCase)).ToList();
        if (matches.Count == 0) matches = all.Where(p => p.Name.Contains(query, StringComparison.OrdinalIgnoreCase)).ToList();
        if (matches.Count == 0 && request.Contains("yesterday", StringComparison.OrdinalIgnoreCase))
            matches = all.Where(p => p.Updated.LocalDateTime.Date == DateTime.Today.AddDays(-1)).ToList();
        if (matches.Count == 1)
        {
            if (matches[0].Id == active?.Id) status.Text = "That project is already open.";
            else OpenProject(matches[0]);
        }
        else status.Text = matches.Count == 0 ? "No saved project matches that name. Try the project search on the left." : "Several projects match. Choose one in the project list.";
        return true;
    }

    void UpdateEnabled()
    {
        foreach (var c in busyDisabled) c.Enabled = !busy;
        // Single-flight: ordinary editing must not re-enable the button during a download.
        updateButton.Enabled = !busy && updateDownload is null;
        projects.Enabled = search.Enabled = !busy;
        input.Enabled = !busy && active is not null;
        document.ReadOnly = busy || active is null;
        send.Enabled = !busy && active is not null;
        cancel.Enabled = busy;
        mode.Enabled = !busy;
        welcome.Visible = active is null;
        tabs.Visible = compose.Visible = toolbar.Visible = active is not null;
        cancel.Visible = busy;
        makeDocument.Visible = active is not null && (!string.IsNullOrWhiteSpace(suggestion.Text)
            || !active.HasDocument && !string.IsNullOrWhiteSpace(document.Text));
        saveChanges.Visible = conflict;
        makeDocument.Enabled = !busy && active is not null;
        saveChanges.Enabled = !busy && active is not null;
        makeDocument.Text = active?.HasDocument == true ? "Replace with latest draft"
            : !string.IsNullOrWhiteSpace(suggestion.Text) ? "Save Robin's draft" : "Save your draft";
    }

    void UpdatePrivacy()
    {
        privacy.Text = settings.OnlineAllowed
            ? "Saved on this computer · Ask Robin sends text online"
            : "Saved on this computer · Writing assistance is off";
    }

    void RenderConversation() => conversation.Text = active is null ? "" : string.Join("\r\n\r\n", active.Conversation.Select(t => $"{t.Role} · {t.At.LocalDateTime:g}\r\n{t.Text}"));

    void RenameProject()
    {
        if (active is null || !SaveActive()) return;
        using var dialog = new Form { Text = "Rename project", Size = new Size(450, 170), StartPosition = FormStartPosition.CenterParent };
        var text = new TextBox { Text = active.Name, Dock = DockStyle.Top };
        var done = ActionButton("Save name");
        done.Dock = DockStyle.Bottom;
        done.DialogResult = DialogResult.OK;
        dialog.Controls.AddRange([text, done]);
        dialog.AcceptButton = done;
        if (dialog.ShowDialog(this) == DialogResult.OK && !string.IsNullOrWhiteSpace(text.Text)) Safe(() => { active.Name = text.Text.Trim(); store.Save(active); heading.Text = active.Name; RefreshProjects(); UpdateSaved(); });
    }

    void Export()
    {
        if (active is null || !SaveActive()) return;
        using var dialog = new SaveFileDialog { Filter = "Text document (*.txt)|*.txt", FileName = string.Concat(active.Name.Select(c => Path.GetInvalidFileNameChars().Contains(c) ? '_' : c)) + ".txt", Title = "Export a copy — Robin keeps working on the original" };
        if (dialog.ShowDialog(this) == DialogResult.OK) Safe(() => { WorkspaceStore.WriteAtomic(dialog.FileName, document.Text); status.Text = "Copy exported. Your project continues in Robin's local workspace."; });
    }

    void ShowVersions()
    {
        if (active is null || !SaveActive()) return;
        using var dialog = new Form { Text = "Previous versions — " + active.Name, Size = new Size(800, 580), StartPosition = FormStartPosition.CenterParent, Font = Font };
        var list = new ListBox { Dock = DockStyle.Top, Height = 110 };
        foreach (var v in store.Versions(active)) list.Items.Add(v);
        var preview = Editor("Choose a version to preview. Your current document won't change until you restore it.");
        preview.ReadOnly = true;
        list.SelectedIndexChanged += (_, _) => Safe(() => { if (list.SelectedItem is DocumentVersion v) preview.Text = File.ReadAllText(v.Path); });
        var restore = ActionButton("Restore this version");
        restore.Dock = DockStyle.Bottom;
        restore.Click += (_, _) =>
        {
            if (list.SelectedItem is not DocumentVersion) return;
            Safe(() =>
            {
                store.SaveDocument(active, preview.Text, expectedDocument);
                expectedDocument = preview.Text;
                loading = true; document.Text = preview.Text; loading = false;
                active.DocumentDraft = null;
                store.Save(active);
                UpdateSaved();
                status.Text = "Version restored. The version it replaced is also kept.";
                dialog.Close();
            });
        };
        dialog.Controls.Add(preview);
        dialog.Controls.Add(list);
        dialog.Controls.Add(restore);
        dialog.ShowDialog(this);
    }

    void Safe(Action action) { try { action(); } catch (Exception ex) { ShowError(ex); } }
    void ShowError(Exception ex) => status.Text = ex.Message;

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (updateDownload is not null)
        {
            // Let the download stop and clean up its partial file, then close.
            updateDownload.Cancel();
            closeWhenUpdateStops = true;
            status.Text = "Stopping the update download, then closing…";
            e.Cancel = true;
        }
        else if (busy)
        {
            cancellation?.Cancel();
            status.Text = "Stopping Robin safely. Close again after the request stops.";
            e.Cancel = true;
        }
        else if (!SaveActive())
        {
            e.Cancel = MessageBox.Show(this, "The document couldn't be saved. Your draft may be saved in the project, but check the status before closing. Close anyway?", "Unsaved document", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes;
        }
        base.OnFormClosing(e);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) { saveTimer.Dispose(); cancellation?.Dispose(); updateDownload?.Dispose(); projectLock?.Dispose(); projectMenu.Dispose(); }
        base.Dispose(disposing);
    }
}
