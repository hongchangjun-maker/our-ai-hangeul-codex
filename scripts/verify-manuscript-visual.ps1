param(
  [Parameter(Mandatory = $true)][string]$DocxPath,
  [Parameter(Mandatory = $true)][string]$BaseUrl,
  [int]$ExpectedPages = 221,
  [string]$OutputRoot = '',
  [double]$AllowedRatio = 0.16
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$source = (Resolve-Path -LiteralPath $DocxPath).Path
if (-not $OutputRoot) { $OutputRoot = Join-Path $projectRoot ("tmp\document-fidelity\" + (Get-Date -Format 'yyyyMMdd-HHmmss')) }
$output = [IO.Path]::GetFullPath($OutputRoot)
$reference = Join-Path $output 'word-reference'
$candidate = Join-Path $output 'browser-candidate'
$diff = Join-Path $output 'diff'
New-Item -ItemType Directory -Force -Path $reference,$candidate,$diff | Out-Null
$pdf = Join-Path $output 'word-reference.pdf'

$word = $null
$document = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $document = $word.Documents.Open($source, $false, $true)
  $document.Repaginate()
  $pageCount = $document.ComputeStatistics(2)
  if ($ExpectedPages -gt 0 -and $pageCount -ne $ExpectedPages) { throw "Word page count is $pageCount, expected $ExpectedPages." }
  $document.ExportAsFixedFormat($pdf, 17)
} finally {
  if ($document) { $document.Close($false) }
  if ($word) { $word.Quit() }
  if ($document) { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($document) | Out-Null }
  if ($word) { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($word) | Out-Null }
}

& node (Join-Path $PSScriptRoot 'render-pdf-pages.mjs') --pdf $pdf --output $reference --dpi 96
if ($LASTEXITCODE -ne 0) { throw 'PDF page rendering failed.' }
& node (Join-Path $PSScriptRoot 'capture-document-pages.mjs') --url $BaseUrl --docx $source --output $candidate --expected-pages $ExpectedPages
if ($LASTEXITCODE -ne 0) { throw 'Browser page capture failed.' }
& node (Join-Path $PSScriptRoot 'pixel-diff-pages.mjs') --reference $reference --candidate $candidate --output $diff --allowed-ratio $AllowedRatio
$diffExit = $LASTEXITCODE
Write-Output "Document fidelity report: $(Join-Path $diff 'pixel-diff-report.json')"
if ($diffExit -ne 0) { throw "Pixel comparison exceeded the allowed ratio. Review $diff" }
