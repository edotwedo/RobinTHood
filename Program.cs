namespace RobinCode;

static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        try
        {
            Updater.WaitForPreviousCopy(args);
            ApplicationConfiguration.Initialize();
            Application.Run(new WorkspaceForm(updateCheck: token => Updater.CheckAsync(token)));
        }
        catch (Exception ex)
        {
            string logPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Desktop), "ROBIN_CRASH.txt");
            File.WriteAllText(logPath, ex.ToString());
            MessageBox.Show(ex.Message, "RobinTHood Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
