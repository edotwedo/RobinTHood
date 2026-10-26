using System.Net;
using System.Net.Sockets;
using System.Text;
using RobinCode;

static class Checks
{
    static int count;
    static CompletionResult Good(string id = "test", string text = "complete answer") => new(true, id, text, 1);
    static void Assert(bool condition, string name)
    {
        if (!condition) throw new Exception(name);
        Console.WriteLine("PASS " + name);
        count++;
    }
    static KeylessClient.Endpoint E(string id, string host) => new(id, id, "https://" + host + "/chat");

    sealed class FakeGitHub(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        public int Requests;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancel)
        { Requests++; return Task.FromResult(respond(request)); }
    }

    static async Task UpdaterChecks()
    {
        byte[] exe = Encoding.UTF8.GetBytes("pretend RobinTHood v0.4.0 executable");
        string sha = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(exe)).ToLowerInvariant();
        string Release(string tag, string? digest, string body = "", bool draft = false, string asset = "RobinTHood.exe", int? size = null) =>
            System.Text.Json.JsonSerializer.Serialize(new
            {
                tag_name = tag, draft, prerelease = false, body,
                assets = new[] { new Dictionary<string, object?> { ["name"] = asset, ["size"] = size ?? exe.Length,
                    ["browser_download_url"] = "https://github.com/edotwedo/RobinTHood/releases/download/" + tag + "/" + asset, ["digest"] = digest } }
            });
        HttpClient Serve(string json, byte[]? download = null) => new(new FakeGitHub(r =>
            r.RequestUri!.AbsoluteUri == Updater.LatestReleaseApi
                ? new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(json) }
                : new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(download ?? exe) }));
        var current = new Version(0, 3, 2);

        var update = await Updater.CheckAsync(default, current, Serve(Release("v0.4.0", "sha256:" + sha)));
        Assert(update is { Tag: "v0.4.0" } && update.Sha256 == sha && update.Size == exe.Length, "newer release with an asset digest is offered");
        Assert(await Updater.CheckAsync(default, current, Serve(Release("v0.3.2", "sha256:" + sha))) is null, "same version is not offered");
        Assert(await Updater.CheckAsync(default, current, Serve(Release("v0.3.1", "sha256:" + sha))) is null, "older version is never offered");
        Assert(await Updater.CheckAsync(default, current, Serve(Release("v0.4.0", "sha256:" + sha, draft: true))) is null, "draft release is not offered");
        Assert(await Updater.CheckAsync(default, current, Serve(Release("v0.4.0", null))) is null, "release with no known fingerprint is not offered");
        Assert(await Updater.CheckAsync(default, current, Serve(Release("v0.4.0", null, $"SHA-256: `{sha}`"))) is { } noted && noted.Sha256 == sha,
            "fingerprint published in release notes is accepted when the API digest is missing");
        Assert(await Updater.CheckAsync(default, current, Serve(Release("v0.4.0", "sha256:" + sha, asset: "Other.zip"))) is null, "release without the Windows exe is not offered");
        Assert(await Updater.CheckAsync(default, current, new HttpClient(new FakeGitHub(_ => new HttpResponseMessage(HttpStatusCode.Forbidden)))) is null,
            "rate-limited or failed check quietly offers nothing");
        Assert(await Updater.CheckAsync(default, current, Serve("not json")) is null, "malformed release data quietly offers nothing");

        string root = Path.Combine(Path.GetTempPath(), "robin-update-check-" + Guid.NewGuid().ToString("N"));
        string desktop = Path.Combine(root, "desktop");
        Directory.CreateDirectory(desktop);
        try
        {
            string installed = await Updater.InstallAsync(update!, null, default, Serve("", exe), Path.Combine(root, "programs"), desktop);
            Assert(File.ReadAllBytes(installed).SequenceEqual(exe) && Path.GetFileName(Path.GetDirectoryName(installed)) == sha.ToUpperInvariant()[..12],
                "verified update installs into its own fingerprint folder");
            Assert(!File.Exists(Path.Combine(desktop, "RobinTHood.lnk")), "update never creates a desktop shortcut the user declined");
            Assert(!Directory.EnumerateFiles(Path.Combine(root, "programs")).Any(), "no partial download is left behind");

            var tampered = Encoding.UTF8.GetBytes("pretend RobinTHood v0.4.0 executablX");
            bool rejected = false;
            try { await Updater.InstallAsync(update!, null, default, Serve("", tampered), Path.Combine(root, "tampered"), desktop); }
            catch (IOException) { rejected = true; }
            Assert(rejected && !Directory.EnumerateFileSystemEntries(Path.Combine(root, "tampered")).Any(),
                "download with the wrong fingerprint is rejected and leaves nothing installed");

            rejected = false;
            try { await Updater.InstallAsync(update!, null, default, Serve("", exe[..^3]), Path.Combine(root, "short"), desktop); }
            catch (IOException) { rejected = true; }
            Assert(rejected && !Directory.EnumerateFileSystemEntries(Path.Combine(root, "short")).Any(), "incomplete download is rejected and removed");
        }
        finally { Directory.Delete(root, true); }
        Assert(Updater.ParseVersion("v1.2") == new Version(1, 2, 0) && Updater.ParseVersion("0.3.2+121fe9e") == new Version(0, 3, 2)
            && Updater.ParseVersion("latest") is null, "version tags and build metadata parse safely");
    }
    static async Task<int> Main(string[] args)
    {
        try
        {
            if (args.Contains("--probe"))
            {
                var observations = new List<object>();
                foreach (string id in new[] { "kilo-lightning", "kilo-laguna" })
                {
                    var result = await KeylessClient.CompleteAsync("Reply with exactly READY. No explanation.", id);
                    observations.Add(new { id, at = DateTimeOffset.UtcNow, result.Success, result.ModelUsed, result.HttpStatus,
                        result.RetryAfterUtc, result.ElapsedSeconds, result.ErrorMessage, result.OutputText });
                    Console.WriteLine($"PROBE {id}: success={result.Success}, status={result.HttpStatus}, {result.ElapsedSeconds:0.0}s, {result.ErrorMessage}");
                    if (result.HttpStatus is >= 400) break; // First refusal ends the probe; no retries.
                    await Task.Delay(2000);
                }
                string output = Path.GetFullPath("dist/adaptive-source-probe.json");
                Directory.CreateDirectory(Path.GetDirectoryName(output)!);
                File.WriteAllText(output, System.Text.Json.JsonSerializer.Serialize(observations, new System.Text.Json.JsonSerializerOptions { WriteIndented = true }));
                Console.WriteLine("EVIDENCE " + output);
                return 0;
            }
            int timedAttempts = 0;
            bool released = false;
            var timed = await FreeAggregator.WithDeadlineAsync(async token =>
            {
                try
                {
                    timedAttempts++;
                    await Task.Delay(Timeout.Infinite, token);
                    timedAttempts++;
                    return Good();
                }
                finally { released = true; }
            }, default, TimeSpan.FromMilliseconds(75));
            Assert(!timed.Success && timed.OutputText == "" && timed.ErrorMessage.Contains("still saved") && timedAttempts == 1 && released,
                "overall deadline cancels active work, prevents later attempts and keeps an actionable saved-request message");
            using (var userCancel = new CancellationTokenSource())
            {
                userCancel.Cancel();
                bool cancelled = false;
                try { await FreeAggregator.WithDeadlineAsync(token => Task.FromResult(Good()), userCancel.Token, TimeSpan.FromSeconds(1)); }
                catch (OperationCanceledException) { cancelled = true; }
                Assert(cancelled, "user cancellation stays cancellation instead of becoming a service timeout");
            }
            var timely = await FreeAggregator.WithDeadlineAsync(token => Task.FromResult(Good("chosen", "saved answer")), default, TimeSpan.FromSeconds(1));
            Assert(timely.Success && timely.OutputText == "saved answer" && timely.ModelUsed == "chosen", "answer completed inside total budget is preserved");
            var finished = await FreeAggregator.WithDeadlineAsync(async token =>
            {
                while (!token.IsCancellationRequested) await Task.Delay(5);
                return Good("finished", "complete answer");
            }, default, TimeSpan.FromMilliseconds(30));
            Assert(finished.Success && finished.OutputText == "complete answer", "complete answer wins a simultaneous deadline notification");
            DateTimeOffset now = DateTimeOffset.Parse("2026-10-26T06:00:00Z");
            var routes = new[] { E("a", "one.test"), E("a2", "one.test"), E("b", "two.test") };
            var sent = new List<string>();
            var router = new AdaptiveCascade(routes, (prompt, id, token) =>
            {
                sent.Add(id);
                return Task.FromResult(id == "b" ? Good(id) : new CompletionResult(false, id, "", 1, "limited", 429, now.AddSeconds(25)));
            }, () => now);
            var answer = await router.RunAsync("test", default);
            Assert(answer.Success && sent.SequenceEqual(new[] { "a", "b" }), "429 skips all other models sharing that provider and switches hosts");
            sent.Clear();
            answer = await router.RunAsync("test", default);
            Assert(answer.Success && sent.SequenceEqual(new[] { "b" }), "next request respects the same Retry-After cooldown");
            now = now.AddSeconds(26);
            sent.Clear();
            // Rotation starts with b here; a later call must become eligible again.
            await router.RunAsync("test", default);
            await router.RunAsync("test", default);
            Assert(sent.Contains("a"), "provider becomes eligible after its actual cooldown expires");

            int calls = 0;
            var allBusy = new AdaptiveCascade([E("x", "x.test"), E("y", "y.test")], (p, id, ct) =>
            {
                calls++;
                return Task.FromResult(new CompletionResult(false, id, "", 0, "limited", 429, now.AddSeconds(id == "x" ? 25 : 50)));
            }, () => now);
            answer = await allBusy.RunAsync("test", default);
            Assert(!answer.Success && calls == 2 && answer.RetryAfterUtc == now.AddSeconds(25) && answer.ErrorMessage.Contains("25 seconds"), "all cooling services return earliest real retry time and preserve a useful message");
            await allBusy.RunAsync("test", default);
            Assert(calls == 2, "requests during complete cooldown make zero network attempts");

            var authSent = new List<string>();
            var auth = new AdaptiveCascade(routes, (p, id, ct) =>
            {
                authSent.Add(id);
                return Task.FromResult(id == "b" ? Good(id) : new CompletionResult(false, id, "", 0, "denied", 403));
            }, () => now);
            await auth.RunAsync("test", default);
            Assert(authSent.SequenceEqual(new[] { "a", "b" }), "authentication refusal doesn't repeatedly hit sibling models");

            var missingSent = new List<string>();
            var missing = new AdaptiveCascade(routes, (p, id, ct) =>
            {
                missingSent.Add(id);
                return Task.FromResult(id == "a" ? new CompletionResult(false,id,"",0,"missing",404) : Good(id));
            }, () => now);
            await missing.RunAsync("test", default);
            Assert(missingSent.SequenceEqual(new[] { "a", "a2" }), "missing model disables that model, not its healthy siblings");
            var upstreamSent = new List<string>();
            var upstream = new AdaptiveCascade(routes, (p,id,ct) =>
            {
                upstreamSent.Add(id);
                return Task.FromResult(id=="a" ? new CompletionResult(false,id,"",0,"upstream limit",429,now.AddSeconds(25),RateLimitIsProviderWide:false) : Good(id));
            },()=>now);
            await upstream.RunAsync("test",default);
            Assert(upstreamSent.SequenceEqual(new[]{"a","a2"}), "explicit upstream-model limits allow a healthy sibling without bypassing a shared quota");

            int active = 0, maximum = 0;
            var concurrent = new AdaptiveCascade(routes, async (p, id, ct) =>
            {
                int current = Interlocked.Increment(ref active);
                int snapshot;
                do { snapshot = maximum; if (snapshot >= current) break; } while (Interlocked.CompareExchange(ref maximum,current,snapshot) != snapshot);
                try { await Task.Delay(50,ct); return Good(id); }
                finally { Interlocked.Decrement(ref active); }
            });
            await Task.WhenAll(Enumerable.Range(0,8).Select(i=>concurrent.RunAsync("test",default)));
            Assert(maximum == 2 && active == 0, "eight concurrent callers cause at most two in-flight provider requests");

            var selected = new List<string>();
            var spread = new AdaptiveCascade(routes,(p,id,ct)=> { selected.Add(id); return Task.FromResult(Good(id)); });
            for (int i=0;i<3;i++) await spread.RunAsync("test",default);
            Assert(selected.Distinct().Count()==3, "ordinary requests distribute starting routes instead of hammering the first model");

            int quotaCalls=0;
            var quota=new AdaptiveCascade([E("q","ai-gateway.kilo.ai")],(p,id,ct)=> { quotaCalls++;return Task.FromResult(Good(id));},()=>now);
            for(int i=0;i<201;i++) answer=await quota.RunAsync("test",default);
            Assert(quotaCalls==200 && !answer.Success && answer.RetryAfterUtc==now.AddHours(1), "local Kilo budget prevents request 201 inside the documented shared hourly window");
            now=now.AddHours(1);
            Assert((await quota.RunAsync("test",default)).Success && quotaCalls==201, "hourly budget naturally refills without resetting or evasion");

            using(var cts=new CancellationTokenSource())
            {
                cts.Cancel();
                try { await spread.RunAsync("test",cts.Token);throw new Exception("cancel ignored"); }
                catch(OperationCanceledException) { Assert(true,"cancellation does not initiate a provider attempt"); }
            }
            var fallbacks=FreeAggregator.CliFallbackTargets("auto");
            Assert(fallbacks.SequenceEqual(new[]{"groq","cloudflare","gemini-api","nvidia-lightning"}) && !fallbacks.Any(id=>id.StartsWith("kilo")||id.StartsWith("ovh")),"optional CLI fallback targets independent providers, never a cooling keyless host");
            var cli=FreeAggregator.CliStartInfo("not-launched.exe","a prompt with spaces","groq");
            Assert(cli.ArgumentList.SequenceEqual(new[]{"run","--free-only","-m","groq","a prompt with spaces"}) && !cli.UseShellExecute,"every optional CLI call is pinned to one free provider and preserves the prompt as data");

            // Real HTTP/SSE parser tests use loopback only; no external model requests.
            var original = KeylessClient.Endpoints[0];
            async Task<CompletionResult> HttpCase(int code,string head,string tail="",int delay=0,string? retry=null)
            {
                using var server=new Server(code,head,tail,delay,retry);
                KeylessClient.Endpoints[0]=original with {Url=server.Url};
                try { return await KeylessClient.CompleteAsync("test",original.Id); }
                finally { KeylessClient.Endpoints[0]=original; }
            }
            const string part="data: {\"choices\":[{\"delta\":{\"content\":\"first\"}}]}\n\n";
            const string last="data: {\"choices\":[{\"delta\":{\"content\":\" second\"},\"finish_reason\":\"stop\"}]}\n\n";
            answer=await HttpCase(429,"{\"error\":\"rate limited\"}",retry:"25");
            Assert(!answer.Success && answer.HttpStatus==429 && answer.RateLimitIsProviderWide && answer.RetryAfterUtc>DateTimeOffset.UtcNow.AddSeconds(20), "HTTP Retry-After, status and conservative quota scope survive into typed completion result");
            string upstreamBody=System.Text.Json.JsonSerializer.Serialize(new {error=new {metadata=new {raw=original.Model+" is temporarily rate-limited upstream. Please retry shortly."}}});
            answer=await HttpCase(429,upstreamBody);
            Assert(!answer.Success && answer.HttpStatus==429 && !answer.RateLimitIsProviderWide,"structured upstream-model refusal is distinguished from shared gateway quota");
            answer=await HttpCase(200,part);
            Assert(!answer.Success && answer.OutputText=="", "abruptly closed partial answer cannot replace a saved document");
            answer=await HttpCase(200,part+"data: {broken-json}\n\ndata: [DONE]\n\n");
            Assert(!answer.Success && answer.OutputText=="", "malformed stream frame cannot silently drop document content");
            answer=await HttpCase(200,part+"data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"length\"}]}\n\n");
            Assert(!answer.Success && answer.ErrorMessage.Contains("cut"), "token-limit truncation is reported as failure, not a complete document");
            answer=await HttpCase(200,part+"data: {\"error\":{\"code\":\"429\",\"message\":\"limited\"}}\n\n");
            Assert(!answer.Success && answer.HttpStatus==429 && answer.OutputText=="", "mid-stream rate-limit errors are typed and discard incomplete output");
            foreach (string field in new[] { "code", "type" })
            foreach (string label in new[] { "rate_limit_exceeded", "rate_limit_error", "too_many_requests" })
            {
                string frame=System.Text.Json.JsonSerializer.Serialize(new {error=new Dictionary<string,string>{{field,label}}});
                answer=await HttpCase(200,part+"data: "+frame+"\n\n");
                Assert(!answer.Success && answer.HttpStatus==429 && answer.RateLimitIsProviderWide && answer.OutputText=="", $"SSE {field}={label} cools the shared provider and discards partial output");
            }
            answer=await HttpCase(200,part,last,16500);
            Assert(answer.Success && answer.OutputText=="first second" && answer.ElapsedSeconds>=16, "healthy stream lasting beyond the old 15-second cutoff finishes successfully");
            await UpdaterChecks();
            Console.WriteLine($"{count} routing checks passed; zero external provider requests.");
            return 0;
        }
        catch(Exception ex) { Console.Error.WriteLine(ex);return 1; }
    }

    sealed class Server : IDisposable
    {
        readonly TcpListener listener=new(IPAddress.Loopback,0);
        readonly CancellationTokenSource stop=new();
        readonly Task serving;
        public string Url {get;}
        public Server(int code,string head,string tail,int delay,string? retry)
        {
            listener.Start();
            Url=$"http://127.0.0.1:{((IPEndPoint)listener.LocalEndpoint).Port}/chat";
            serving=Serve(code,head,tail,delay,retry);
        }
        async Task Serve(int code,string head,string tail,int delay,string? retry)
        {
            try
            {
                using var client=await listener.AcceptTcpClientAsync(stop.Token);
                using var stream=client.GetStream();
                using var reader=new StreamReader(stream,leaveOpen:true);
                int length=0;
                while(await reader.ReadLineAsync(stop.Token) is {Length:>0} line)
                    if(line.StartsWith("Content-Length:",StringComparison.OrdinalIgnoreCase)) length=int.Parse(line.Split(':')[1]);
                if(length>0) await reader.ReadBlockAsync(new char[length],stop.Token);
                string headers=$"HTTP/1.1 {code} {(code==200?"OK":"Too Many Requests")}\r\nContent-Type: text/event-stream\r\nContent-Length: {Encoding.UTF8.GetByteCount(head+tail)}\r\nConnection: close\r\n"+(retry is null?"":"Retry-After: "+retry+"\r\n")+"\r\n";
                await stream.WriteAsync(Encoding.ASCII.GetBytes(headers+head),stop.Token);
                if(delay>0) await Task.Delay(delay,stop.Token);
                if(tail.Length>0) await stream.WriteAsync(Encoding.UTF8.GetBytes(tail),stop.Token);
            }
            catch(Exception) when(stop.IsCancellationRequested) { }
        }
        public void Dispose() {stop.Cancel();listener.Stop();try {serving.GetAwaiter().GetResult();}catch(OperationCanceledException){}stop.Dispose();}
    }
}
