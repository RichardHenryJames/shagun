param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('protect', 'unprotect')]
    [string]$Operation
)

# Called only by the local backup runner. Key material uses process stdin/stdout,
# never command arguments, files, a terminal prompt or application configuration.
# DPAPI CurrentUser intentionally requires this Windows profile for recovery.
$ErrorActionPreference = 'Stop'
$inputBytes = $null
$outputBytes = $null
try {
    if (-not $IsWindows) { throw 'Windows DPAPI is required.' }
    $encoded = [Console]::In.ReadToEnd().Trim()
    if ($encoded.Length -gt 16384) { throw 'Input exceeds the key-envelope limit.' }
    $inputBytes = [Convert]::FromBase64String($encoded)
    $entropy = [Text.Encoding]::UTF8.GetBytes('Shagun local SQL backup key v1')
    $scope = [Security.Cryptography.DataProtectionScope]::CurrentUser
    if ($Operation -eq 'protect') {
        if ($inputBytes.Length -ne 32) { throw 'An AES-256 key is required.' }
        $outputBytes = [Security.Cryptography.ProtectedData]::Protect($inputBytes, $entropy, $scope)
    } else {
        if ($inputBytes.Length -lt 32 -or $inputBytes.Length -gt 8192) { throw 'Invalid protected key.' }
        $outputBytes = [Security.Cryptography.ProtectedData]::Unprotect($inputBytes, $entropy, $scope)
        if ($outputBytes.Length -ne 32) { throw 'Invalid unprotected key length.' }
    }
    [Console]::Out.Write([Convert]::ToBase64String($outputBytes))
} catch {
    [Console]::Error.Write('Local key protection failed; details withheld.')
    exit 1
} finally {
    if ($null -ne $inputBytes) { [Array]::Clear($inputBytes) }
    if ($null -ne $outputBytes) { [Array]::Clear($outputBytes) }
}