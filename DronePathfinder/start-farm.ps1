$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$prefix = "http://127.0.0.1:8765/"
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)
try {
  $listener.Start()
} catch {
  Write-Host "Could not start $prefix — it may already be running. Open that address in your browser."
  exit 1
}
Write-Host "Farm app: $prefix"
Write-Host "Keep this window open. Close it to stop the server."
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $ctx.Response.Headers.Add("Access-Control-Allow-Origin", "*")
  $ctx.Response.Headers.Add("Access-Control-Allow-Methods", "GET, OPTIONS")
  if ($ctx.Request.HttpMethod -eq "OPTIONS") {
    $ctx.Response.StatusCode = 204
    $ctx.Response.Close()
    continue
  }
  $path = $ctx.Request.Url.LocalPath
  if ($path -eq "/") { $path = "/index.html" }
  $file = Join-Path $root ($path.TrimStart("/").Replace("/", "\"))
  if (Test-Path $file -PathType Leaf) {
    $ext = [IO.Path]::GetExtension($file).ToLower()
    $ctype = switch ($ext) {
      ".html" { "text/html; charset=utf-8" }
      ".css" { "text/css; charset=utf-8" }
      ".js" { "application/javascript; charset=utf-8" }
      default { "application/octet-stream" }
    }
    $bytes = [IO.File]::ReadAllBytes($file)
    $ctx.Response.ContentType = $ctype
    $ctx.Response.StatusCode = 200
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $ctx.Response.StatusCode = 404
  }
  $ctx.Response.Close()
}
