using System.Security.Cryptography;
using Renci.SshNet;

var configDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "TypeOS");
Directory.CreateDirectory(configDir);

var workspaceDir = Path.Combine(configDir, "filesystem");
Directory.CreateDirectory(workspaceDir);

Console.Write("Enter how much MB do you want to allocate to TypeOS: ");
var allocateMB = Console.ReadLine() ?? "100";
var config = Path.Combine(configDir, "config.json");
File.WriteAllText(config, $"{{ \"allocateMB\": {allocateMB} }}");

const string keyChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
var keyPath = Path.Combine(configDir, "key.txt");
var regenerateKey = args.Contains("--regenerate-key");

string key;
if (!regenerateKey && File.Exists(keyPath))
{
    key = File.ReadAllText(keyPath);
}
else
{
    key = RandomNumberGenerator.GetString(keyChars, 16);
    File.WriteAllText(keyPath, key);
}

Console.Write($"TypeOS helper has started. You may now attach your session by putting \"attachToHelper ({key})\" in the terminal.\nRegenerate it by starting program with arg --regenerate-key");

var attached = false;

SshClient? ssh = null;
var sshCwd = "";

string? ResolvePath(string relPath)
{
    var full = Path.GetFullPath(Path.Combine(workspaceDir, relPath));
    return full == workspaceDir || full.StartsWith(workspaceDir + Path.DirectorySeparatorChar) ? full : null;
}

bool Authorized(HttpRequest req) => req.Headers["X-Key"].ToString() == key;

string ShellQuote(string s) => "'" + s.Replace("'", "'\\''") + "'";

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader();
    });
});
var app = builder.Build();

app.UseCors();

app.MapGet("/", () => "hello, in case you are wondering what is this random active port, this is the helper for TypeOS which allows TypeOS to send files to your PC");
app.MapGet("/status", () => "ok");

app.MapPost("/attach", (HttpRequest req) =>
{
    if (!Authorized(req)) return Results.Unauthorized();
    attached = true;
    return Results.Ok("attached");
});

app.MapPost("/detach", (HttpRequest req) =>
{
    if (!Authorized(req)) return Results.Unauthorized();
    attached = false;
    return Results.Ok("detached");
});

app.MapGet("/files", (HttpRequest req) =>
{
    if (!Authorized(req) || !attached) return Results.Unauthorized();
    var files = Directory.GetFiles(workspaceDir, "*", SearchOption.AllDirectories).Select(f => new
    {
        path = Path.GetRelativePath(workspaceDir, f).Replace("\\", "/"),
        modified = File.GetLastWriteTimeUtc(f)
    });
    return Results.Json(files);
});

app.MapGet("/files/content", (HttpRequest req, string path) =>
{
    if (!Authorized(req) || !attached) return Results.Unauthorized();
    var full = ResolvePath(path);
    if (full == null || !File.Exists(full)) return Results.NotFound();
    return Results.Text(File.ReadAllText(full));
});

app.MapPost("/files/write", (HttpRequest req, FileWrite body) =>
{
    if (!Authorized(req) || !attached) return Results.Unauthorized();
    var full = ResolvePath(body.Path);
    if (full == null) return Results.BadRequest();
    Directory.CreateDirectory(Path.GetDirectoryName(full)!);
    File.WriteAllText(full, body.Content);
    return Results.Ok();
});

app.MapDelete("/files", (HttpRequest req, string path) =>
{
    if (!Authorized(req) || !attached) return Results.Unauthorized();
    var full = ResolvePath(path);
    if (full == null || !File.Exists(full)) return Results.NotFound();
    File.Delete(full);
    return Results.Ok();
});

app.MapPost("/ssh/connect", (HttpRequest req, SshConnect body) =>
{
    if (!Authorized(req) || !attached) return Results.Unauthorized();
    try
    {
        ssh?.Disconnect();
        ssh?.Dispose();

        var passwordAuth = new PasswordAuthenticationMethod(body.User, body.Password);
        var keyboardAuth = new KeyboardInteractiveAuthenticationMethod(body.User);
        keyboardAuth.AuthenticationPrompt += (_, e) =>
        {
            foreach (var prompt in e.Prompts) { prompt.Response = body.Password; }
        };
        var info = new Renci.SshNet.ConnectionInfo(body.Host, body.Port <= 0 ? 22 : body.Port, body.User, passwordAuth, keyboardAuth)
        {
            Timeout = TimeSpan.FromSeconds(30)
        };

        ssh = new SshClient(info);
        ssh.Connect();
        sshCwd = "";
        return Results.Ok("connected");
    }
    catch (Exception e)
    {
        ssh?.Dispose();
        ssh = null;
        return Results.BadRequest(e.Message);
    }
});

app.MapPost("/ssh/run", (HttpRequest req, SshRun body) =>
{
    if (!Authorized(req) || !attached) return Results.Unauthorized();
    if (ssh == null || !ssh.IsConnected) return Results.BadRequest("not connected");

    var marker = "__TYPEOS_SSH_PWD__";
    var cd = sshCwd == "" ? "" : $"cd {ShellQuote(sshCwd)} 2>/dev/null; ";
    var command = ssh.CreateCommand($"{cd}{body.Command}; printf {ShellQuote(marker)}; pwd");
    command.CommandTimeout = TimeSpan.FromSeconds(30);

    try
    {
        var result = command.Execute();
        var output = result;
        var idx = result.LastIndexOf(marker, StringComparison.Ordinal);
        if (idx >= 0)
        {
            output = result.Substring(0, idx);
            var pwd = result.Substring(idx + marker.Length).Trim();
            if (pwd != "") { sshCwd = pwd; }
        }
        return Results.Json(new { output, error = command.Error, cwd = sshCwd });
    }
    catch (Exception e)
    {
        return Results.Json(new { output = "", error = e.Message, cwd = sshCwd });
    }
});

app.MapPost("/ssh/disconnect", (HttpRequest req) =>
{
    if (!Authorized(req)) return Results.Unauthorized();
    ssh?.Disconnect();
    ssh?.Dispose();
    ssh = null;
    return Results.Ok("disconnected");
});

app.Run();

record FileWrite(string Path, string Content);
record SshConnect(string Host, int Port, string User, string Password);
record SshRun(string Command);
