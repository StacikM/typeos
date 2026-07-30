using System.Security.Cryptography;

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

string? ResolvePath(string relPath)
{
    var full = Path.GetFullPath(Path.Combine(workspaceDir, relPath));
    return full == workspaceDir || full.StartsWith(workspaceDir + Path.DirectorySeparatorChar) ? full : null;
}

bool Authorized(HttpRequest req) => req.Headers["X-Key"].ToString() == key;

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

app.Run();

record FileWrite(string Path, string Content);
