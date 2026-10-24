namespace RobinCode;

static class Program
{
    [STAThread]
    static void Main()
    {
        try
        {
            ApplicationConfiguration.Initialize();
            Application.Run(new RobinForm());
        }
        catch (Exception ex)
        {
            string logPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Desktop), "ROBIN_CRASH.txt");
            File.WriteAllText(logPath, ex.ToString());
            MessageBox.Show(ex.Message, "RobinTHood Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
